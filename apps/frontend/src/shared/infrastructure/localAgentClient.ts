import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { getAPIV1BaseURL } from '@/shared/infrastructure/config'
import { performanceNow, recordAgentNetworkRequestMetric } from '@/features/agent/state/agentPerformanceStore'
import type { AgentRuntimeTransport } from '@/shared/infrastructure/agentRuntimeTransport'
import {
  DEFAULT_LOCAL_AGENT_HEALTH_TIMEOUT_MS,
  DEFAULT_LOCAL_AGENT_REQUEST_TIMEOUT_MS,
  DEFAULT_RUN_STREAM_HTTP_TIMEOUT_MS,
  runtimeLocalAgentBaseURL,
  runtimeLocalAgentTransport,
  TERMINAL_RUN_STATUSES,
} from '@/shared/infrastructure/local-agent-client/config'
import {
  isLocalAgentNotFoundError,
  isRetryableRunStreamError,
  localAgentResponseError,
  LocalAgentHTTPError,
  localAgentStreamError,
} from '@/shared/infrastructure/local-agent-client/errors'
import {
  createLocalAgentAbortError,
  createLocalAgentRequestSignal,
  normalizePositiveTimeoutMs,
  sleepWithAbort,
} from '@/shared/infrastructure/local-agent-client/requestSignal'
import { withRuntimeModelConfigError } from '@/shared/infrastructure/local-agent-client/modelConfigError'
import { parseRuntimeEvent } from '@/shared/infrastructure/local-agent-client/runtimeEvent'
import { minimalResolvedThread } from '@/shared/infrastructure/local-agent-client/threadResolution'
import { AGENT_TRACE_EVENT_KINDS } from '@movscript/protocol'
import { runtimeRunFromEvent, runtimeRunIdFromEvent } from '@movscript/event-state'
import type {
  AgentApprovalRequest,
  AgentCapabilitiesResponse,
  AgentCatalogConfigFile,
  AgentCatalogPack,
  AgentCatalogSkill,
  AgentClientInput,
  AgentDebugTool,
  AgentDebugContextPanel,
  AgentFeedMessage,
  AgentFeedMessagePage,
  AgentFeedMessageStreamEvent,
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
  AgentToolCall,
  AgentRuntimeLimitsOverride,
  AgentThreadListQuery,
  AgentHealth,
  AgentMessageFeedQuery,
  AgentMessageFeedStreamOptions,
  AgentSessionMessageFeedQuery,
  AgentRuntimeTelemetryMetricSample,
  AgentRuntimeTelemetryLogEntry,
  AgentRuntimeTelemetrySpan,
  AgentRuntimeTelemetryOperation,
  AgentRuntimeTelemetrySnapshot,
  AgentMemoryScope,
  AgentMemoryKind,
  AgentWorkspaceKind,
  AgentWorkspaceStatus,
  AgentMemory,
  AgentWorkspace,
  AgentWorkspaceApplyReview,
  AgentWorkspaceApplyPreview,
  AgentRunTraceResponse,
  AgentRunDebugLedger,
  AgentRunDebugEvidenceKind,
  AgentRunDebugEvidenceRef,
  AgentRunDebugEvidenceRefQuery,
  AgentRunDebugEvidenceRefResponse,
  AgentRunDebugEvidence,
  AgentTraceDebugView,
  AgentRunGenerationView,
  AgentPackFile,
  AgentPackInstallResult,
  AgentPackUninstallResult,
  RunMessageOptions,
  ThreadStreamOptions,
  SessionStreamOptions,
  PlanStreamOptions,
} from '@/shared/infrastructure/local-agent-client/types'

