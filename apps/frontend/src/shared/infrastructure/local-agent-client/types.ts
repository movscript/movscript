import type { AgentDraftKind } from '@/shared/contracts/agentDraft'
import type {
  AgentApprovalRequest,
  AgentCapabilitiesResponse,
  AgentCatalogConfigFile,
  AgentCatalogPack,
  AgentCatalogSkill,
  AgentClientInput,
  AgentDebugTool,
  AgentDebugContextPanel,
  AgentInspectResponse,
  AgentInputRequest,
  AgentManifest,
  AgentMessage,
  AgentMessageRole,
  AgentPlan,
  AgentPlanRevision,
  AgentPlanTask,
  AgentPlanTaskStatus,
  AgentRun,
  AgentRunInput,
  AgentRuntimeLimits,
  AgentRunRole,
  AgentRunPreview,
  AgentRunStatus,
  AgentRunStep,
  AgentRunTracePage,
  AgentRunTraceSummary,
  AgentRuntimeEventV2,
  AgentRuntimeSnapshotV2,
  AgentSession,
  AgentSessionSummary,
  AgentStepStatus,
  AgentTask,
  AgentTaskArtifact,
  AgentTaskGraph,
  AgentTaskGraphSnapshot,
  AgentTaskGraphStatus,
  AgentTaskStatus,
  AgentTelemetryMetricUnit,
  AgentThread,
  AgentThreadClearResult,
  AgentThreadDeletionResult,
  AgentThreadListPage,
  AgentThreadRole,
  AgentConversationLifecycle,
  AgentThreadResolution,
  AgentThreadSummary,
  AgentThreadStatus,
  AgentTraceEvent,
  AgentTraceEventKind,
  AgentTraceQuery,
  CompiledPromptPreview,
  DispatchTaskGraphResult,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
  RuntimeModelCapabilityRoutePublic,
  RuntimeModelAPIKind,
  RuntimeModelConfigPublic,
  RuntimeModelCredentialStatusPublic,
  RuntimeModelTestResult,
  CreateMessageRunResult,
  RunMessageResult,
  RuntimeContinuation,
  RuntimeInteraction,
  RuntimeWork,
  ToolCall,
  UpdateTaskGraphResult,
} from '@movscript/protocol'

export type {
  AgentApprovalRequest,
  AgentCapabilitiesResponse,
  AgentCatalogConfigFile,
  AgentCatalogPack,
  AgentCatalogSkill,
  AgentClientInput,
  AgentDebugTool,
  AgentDebugContextPanel,
  AgentInspectResponse,
  AgentInputRequest,
  AgentManifest,
  AgentMessage,
  AgentMessageRole,
  AgentPlan,
  AgentPlanRevision,
  AgentPlanTask,
  AgentPlanTaskStatus,
  AgentRun,
  AgentRunInput,
  AgentRuntimeLimits,
  AgentRunRole,
  AgentRunPreview,
  AgentRunStatus,
  AgentRunStep,
  AgentRunTracePage,
  AgentRunTraceSummary,
  AgentRuntimeEventV2,
  AgentRuntimeSnapshotV2,
  AgentSession,
  AgentSessionSummary,
  AgentStepStatus,
  AgentTask,
  AgentTaskArtifact,
  AgentTaskGraph,
  AgentTaskGraphSnapshot,
  AgentTaskGraphStatus,
  AgentTaskStatus,
  AgentThread,
  AgentThreadClearResult,
  AgentThreadDeletionResult,
  AgentThreadListPage,
  AgentThreadRole,
  AgentConversationLifecycle,
  AgentThreadResolution,
  AgentThreadSummary,
  AgentThreadStatus,
  AgentTraceEvent,
  AgentTraceEventKind,
  AgentTraceQuery,
  CompiledPromptPreview,
  DispatchTaskGraphResult,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
  RuntimeModelCapabilityRoutePublic,
  RuntimeModelAPIKind,
  RuntimeModelConfigPublic,
  RuntimeModelCredentialStatusPublic,
  RuntimeModelTestResult,
  CreateMessageRunResult,
  RunMessageResult,
  RuntimeContinuation,
  RuntimeInteraction,
  RuntimeWork,
  ToolCall,
  UpdateTaskGraphResult,
}

export type AgentToolCall = ToolCall

export type AgentRuntimeLimitsOverride = Partial<Pick<AgentRuntimeLimits, 'approvalMode' | 'sandboxMode' | 'maxToolCalls' | 'maxIterations' | 'execution'>>

export interface AgentThreadListQuery {
  cursor?: string
  limit?: number
  includeProvisional?: boolean
}

