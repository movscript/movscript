import { useUserStore } from '@/store/userStore'
import { getAPIV1BaseURL } from '@/lib/config'
import { AGENT_RUNTIME_EVENT_V2_SCHEMA, AGENT_TRACE_EVENT_KINDS } from '@movscript/protocol'
import { runtimeRunFromEvent, runtimeRunIdFromEvent } from '@movscript/event-state'
import type {
  AgentApprovalRequest,
  AgentCapabilitiesResponse,
  AgentCatalogProfile,
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
  AgentRunPolicy,
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

export { AGENT_TRACE_EVENT_KINDS }
export type {
  AgentApprovalRequest,
  AgentCapabilitiesResponse,
  AgentCatalogProfile,
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
  AgentRunPolicy,
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

export type AgentRunPolicyOverride = Partial<Pick<AgentRunPolicy, 'approvalMode' | 'sandboxMode' | 'maxToolCalls' | 'maxIterations' | 'workflow'>>

export interface AgentThreadListQuery {
  cursor?: string
  limit?: number
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
  unit: 'ms' | 'bytes' | 'count'
  createdAt: string
  labels?: Record<string, string | number | boolean>
}

export interface AgentRuntimeTelemetryLogEntry {
  level: 'info' | 'warning' | 'error'
  message: string
  createdAt: string
  operationId?: string
  details?: Record<string, unknown>
}

export interface AgentRuntimeTelemetrySnapshot {
  operations: Array<{
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
  }>
  metrics: AgentRuntimeTelemetryMetricSample[]
  logs: AgentRuntimeTelemetryLogEntry[]
  summary: {
    operationCount: number
    runningOperationCount: number
    slowOperationCount: number
    errorOperationCount: number
  }
}

export type AgentMemoryScope = 'global' | 'project' | 'thread'
export type AgentMemoryKind = 'preference' | 'fact' | 'entity_ref' | 'draft' | 'decision' | 'warning'
export type AgentDraftKind =
  | 'setting_proposal'
  | 'asset_proposal'
  | 'project_standards_proposal'
  | 'production_proposal'
  | 'content_unit_proposal'
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

export class LocalAgentHTTPError extends Error {
  constructor(
    readonly status: number,
    readonly responseText: string,
    message: string,
  ) {
    super(`local agent returned ${status}: ${message}`)
  }
}

export function isLocalAgentNotFoundError(error: unknown): boolean {
  return error instanceof LocalAgentHTTPError
    ? error.status === 404
    : error instanceof Error && /^local agent returned 404:/.test(error.message)
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
  decisions: Array<{ eventId: string; kind: 'policy' | 'approval' | 'input' | 'skill' | 'context'; summary: string; impact?: string }>
  attention: Array<{ eventId: string; severity: 'info' | 'warning' | 'error' | 'blocked'; title: string; summary?: string; nextAction?: string }>
  evidenceIndex: Array<{
    evidenceId: string
    eventId: string
    kind: 'model_request' | 'model_response' | 'tool_result' | 'raw_event'
    label: string
    chars: number
    preview: string
    fetchPath: string
  }>
}

export interface AgentRunDebugEvidence {
  schema: 'movscript.agent.run-debug-evidence.v1'
  runId: string
  evidenceId: string
  eventId: string
  kind: 'model_request' | 'model_response' | 'tool_result' | 'raw_event'
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
    }>
    currentActiveSkillIds: string[]
    currentLoadedSkillIds: string[]
    currentUnloadedSkillIds: string[]
    currentAvailableSkillIds: string[]
  }
  promptDetails: unknown[]
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

export interface AgentSkillBundleFile {
  path: string
  content: string
}

export interface AgentSkillBundleInstallResult {
  status: 'installed'
  pluginId: string
  targetDir: string
  installedFiles: string[]
  catalog?: Record<string, unknown>
}

export interface AgentSkillBundleUninstallResult {
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
  timeoutMs?: number
  streamRequestTimeoutMs?: number
  pollMs?: number
  agentManifest?: AgentManifest
  runPolicy?: AgentRunPolicyOverride
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

const DEFAULT_LOCAL_AGENT_BASE_URL = 'http://127.0.0.1:28765'
const DEFAULT_RUN_STREAM_HTTP_TIMEOUT_MS = 60_000
const TERMINAL_RUN_STATUSES = new Set<AgentRunStatus>([
  'completed',
  'completed_with_warnings',
  'requires_action',
  'failed',
  'cancelled',
])

export function canStartLocalAgentFromClient(): boolean {
  return typeof window !== 'undefined' && typeof window.api?.ensureAgentRuntime === 'function'
}

export class LocalAgentClient {
  readonly baseURL: string

  constructor(baseURL = runtimeLocalAgentBaseURL()) {
    this.baseURL = baseURL.replace(/\/+$/, '')
  }

  health(): Promise<AgentHealth> {
    return this.getJSON('/health', { auth: false })
  }

  inspect(): Promise<AgentInspectResponse> {
    return this.getJSON('/inspect')
  }

  getRuntimeTelemetry(signal?: AbortSignal): Promise<AgentRuntimeTelemetrySnapshot> {
    return this.getJSON('/runtime/telemetry', { auth: false, signal })
  }

  async ensureRunning(): Promise<AgentHealth> {
    try {
      return await this.health()
    } catch (healthError) {
      const ensureAgentRuntime = canStartLocalAgentFromClient() ? window.api?.ensureAgentRuntime : undefined
      if (!ensureAgentRuntime) {
        throw new Error(`当前窗口没有桌面客户端启动能力。请用 Electron 桌面端打开，或手动运行：pnpm --filter @movscript/agent dev`)
      }

      const status = await ensureAgentRuntime({ baseURL: this.baseURL })
      if (!status.ok) {
        throw new Error(status.error || `failed to start agent at ${this.baseURL}`)
      }
      return this.health()
    }
  }

  listSessions(): Promise<{ sessions: AgentSessionSummary[] }> {
    return this.getJSON('/sessions')
  }

  getSession(sessionId: string, signal?: AbortSignal): Promise<AgentSession> {
    return this.getJSON(`/sessions/${encodeURIComponent(sessionId)}`, { signal })
  }

  getSessionRuntime(sessionId: string, signal?: AbortSignal): Promise<AgentRuntimeSnapshotV2> {
    return this.getJSON(`/sessions/${encodeURIComponent(sessionId)}/runtime`, { signal })
  }

  createThread(input: { sessionId?: string; title?: string; projectId?: number; agentName?: string; agentRole?: AgentThreadRole; parentThreadId?: string; parentRunId?: string } = {}, signal?: AbortSignal): Promise<AgentThread> {
    return this.postJSON('/threads', input, signal)
  }

  listThreads(query: AgentThreadListQuery = {}, signal?: AbortSignal): Promise<AgentThreadListPage> {
    const params = new URLSearchParams()
    if (query.cursor) params.set('cursor', query.cursor)
    if (typeof query.limit === 'number') params.set('limit', String(query.limit))
    return this.getJSON(`/threads${params.size ? `?${params.toString()}` : ''}`, { signal })
  }

  deleteThread(threadId: string, signal?: AbortSignal): Promise<AgentThreadDeletionResult> {
    return this.deleteJSON(`/threads/${encodeURIComponent(threadId)}`, signal)
  }

  deleteAllThreads(signal?: AbortSignal): Promise<AgentThreadClearResult> {
    return this.deleteJSON('/threads', signal)
  }

  addMessage(threadId: string, content: string, clientInput?: AgentClientInput, signal?: AbortSignal): Promise<AgentMessage> {
    return this.postJSON(`/threads/${encodeURIComponent(threadId)}/messages`, {
      role: 'user',
      content,
      ...(clientInput ? { clientInput } : {}),
    }, signal)
  }

  createMessageRun(threadId: string, input: {
    message: string
    sourceMessageId?: string
    toolCall?: AgentToolCall
    agentManifest?: AgentManifest
    approvedToolNames?: string[]
    clientInput?: AgentClientInput
    policy?: AgentRunPolicyOverride
    activeRunPolicy?: 'runtime_input' | 'new_run'
    runtimeInputMode?: 'soft' | 'hard'
  }, signal?: AbortSignal): Promise<CreateMessageRunResult> {
    return this.postJSON(`/threads/${encodeURIComponent(threadId)}/runs`, input, signal)
  }

  listRuns(): Promise<{ runs: AgentRun[] }> {
    return this.getJSON('/runs')
  }

  listRunsByParent(parentRunId: string, signal?: AbortSignal): Promise<{ runs: AgentRun[] }> {
    return this.getJSON(`/runs?parentRunId=${encodeURIComponent(parentRunId)}`, { signal })
  }

  listRunsByThread(threadId: string, signal?: AbortSignal): Promise<{ threadId: string; runs: AgentRun[] }> {
    return this.getJSON(`/threads/${encodeURIComponent(threadId)}/runs`, { signal })
  }

  getThreadRuntime(threadId: string, signal?: AbortSignal): Promise<AgentRuntimeSnapshotV2> {
    return this.getJSON(`/threads/${encodeURIComponent(threadId)}/runtime`, { signal })
  }

  previewRun(input: { threadId?: string; message?: string; agentManifest?: AgentManifest; approvedToolNames?: string[]; clientInput?: AgentClientInput; policy?: AgentRunPolicyOverride }, signal?: AbortSignal): Promise<AgentRunPreview> {
    return this.postJSON('/runs/preview', input, signal)
  }

  getCapabilities(query: { projectId?: number } = {}): Promise<AgentCapabilitiesResponse> {
    const params = new URLSearchParams()
    if (typeof query.projectId === 'number') params.set('projectId', String(query.projectId))
    return this.getJSON(`/capabilities${params.size ? `?${params.toString()}` : ''}`)
  }

  installAgentSkillBundle(input: { pluginId: string; files: AgentSkillBundleFile[] }, signal?: AbortSignal): Promise<AgentSkillBundleInstallResult> {
    return this.postJSON('/agent-catalog/skills/install-bundle', input, signal)
  }

  uninstallAgentSkillBundle(input: { pluginId: string }, signal?: AbortSignal): Promise<AgentSkillBundleUninstallResult> {
    return this.postJSON('/agent-catalog/skills/uninstall-bundle', input, signal)
  }

  reloadAgentCatalog(signal?: AbortSignal): Promise<unknown> {
    return this.postJSON('/agent-catalog/reload', {}, signal)
  }

  saveDefaultAgentProfile(input: { profileId: string }, signal?: AbortSignal): Promise<AgentManifest> {
    return this.postJSON('/agent-profiles/default', input, signal)
  }

  saveDefaultToolPolicy(input: { toolGrants: AgentManifest['tools'] }, signal?: AbortSignal): Promise<AgentManifest> {
    return this.postJSON('/agent-tools/default-policy', input, signal)
  }

  saveDefaultSkillPolicy(input: { skills: Array<{ id: string; enabled: boolean }> }, signal?: AbortSignal): Promise<{ skills: AgentCatalogSkill[] }> {
    return this.postJSON('/agent-skills/default-policy', input, signal)
  }

  getModelConfig(): Promise<RuntimeModelConfigPublic> {
    return withRuntimeModelConfigError(this.getJSON('/model-config', { auth: false }))
  }

  saveModelConfig(input: {
    modelConfigId?: number
    model: string
    apiKind?: RuntimeModelAPIKind
    baseURL?: string
    apiKey?: string
    useForChat?: boolean
    useForPlanner?: boolean
  }): Promise<RuntimeModelConfigPublic> {
    return withRuntimeModelConfigError(this.postJSON('/model-config', input))
  }

  clearModelConfig(): Promise<RuntimeModelConfigPublic> {
    return withRuntimeModelConfigError(this.deleteJSON('/model-config'))
  }

  testModelConfig(input: {
    message?: string
    modelConfigId?: number
    model?: string
    apiKind?: RuntimeModelAPIKind
    baseURL?: string
    apiKey?: string
    useForChat?: boolean
    useForPlanner?: boolean
  } = {}): Promise<RuntimeModelTestResult> {
    return withRuntimeModelConfigError(this.postJSON('/model-config/test', input))
  }

  cancelRun(runId: string, input: { reason?: string } = {}, signal?: AbortSignal): Promise<AgentRun> {
    return this.postJSON(`/runs/${encodeURIComponent(runId)}/cancel`, input, signal)
  }

  getRun(runId: string, signal?: AbortSignal): Promise<AgentRun> {
    return this.getJSON(`/runs/${encodeURIComponent(runId)}`, { signal })
  }

  approveInteraction(interactionId: string, signal?: AbortSignal): Promise<{ interaction: RuntimeInteraction; run: AgentRun }> {
    return this.postJSON(`/interactions/${encodeURIComponent(interactionId)}/approve`, {}, signal)
  }

  rejectInteraction(interactionId: string, signal?: AbortSignal): Promise<{ interaction: RuntimeInteraction; run: AgentRun }> {
    return this.postJSON(`/interactions/${encodeURIComponent(interactionId)}/reject`, {}, signal)
  }

  getTaskGraphSnapshot(taskGraphId: string, signal?: AbortSignal): Promise<AgentTaskGraphSnapshot> {
    return this.getJSON(`/plans/${encodeURIComponent(taskGraphId)}`, { signal })
  }

  createTaskGraph(input: {
    threadId: string
    title?: string
    goal?: string
    message?: string
    maxTasks?: number
    tasks?: Array<Partial<AgentTask> & { title?: string }>
    createPlannerRun?: boolean
    agentManifest?: AgentManifest
    policy?: AgentRunPolicyOverride
  }, signal?: AbortSignal): Promise<AgentTaskGraphSnapshot> {
    return this.postJSON('/plans', input, signal)
  }

  getPlanTasks(taskGraphId: string, signal?: AbortSignal): Promise<{ taskGraphId: string; tasks: AgentTask[] }> {
    return this.getJSON(`/plans/${encodeURIComponent(taskGraphId)}/tasks`, { signal })
  }

  updateTask(taskId: string, input: Partial<AgentTask>, signal?: AbortSignal): Promise<AgentTask> {
    return this.patchJSON(`/tasks/${encodeURIComponent(taskId)}`, input, signal)
  }

  dispatchTaskGraph(taskGraphId: string, input: {
    plannerRunId?: string
    taskIds?: string[]
    maxWorkers?: number
    maxTaskAttempts?: number
    retryFailed?: boolean
    workerTimeoutMs?: number
    agentManifest?: AgentManifest
    policy?: AgentRunPolicyOverride
  } = {}, signal?: AbortSignal): Promise<DispatchTaskGraphResult> {
    return this.postJSON(`/plans/${encodeURIComponent(taskGraphId)}/dispatch`, input, signal)
  }

  getChildRuns(runId: string, signal?: AbortSignal): Promise<{ runId: string; children: AgentRun[] }> {
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/children`, { signal })
  }

  replanRun(runId: string, input: {
    tasks?: Array<Partial<AgentTask> & { title?: string }>
    addTasks?: Array<Partial<AgentTask> & { title: string }>
    updates?: Array<Partial<AgentTask> & { id: string }>
    updateTasks?: Array<Partial<AgentTask> & { id: string }>
    resetTaskIds?: string[]
    resetBlocked?: boolean
    resetNeedsReview?: boolean
    resetFailed?: boolean
    resetCancelled?: boolean
    dispatch?: boolean
    maxWorkers?: number
    maxTaskAttempts?: number
    retryFailed?: boolean
    workerTimeoutMs?: number
  } = {}, signal?: AbortSignal): Promise<UpdateTaskGraphResult> {
    return this.postJSON(`/runs/${encodeURIComponent(runId)}/updateTaskGraph`, input, signal)
  }

  cancelRunTree(runId: string, input: { reason?: string } = {}, signal?: AbortSignal): Promise<{ cancelledRunIds: string[] }> {
    return this.postJSON(`/runs/${encodeURIComponent(runId)}/cancel-tree`, input, signal)
  }

  getRunTraceEvents(runId: string, query: AgentTraceQuery = {}): Promise<AgentRunTraceResponse> {
    const params = new URLSearchParams()
    if (query.cursor) params.set('cursor', query.cursor)
    if (typeof query.limit === 'number') params.set('limit', String(query.limit))
    if (query.kind) params.set('kind', query.kind)
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/trace${params.size ? `?${params.toString()}` : ''}`)
  }

  getRunTraceEventData(runId: string, eventId: string): Promise<{ runId: string; eventId: string; data: unknown }> {
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/trace/events/${encodeURIComponent(eventId)}/data`)
  }

  getRunTraceSummary(runId: string): Promise<AgentRunTraceSummary> {
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/trace/summary`)
  }

  getRunTraceDebugView(runId: string): Promise<AgentTraceDebugView> {
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/trace/debug-view`)
  }

  getRunDebugLedger(runId: string): Promise<AgentRunDebugLedger> {
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/debug-ledger`)
  }

  getRunDebugEvidence(runId: string, evidenceId: string): Promise<AgentRunDebugEvidence> {
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/debug-evidence/${encodeURIComponent(evidenceId)}`)
  }

  getRunGenerationView(runId: string): Promise<AgentRunGenerationView> {
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/generation-view`)
  }

  answerRunInput(runId: string, input: { requestId?: string; choiceIds?: string[]; text?: string; sourceMessageId?: string }, signal?: AbortSignal): Promise<AgentRun> {
    return this.postJSON(`/runs/${encodeURIComponent(runId)}/input`, input, signal)
  }

  async waitForRun(runId: string, options: { timeoutMs?: number; pollMs?: number; onRunUpdate?: (run: AgentRun) => void; signal?: AbortSignal } = {}): Promise<AgentRun> {
    const timeoutMs = options.timeoutMs ?? 30_000
    const pollMs = options.pollMs ?? 300
    const deadline = Date.now() + timeoutMs

    while (true) {
      const run = await this.getRun(runId, options.signal)
      options.onRunUpdate?.(run)
      if (TERMINAL_RUN_STATUSES.has(run.status)) return run
      if (Date.now() > deadline) throw new Error(`local runtime run ${runId} did not finish within ${timeoutMs}ms`)
      await sleepWithAbort(pollMs, options.signal)
    }
  }

  async streamRun(runId: string, options: RunMessageOptions = {}): Promise<AgentRun> {
    const overallStartedAt = Date.now()
    const overallTimeoutMs = normalizePositiveTimeoutMs(options.timeoutMs)
    const streamRequestTimeoutMs = normalizePositiveTimeoutMs(options.streamRequestTimeoutMs) ?? DEFAULT_RUN_STREAM_HTTP_TIMEOUT_MS
    let lastKnownRun: AgentRun | undefined
    const timeoutMs = options.timeoutMs ?? 30_000
    const externalSignal = options.signal
    const fullRunOrLatest = async (run: AgentRun): Promise<AgentRun> => {
      if (run.streamPartial) {
        const fullRun = await this.getRun(run.id, externalSignal).catch(() => undefined)
        if (fullRun) return fullRun
      }
      return run
    }

    let streamRequestCount = 0
    while (true) {
      if (externalSignal?.aborted) throw externalSignal.reason ?? createLocalAgentAbortError()
      const remainingOverallMs = overallTimeoutMs === undefined
        ? undefined
        : overallTimeoutMs - (Date.now() - overallStartedAt)
      if (remainingOverallMs !== undefined && remainingOverallMs <= 0) {
        const latestRun = await this.getRun(runId, externalSignal).catch(() => undefined)
        if (latestRun) {
          lastKnownRun = latestRun
          options.onRunUpdate?.(latestRun)
          if (TERMINAL_RUN_STATUSES.has(latestRun.status)) return await fullRunOrLatest(latestRun)
        }
        throw new Error(`local runtime stream for run ${runId} timed out after ${timeoutMs}ms across ${streamRequestCount} HTTP request${streamRequestCount === 1 ? '' : 's'}`)
      }

      const controller = new AbortController()
      let streamRequestTimedOut = false
      const abortFromExternal = () => {
        if (!controller.signal.aborted) controller.abort(externalSignal?.reason)
      }
      if (externalSignal?.aborted) abortFromExternal()
      else externalSignal?.addEventListener('abort', abortFromExternal, { once: true })

      const requestTimeoutMs = Math.max(1, Math.min(streamRequestTimeoutMs, remainingOverallMs ?? streamRequestTimeoutMs))
      const requestTimeout = globalThis.setTimeout(() => {
        streamRequestTimedOut = true
        controller.abort(createLocalAgentAbortError())
      }, requestTimeoutMs)

      try {
        streamRequestCount += 1
        const attempt = await this.readRunStreamAttempt(runId, options, controller.signal)
        lastKnownRun = attempt.run
        if (TERMINAL_RUN_STATUSES.has(attempt.run.status)) return await fullRunOrLatest(attempt.run)
        options.onRunUpdate?.(attempt.run)
      } catch (error) {
        if (externalSignal?.aborted) throw externalSignal.reason ?? createLocalAgentAbortError()

        const latestRun = await this.getRun(runId, externalSignal).catch(() => undefined)
        if (latestRun) {
          lastKnownRun = latestRun
          options.onRunUpdate?.(latestRun)
          if (TERMINAL_RUN_STATUSES.has(latestRun.status)) return await fullRunOrLatest(latestRun)
        }

        if (streamRequestTimedOut || (latestRun && isRetryableRunStreamError(error))) {
          continue
        }

        const fallbackRun = lastKnownRun ?? latestRun
        if (fallbackRun && TERMINAL_RUN_STATUSES.has(fallbackRun.status)) return await fullRunOrLatest(fallbackRun)
        throw error
      } finally {
        globalThis.clearTimeout(requestTimeout)
        externalSignal?.removeEventListener('abort', abortFromExternal)
      }
    }
  }

  async streamThread(threadId: string, options: ThreadStreamOptions = {}): Promise<void> {
    await this.streamRuntimeEvents(`/threads/${encodeURIComponent(threadId)}/stream`, options)
  }

  async streamSession(sessionId: string, options: SessionStreamOptions = {}): Promise<void> {
    await this.streamRuntimeEvents(`/sessions/${encodeURIComponent(sessionId)}/stream`, options)
  }

  async streamPlan(taskGraphId: string, options: PlanStreamOptions = {}): Promise<void> {
    await this.streamRuntimeEvents(`/plans/${encodeURIComponent(taskGraphId)}/stream`, options)
  }

  private async streamRuntimeEvents(
    path: string,
    options: { onRuntimeEvent?: (event: AgentRuntimeEventV2) => void; signal?: AbortSignal } = {},
  ): Promise<void> {
    const res = await fetch(`${this.baseURL}${path}`, {
      headers: this.authHeaders({ Accept: 'text/event-stream' }),
      signal: options.signal,
    })
    if (!res.ok) throw await localAgentResponseError(res)
    if (!res.body) return

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const processBlock = (block: string) => {
      const parsed = parseSSEBlock(block)
      if (!parsed) return
      try {
        const event = parseRuntimeEvent(parsed.data)
        if (event) options.onRuntimeEvent?.(event)
      } catch {
        return
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let normalized = buffer.replace(/\r\n/g, '\n')
      let separatorIndex = normalized.indexOf('\n\n')
      while (separatorIndex >= 0) {
        processBlock(normalized.slice(0, separatorIndex))
        normalized = normalized.slice(separatorIndex + 2)
        separatorIndex = normalized.indexOf('\n\n')
      }
      buffer = normalized
    }
    const tail = decoder.decode()
    if (tail) buffer += tail
    if (buffer.trim()) processBlock(buffer)
  }

  private async streamRunFromThread(threadId: string, runId: string, options: RunMessageOptions, initialRun?: AgentRun): Promise<AgentRun> {
    const externalSignal = options.signal
    const controller = new AbortController()
    let latestRun = initialRun
    let settled = false
    const abortFromExternal = () => {
      if (!controller.signal.aborted) controller.abort(externalSignal?.reason)
    }
    if (externalSignal?.aborted) abortFromExternal()
    else externalSignal?.addEventListener('abort', abortFromExternal, { once: true })

    const timeoutMs = normalizePositiveTimeoutMs(options.timeoutMs) ?? 30_000
    const timeout = globalThis.setTimeout(() => {
      if (!controller.signal.aborted) controller.abort(createLocalAgentAbortError())
    }, timeoutMs)

    try {
      await this.streamThread(threadId, {
        signal: controller.signal,
        onRuntimeEvent: (event) => {
          options.onRuntimeEvent?.(event)
          if (runtimeRunIdFromEvent(event) !== runId) return
          const eventRun = runtimeRunFromEvent(event)
          if (eventRun) {
            latestRun = eventRun
            options.onRunUpdate?.(eventRun)
          }
          if (latestRun && TERMINAL_RUN_STATUSES.has(latestRun.status)) {
            settled = true
            if (!controller.signal.aborted) controller.abort(createLocalAgentAbortError())
          }
        },
      })
    } catch (error) {
      if (externalSignal?.aborted) throw externalSignal.reason ?? createLocalAgentAbortError()
      if (!settled) return this.streamRun(runId, options)
    } finally {
      globalThis.clearTimeout(timeout)
      externalSignal?.removeEventListener('abort', abortFromExternal)
    }

    const terminalRun = latestRun
    if (terminalRun && TERMINAL_RUN_STATUSES.has(terminalRun.status)) {
      return terminalRun.streamPartial
        ? await this.getRun(terminalRun.id, externalSignal).catch(() => terminalRun)
        : terminalRun
    }
    return this.streamRun(runId, options)
  }

  private async readRunStreamAttempt(runId: string, options: RunMessageOptions, signal: AbortSignal): Promise<{ run: AgentRun }> {
    const res = await fetch(`${this.baseURL}/runs/${encodeURIComponent(runId)}/stream`, {
      headers: this.authHeaders({ Accept: 'text/event-stream' }),
      signal,
    })
    if (!res.ok) throw await localAgentResponseError(res)
    if (!res.body) return { run: await this.waitForRun(runId, { ...options, signal }) }

    let latestRun = await this.getRun(runId, signal)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const processBlock = (block: string): AgentRun | undefined => {
      const parsed = parseSSEBlock(block)
      if (!parsed) return undefined
      const event = parseRuntimeEvent(parsed.data)
      if (!event) return undefined
      options.onRuntimeEvent?.(event)
      const eventRun = runtimeRunFromEvent(event)
      if (eventRun) {
        latestRun = eventRun
        options.onRunUpdate?.(eventRun)
      }
      if (TERMINAL_RUN_STATUSES.has(latestRun.status)) return latestRun
      return undefined
    }
    const finishFromStream = async (run: AgentRun): Promise<{ run: AgentRun }> => {
      await reader.cancel().catch(() => undefined)
      return { run }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let normalized = buffer.replace(/\r\n/g, '\n')
      let separatorIndex = normalized.indexOf('\n\n')
      while (separatorIndex >= 0) {
        const terminalRun = processBlock(normalized.slice(0, separatorIndex))
        if (terminalRun) return await finishFromStream(terminalRun)
        normalized = normalized.slice(separatorIndex + 2)
        separatorIndex = normalized.indexOf('\n\n')
      }
      buffer = normalized
    }
    const tail = decoder.decode()
    if (tail) buffer += tail
    if (buffer.trim()) {
      const terminalRun = processBlock(buffer)
      if (terminalRun) return await finishFromStream(terminalRun)
    }
    if (latestRun.streamPartial && TERMINAL_RUN_STATUSES.has(latestRun.status)) {
      return await finishFromStream(latestRun)
    }
    return { run: latestRun }
  }

  getThread(threadId: string, signal?: AbortSignal): Promise<AgentThread> {
    return this.getJSON(`/threads/${encodeURIComponent(threadId)}`, { signal })
  }

  updateThread(threadId: string, input: { title?: string; archived?: boolean; metadata?: Record<string, unknown> }, signal?: AbortSignal): Promise<AgentThread> {
    return this.patchJSON(`/threads/${encodeURIComponent(threadId)}`, input, signal)
  }

  listMemories(query: { scope?: AgentMemoryScope; projectId?: number; threadId?: string; kind?: AgentMemoryKind } = {}): Promise<{ memories: AgentMemory[] }> {
    const params = new URLSearchParams()
    if (query.scope) params.set('scope', query.scope)
    if (typeof query.projectId === 'number') params.set('projectId', String(query.projectId))
    if (query.threadId) params.set('threadId', query.threadId)
    if (query.kind) params.set('kind', query.kind)
    return this.getJSON(`/memories${params.size ? `?${params.toString()}` : ''}`)
  }

  listDrafts(query: { projectId?: number; kind?: AgentDraftKind; status?: AgentDraftStatus | AgentDraftStatus[]; threadId?: string; runId?: string; pageKey?: string; pageType?: string; pageRoute?: string; pageEntityType?: string; pageEntityId?: number | string; limit?: number } = {}): Promise<{ drafts: AgentDraft[] }> {
    const params = new URLSearchParams()
    if (typeof query.projectId === 'number') params.set('projectId', String(query.projectId))
    if (query.kind) params.set('kind', query.kind)
    if (Array.isArray(query.status)) {
      for (const status of query.status) params.append('status', status)
    } else if (query.status) {
      params.set('status', query.status)
    }
    if (query.threadId) params.set('threadId', query.threadId)
    if (query.runId) params.set('runId', query.runId)
    if (query.pageKey) params.set('pageKey', query.pageKey)
    if (query.pageType) params.set('pageType', query.pageType)
    if (query.pageRoute) params.set('pageRoute', query.pageRoute)
    if (query.pageEntityType) params.set('pageEntityType', query.pageEntityType)
    if (query.pageEntityId !== undefined) params.set('pageEntityId', String(query.pageEntityId))
    if (typeof query.limit === 'number') params.set('limit', String(query.limit))
    return this.getJSON(`/drafts${params.size ? `?${params.toString()}` : ''}`)
  }

  getDraft(draftId: string): Promise<AgentDraft> {
    return this.getJSON(`/drafts/${encodeURIComponent(draftId)}`)
  }

  createDraft(input: { projectId?: number; kind?: AgentDraftKind; title: string; content: string; source?: Record<string, unknown>; target?: Record<string, unknown>; seed?: Record<string, unknown>; metadata?: Record<string, unknown> }): Promise<AgentDraft> {
    return this.postJSON('/draft', input)
  }

  updateDraft(draftId: string, input: { status?: AgentDraftStatus; title?: string; content?: string; target?: Record<string, unknown>; metadata?: Record<string, unknown> }): Promise<AgentDraft> {
    return this.patchJSON(`/drafts/${encodeURIComponent(draftId)}`, input)
  }

  previewApplyDraft(draftId: string, input: { target?: Record<string, unknown>; targetEntityType?: string; targetEntityId?: number | string; targetField?: string; currentValue?: unknown; proposedValue?: unknown } = {}): Promise<AgentDraftApplyPreview> {
    return this.postJSON(`/drafts/${encodeURIComponent(draftId)}/apply-preview`, input)
  }

  applyDraft(draftId: string, input: { target?: Record<string, unknown>; targetEntityType?: string; targetEntityId?: number | string; targetField?: string; currentValue?: unknown; proposedValue?: unknown } = {}): Promise<AgentDraftApplyPreview> {
    return this.postJSON(`/drafts/${encodeURIComponent(draftId)}/apply`, input)
  }

  rejectDraft(draftId: string, reason?: string): Promise<AgentDraft> {
    return this.postJSON(`/drafts/${encodeURIComponent(draftId)}/reject`, { reason })
  }

  createMemory(input: { scope: AgentMemoryScope; kind: AgentMemoryKind; content: string; projectId?: number; threadId?: string }): Promise<AgentMemory> {
    return this.postJSON('/memories', input)
  }

  deleteMemory(memoryId: string, signal?: AbortSignal): Promise<{ deleted: true }> {
    return this.deleteJSON(`/memories/${encodeURIComponent(memoryId)}`, signal)
  }

  async runMessageStream(input: {
    threadId?: string
    message: string
    sourceMessageId?: string
    title?: string
    projectId?: number
    clientInput?: AgentClientInput
    toolCall?: AgentToolCall
    approvedToolNames?: string[]
    activeRunPolicy?: 'runtime_input' | 'new_run'
  }, options: RunMessageOptions = {}): Promise<RunMessageResult> {
    const resolvedThread = await this.resolveMessageThread(input, options.signal)
    const thread = resolvedThread.thread
    const created = await this.createMessageRun(thread.id, {
      message: input.message,
      ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
      ...(input.toolCall ? { toolCall: input.toolCall } : {}),
      ...(options.agentManifest ? { agentManifest: options.agentManifest } : {}),
      ...(input.approvedToolNames?.length ? { approvedToolNames: input.approvedToolNames } : {}),
      ...(input.clientInput ? { clientInput: input.clientInput } : {}),
      activeRunPolicy: input.activeRunPolicy ?? 'new_run',
      ...(options.runPolicy ? { policy: options.runPolicy } : {}),
    }, options.signal)
    const run = created.run
    options.onSourceMessage?.(created.message, run)
    options.onRunUpdate?.(run)
    if (created.runtimeInput?.accepted) {
      const finalThread = await this.getThread(thread.id)
      return { run, thread: finalThread, threadResolution: resolvedThread.resolution, sourceMessage: created.message }
    }
    const finalRun = await this.streamRunFromThread(thread.id, run.id, options, run)
    const finalThread = await this.getThread(thread.id)
    return { run: finalRun, thread: finalThread, threadResolution: resolvedThread.resolution, sourceMessage: created.message }
  }

  private async resolveMessageThread(input: { threadId?: string; title?: string; projectId?: number }, signal?: AbortSignal): Promise<{
    thread: AgentThread
    resolution: AgentThreadResolution
  }> {
    if (!input.threadId) {
      const thread = await this.createThread({ title: input.title, projectId: input.projectId }, signal)
      return {
        thread,
        resolution: {
          threadId: thread.id,
          reusedExistingThread: false,
          createdNewThread: true,
          missingRequestedThread: false,
        },
      }
    }

    try {
      const thread = await this.getThread(input.threadId, signal)
      return {
        thread,
        resolution: {
          requestedThreadId: input.threadId,
          threadId: thread.id,
          reusedExistingThread: true,
          createdNewThread: false,
          missingRequestedThread: false,
        },
      }
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? createLocalAgentAbortError()
      if (!isLocalAgentNotFoundError(error)) throw error
      const thread = await this.createThread({ title: input.title, projectId: input.projectId }, signal)
      return {
        thread,
        resolution: {
          requestedThreadId: input.threadId,
          threadId: thread.id,
          reusedExistingThread: false,
          createdNewThread: true,
          missingRequestedThread: true,
        },
      }
    }
  }

  private async getJSON<T>(path: string, options: { auth?: boolean; signal?: AbortSignal } = {}): Promise<T> {
    const res = await fetch(`${this.baseURL}${path}`, {
      headers: options.auth === false ? {} : this.authHeaders(),
      signal: options.signal,
    })
    if (!res.ok) throw await localAgentResponseError(res)
    return await res.json() as T
  }

  private async postJSON<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.baseURL}${path}`, {
      method: 'POST',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(this.withBackendContext(body)),
      signal,
    })
    if (!res.ok) throw await localAgentResponseError(res)
    return await res.json() as T
  }

  private async patchJSON<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.baseURL}${path}`, {
      method: 'PATCH',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(this.withBackendContext(body)),
      signal,
    })
    if (!res.ok) throw await localAgentResponseError(res)
    return await res.json() as T
  }

  private async deleteJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.baseURL}${path}`, {
      method: 'DELETE',
      headers: this.authHeaders(),
      signal,
    })
    if (!res.ok) throw await localAgentResponseError(res)
    return await res.json() as T
  }

  private authHeaders(base: Record<string, string> = {}): Record<string, string> {
    const token = useUserStore.getState().token
    return token ? { ...base, Authorization: `Bearer ${token}` } : base
  }

  private withBackendContext(body: Record<string, unknown>): Record<string, unknown> {
    return {
      ...body,
      backendAPIBaseURL: getAPIV1BaseURL(),
    }
  }
}

function runtimeLocalAgentBaseURL(): string {
  return import.meta.env?.VITE_LOCAL_AGENT_BASE_URL || DEFAULT_LOCAL_AGENT_BASE_URL
}

export const localAgentClient = new LocalAgentClient()

async function localAgentResponseError(res: Response): Promise<LocalAgentHTTPError> {
  const text = await res.text()
  const message = localAgentErrorMessage(text)
  return new LocalAgentHTTPError(res.status, text, message)
}

function localAgentErrorMessage(text: string): string {
  const body = text.trim()
  if (!body) return ''
  try {
    const parsed = JSON.parse(body) as unknown
    if (isLocalAgentErrorRecord(parsed)) {
      const error = parsed.error
      if (typeof error === 'string' && error.trim()) return error.trim()
      if (isLocalAgentErrorRecord(error) && typeof error.message === 'string' && error.message.trim()) return error.message.trim()
      if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim()
    }
  } catch {
    // Fall back to the raw response body.
  }
  return body
}

function isLocalAgentErrorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePositiveTimeoutMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function isRetryableRunStreamError(error: unknown): boolean {
  if (error instanceof LocalAgentHTTPError) return false
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error) {
    return error.name === 'AbortError' || error.name === 'TypeError'
  }
  return false
}

async function withRuntimeModelConfigError<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('local agent returned 404')) {
      throw new Error('当前 Agent 版本不支持模型配置接口。请重启桌面端，或停止旧进程后重新运行：pnpm --filter @movscript/agent dev')
    }
    throw error
  }
}

function parseSSEBlock(block: string): { event?: string; data: string } | undefined {
  const lines = block.replace(/\r\n/g, '\n').split('\n')
  const dataLines: string[] = []
  let event: string | undefined
  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart())
    }
  }
  if (dataLines.length === 0) return undefined
  return { event, data: dataLines.join('\n').trim() }
}

function parseRuntimeEvent(data: string): AgentRuntimeEventV2 | undefined {
  const value = JSON.parse(data) as AgentRuntimeEventV2
  return value?.schema === AGENT_RUNTIME_EVENT_V2_SCHEMA ? value : undefined
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? createLocalAgentAbortError())
      return
    }
    const timer = globalThis.setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      globalThis.clearTimeout(timer)
      reject(signal.reason ?? createLocalAgentAbortError())
    }, { once: true })
  })
}

function createLocalAgentAbortError(): Error {
  try {
    return new DOMException('Aborted', 'AbortError')
  } catch {
    const error = new Error('Aborted')
    error.name = 'AbortError'
    return error
  }
}