export { AGENT_TRACE_EVENT_KINDS }
export { isLocalAgentNotFoundError, LocalAgentHTTPError }
export type {
  AgentApprovalRequest,
  AgentCapabilitiesResponse,
  AgentCatalogConfigFile,
  AgentCatalogPack,
  AgentCatalogSkill,
  AgentClientInput,
  AgentDebugTool,
  AgentDebugContextPanel,
  AgentFeedMessage,
  AgentFeedMessagePage,
  AgentFeedMessageStreamEvent,
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
  AgentToolCall,
  AgentRuntimeLimitsOverride,
  AgentThreadListQuery,
  AgentHealth,
  AgentMessageFeedQuery,
  AgentMessageFeedStreamOptions,
  AgentSessionMessageFeedQuery,
  AgentRuntimeTelemetryMetricSample,
  AgentRuntimeTelemetryLogEntry,
  AgentRuntimeTelemetrySpan,
  AgentRuntimeTelemetryOperation,
  AgentRuntimeTelemetrySnapshot,
  AgentMemoryScope,
  AgentMemoryKind,
  AgentWorkspaceKind,
  AgentWorkspaceStatus,
  AgentMemory,
  AgentWorkspace,
  AgentWorkspaceApplyReview,
  AgentWorkspaceApplyPreview,
  AgentRunTraceResponse,
  AgentRunDebugLedger,
  AgentRunDebugEvidenceKind,
  AgentRunDebugEvidenceRef,
  AgentRunDebugEvidenceRefQuery,
  AgentRunDebugEvidenceRefResponse,
  AgentRunDebugEvidence,
  AgentTraceDebugView,
  AgentRunGenerationView,
  AgentPackFile,
  AgentPackInstallResult,
  AgentPackUninstallResult,
  RunMessageOptions,
  ThreadStreamOptions,
  SessionStreamOptions,
  PlanStreamOptions,
} from '@/shared/infrastructure/local-agent-client/types'
export function canStartLocalAgentFromClient(): boolean {
  return typeof window !== 'undefined' && typeof window.api?.ensureAgentRuntime === 'function'
}

export class LocalAgentClient {
  readonly baseURL: string
  readonly transportKind: AgentRuntimeTransport['kind']
  private readonly transport: AgentRuntimeTransport
  private readonly healthTimeoutMs: number
  private readonly requestTimeoutMs: number

  constructor(
    baseURL: string | AgentRuntimeTransport = runtimeLocalAgentBaseURL(),
    options: { healthTimeoutMs?: number; requestTimeoutMs?: number; transport?: AgentRuntimeTransport } = {},
  ) {
    this.transport = typeof baseURL === 'string'
      ? options.transport ?? runtimeLocalAgentTransport(baseURL)
      : baseURL
    this.baseURL = this.transport.endpointLabel
    this.transportKind = this.transport.kind
    this.healthTimeoutMs = normalizePositiveTimeoutMs(options.healthTimeoutMs) ?? DEFAULT_LOCAL_AGENT_HEALTH_TIMEOUT_MS
    this.requestTimeoutMs = normalizePositiveTimeoutMs(options.requestTimeoutMs) ?? DEFAULT_LOCAL_AGENT_REQUEST_TIMEOUT_MS
  }