export interface AgentHealth {
  ok: boolean
  service: string
  mode: string
  mcpEndpoint: string
  runtime?: {
    apiVersion: number
    features: string[]
    endpoints: string[]
  }
  paths?: {
    statePath: string
    memoryPath: string
    draftPath: string
    modelConfigPath: string
  }
  modelConfigPath?: string
  modelConfig?: RuntimeModelConfigPublic
  modelCapabilities?: RuntimeModelCapabilityRoutePublic[]
  pluginCatalog?: {
    skillsDir: string
    toolsDir: string
    builtinSkillsDir?: string
    builtinToolsDir?: string
    skillCount: number
    toolCount: number
    warnings?: string[]
  }
}

export interface AgentRuntimeTelemetryMetricSample {
  name: string
  value: number
  unit: AgentTelemetryMetricUnit
  createdAt: string
  labels?: Record<string, string | number | boolean>
}

export interface AgentRuntimeTelemetryLogEntry {
  level: 'info' | 'warning' | 'error'
  message: string
  createdAt: string
  operationId?: string
  spanId?: string
  details?: Record<string, unknown>
}

export interface AgentRuntimeTelemetrySpan {
  id: string
  traceEventId?: string
  runId: string
  threadId?: string
  kind: string
  name: string
  status: 'started' | 'completed' | 'blocked' | 'failed' | 'info'
  startedAt: string
  endedAt?: string
  durationMs?: number
  toolName?: string
  labels?: Record<string, string | number | boolean>
}

export interface AgentRuntimeTelemetryOperation {
  id: string
  kind: string
  status: 'running' | 'success' | 'error'
  startedAt: string
  updatedAt: string
  endedAt?: string
  durationMs?: number
  runId?: string
  threadId?: string
  requestPath?: string
  method?: string
  phases: Array<{ name: string; label: string; at: string; offsetMs: number; deltaMs: number; details?: Record<string, unknown> }>
}

export interface AgentRuntimeTelemetrySnapshot {
  schema: 'movscript.agent.runtime-telemetry.v1'
  generatedAt: string
  service: {
    name: 'movscript-agent'
    storage: 'memory'
    metricsEndpoint: '/metrics'
    snapshotEndpoint: '/runtime/telemetry'
  }
  retention: {
    operations: number
    spans: number
    metrics: number
    logs: number
  }
  operations: AgentRuntimeTelemetryOperation[]
  spans: AgentRuntimeTelemetrySpan[]
  metrics: AgentRuntimeTelemetryMetricSample[]
  logs: AgentRuntimeTelemetryLogEntry[]
  summary: {
    operationCount: number
    runningOperationCount: number
    slowOperationCount: number
    errorOperationCount: number
    spanCount: number
    slowSpanCount: number
    errorSpanCount: number
  }
}

export type AgentMemoryScope = 'global' | 'project' | 'thread'
export type AgentMemoryKind = 'preference' | 'fact' | 'entity_ref' | 'draft' | 'decision' | 'warning'
export type { AgentDraftKind }
export type AgentDraftStatus = 'draft' | 'accepted' | 'rejected' | 'applied' | 'superseded'

export interface AgentMemory {
  id: string
  scope: AgentMemoryScope
  projectId?: number
  threadId?: string
  kind: AgentMemoryKind
  content: string
  sourceRunId?: string
  sourceMessageId?: string
  createdAt: string
  updatedAt: string
}

