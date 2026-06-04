import type { AgentRun, AgentTraceEvent } from '../../../../state/shared/types.js'

export interface AgentTraceDebugView {
  schema: 'movscript.agent-trace-debug-view.v2'
  generatedAt: string
  runId: string
  run: AgentRun
  trace: {
    loaded: number
    total: number
    hasMore: false
  }
  coverage: AgentDebugCoverageSummary
  readinessChecklist: AgentDebugReadinessItem[]
  runtimeSummary: AgentRunRuntimeSummary
  runtimeFrames: AgentRuntimeFrame[]
  attentionEvents: AgentDebugAttentionEvent[]
  pendingActions: AgentPendingActionView[]
  fieldGuide: AgentDebugFieldGuideItem[]
  events: AgentTraceEvent[]
  reportText: string
  bundle: Record<string, unknown>
}

export type AgentRuntimeFrameKind = 'setup' | 'round' | 'finalize'
export type AgentRuntimeFrameFocus = 'context' | 'model' | 'tool' | 'skill' | 'message' | 'approval' | 'attention' | 'raw'

interface AgentRuntimeFrameBase {
  id: string
  kind: AgentRuntimeFrameKind
  label: string
  startedAt: string
  completedAt?: string
  durationMs?: number
  status: AgentTraceEvent['status']
  focus: AgentRuntimeFrameFocus[]
  eventIds: string[]
  events: AgentTraceEvent[]
  attentionEvents: AgentDebugAttentionEvent[]
}

export interface AgentRuntimeSetupFrame extends AgentRuntimeFrameBase {
  kind: 'setup'
  skills: AgentSkillTraceEntry[]
  contextMutations: AgentContextMutationView[]
}

export interface AgentRuntimeRoundFrame extends AgentRuntimeFrameBase {
  kind: 'round'
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  context: {
    projection?: AgentRuntimeContextProjectionView
    prompt?: AgentPromptDetailView
    diff: AgentRuntimeContextDiffView
  }
  skills: AgentSkillTraceEntry[]
  modelCalls: AgentModelCallSummary[]
  modelContext: AgentModelCallContextView[]
  toolCalls: AgentToolCallView[]
  messageWrites: AgentMessageWriteView[]
  approvals: AgentDebugAttentionEvent[]
}

export interface AgentRuntimeFinalizeFrame extends AgentRuntimeFrameBase {
  kind: 'finalize'
  messageWrites: AgentMessageWriteView[]
  pendingActions: AgentPendingActionView[]
}

export type AgentRuntimeFrame = AgentRuntimeSetupFrame | AgentRuntimeRoundFrame | AgentRuntimeFinalizeFrame

export interface AgentRuntimeContextDiffView {
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
  changes: AgentRuntimeContextChangeView[]
  mutations: AgentContextMutationView[]
}

export interface AgentRuntimeContextChangeView {
  eventId: string
  op: 'append' | 'amend' | 'delete' | 'unknown'
  key: string
  reason?: string
  ref?: AgentTraceRefView
  before?: AgentTraceRefView
  after?: AgentTraceRefView
  preview?: string
  raw?: unknown
}

