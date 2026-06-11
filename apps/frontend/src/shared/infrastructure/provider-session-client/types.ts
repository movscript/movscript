import type { MovScriptWorkspaceKind } from '@/shared/contracts/movscriptWorkspace'
import type { ElectronProviderSessionSummary, ElectronMovScriptWorkspaceConfig, ElectronMovScriptWorkspaceConfigSaveInput } from '@/shared/contracts/electronApi'
import type {
  AgentApprovalRequest,
  ProviderSessionCapabilitiesResponse,
  ProviderCatalogConfigFile,
  ProviderCatalogPack,
  ProviderCatalogSkill,
  ProviderSessionClientInput,
  ProviderToolDescriptor,
  ProviderContextPanel,
  AgentTimelineItem,
  AgentTimelinePage,
  AgentTimelineStreamEvent,
  ProviderCatalogInspectResponse,
  ProviderSessionInputRequest,
  ProviderManifest,
  AgentMessage,
  AgentMessageRole,
  AgentPlan,
  AgentPlanRevision,
  AgentPlanTask,
  AgentPlanTaskStatus,
  AgentRun,
  AgentRunInput,
  ProviderSessionLimits,
  AgentRunRole,
  AgentRunPreview,
  AgentRunStatus,
  AgentRunStep,
  AgentRunTracePage,
  AgentRunTraceSummary,
  ProviderSessionEventV2,
  ProviderSessionStatusRecord,
  ProviderSessionSnapshotV2,
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
  ResolvedProviderSkill,
  ResolvedToolCatalog,
  ProviderModelCapabilityRoutePublic,
  ProviderModelAPIKind,
  ProviderModelConfigPublic,
  ProviderModelCredentialStatusPublic,
  ProviderModelTestResult,
  CreateMessageRunResult,
  RunMessageResult,
  ProviderContinuation,
  ProviderInteraction,
  ProviderWork,
  ToolCall,
  UpdateTaskGraphResult,
} from '@movscript/core/agent/protocol'

export type {
  AgentApprovalRequest,
  ProviderSessionCapabilitiesResponse,
  ProviderCatalogConfigFile,
  ProviderCatalogPack,
  ProviderCatalogSkill,
  ProviderSessionClientInput,
  ProviderToolDescriptor,
  ProviderContextPanel,
  AgentTimelineItem,
  AgentTimelinePage,
  AgentTimelineStreamEvent,
  ProviderCatalogInspectResponse,
  ProviderSessionInputRequest,
  ProviderManifest,
  AgentMessage,
  AgentMessageRole,
  AgentPlan,
  AgentPlanRevision,
  AgentPlanTask,
  AgentPlanTaskStatus,
  AgentRun,
  AgentRunInput,
  ProviderSessionLimits,
  AgentRunRole,
  AgentRunPreview,
  AgentRunStatus,
  AgentRunStep,
  AgentRunTracePage,
  AgentRunTraceSummary,
  ProviderSessionEventV2,
  ProviderSessionStatusRecord,
  ProviderSessionSnapshotV2,
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
  ResolvedProviderSkill,
  ResolvedToolCatalog,
  ProviderModelCapabilityRoutePublic,
  ProviderModelAPIKind,
  ProviderModelConfigPublic,
  ProviderModelCredentialStatusPublic,
  ProviderModelTestResult,
  CreateMessageRunResult,
  RunMessageResult,
  ProviderContinuation,
  ProviderInteraction,
  ProviderWork,
  ToolCall,
  UpdateTaskGraphResult,
}

export type AgentToolCall = ToolCall
export type ProviderSessionSummary = ElectronProviderSessionSummary
export type MovScriptWorkspaceConfig = ElectronMovScriptWorkspaceConfig
export type MovScriptWorkspaceConfigSaveInput = ElectronMovScriptWorkspaceConfigSaveInput

export interface ProviderSessionLease {
  ok: boolean
  sessionId?: string
  leaseId: string
  ttlMs?: number
  expiresAt?: string
  activeLeases?: number
  activeStreams?: number
  released?: boolean
  holder?: string
}

export interface ProviderPluginFileManifest {
  id: string
  name: string
  version: string
  [key: string]: unknown
}

export interface ProviderPluginFile {
  path: string
  content: string
}

export interface ProviderPluginFileList {
  path: string
  plugins: ProviderPluginFileManifest[]
}

export interface ProviderPluginFileInstallInput {
  plugin: ProviderPluginFileManifest
  pluginCatalogFiles?: ProviderPluginFile[]
}

export interface ProviderPluginFileInstallResult extends ProviderPluginFileList {
  plugin?: ProviderPluginFileManifest
  pluginCatalogPackInstall?: unknown
}

export interface ProviderPluginFileRemoveResult extends ProviderPluginFileList {
  removed: boolean
  pluginCatalogPackUninstall?: unknown
}

export type ProviderSessionLimitsOverride = Partial<Pick<ProviderSessionLimits, 'approvalMode' | 'sandboxMode' | 'maxToolCalls' | 'maxIterations' | 'execution'>>