  async health(): Promise<AgentHealth> {
    try {
      return await this.getJSON('/runtime/compat', { auth: false, timeoutMs: this.healthTimeoutMs })
    } catch (error) {
      if (!isLocalAgentNotFoundError(error)) throw error
      return this.getJSON('/health', { auth: false, timeoutMs: this.healthTimeoutMs })
    }
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

      const status = await ensureAgentRuntime({
        baseURL: this.baseURL,
        transportKind: this.transport.kind,
        ...(this.transport.socketPath ? { socketPath: this.transport.socketPath } : {}),
      })
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

  createThread(input: { sessionId?: string; title?: string; projectId?: number; agentName?: string; agentRole?: AgentThreadRole; parentThreadId?: string; parentRunId?: string; lifecycle?: AgentConversationLifecycle; expiresAt?: string } = {}, signal?: AbortSignal): Promise<AgentThread> {
    return this.postJSON('/threads', input, signal)
  }

  startProvisionalConversation(input: { title?: string; projectId?: number; expiresAt?: string } = {}, signal?: AbortSignal): Promise<AgentThread> {
    return this.createThread({
      ...input,
      lifecycle: 'provisional',
    }, signal)
  }

  listThreads(query: AgentThreadListQuery = {}, signal?: AbortSignal): Promise<AgentThreadListPage> {
    const params = new URLSearchParams()
    if (query.cursor) params.set('cursor', query.cursor)
    if (typeof query.limit === 'number') params.set('limit', String(query.limit))
    if (query.includeProvisional === true) params.set('includeProvisional', 'true')
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
    runtimeLimits?: AgentRuntimeLimitsOverride
    activeRunMode?: 'runtime_input' | 'new_run'
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

  listThreadMessages(threadId: string, query: AgentMessageFeedQuery = {}, signal?: AbortSignal): Promise<AgentFeedMessagePage> {
    const params = new URLSearchParams()
    if (query.before) params.set('before', query.before)
    if (typeof query.limit === 'number') params.set('limit', String(query.limit))
    return this.getJSON(`/threads/${encodeURIComponent(threadId)}/messages${params.size ? `?${params.toString()}` : ''}`, { signal })
  }

  listSessionMessages(sessionId: string, query: AgentSessionMessageFeedQuery = {}, signal?: AbortSignal): Promise<AgentFeedMessagePage> {
    const params = new URLSearchParams()
    if (query.threadId) params.set('threadId', query.threadId)
    if (query.before) params.set('before', query.before)
    if (typeof query.limit === 'number') params.set('limit', String(query.limit))
    return this.getJSON(`/sessions/${encodeURIComponent(sessionId)}/messages${params.size ? `?${params.toString()}` : ''}`, { signal })
  }

  previewRun(input: { threadId?: string; message?: string; agentManifest?: AgentManifest; approvedToolNames?: string[]; clientInput?: AgentClientInput; runtimeLimits?: AgentRuntimeLimitsOverride }, signal?: AbortSignal): Promise<AgentRunPreview> {
    return this.postJSON('/runs/preview', input, signal)
  }

  getCapabilities(query: { projectId?: number } = {}): Promise<AgentCapabilitiesResponse> {
    const params = new URLSearchParams()
    if (typeof query.projectId === 'number') params.set('projectId', String(query.projectId))
    return this.getJSON(`/capabilities${params.size ? `?${params.toString()}` : ''}`)
  }

  installAgentPack(input: { pluginId: string; files: AgentPackFile[] }, signal?: AbortSignal): Promise<AgentPackInstallResult> {
    return this.postJSON('/agent-catalog/packs/install', input, signal)
  }

  uninstallAgentPack(input: { pluginId: string }, signal?: AbortSignal): Promise<AgentPackUninstallResult> {
    return this.postJSON('/agent-catalog/packs/uninstall', input, signal)
  }

  reloadAgentCatalog(signal?: AbortSignal): Promise<unknown> {
    return this.postJSON('/agent-catalog/reload', {}, signal)
  }

  saveActiveAgentConfigFile(input: { configFileId: string }, signal?: AbortSignal): Promise<AgentManifest> {
    return this.postJSON('/agent-config-files/active', input, signal)
  }

  saveAgentConfigFile(input: { configFile: AgentCatalogConfigFile; activate?: boolean }, signal?: AbortSignal): Promise<{ configFile: AgentCatalogConfigFile; configFiles: AgentCatalogConfigFile[]; activeAgentManifest: AgentManifest }> {
    return this.postJSON('/agent-config-files', input, signal)
  }

  deleteAgentConfigFile(input: { configFileId: string }, signal?: AbortSignal): Promise<{ configFiles: AgentCatalogConfigFile[]; activeAgentManifest: AgentManifest }> {
    return this.deleteJSON(`/agent-config-files/${encodeURIComponent(input.configFileId)}`, signal)
  }

  saveConfigFileToolPermissions(input: { configFileId: string; toolGrants: AgentManifest['tools'] }, signal?: AbortSignal): Promise<AgentManifest> {
    return this.postJSON(`/agent-config-files/${encodeURIComponent(input.configFileId)}/tool-permissions`, { toolGrants: input.toolGrants }, signal)
  }

  saveSkillInstructions(input: { skills: Array<{ id: string; instructionTemplate: string }> }, signal?: AbortSignal): Promise<{ skills: AgentCatalogSkill[] }> {
    return this.postJSON('/agent-skills/instructions', input, signal)
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
    runtimeLimits?: AgentRuntimeLimitsOverride
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
    runtimeLimits?: AgentRuntimeLimitsOverride
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

  findRunDebugEvidenceRefs(runId: string, query: AgentRunDebugEvidenceRefQuery): Promise<AgentRunDebugEvidenceRefResponse> {
    const params = new URLSearchParams()
    if (query.kind) params.set('kind', query.kind)
    if (query.contextBundleId) params.set('contextBundleId', query.contextBundleId)
    if (query.refKey) params.set('refKey', query.refKey)
    if (query.contentHash) params.set('contentHash', query.contentHash)
    if (query.resultHash) params.set('resultHash', query.resultHash)
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/debug-evidence-refs${params.size ? `?${params.toString()}` : ''}`)
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

  async streamThreadMessages(threadId: string, options: AgentMessageFeedStreamOptions = {}): Promise<void> {
    await this.streamMessageFeedEvents(`/threads/${encodeURIComponent(threadId)}/messages/stream`, options)
  }

  async streamSessionMessages(sessionId: string, options: AgentMessageFeedStreamOptions = {}): Promise<void> {
    const params = new URLSearchParams()
    if (options.threadId) params.set('threadId', options.threadId)
    await this.streamMessageFeedEvents(`/sessions/${encodeURIComponent(sessionId)}/messages/stream${params.size ? `?${params.toString()}` : ''}`, options)
  }

  async streamPlan(taskGraphId: string, options: PlanStreamOptions = {}): Promise<void> {
    await this.streamRuntimeEvents(`/plans/${encodeURIComponent(taskGraphId)}/stream`, options)
  }

  private async streamRuntimeEvents(
    path: string,
    options: { onRuntimeEvent?: (event: AgentRuntimeEventV2) => void; signal?: AbortSignal } = {},
  ): Promise<void> {
    const stream = await this.openMeasuredEventStream(path, {
      headers: this.authHeaders({ Accept: 'text/event-stream' }),
      signal: options.signal,
    })
    if (!stream.ok) throw await localAgentStreamError(stream)

    for await (const data of stream.messages()) {
      try {
        const event = parseRuntimeEvent(data)
        if (event) options.onRuntimeEvent?.(event)
      } catch {
        continue
      }
    }
  }

  private async streamMessageFeedEvents(
    path: string,
    options: AgentMessageFeedStreamOptions = {},
  ): Promise<void> {
    const stream = await this.openMeasuredEventStream(path, {
      headers: this.authHeaders({ Accept: 'text/event-stream' }),
      signal: options.signal,
    })
    if (!stream.ok) throw await localAgentStreamError(stream)

    for await (const data of stream.messages()) {
      try {
        const event = parseMessageFeedEvent(data)
        if (event) options.onMessageEvent?.(event)
      } catch {
        continue
      }
    }
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
    const stream = await this.openMeasuredEventStream(`/runs/${encodeURIComponent(runId)}/stream`, {
      headers: this.authHeaders({ Accept: 'text/event-stream' }),
      signal,
    })
    if (!stream.ok) throw await localAgentStreamError(stream)

    let latestRun = await this.getRun(runId, signal)
    const processData = (data: string): AgentRun | undefined => {
      const event = parseRuntimeEvent(data)
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

    for await (const data of stream.messages()) {
      const terminalRun = processData(data)
      if (terminalRun) return { run: terminalRun }
    }
    if (latestRun.streamPartial && TERMINAL_RUN_STATUSES.has(latestRun.status)) {
      return { run: latestRun }
    }
    return { run: latestRun }
  }

  getThread(threadId: string, signal?: AbortSignal): Promise<AgentThread> {
    return this.getJSON(`/threads/${encodeURIComponent(threadId)}`, { signal })
  }

  updateThread(threadId: string, input: {
    title?: string
    archived?: boolean
    metadata?: Record<string, unknown>
    lifecycle?: AgentConversationLifecycle
    expiresAt?: string
  }, signal?: AbortSignal): Promise<AgentThread> {
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

  listWorkspaces(query: { projectId?: number; kind?: AgentWorkspaceKind; status?: AgentWorkspaceStatus | AgentWorkspaceStatus[]; threadId?: string; runId?: string; pageKey?: string; pageType?: string; pageRoute?: string; pageEntityType?: string; pageEntityId?: number | string; limit?: number } = {}): Promise<{ workspaces: AgentWorkspace[] }> {
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
    return this.getJSON(`/workspaces${params.size ? `?${params.toString()}` : ''}`)
  }

  getWorkspace(workspaceId: string): Promise<AgentWorkspace> {
    return this.getJSON(`/workspaces/${encodeURIComponent(workspaceId)}`)
  }

  createWorkspace(input: { projectId?: number; kind?: AgentWorkspaceKind; title: string; content: string; source?: Record<string, unknown>; target?: Record<string, unknown>; seed?: Record<string, unknown>; metadata?: Record<string, unknown> }): Promise<AgentWorkspace> {
    return this.postJSON('/workspace', input)
  }

  updateWorkspace(workspaceId: string, input: { status?: AgentWorkspaceStatus; title?: string; content?: string; target?: Record<string, unknown>; metadata?: Record<string, unknown> }): Promise<AgentWorkspace> {
    return this.patchJSON(`/workspaces/${encodeURIComponent(workspaceId)}`, input)
  }

  previewApplyWorkspace(workspaceId: string, input: { target?: Record<string, unknown>; targetEntityType?: string; targetEntityId?: number | string; targetField?: string; currentValue?: unknown; proposedValue?: unknown } = {}): Promise<AgentWorkspaceApplyPreview> {
    return this.postJSON(`/workspaces/${encodeURIComponent(workspaceId)}/apply-preview`, input)
  }

  applyWorkspace(workspaceId: string, input: { target?: Record<string, unknown>; targetEntityType?: string; targetEntityId?: number | string; targetField?: string; currentValue?: unknown; proposedValue?: unknown } = {}): Promise<AgentWorkspaceApplyPreview> {
    return this.postJSON(`/workspaces/${encodeURIComponent(workspaceId)}/apply`, input)
  }

  rejectWorkspace(workspaceId: string, reason?: string): Promise<AgentWorkspace> {
    return this.postJSON(`/workspaces/${encodeURIComponent(workspaceId)}/reject`, { reason })
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
    activeRunMode?: 'runtime_input' | 'new_run'
  }, options: RunMessageOptions = {}): Promise<RunMessageResult> {
    options.onPhase?.('resolve_thread_start', {
      requestedThreadId: input.threadId,
      hasExistingThread: Boolean(input.threadId),
    })
    const resolvedThread = await this.resolveMessageThread(input, options.signal)
    options.onPhase?.('resolve_thread_done', {
      threadId: resolvedThread.thread.id,
      createdNewThread: resolvedThread.resolution.createdNewThread,
      reusedExistingThread: resolvedThread.resolution.reusedExistingThread,
      missingRequestedThread: resolvedThread.resolution.missingRequestedThread,
    })
    let thread = resolvedThread.thread
    options.onPhase?.('create_message_run_start', {
      threadId: thread.id,
      activeRunMode: input.activeRunMode ?? 'new_run',
      hasClientInput: Boolean(input.clientInput),
      hasAgentManifest: Boolean(options.agentManifest),
      hasRuntimeLimits: Boolean(options.runtimeLimits),
    })
    const created = await this.createMessageRunWithMissingThreadFallback(thread.id, {
      message: input.message,
      ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
      ...(input.toolCall ? { toolCall: input.toolCall } : {}),
      ...(options.agentManifest ? { agentManifest: options.agentManifest } : {}),
      ...(input.approvedToolNames?.length ? { approvedToolNames: input.approvedToolNames } : {}),
      ...(input.clientInput ? { clientInput: input.clientInput } : {}),
      activeRunMode: input.activeRunMode ?? 'new_run',
      ...(options.runtimeLimits ? { runtimeLimits: options.runtimeLimits } : {}),
    }, {
      input,
      resolvedThread,
      signal: options.signal,
    })
    thread = resolvedThread.thread
    const run = created.run
    options.onPhase?.('create_message_run_done', {
      threadId: thread.id,
      runId: run.id,
      runStatus: run.status,
      sourceMessageId: created.message.id,
      runtimeInputAccepted: Boolean(created.runtimeInput?.accepted),
    })
    options.onSourceMessage?.(created.message, run)
    options.onRunUpdate?.(run)
    if (created.runtimeInput?.accepted) {
      options.onPhase?.('runtime_input_final_thread_start', { threadId: thread.id, runId: run.id })
      const finalThread = await this.getThread(thread.id)
      options.onPhase?.('runtime_input_final_thread_done', { threadId: finalThread.id, runId: run.id })
      return { run, thread: finalThread, threadResolution: resolvedThread.resolution, sourceMessage: created.message }
    }
    options.onPhase?.('run_stream_start', { threadId: thread.id, runId: run.id })
    const finalRun = await this.streamRunFromThread(thread.id, run.id, options, run)
    options.onPhase?.('run_stream_done_client', { threadId: thread.id, runId: finalRun.id, runStatus: finalRun.status })
    options.onPhase?.('final_thread_fetch_start', { threadId: thread.id, runId: finalRun.id })
    const finalThread = await this.getThread(thread.id)
    options.onPhase?.('final_thread_fetch_done', { threadId: finalThread.id, runId: finalRun.id })
    return { run: finalRun, thread: finalThread, threadResolution: resolvedThread.resolution, sourceMessage: created.message }
  }

  private async resolveMessageThread(input: { threadId?: string; title?: string; projectId?: number }, signal?: AbortSignal): Promise<{
    thread: AgentThread
    resolution: AgentThreadResolution
  }> {
    if (!input.threadId) {
      const thread = await this.startProvisionalConversation({ title: input.title, projectId: input.projectId }, signal)
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

    const thread = minimalResolvedThread(input.threadId)
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
  }

  private async createMessageRunWithMissingThreadFallback(
    threadId: string,
    body: Parameters<LocalAgentClient['createMessageRun']>[1],
    options: {
      input: { threadId?: string; title?: string; projectId?: number }
      resolvedThread: Awaited<ReturnType<LocalAgentClient['resolveMessageThread']>>
      signal?: AbortSignal
    },
  ): Promise<CreateMessageRunResult> {
    try {
      return await this.createMessageRun(threadId, body, options.signal)
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason ?? createLocalAgentAbortError()
      if (!options.input.threadId || !isLocalAgentNotFoundError(error)) throw error
      const thread = await this.startProvisionalConversation({ title: options.input.title, projectId: options.input.projectId }, options.signal)
      options.resolvedThread.thread = thread
      options.resolvedThread.resolution = {
        requestedThreadId: options.input.threadId,
        threadId: thread.id,
        reusedExistingThread: false,
        createdNewThread: true,
        missingRequestedThread: true,
      }
      return await this.createMessageRun(thread.id, body, options.signal)
    }
  }

  private async getJSON<T>(path: string, options: { auth?: boolean; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
    const request = createLocalAgentRequestSignal(options.signal, options.timeoutMs ?? this.requestTimeoutMs)
    try {
      const res = await this.requestMeasured(path, {
        headers: options.auth === false ? {} : this.authHeaders(),
        signal: request.signal,
      })
      if (!res.ok) throw await localAgentResponseError(res)
      return await res.json() as T
    } finally {
      request.cleanup()
    }
  }

  private async postJSON<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const request = createLocalAgentRequestSignal(signal, this.requestTimeoutMs)
    try {
      const res = await this.requestMeasured(path, {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(this.withBackendContext(body)),
        signal: request.signal,
      })
      if (!res.ok) throw await localAgentResponseError(res)
      return await res.json() as T
    } finally {
      request.cleanup()
    }
  }

  private async patchJSON<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const request = createLocalAgentRequestSignal(signal, this.requestTimeoutMs)
    try {
      const res = await this.requestMeasured(path, {
        method: 'PATCH',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(this.withBackendContext(body)),
        signal: request.signal,
      })
      if (!res.ok) throw await localAgentResponseError(res)
      return await res.json() as T
    } finally {
      request.cleanup()
    }
  }

  private async deleteJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
    const request = createLocalAgentRequestSignal(signal, this.requestTimeoutMs)
    try {
      const res = await this.requestMeasured(path, {
        method: 'DELETE',
        headers: this.authHeaders(),
        signal: request.signal,
      })
      if (!res.ok) throw await localAgentResponseError(res)
      return await res.json() as T
    } finally {
      request.cleanup()
    }
  }

  private async requestMeasured(path: string, init: RequestInit = {}): Promise<Response> {
    const started = performanceNow()
    const method = init.method ?? 'GET'
    try {
      const response = await this.transport.request(path, init)
      this.recordNetworkMetric(path, method, statusClass(response.status), started)
      return response
    } catch (error) {
      this.recordNetworkMetric(path, method, init.signal?.aborted ? 'aborted' : 'network_error', started)
      throw error
    }
  }

  private async openMeasuredEventStream(path: string, init: RequestInit = {}) {
    const started = performanceNow()
    const method = init.method ?? 'GET'
    try {
      const stream = await this.transport.openEventStream(path, init)
      this.recordNetworkMetric(path, method, statusClass(stream.status), started)
      return stream
    } catch (error) {
      this.recordNetworkMetric(path, method, init.signal?.aborted ? 'aborted' : 'network_error', started)
      throw error
    }
  }

  private recordNetworkMetric(path: string, method: string, status: string, started: number): void {
    recordAgentNetworkRequestMetric({
      method,
      routeGroup: path,
      statusClass: status,
      durationMs: Math.max(0, performanceNow() - started),
      transport: this.transportKind,
    })
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

export const localAgentClient = new LocalAgentClient()

function statusClass(status: number): string {
  if (!Number.isFinite(status) || status <= 0) return 'unknown'
  return `${Math.floor(status / 100)}xx`
}

function parseMessageFeedEvent(data: string): AgentFeedMessageStreamEvent | undefined {
  const parsed = JSON.parse(data) as unknown
  if (!isPlainRecord(parsed)) return undefined
  const type = parsed.type
  if (type !== 'message.created' && type !== 'message.updated' && type !== 'messages.reset_required') return undefined
  const revision = typeof parsed.revision === 'number' && Number.isFinite(parsed.revision)
    ? parsed.revision
    : Date.now()
  return {
    type,
    revision,
    ...(isPlainRecord(parsed.message) ? { message: parsed.message as unknown as AgentFeedMessageStreamEvent['message'] } : {}),
    ...(typeof parsed.reason === 'string' ? { reason: parsed.reason } : {}),
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}