export interface AgentDebugCoverageSummary {
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

export interface AgentDebugReadinessItem {
  id: string
  label: string
  status: 'ok' | 'warning'
  detail: string
  action: string
}

export interface AgentDebugFieldGuideItem {
  id: 'model_request' | 'model_response' | 'history_write' | 'missing_data'
  label: string
  description: string
}

export interface AgentModelCallSummary {
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

export interface AgentModelCallContextView {
  callId: string
  label: string
  status: AgentModelCallSummary['status']
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

export interface AgentSkillTraceEntry {
  eventId: string
  createdAt: string
  eventType: string
  title: string
  summary?: string
  activeSkillIds: string[]
  loadedSkillIds: string[]
  unloadedSkillIds: string[]
  availableSkillIds: string[]
  omissions: AgentRuntimeSkillOmissionView[]
}

export interface AgentRuntimeSkillTraceSummary {
  entries: AgentSkillTraceEntry[]
  currentActiveSkillIds: string[]
  currentLoadedSkillIds: string[]
  currentUnloadedSkillIds: string[]
  currentAvailableSkillIds: string[]
  currentOmissions: AgentRuntimeSkillOmissionView[]
}

export interface AgentRunRuntimeSummary {
  skills: {
    activeSkillIds: string[]
    loadedSkillIds: string[]
    unloadedSkillIds: string[]
    availableSkillIds: string[]
    contextProjection: AgentSkillContextProjectionView[]
    omissions: AgentRuntimeSkillOmissionView[]
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
    latestContextProjection?: AgentRuntimeContextProjectionView
    latestMutationReason?: string
    historyProjection?: AgentPromptHistoryProjectionView
    toolLoopProjection?: AgentGenericPromptProjectionView
    historicalVisualProjection?: AgentGenericPromptProjectionView
    attachmentProjection?: AgentGenericPromptProjectionView
  }
}

export interface AgentRuntimeContextProjectionView {
  eventId: string
  title: string
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  messageCount?: string
  systemMessageCount?: string
  promptChars?: string
  contextBundle?: AgentTraceRefView
  historyProjection?: AgentPromptHistoryProjectionView
  toolLoopProjection?: AgentGenericPromptProjectionView
  historicalVisualProjection?: AgentGenericPromptProjectionView
  attachmentProjection?: AgentGenericPromptProjectionView
}

export interface AgentRuntimeContextDiffWindowView {
  projection: AgentRuntimeContextProjectionView
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
  mutations: AgentContextMutationView[]
}

export interface AgentTraceRefView {
  kind: 'context_bundle' | 'context' | 'content_hash' | 'result_hash'
  label: string
  key?: string
  id?: string
  type?: string
  hash?: string
}

export interface AgentPromptDetailView {
  eventId: string
  title: string
  contextBundle?: AgentTraceRefView
  totalChars?: string
  messageCount?: string
  systemMessageCount?: string
  blockedToolCount?: string
  skills: string[]
  skillContextProjection: AgentSkillContextProjectionView[]
  tools: string[]
  layers: Array<{ label: string; value: string }>
  contextLayers: Array<{ label: string; value: string }>
  partGroups: Array<{ contextLayer: string; count: number; chars: string; partIds: string[] }>
  parts: Array<{ id: string; layer?: string; contextLayer?: string; chars?: string }>
  budgetDecisions: Array<{ action: string; stage?: string; partId: string; reason?: string; originalChars?: string; renderedChars?: string }>
  historyProjection?: AgentPromptHistoryProjectionView
  toolLoopProjection?: AgentGenericPromptProjectionView
  historicalVisualProjection?: AgentGenericPromptProjectionView
  attachmentProjection?: AgentGenericPromptProjectionView
  runtimeSkillState?: AgentPromptSkillStateView
  contextLedgerState?: AgentPromptContextLedgerStateView
}

export interface AgentGenericPromptProjectionView {
  [key: string]: unknown
  decisions: Array<Record<string, unknown>>
}

export interface AgentPromptHistoryProjectionView {
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

export interface AgentSkillContextProjectionView {
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

export interface AgentPromptSkillStateView {
  activeSkillIds: string[]
  loadedSkillIds: string[]
  unloadedSkillIds: string[]
  availableSkillIds: string[]
  omissions: AgentRuntimeSkillOmissionView[]
  sourceEventId?: string
}

export interface AgentRuntimeSkillOmissionView {
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

export interface AgentPromptContextLedgerStateView {
  mutationCount: number
  mutationEventIds: string[]
  latestMutationEventId?: string
  latestMutationReason?: string
}

export interface AgentContextMutationView {
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
  latest?: {
    id: string
    type: 'append' | 'amend' | 'delete'
    createdAt: string
    reason?: string
  }
  refs: AgentTraceRefView[]
}

export interface AgentMessageWriteView {
  eventId: string
  messageId?: string
  source?: string
  sourceLabel?: string
  contentChars: number
  contentPreview?: string
  contentHash?: string
  refs: AgentTraceRefView[]
}

export interface AgentToolCallView {
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
  refs: AgentTraceRefView[]
}

export interface AgentDebugAttentionEvent {
  eventId: string
  createdAt: string
  kind: AgentTraceEvent['kind']
  kindLabel: string
  status: AgentTraceEvent['status']
  statusLabel: string
  title: string
  summary?: string
  behavior?: string
  impact?: string
  error?: string
}

export type AgentPendingActionView =
  | {
    type: 'approval'
    id: string
    createdAt: string
    toolName: string
    status: string
    reason?: string
    risk?: string
    permission?: string
  }
  | {
    type: 'input'
    id: string
    createdAt: string
    title: string
    question: string
    inputType: string
    choices: Array<{ id: string; label: string; description?: string }>
    allowCustomAnswer: boolean
    status: string
  }