export interface AgentDraft {
  id: string
  filePath?: string
  projectId?: number
  kind: AgentDraftKind
  title: string
  content: string
  status: AgentDraftStatus
  source?: Record<string, unknown>
  target?: Record<string, unknown>
  createdByRunId?: string
  createdByThreadId?: string
  appliedByUserId?: number | string
  appliedAt?: string
  rejectedReason?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AgentDraftApplyReview {
  draftId: string
  draftTitle: string
  draftKind: AgentDraftKind
  target: Record<string, unknown>
  currentValue: unknown
  proposedValue: unknown
  risk: 'write'
  sideEffect: string
  requiresBackendApply: boolean
}

export interface AgentDraftApplyPreview {
  status: 'preview' | 'applied'
  review: AgentDraftApplyReview
  draft: AgentDraft
  message: string
  backendApply?: Record<string, unknown>
}

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
  schema: 'movscript.agent-trace-debug-view.v1'
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
  modelCalls: Array<{
    id: string
    label: string
    roundId?: string
    roundIndex?: number
    roundLabel?: string
    correlateByEventWindow?: boolean
    eventIds: string[]
    status: 'complete' | 'request_only' | 'response_only' | 'result_only' | 'failed'
    statusLabel: string
    requestEventId?: string
    responseEventId?: string
    resultEventId?: string
    model?: string
    messageCount?: string
    toolCount?: string
    httpStatus?: string
    latency?: string
    responseChars?: string
    inputTokens?: string
    outputTokens?: string
    retryCount?: string
    error?: string
    issue?: string
    hasRequestPayload: boolean
    hasResponseBody: boolean
  }>
  modelCallContexts: Array<{
    callId: string
    label: string
    status: 'complete' | 'request_only' | 'response_only' | 'result_only' | 'failed'
    statusLabel: string
    correlationLabel: string
    requestEventId?: string
    responseEventId?: string
    resultEventId?: string
    modelEventIds: string[]
    toolCalls: Array<{ eventId: string; toolName?: string; status: string; statusLabel: string; summary?: string }>
    messageWrites: Array<{ eventId: string; messageId?: string; source?: string; sourceLabel?: string; contentChars: number; contentPreview?: string }>
    issue?: string
  }>
  runtimeSummary: {
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
      roundContextUpdateCount: number
      latestRoundContextUpdate?: {
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
  roundContextUpdates: Array<{
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
  }>
  roundContextChanges: Array<{
    round: AgentTraceDebugView['roundContextUpdates'][number]
    previousRoundEventId?: string
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
    mutations: AgentTraceDebugView['contextMutations']
  }>
  skillTimeline: {
    timeline: Array<{
      eventId: string
      createdAt: string
      eventType: string
      title: string
      summary?: string
      activeSkillIds: string[]
      loadedSkillIds: string[]
      unloadedSkillIds: string[]
      availableSkillIds: string[]
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
    }>
    currentActiveSkillIds: string[]
    currentLoadedSkillIds: string[]
    currentUnloadedSkillIds: string[]
    currentAvailableSkillIds: string[]
    currentOmissions: Array<{
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
  }
  promptDetails: Array<{
    eventId: string
    title: string
    totalChars?: string
    budgetDecisions: Array<{
      action: string
      stage?: string
      partId: string
      reason?: string
      originalChars?: string
      renderedChars?: string
    }>
    runtimeSkillState?: {
      activeSkillIds: string[]
      loadedSkillIds: string[]
      unloadedSkillIds: string[]
      availableSkillIds: string[]
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
    contextLedgerState?: {
      mutationCount: number
      mutationEventIds: string[]
      latestMutationEventId?: string
      latestMutationReason?: string
    }
  }>
  contextMutations: Array<{
    eventId: string
    title: string
    total: number
    appended: number
    amended: number
    deleted: number
    affectedContextKeys: string[]
    appendedContextKeys: string[]
    amendedContextKeys: string[]
    deletedContextKeys: string[]
    latest?: { id: string; type: 'append' | 'amend' | 'delete'; createdAt: string; reason?: string }
    refs: Array<{ kind: 'context_bundle' | 'context' | 'content_hash' | 'result_hash'; label: string; key?: string; id?: string; type?: string; hash?: string }>
  }>
  messageWrites: unknown[]
  toolCalls: unknown[]
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

export interface AgentPackFile {
  path: string
  content: string
}

export interface AgentPackInstallResult {
  status: 'installed'
  pluginId: string
  targetDir: string
  installedFiles: string[]
  catalog?: Record<string, unknown>
}

export interface AgentPackUninstallResult {
  status: 'uninstalled'
  pluginId: string
  targetDir: string
  removed: boolean
  catalog?: Record<string, unknown>
}

export interface RunMessageOptions {
  onRunUpdate?: (run: AgentRun) => void
  onSourceMessage?: (message: AgentMessage, run: AgentRun) => void
  onRuntimeEvent?: (event: AgentRuntimeEventV2) => void
  onPhase?: (name: string, details?: Record<string, unknown>) => void
  timeoutMs?: number
  streamRequestTimeoutMs?: number
  pollMs?: number
  agentManifest?: AgentManifest
  runtimeLimits?: AgentRuntimeLimitsOverride
  signal?: AbortSignal
}

export interface ThreadStreamOptions {
  onRuntimeEvent?: (event: AgentRuntimeEventV2) => void
  signal?: AbortSignal
}

export interface SessionStreamOptions {
  onRuntimeEvent?: (event: AgentRuntimeEventV2) => void
  signal?: AbortSignal
}

export interface PlanStreamOptions {
  onRuntimeEvent?: (event: AgentRuntimeEventV2) => void
  signal?: AbortSignal
}