export interface AgentThreadListQuery {
  cursor?: string
  limit?: number
  includeProvisional?: boolean
}

export interface AgentTimelineQuery {
  before?: string
  limit?: number
}

export interface AgentThreadMessagesQuery {
  afterOrdinal?: number
  limit?: number
  direction?: 'asc' | 'desc'
}

export interface AgentThreadMessagesPage {
  threadId: string
  messages: AgentMessage[]
  nextAfterOrdinal?: number
  hasMore: boolean
  scan: {
    durationMs: number
    bytesRead: number
    totalBytes: number
    linesRead: number
    eventsRead: number
    matchedEvents: number
    malformedLines: number
  }
}

export interface AgentSessionTimelineQuery extends AgentTimelineQuery {
  threadId?: string
}

export interface AgentTimelineStreamOptions {
  threadId?: string
  onTimelineEvent?: (event: AgentTimelineStreamEvent) => void
  signal?: AbortSignal
}

export interface ProviderSessionHealth {
  ok: boolean
  service: string
  mode: string
  mcpEndpoint?: string
  runtime?: {
    apiVersion: number
    features: string[]
    endpoints: string[]
  }
  paths?: {
    runtimeDataDir: string
    memoryPath: string
    runtimeLogPath: string
    workspacePath: string
    toolResultPath: string
    catalogStatePath: string
    modelConfigPath: string
  }
  modelConfigPath?: string
  modelConfig?: ProviderModelConfigPublic
  modelCapabilities?: ProviderModelCapabilityRoutePublic[]
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

export interface ProviderSessionTelemetryMetricSample {
  name: string
  value: number
  unit: AgentTelemetryMetricUnit
  createdAt: string
  labels?: Record<string, string | number | boolean>
}

export interface ProviderSessionTelemetryLogEntry {
  level: 'info' | 'warning' | 'error'
  message: string
  createdAt: string
  operationId?: string
  spanId?: string
  details?: Record<string, unknown>
}

export interface ProviderSessionTelemetrySpan {
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

export interface ProviderSessionTelemetryOperation {
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

export interface ProviderSessionTelemetrySnapshot {
  schema: 'movscript.agent.runtime-telemetry.v1'
  generatedAt: string
  service: {
    name: 'mova'
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
  operations: ProviderSessionTelemetryOperation[]
  spans: ProviderSessionTelemetrySpan[]
  metrics: ProviderSessionTelemetryMetricSample[]
  logs: ProviderSessionTelemetryLogEntry[]
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

export type ProviderMemoryScope = 'global' | 'project' | 'thread'
export type ProviderMemoryKind = 'preference' | 'fact' | 'entity_ref' | 'workspace' | 'decision' | 'warning'
export type { MovScriptWorkspaceKind }
export type WorkspaceArtifactStatus = 'workspace' | 'accepted' | 'rejected' | 'applied' | 'superseded'

export interface ProviderMemory {
  id: string
  scope: ProviderMemoryScope
  projectId?: number
  threadId?: string
  kind: ProviderMemoryKind
  content: string
  sourceRunId?: string
  sourceMessageId?: string
  createdAt: string
  updatedAt: string
}

export interface WorkspaceArtifact {
  id: string
  filePath?: string
  projectId?: number
  kind: MovScriptWorkspaceKind
  title: string
  content: string
  status: WorkspaceArtifactStatus
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

export interface WorkspaceArtifactApplyReview {
  workspaceId: string
  workspaceTitle: string
  workspaceKind: MovScriptWorkspaceKind
  target: Record<string, unknown>
  currentValue: unknown
  proposedValue: unknown
  risk: 'write'
  sideEffect: string
  requiresBackendApply: boolean
}

export interface WorkspaceArtifactApplyPreview {
  status: 'preview' | 'applied'
  review: WorkspaceArtifactApplyReview
  workspace: WorkspaceArtifact
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
  /** Compatibility field accepted from older provider-session debug views. */
  runtimeSummary?: AgentTraceDebugView['providerSessionSummary']
  providerSessionFrames: ProviderSessionTraceFrame[]
  /** Compatibility field accepted from older provider-session debug views. */
  runtimeFrames?: ProviderSessionTraceFrame[]
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

export type ProviderSessionTraceRef = { kind: 'context_bundle' | 'context' | 'content_hash' | 'result_hash'; label: string; key?: string; id?: string; type?: string; hash?: string }
export type ProviderSessionTraceContextMutation = { eventId: string; title: string; total: number; appended: number; amended: number; deleted: number; affectedContextKeys: string[]; appendedContextKeys: string[]; amendedContextKeys: string[]; deletedContextKeys: string[]; latest?: { id: string; type: 'append' | 'amend' | 'delete'; createdAt: string; reason?: string }; refs: ProviderSessionTraceRef[] }
export interface ProviderSessionTraceHistoryProjection {
  inputCount: number
  retainedCount: number
  compactedCount: number
  filteredCount: number
  summaryChars: number
  decisions: Array<Record<string, unknown>>
}
export type ProviderSessionTraceGenericProjection = Record<string, unknown> & { decisions: Array<Record<string, unknown>> }
export type ProviderSessionTraceRoundContextProjection = Record<string, unknown> & {
  eventId: string
  title: string
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  messageCount?: string
  systemMessageCount?: string
  promptChars?: string
  contextBundle?: ProviderSessionTraceRef
  historyProjection?: ProviderSessionTraceHistoryProjection
  toolLoopProjection?: ProviderSessionTraceGenericProjection
  historicalVisualProjection?: ProviderSessionTraceGenericProjection
  attachmentProjection?: ProviderSessionTraceGenericProjection
}
export interface ProviderSessionTraceSkillOmission {
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
}
export interface ProviderSessionTraceSkillContextProjection {
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
}
export interface ProviderSessionTracePromptDetail {
  eventId: string
  title: string
  contextBundle?: ProviderSessionTraceRef
  totalChars?: string
  messageCount?: string
  systemMessageCount?: string
  blockedToolCount?: string
  skills: string[]
  skillContextProjection: ProviderSessionTraceSkillContextProjection[]
  tools: string[]
  layers: Array<{ label: string; value: string }>
  contextLayers: Array<{ label: string; value: string }>
  partGroups: Array<{ contextLayer: string; count: number; chars: string; partIds: string[] }>
  parts: Array<{ id: string; layer?: string; contextLayer?: string; chars?: string }>
  budgetDecisions: Array<{ action: string; stage?: string; partId: string; reason?: string; originalChars?: string; renderedChars?: string }>
  historyProjection?: ProviderSessionTraceHistoryProjection
  toolLoopProjection?: ProviderSessionTraceGenericProjection
  historicalVisualProjection?: ProviderSessionTraceGenericProjection
  attachmentProjection?: ProviderSessionTraceGenericProjection
  runtimeSkillState?: {
    activeSkillIds: string[]
    loadedSkillIds: string[]
    unloadedSkillIds: string[]
    availableSkillIds: string[]
    omissions: ProviderSessionTraceSkillOmission[]
    sourceEventId?: string
  }
  contextLedgerState?: {
    mutationCount: number
    mutationEventIds: string[]
    latestMutationEventId?: string
    latestMutationReason?: string
  }
}
export type ProviderSessionTraceSkillEntry = {
  eventId: string
  createdAt: string
  eventType: string
  title: string
  summary?: string
  activeSkillIds: string[]
  loadedSkillIds: string[]
  unloadedSkillIds: string[]
  availableSkillIds: string[]
  omissions: ProviderSessionTraceSkillOmission[]
}
export interface ProviderSessionTraceModelCall {
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
}
export interface ProviderSessionTraceModelCallContext {
  callId: string
  label: string
  status: ProviderSessionTraceModelCall['status']
  statusLabel: string
  correlationLabel: string
  requestEventId?: string
  responseEventId?: string
  resultEventId?: string
  modelEventIds: string[]
  toolCalls: Array<{ eventId: string; toolName?: string; status: string; statusLabel: string; summary?: string }>
  messageWrites: Array<{ eventId: string; messageId?: string; source?: string; sourceLabel?: string; contentChars: number; contentPreview?: string }>
  issue?: string
}
export interface ProviderSessionTraceToolCall {
  eventId: string
  toolName?: string
  title: string
  status: AgentTraceEvent['status']
  statusLabel: string
  source?: string
  sandboxed?: boolean
  durationMs?: number
  summary?: string
  argsPreview?: string
  dataPreview?: string
  resultHash?: string
  resultChars?: number
  refs: ProviderSessionTraceRef[]
}
export interface ProviderSessionTraceMessageWrite {
  eventId: string
  messageId?: string
  source?: string
  sourceLabel?: string
  contentChars: number
  contentPreview?: string
  contentHash?: string
  refs: ProviderSessionTraceRef[]
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

export interface RunMessageOptions {
  onRunUpdate?: (run: AgentRun) => void
  onSourceMessage?: (message: AgentMessage, run: AgentRun) => void
  onProviderEvent?: (event: ProviderSessionEventV2) => void
  onPhase?: (name: string, details?: Record<string, unknown>) => void
  timeoutMs?: number
  streamRequestTimeoutMs?: number
  pollMs?: number
  providerManifest?: ProviderManifest
  agentManifest?: ProviderManifest
  providerSessionLimits?: ProviderSessionLimitsOverride
  /** Legacy provider wire key. New client code should use providerSessionLimits. */
  runtimeLimits?: ProviderSessionLimitsOverride
  signal?: AbortSignal
}

export interface ThreadStreamOptions {
  onProviderEvent?: (event: ProviderSessionEventV2) => void
  signal?: AbortSignal
}

export interface SessionStreamOptions {
  onProviderEvent?: (event: ProviderSessionEventV2) => void
  signal?: AbortSignal
}

export interface PlanStreamOptions {
  onProviderEvent?: (event: ProviderSessionEventV2) => void
  signal?: AbortSignal
}
