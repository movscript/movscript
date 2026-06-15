import type {
  AgentRun,
  AgentRunRole,
  AgentRunStatus,
  AgentRunTracePage,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '@/shared/infrastructure/provider-session-client/coreTypes'
import type {
  ProviderSessionTraceContextMutation,
  ProviderSessionTraceMessageWrite,
  ProviderSessionTraceModelCall,
  ProviderSessionTraceModelCallContext,
  ProviderSessionTracePromptDetail,
  ProviderSessionTraceRef,
  ProviderSessionTraceRoundContextProjection,
  ProviderSessionTraceSkillEntry,
  ProviderSessionTraceToolCall,
} from '@/shared/infrastructure/provider-session-client/traceDebugTypes'

export type AgentRunTraceResponse = AgentRunTracePage

export interface AgentRunDebugLedger {
  schema: 'movscript.agent.run-debug-ledger.v1'
  runId: string
  generatedAt: string
  budget: { maxChars: number; estimatedChars: number; truncated: boolean }
  run: {
    status: AgentRunStatus
    role?: AgentRunRole
    objective?: string
    currentRound?: number
    error?: string
    warnings: string[]
  }
  context: {
    promptChars?: number
    messageCount?: number
    systemMessageCount?: number
    activeSkillIds: string[]
    availableToolNames: string[]
    blockedToolCount?: number
    droppedSummary: {
      count: number
      totalOriginalChars: number
      totalRenderedChars: number
      samples: Array<{ eventId: string; originalChars: number; renderedChars: number; reason?: string }>
    }
    layers: Array<{ label: string; chars: number }>
  }
  modelCalls: Array<{
    callId: string
    roundIndex?: number
    status: 'request_only' | 'complete' | 'failed' | 'result_only'
    model?: string
    messageCount?: number
    toolCount?: number
    httpStatus?: number
    latencyMs?: number
    inputTokens?: number
    outputTokens?: number
    responseChars?: number
    retryCount?: number
    evidenceRefs: string[]
    issue?: string
  }>
  toolCalls: Array<{
    eventId: string
    roundIndex?: number
    toolName: string
    status: AgentTraceEvent['status']
    durationMs?: number
    summary?: string
    argsEvidenceRef?: string
    resultEvidenceRef?: string
    issue?: string
  }>
  decisions: Array<{ eventId: string; kind: 'permission' | 'approval' | 'input' | 'skill' | 'context'; summary: string; impact?: string }>
  attention: Array<{ eventId: string; severity: 'info' | 'warning' | 'error' | 'blocked'; title: string; summary?: string; nextAction?: string }>
  evidenceIndex: AgentRunDebugEvidenceRef[]
}

export type AgentRunDebugEvidenceKind = 'model_request' | 'model_response' | 'tool_args' | 'tool_result' | 'raw_event'

export interface AgentRunDebugEvidenceRef {
  evidenceId: string
  eventId: string
  kind: AgentRunDebugEvidenceKind
  label: string
  chars: number
  preview: string
  fetchPath: string
  refKeys?: string[]
  contentHashes?: string[]
  resultHashes?: string[]
  contextBundleIds?: string[]
}

export interface AgentRunDebugEvidenceRefQuery {
  kind?: AgentRunDebugEvidenceKind
  contextBundleId?: string
  refKey?: string
  contentHash?: string
  resultHash?: string
}

export interface AgentRunDebugEvidenceRefResponse {
  runId: string
  evidenceRefs: AgentRunDebugEvidenceRef[]
}

export interface AgentRunDebugEvidence {
  schema: 'movscript.agent.run-debug-evidence.v1'
  runId: string
  evidenceId: string
  eventId: string
  kind: AgentRunDebugEvidenceKind
  chars: number
  value: unknown
}

export interface AgentTraceDebugView {
  schema: 'movscript.agent-trace-debug-view.v2'
  generatedAt: string
  runId: string
  run: AgentRun
  trace: { loaded: number; total: number; hasMore: false }
  coverage: {
    loadedLabel: string
    hasUnloadedTrace: boolean
    modelCallsLabel: string
    promptDetailsLabel: string
    messageWritesLabel: string
    toolDetailsLabel: string
    httpResponsesLabel: string
    requestPayloadsLabel: string
    httpResponseBodiesLabel: string
    tokenUsageLabel: string
    issues: string[]
  }
  readinessChecklist: Array<{ id: string; label: string; status: 'ok' | 'warning'; detail: string; action: string }>
  providerSessionSummary: {
    skills: {
      activeSkillIds: string[]
      loadedSkillIds: string[]
      unloadedSkillIds: string[]
      availableSkillIds: string[]
      contextProjection: Array<{
        skillId: string
        name: string
        activationReason?: string
        contextBehavior?: string
        includedInPrompt: boolean
        promptPartId?: string
        promptLayer?: string
        promptKind?: string
        renderedChars?: string
        omittedReason?: string
        omittedStage?: string
        originalChars?: string
        priority?: string
      }>
      omissions: Array<{
        skillId: string
        name: string
        stage: string
        reason: string
        matched?: boolean
        selected?: boolean
        triggerReason?: string
        dependencyIds: string[]
        missingDependencyIds: string[]
        inactiveDependencyIds: string[]
        conflictSkillIds: string[]
      }>
      sourceEventId?: string
    }
    tools: {
      availableToolNames: string[]
      usedToolNames: string[]
      failedToolNames: string[]
      blockedToolNames: string[]
      approvalRequiredToolNames: string[]
      deniedToolNames: string[]
      permissionGateBlockedToolNames: string[]
      pendingApprovalToolNames: string[]
      blockedToolCount?: number
      sourceEventId?: string
    }
    context: {
      promptEventId?: string
      contextMutationCount: number
      contextProjectionCount: number
      latestContextProjection?: {
        eventId: string
        title: string
        roundId?: string
        roundIndex?: number
        roundLabel?: string
        messageCount?: string
        systemMessageCount?: string
        promptChars?: string
        historyProjection?: {
          inputCount: number
          retainedCount: number
          compactedCount: number
          filteredCount: number
          summaryChars: number
          decisions: Array<Record<string, unknown>>
        }
        toolLoopProjection?: Record<string, unknown> & { decisions: Array<Record<string, unknown>> }
        historicalVisualProjection?: Record<string, unknown> & { decisions: Array<Record<string, unknown>> }
        attachmentProjection?: Record<string, unknown> & { decisions: Array<Record<string, unknown>> }
      }
      latestMutationReason?: string
      historyProjection?: {
        inputCount: number
        retainedCount: number
        compactedCount: number
        filteredCount: number
        summaryChars: number
        decisions: Array<{
          action: string
          stage?: string
          reason?: string
          messageCount?: number
          retainedCount?: number
          summaryChars?: number
          maxMessages?: number
        }>
      }
      toolLoopProjection?: Record<string, unknown> & { decisions: Array<Record<string, unknown>> }
      historicalVisualProjection?: Record<string, unknown> & { decisions: Array<Record<string, unknown>> }
      attachmentProjection?: Record<string, unknown> & { decisions: Array<Record<string, unknown>> }
    }
  }
  providerSessionFrames: ProviderSessionTraceFrame[]
  attentionEvents: Array<{
    eventId: string
    createdAt: string
    kind: AgentTraceEventKind
    kindLabel: string
    status: AgentTraceEvent['status']
    statusLabel: string
    title: string
    summary?: string
    behavior?: string
    impact?: string
    error?: string
  }>
  pendingActions: unknown[]
  fieldGuide: Array<{ id: string; label: string; description: string }>
  events: AgentTraceEvent[]
  reportText: string
  bundle: Record<string, unknown>
}

export type ProviderSessionTraceFrameFocus = 'context' | 'model' | 'tool' | 'skill' | 'message' | 'approval' | 'attention' | 'raw'
export type ProviderSessionTraceFrame = ProviderSessionTraceSetupFrame | ProviderSessionTraceRoundFrame | ProviderSessionTraceFinalizeFrame

export interface ProviderSessionTraceFrameBase {
  id: string
  kind: 'setup' | 'round' | 'finalize'
  label: string
  startedAt: string
  completedAt?: string
  durationMs?: number
  status: AgentTraceEvent['status']
  focus: ProviderSessionTraceFrameFocus[]
  eventIds: string[]
  events: AgentTraceEvent[]
  attentionEvents: AgentTraceDebugView['attentionEvents']
}

export interface ProviderSessionTraceSetupFrame extends ProviderSessionTraceFrameBase {
  kind: 'setup'
  skills: ProviderSessionTraceSkillEntry[]
  contextMutations: ProviderSessionTraceContextMutation[]
}

export interface ProviderSessionTraceRoundFrame extends ProviderSessionTraceFrameBase {
  kind: 'round'
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  context: {
    projection?: ProviderSessionTraceRoundContextProjection
    prompt?: ProviderSessionTracePromptDetail
    diff: ProviderSessionTraceContextDiff
  }
  skills: ProviderSessionTraceSkillEntry[]
  modelCalls: ProviderSessionTraceModelCall[]
  modelContext: ProviderSessionTraceModelCallContext[]
  toolCalls: ProviderSessionTraceToolCall[]
  messageWrites: ProviderSessionTraceMessageWrite[]
  approvals: AgentTraceDebugView['attentionEvents']
}

export interface ProviderSessionTraceFinalizeFrame extends ProviderSessionTraceFrameBase {
  kind: 'finalize'
  messageWrites: ProviderSessionTraceMessageWrite[]
  pendingActions: unknown[]
}

export interface ProviderSessionTraceContextDiff {
  previousContextProjectionEventId?: string
  mutationCount: number
  appended: number
  amended: number
  deleted: number
  affectedContextKeys: string[]
  appendedContextKeys: string[]
  amendedContextKeys: string[]
  deletedContextKeys: string[]
  latestMutationReason?: string
  mutationEventIds: string[]
  changes: Array<{
    eventId: string
    op: 'append' | 'amend' | 'delete' | 'unknown'
    key: string
    reason?: string
    ref?: ProviderSessionTraceRef
    before?: ProviderSessionTraceRef
    after?: ProviderSessionTraceRef
    preview?: string
    raw?: unknown
  }>
  mutations: ProviderSessionTraceContextMutation[]
}

export interface AgentRunGenerationView {
  schema: 'movscript.agent-run-generation-view.v1'
  generatedAt: string
  runId: string
  jobs: Array<{
    jobId?: number
    jobType?: string
    providerName?: string
    modelDisplay?: string
    modelIdentifier?: string
    modelConfigId?: number
    status: string
    stage?: string
    progress?: number
    terminal: boolean
    outputResourceId?: number
    outputResourceIds?: number[]
    message?: string
    firstSeenAt?: string
    updatedAt?: string
    completedAt?: string
  }>
  latestJob: AgentRunGenerationView['jobs'][number] | null
  outputResourceIds: number[]
  outputResources: Array<{
    ID: number
    owner_id: number
    type: 'image' | 'video' | 'audio' | 'text' | 'file'
    name: string
    url: string
    size: number
    mime_type: string
    direct_url?: string
    storage_backend?: string
    storage_key?: string
  }>
  metadataByResourceId: Record<string, {
    jobId?: number
    jobType?: string
    providerName?: string
    modelDisplay?: string
    modelIdentifier?: string
    modelConfigId?: number
    status?: string
    stage?: string
  }>
  active: number
  terminal: number
  succeeded: number
  failed: number
  cancelled: number
  timeout: number
}
