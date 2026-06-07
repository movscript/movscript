import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { getAPIV1BaseURL } from '@/shared/infrastructure/config'
import { performanceNow, recordAgentNetworkRequestMetric } from '@/features/agent/state/agentPerformanceStore'
import type { ProviderSessionTransport } from '@/shared/infrastructure/providerSessionTransport'
import {
  DEFAULT_PROVIDER_SESSION_HEALTH_TIMEOUT_MS,
  DEFAULT_PROVIDER_SESSION_REQUEST_TIMEOUT_MS,
  DEFAULT_RUN_STREAM_HTTP_TIMEOUT_MS,
  providerSessionTransport,
} from '@/shared/infrastructure/provider-session-client/config'
import {
  isProviderSessionNotFoundError,
  isRetryableRunStreamError,
  providerSessionResponseError,
  ProviderSessionHTTPError,
  providerSessionStreamError,
} from '@/shared/infrastructure/provider-session-client/errors'
import {
  createProviderSessionAbortError,
  createProviderSessionRequestSignal,
  normalizePositiveTimeoutMs,
  sleepWithAbort,
} from '@/shared/infrastructure/provider-session-client/requestSignal'
import { withProviderSessionModelConfigError } from '@/shared/infrastructure/provider-session-client/modelConfigError'
import { parseProviderSessionEvent } from '@/shared/infrastructure/provider-session-client/providerSessionEvent'
import { AGENT_TRACE_EVENT_KINDS, PROVIDER_MODEL_API_KINDS, isAgentRunStreamSettledStatus, isAgentRunTerminalStatus } from '@/features/agent/domain/agentProtocol'
import { providerSessionRunFromEvent, providerSessionRunIdFromEvent } from '@/shared/infrastructure/provider-session-client/providerSessionEventFacts'
import type { AgentRunProfileSelection } from '@/features/agent/domain/agentRunProfilePreset'
import type { AgentThreadControlState } from '@/features/agent/domain/agentChatProtocol'
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
  AgentToolCall,
  ProviderSessionSummary,
  ProviderSessionLease,
  ProviderPluginFileInstallInput,
  ProviderPluginFileInstallResult,
  ProviderPluginFile,
  ProviderPluginFileList,
  ProviderPluginFileManifest,
  ProviderPluginFileRemoveResult,
  ProviderSessionLimitsOverride,
  AgentThreadListQuery,
  AgentThreadMessagesPage,
  AgentThreadMessagesQuery,
  ProviderSessionHealth,
  AgentTimelineQuery,
  AgentTimelineStreamOptions,
  AgentSessionTimelineQuery,
  ProviderSessionTelemetryMetricSample,
  ProviderSessionTelemetryLogEntry,
  ProviderSessionTelemetrySpan,
  ProviderSessionTelemetryOperation,
  ProviderSessionTelemetrySnapshot,
  ProviderMemoryScope,
  ProviderMemoryKind,
  MovScriptWorkspaceKind,
  WorkspaceArtifactStatus,
  ProviderMemory,
  WorkspaceArtifact,
  WorkspaceArtifactApplyReview,
  WorkspaceArtifactApplyPreview,
  AgentRunTraceResponse,
  AgentRunDebugLedger,
  AgentRunDebugEvidenceKind,
  AgentRunDebugEvidenceRef,
  AgentRunDebugEvidenceRefQuery,
  AgentRunDebugEvidenceRefResponse,
  AgentRunDebugEvidence,
  AgentTraceDebugView,
  AgentRunGenerationView,
  MovScriptWorkspaceConfig,
  MovScriptWorkspaceConfigSaveInput,
  RunMessageOptions,
  ThreadStreamOptions,
  SessionStreamOptions,
  PlanStreamOptions,
} from '@/shared/infrastructure/provider-session-client/types'

export { AGENT_TRACE_EVENT_KINDS }
export { isProviderSessionNotFoundError, ProviderSessionHTTPError }
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
  AgentToolCall,
  ProviderSessionSummary,
  ProviderSessionLimitsOverride,
  AgentThreadListQuery,
  AgentThreadMessagesPage,
  AgentThreadMessagesQuery,
  ProviderSessionHealth,
  AgentTimelineQuery,
  AgentTimelineStreamOptions,
  AgentSessionTimelineQuery,
  ProviderSessionTelemetryMetricSample,
  ProviderSessionTelemetryLogEntry,
  ProviderSessionTelemetrySpan,
  ProviderSessionTelemetryOperation,
  ProviderSessionTelemetrySnapshot,
  ProviderMemoryScope,
  ProviderMemoryKind,
  MovScriptWorkspaceKind,
  WorkspaceArtifactStatus,
  ProviderMemory,
  WorkspaceArtifact,
  WorkspaceArtifactApplyReview,
  WorkspaceArtifactApplyPreview,
  AgentRunTraceResponse,
  AgentRunDebugLedger,
  AgentRunDebugEvidenceKind,
  AgentRunDebugEvidenceRef,
  AgentRunDebugEvidenceRefQuery,
  AgentRunDebugEvidenceRefResponse,
  AgentRunDebugEvidence,
  AgentTraceDebugView,
  AgentRunGenerationView,
  MovScriptWorkspaceConfig,
  MovScriptWorkspaceConfigSaveInput,
  ProviderSessionLease,
  ProviderPluginFileInstallInput,
  ProviderPluginFileInstallResult,
  ProviderPluginFile,
  ProviderPluginFileList,
  ProviderPluginFileManifest,
  ProviderPluginFileRemoveResult,
  RunMessageOptions,
  ThreadStreamOptions,
  SessionStreamOptions,
  PlanStreamOptions,
} from '@/shared/infrastructure/provider-session-client/types'

export interface ProviderSessionApprovalDecisionInput {
  scope?: 'turn' | 'session'
  strictAutoReview?: boolean
  execPolicyAmendment?: unknown
  networkPolicyAmendment?: unknown
}
export class ProviderSessionClient {
  readonly baseURL: string
  readonly transportKind: ProviderSessionTransport['kind']
  readonly providerProfileKey?: string
  readonly workspaceDir?: string
  readonly sessionId?: string
  private readonly transport: ProviderSessionTransport
  private readonly healthTimeoutMs: number
  private readonly requestTimeoutMs: number

  constructor(
    transport?: ProviderSessionTransport,
    options: { healthTimeoutMs?: number; requestTimeoutMs?: number; transport?: ProviderSessionTransport; providerProfileKey?: string; workspaceDir?: string; sessionId?: string } = {},
  ) {
    this.transport = transport ?? options.transport ?? providerSessionTransport({ workspaceDir: options.workspaceDir, sessionId: options.sessionId })
    this.baseURL = this.transport.endpointLabel
    this.transportKind = this.transport.kind
    this.providerProfileKey = options.providerProfileKey
    this.workspaceDir = options.workspaceDir
    this.sessionId = options.sessionId
    this.healthTimeoutMs = normalizePositiveTimeoutMs(options.healthTimeoutMs) ?? DEFAULT_PROVIDER_SESSION_HEALTH_TIMEOUT_MS
    this.requestTimeoutMs = normalizePositiveTimeoutMs(options.requestTimeoutMs) ?? DEFAULT_PROVIDER_SESSION_REQUEST_TIMEOUT_MS
  }

  forSession(input: { sessionId: string; workspaceDir?: string }): ProviderSessionClient {
    return new ProviderSessionClient(undefined, {
      healthTimeoutMs: this.healthTimeoutMs,
      requestTimeoutMs: this.requestTimeoutMs,
      providerProfileKey: this.providerProfileKey,
      workspaceDir: input.workspaceDir,
      sessionId: input.sessionId,
    })
  }

  async health(): Promise<ProviderSessionHealth> {
    try {
      return await this.getJSON('/runtime/compat', { auth: false, timeoutMs: this.healthTimeoutMs })
    } catch (error) {
      if (!isProviderSessionNotFoundError(error)) throw error
      return this.getJSON('/health', { auth: false, timeoutMs: this.healthTimeoutMs })
    }
  }

  async inspect(): Promise<ProviderCatalogInspectResponse> {
    return normalizeActiveProviderManifestResponse(await this.getJSON<ProviderCatalogInspectResponse>('/inspect'))
  }

  getProviderSessionTelemetry(signal?: AbortSignal): Promise<ProviderSessionTelemetrySnapshot> {
    if (isBackendAPIV1Endpoint(this.baseURL)) {
      return Promise.resolve(emptyProviderSessionTelemetrySnapshot())
    }
    return this.getJSON('/runtime/telemetry', { auth: false, signal })
  }

  async listProviderSessionsFromWorkspace(input: { workspaceDir?: string; providerProfileKey?: string } = {}): Promise<{ sessions: ProviderSessionSummary[] }> {
    if (typeof window === 'undefined' || typeof window.api?.listProviderSessions !== 'function') {
      return { sessions: [] }
    }
    const providerProfileKey = input.providerProfileKey ?? this.providerProfileKey
    return window.api.listProviderSessions({
      ...(providerProfileKey ? { providerProfileKey } : {}),
      ...(input.workspaceDir ?? this.workspaceDir ? { workspaceDir: input.workspaceDir ?? this.workspaceDir } : {}),
    })
  }

  acquireProviderSessionLease(input: { leaseId: string; ttlMs?: number; holder?: string }, signal?: AbortSignal): Promise<ProviderSessionLease> {
    return this.postJSON('/runtime/session/leases', {
      leaseId: input.leaseId,
      ...(typeof input.ttlMs === 'number' ? { ttlMs: input.ttlMs } : {}),
      ...(input.holder?.trim() ? { holder: input.holder.trim() } : {}),
    }, signal)
  }

  releaseProviderSessionLease(leaseId: string, signal?: AbortSignal): Promise<ProviderSessionLease> {
    return this.deleteJSON(`/runtime/session/leases/${encodeURIComponent(leaseId)}`, signal)
  }

  async ensureRunning(): Promise<ProviderSessionHealth> {
    return this.health()
  }

  listSessions(): Promise<{ sessions: AgentSessionSummary[] }> {
    return this.getJSON('/sessions')
  }

  getSession(sessionId: string, signal?: AbortSignal): Promise<AgentSession> {
    return this.getJSON(`/sessions/${encodeURIComponent(sessionId)}`, { signal })
  }

  getSessionProviderSessionSnapshot(sessionId: string, signal?: AbortSignal): Promise<ProviderSessionSnapshotV2> {
    return this.getJSON(`/sessions/${encodeURIComponent(sessionId)}/runtime`, { signal })
  }

  createThread(input: { sessionId?: string; title?: string; projectId?: number; agentName?: string; agentRole?: AgentThreadRole; parentThreadId?: string; parentRunId?: string; lifecycle?: AgentConversationLifecycle; expiresAt?: string } = {}, signal?: AbortSignal): Promise<AgentThread> {
    return this.postJSON('/threads', input, signal)
  }

  startProvisionalConversation(input: { sessionId?: string; title?: string; projectId?: number; expiresAt?: string } = {}, signal?: AbortSignal): Promise<AgentThread> {
    return this.createThread({
      ...input,
      ...(input.sessionId?.trim()
        ? { sessionId: input.sessionId.trim() }
        : this.sessionId
          ? { sessionId: this.sessionId }
          : {}),
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

  listThreadMessages(threadId: string, query: AgentThreadMessagesQuery = {}, signal?: AbortSignal): Promise<AgentThreadMessagesPage> {
    const params = new URLSearchParams()
    if (typeof query.afterOrdinal === 'number') params.set('afterOrdinal', String(query.afterOrdinal))
    if (typeof query.limit === 'number') params.set('limit', String(query.limit))
    if (query.direction === 'desc') params.set('direction', 'desc')
    return this.getJSON(`/threads/${encodeURIComponent(threadId)}/messages${params.size ? `?${params.toString()}` : ''}`, { signal })
  }

  createSessionMessageRun(sessionId: string, input: {
    message: string
    sourceMessageId?: string
    toolCall?: AgentToolCall
    providerManifest?: ProviderManifest
    agentManifest?: ProviderManifest
    approvedToolNames?: string[]
    clientInput?: ProviderSessionClientInput
    providerSessionLimits?: ProviderSessionLimitsOverride
    /** Legacy provider wire key. New client code should use providerSessionLimits. */
    runtimeLimits?: ProviderSessionLimitsOverride
    runProfile?: AgentRunProfileSelection
    threadControl?: Partial<AgentThreadControlState>
    activeRunMode?: 'runtime_input' | 'new_run'
    providerSessionInputMode?: 'soft' | 'hard'
    /** Legacy provider wire key. New client code should use providerSessionInputMode. */
    runtimeInputMode?: 'soft' | 'hard'
    title?: string
    projectId?: number
  }, signal?: AbortSignal): Promise<CreateMessageRunResult> {
    return this.postJSON<CreateMessageRunResult>(`/sessions/${encodeURIComponent(sessionId)}/runs`, providerManifestRequestBody(input), signal)
      .then(normalizeCreateMessageRunResult)
  }

  async listRuns(): Promise<{ runs: AgentRun[] }> {
    return normalizeAgentRunList(await this.getJSON<{ runs: AgentRun[] }>('/runs'))
  }

  async listRunsByParent(parentRunId: string, signal?: AbortSignal): Promise<{ runs: AgentRun[] }> {
    return normalizeAgentRunList(await this.getJSON<{ runs: AgentRun[] }>(`/runs?parentRunId=${encodeURIComponent(parentRunId)}`, { signal }))
  }

  async listRunsByThread(threadId: string, signal?: AbortSignal): Promise<{ threadId: string; runs: AgentRun[] }> {
    const result = await this.getJSON<{ threadId: string; runs: AgentRun[] }>(`/threads/${encodeURIComponent(threadId)}/runs`, { signal })
    return { ...result, runs: result.runs.map(normalizeAgentRun) }
  }

  async getThreadProviderSessionSnapshot(threadId: string, signal?: AbortSignal): Promise<ProviderSessionSnapshotV2> {
    return normalizeProviderSessionSnapshot(await this.getJSON(`/threads/${encodeURIComponent(threadId)}/runtime`, { signal }))
  }

  async listThreadTimeline(threadId: string, query: AgentTimelineQuery = {}, signal?: AbortSignal): Promise<AgentTimelinePage> {
    const params = new URLSearchParams()
    if (query.before) params.set('before', query.before)
    if (typeof query.limit === 'number') params.set('limit', String(query.limit))
    const page = await this.getJSON<AgentTimelinePage>(`/threads/${encodeURIComponent(threadId)}/timeline${params.size ? `?${params.toString()}` : ''}`, { signal })
    return normalizeTimelinePage(page)
  }

  async listSessionTimeline(sessionId: string, query: AgentSessionTimelineQuery = {}, signal?: AbortSignal): Promise<AgentTimelinePage> {
    const params = new URLSearchParams()
    if (query.threadId) params.set('threadId', query.threadId)
    if (query.before) params.set('before', query.before)
    if (typeof query.limit === 'number') params.set('limit', String(query.limit))
    const page = await this.getJSON<AgentTimelinePage>(`/sessions/${encodeURIComponent(sessionId)}/timeline${params.size ? `?${params.toString()}` : ''}`, { signal })
    return normalizeTimelinePage(page)
  }

  async previewRun(input: { threadId?: string; message?: string; providerManifest?: ProviderManifest; agentManifest?: ProviderManifest; approvedToolNames?: string[]; clientInput?: ProviderSessionClientInput; providerSessionLimits?: ProviderSessionLimitsOverride; runtimeLimits?: ProviderSessionLimitsOverride; runProfile?: AgentRunProfileSelection; threadControl?: Partial<AgentThreadControlState> }, signal?: AbortSignal): Promise<AgentRunPreview> {
    return normalizeAgentRunPreview(await this.postJSON<AgentRunPreview>('/runs/preview', providerManifestRequestBody(input), signal))
  }

  async getCapabilities(query: { projectId?: number } = {}): Promise<ProviderSessionCapabilitiesResponse> {
    const params = new URLSearchParams()
    if (typeof query.projectId === 'number') params.set('projectId', String(query.projectId))
    return normalizeActiveProviderManifestResponse(await this.getJSON<ProviderSessionCapabilitiesResponse>(`/capabilities${params.size ? `?${params.toString()}` : ''}`))
  }

  reloadProviderCatalog(signal?: AbortSignal): Promise<unknown> {
    return this.postJSON(providerCatalogWireRoute('catalog', 'reload'), {}, signal)
  }

  saveActiveProviderConfigFile(input: { configFileId: string }, signal?: AbortSignal): Promise<ProviderManifest> {
    return this.postJSON(providerCatalogWireRoute('config-files', 'active'), input, signal)
  }

  async saveProviderConfigFile(input: { configFile: ProviderCatalogConfigFile; activate?: boolean }, signal?: AbortSignal): Promise<{ configFile: ProviderCatalogConfigFile; configFiles: ProviderCatalogConfigFile[]; activeProviderManifest: ProviderManifest; activeAgentManifest?: ProviderManifest }> {
    return normalizeActiveProviderManifestResponse(await this.postJSON<{ configFile: ProviderCatalogConfigFile; configFiles: ProviderCatalogConfigFile[]; activeProviderManifest?: ProviderManifest; activeAgentManifest?: ProviderManifest }>(providerCatalogWireRoute('config-files'), input, signal))
  }

  async deleteProviderConfigFile(input: { configFileId: string }, signal?: AbortSignal): Promise<{ configFiles: ProviderCatalogConfigFile[]; activeProviderManifest: ProviderManifest; activeAgentManifest?: ProviderManifest }> {
    return normalizeActiveProviderManifestResponse(await this.deleteJSON<{ configFiles: ProviderCatalogConfigFile[]; activeProviderManifest?: ProviderManifest; activeAgentManifest?: ProviderManifest }>(`${providerCatalogWireRoute('config-files')}/${encodeURIComponent(input.configFileId)}`, signal))
  }

  saveConfigFileToolPermissions(input: { configFileId: string; toolGrants: ProviderManifest['tools'] }, signal?: AbortSignal): Promise<ProviderManifest> {
    return this.postJSON(`${providerCatalogWireRoute('config-files')}/${encodeURIComponent(input.configFileId)}/tool-permissions`, { toolGrants: input.toolGrants }, signal)
  }

  saveSkillInstructions(input: { skills: Array<{ id: string; instructionTemplate: string }> }, signal?: AbortSignal): Promise<{ skills: ProviderCatalogSkill[] }> {
    return this.postJSON(providerCatalogWireRoute('skills', 'instructions'), input, signal)
  }

  listPlugins(signal?: AbortSignal): Promise<ProviderPluginFileList> {
    return this.getJSON('/plugins', { signal })
  }

  savePlugin(plugin: ProviderPluginFileManifest, signal?: AbortSignal): Promise<ProviderPluginFileList> {
    return this.postJSON('/plugins', { plugin }, signal, { backendContext: false })
  }

  installPlugin(input: ProviderPluginFileInstallInput, signal?: AbortSignal): Promise<ProviderPluginFileInstallResult> {
    return this.postJSON('/plugins/install', {
      plugin: input.plugin,
      [providerPluginCatalogFilesWireKey()]: providerPluginCatalogFilesWireValue(input.pluginCatalogFiles ?? []),
    }, signal, { backendContext: false })
  }

  removePlugin(pluginId: string, signal?: AbortSignal): Promise<ProviderPluginFileRemoveResult> {
    return this.deleteJSON(`/plugins/${encodeURIComponent(pluginId)}`, signal)
  }

  getModelConfig(): Promise<ProviderModelConfigPublic> {
    return withProviderSessionModelConfigError(this.getJSON('/model-config', { auth: false }))
  }

  saveModelConfig(input: {
    modelConfigId?: number
    model: string
    apiKind?: ProviderModelAPIKind
    baseURL?: string
    apiKey?: string
    useForChat?: boolean
    useForPlanner?: boolean
  }): Promise<ProviderModelConfigPublic> {
    return withProviderSessionModelConfigError(this.postJSON('/model-config', input))
  }

  clearModelConfig(): Promise<ProviderModelConfigPublic> {
    return withProviderSessionModelConfigError(this.deleteJSON('/model-config'))
  }

  async getWorkspaceConfig(input: { workspaceDir?: string } = {}): Promise<MovScriptWorkspaceConfig> {
    if (typeof window !== 'undefined' && typeof window.api?.getMovScriptWorkspaceConfig === 'function') {
      return window.api.getMovScriptWorkspaceConfig({
        ...(this.providerProfileKey ? { providerProfileKey: this.providerProfileKey } : {}),
        ...(input.workspaceDir ?? this.workspaceDir ? { workspaceDir: input.workspaceDir ?? this.workspaceDir } : {}),
      })
    }
    return {
      schema: 'movscript.workspace-config.v2',
      updatedAt: new Date().toISOString(),
    }
  }

  async saveWorkspaceConfig(input: MovScriptWorkspaceConfigSaveInput): Promise<MovScriptWorkspaceConfig> {
    if (typeof window !== 'undefined' && typeof window.api?.saveMovScriptWorkspaceConfig === 'function') {
      return window.api.saveMovScriptWorkspaceConfig({
        ...(this.providerProfileKey ? { providerProfileKey: this.providerProfileKey } : {}),
        ...(this.workspaceDir ? { workspaceDir: this.workspaceDir } : {}),
        ...input,
      })
    }
    if (input.modelConfig && isPlainRecord(input.modelConfig)) await this.saveModelConfig(modelConfigInputFromRecord(input.modelConfig))
    if (input.modelConfig === null) await this.clearModelConfig()
    return this.getWorkspaceConfig()
  }

  async getProviderModelConfig(): Promise<ProviderModelConfigPublic> {
    if (typeof window !== 'undefined' && typeof window.api?.getMovScriptWorkspaceConfig === 'function') {
      const config = await this.getWorkspaceConfig()
      return providerModelConfigPublicFromWorkspaceConfig(config.modelConfig)
    }
    return this.getModelConfig()
  }

  async saveProviderModelConfig(input: Parameters<ProviderSessionClient['saveModelConfig']>[0]): Promise<ProviderModelConfigPublic> {
    if (typeof window !== 'undefined' && typeof window.api?.saveMovScriptWorkspaceConfig === 'function') {
      const config = await this.saveWorkspaceConfig({ modelConfig: input })
      return providerModelConfigPublicFromWorkspaceConfig(config.modelConfig)
    }
    return this.saveModelConfig(input)
  }

  async clearProviderModelConfig(): Promise<ProviderModelConfigPublic> {
    if (typeof window !== 'undefined' && typeof window.api?.saveMovScriptWorkspaceConfig === 'function') {
      const config = await this.saveWorkspaceConfig({ modelConfig: null })
      return providerModelConfigPublicFromWorkspaceConfig(config.modelConfig)
    }
    return this.clearModelConfig()
  }

  testModelConfig(input: {
    message?: string
    modelConfigId?: number
    model?: string
    apiKind?: ProviderModelAPIKind
    baseURL?: string
    apiKey?: string
    useForChat?: boolean
    useForPlanner?: boolean
  } = {}): Promise<ProviderModelTestResult> {
    return withProviderSessionModelConfigError(this.postJSON('/model-config/test', input))
  }

  async cancelRun(runId: string, input: { reason?: string } = {}, signal?: AbortSignal): Promise<AgentRun> {
    return normalizeAgentRun(await this.postJSON<AgentRun>(`/runs/${encodeURIComponent(runId)}/cancel`, input, signal))
  }

  async getRun(runId: string, signal?: AbortSignal): Promise<AgentRun> {
    return normalizeAgentRun(await this.getJSON<AgentRun>(`/runs/${encodeURIComponent(runId)}`, { signal }))
  }

  async approveInteraction(interactionId: string, input: ProviderSessionApprovalDecisionInput = {}, signal?: AbortSignal): Promise<{ interaction: ProviderInteraction; run: AgentRun }> {
    const response = await this.postJSON<{ interaction: ProviderInteraction; run: AgentRun }>(`/interactions/${encodeURIComponent(interactionId)}/approve`, input, signal)
    return { ...response, run: normalizeAgentRun(response.run) }
  }

  async rejectInteraction(interactionId: string, signal?: AbortSignal): Promise<{ interaction: ProviderInteraction; run: AgentRun }> {
    const response = await this.postJSON<{ interaction: ProviderInteraction; run: AgentRun }>(`/interactions/${encodeURIComponent(interactionId)}/reject`, {}, signal)
    return { ...response, run: normalizeAgentRun(response.run) }
  }

  async getTaskGraphSnapshot(taskGraphId: string, signal?: AbortSignal): Promise<AgentTaskGraphSnapshot> {
    return normalizeAgentTaskGraphSnapshot(await this.getJSON(`/plans/${encodeURIComponent(taskGraphId)}`, { signal }))
  }

  async createTaskGraph(input: {
    threadId: string
    title?: string
    goal?: string
    message?: string
    maxTasks?: number
    tasks?: Array<Partial<AgentTask> & { title?: string }>
    createPlannerRun?: boolean
    providerManifest?: ProviderManifest
    agentManifest?: ProviderManifest
    providerSessionLimits?: ProviderSessionLimitsOverride
    /** Legacy provider wire key. New client code should use providerSessionLimits. */
    runtimeLimits?: ProviderSessionLimitsOverride
  }, signal?: AbortSignal): Promise<AgentTaskGraphSnapshot> {
    return normalizeAgentTaskGraphSnapshot(await this.postJSON('/plans', providerManifestRequestBody(input), signal))
  }

  getPlanTasks(taskGraphId: string, signal?: AbortSignal): Promise<{ taskGraphId: string; tasks: AgentTask[] }> {
    return this.getJSON(`/plans/${encodeURIComponent(taskGraphId)}/tasks`, { signal })
  }

  updateTask(taskId: string, input: Partial<AgentTask>, signal?: AbortSignal): Promise<AgentTask> {
    return this.patchJSON(`/tasks/${encodeURIComponent(taskId)}`, input, signal)
  }

  async dispatchTaskGraph(taskGraphId: string, input: {
    plannerRunId?: string
    taskIds?: string[]
    maxWorkers?: number
    maxTaskAttempts?: number
    retryFailed?: boolean
    workerTimeoutMs?: number
    providerManifest?: ProviderManifest
    agentManifest?: ProviderManifest
    providerSessionLimits?: ProviderSessionLimitsOverride
    /** Legacy provider wire key. New client code should use providerSessionLimits. */
    runtimeLimits?: ProviderSessionLimitsOverride
  } = {}, signal?: AbortSignal): Promise<DispatchTaskGraphResult> {
    return normalizeDispatchTaskGraphResult(await this.postJSON(`/plans/${encodeURIComponent(taskGraphId)}/dispatch`, providerManifestRequestBody(input), signal))
  }

  async getChildRuns(runId: string, signal?: AbortSignal): Promise<{ runId: string; children: AgentRun[] }> {
    const result = await this.getJSON<{ runId: string; children: AgentRun[] }>(`/runs/${encodeURIComponent(runId)}/children`, { signal })
    return { ...result, children: result.children.map(normalizeAgentRun) }
  }

  async replanRun(runId: string, input: {
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
    return normalizeUpdateTaskGraphResult(await this.postJSON(`/runs/${encodeURIComponent(runId)}/updateTaskGraph`, input, signal))
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

  async getRunTraceDebugView(runId: string): Promise<AgentTraceDebugView> {
    return normalizeAgentTraceDebugView(await this.getJSON(`/runs/${encodeURIComponent(runId)}/trace/debug-view`))
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

  async answerRunInput(runId: string, input: { requestId?: string; choiceIds?: string[]; text?: string; sourceMessageId?: string }, signal?: AbortSignal): Promise<AgentRun> {
    return normalizeAgentRun(await this.postJSON(`/runs/${encodeURIComponent(runId)}/input`, input, signal))
  }

  async waitForRun(runId: string, options: { timeoutMs?: number; pollMs?: number; onRunUpdate?: (run: AgentRun) => void; signal?: AbortSignal } = {}): Promise<AgentRun> {
    const timeoutMs = options.timeoutMs ?? 30_000
    const pollMs = options.pollMs ?? 300
    const deadline = Date.now() + timeoutMs

    while (true) {
      const run = await this.getRun(runId, options.signal)
      options.onRunUpdate?.(run)
      if (isAgentRunStreamSettledStatus(run.status)) return run
      if (Date.now() > deadline) throw new Error(`provider session run ${runId} did not finish within ${timeoutMs}ms`)
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
      if (externalSignal?.aborted) throw externalSignal.reason ?? createProviderSessionAbortError()
      const remainingOverallMs = overallTimeoutMs === undefined
        ? undefined
        : overallTimeoutMs - (Date.now() - overallStartedAt)
      if (remainingOverallMs !== undefined && remainingOverallMs <= 0) {
        const latestRun = await this.getRun(runId, externalSignal).catch(() => undefined)
        if (latestRun) {
          lastKnownRun = latestRun
          options.onRunUpdate?.(latestRun)
          if (isAgentRunStreamSettledStatus(latestRun.status)) return await fullRunOrLatest(latestRun)
        }
        throw new Error(`provider session stream for run ${runId} timed out after ${timeoutMs}ms across ${streamRequestCount} HTTP request${streamRequestCount === 1 ? '' : 's'}`)
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
        controller.abort(createProviderSessionAbortError())
      }, requestTimeoutMs)

      try {
        streamRequestCount += 1
        const attempt = await this.readRunStreamAttempt(runId, options, controller.signal)
        lastKnownRun = attempt.run
        if (isAgentRunStreamSettledStatus(attempt.run.status)) return await fullRunOrLatest(attempt.run)
        options.onRunUpdate?.(attempt.run)
      } catch (error) {
        if (externalSignal?.aborted) throw externalSignal.reason ?? createProviderSessionAbortError()

        const latestRun = await this.getRun(runId, externalSignal).catch(() => undefined)
        if (latestRun) {
          lastKnownRun = latestRun
          options.onRunUpdate?.(latestRun)
          if (isAgentRunStreamSettledStatus(latestRun.status)) return await fullRunOrLatest(latestRun)
        }

        if (streamRequestTimedOut || (latestRun && isRetryableRunStreamError(error))) {
          continue
        }

        const fallbackRun = lastKnownRun ?? latestRun
        if (fallbackRun && isAgentRunStreamSettledStatus(fallbackRun.status)) return await fullRunOrLatest(fallbackRun)
        throw error
      } finally {
        globalThis.clearTimeout(requestTimeout)
        externalSignal?.removeEventListener('abort', abortFromExternal)
      }
    }
  }

  async streamThread(threadId: string, options: ThreadStreamOptions = {}): Promise<void> {
    await this.streamProviderEvents(`/threads/${encodeURIComponent(threadId)}/stream`, options)
  }

  async streamSession(sessionId: string, options: SessionStreamOptions = {}): Promise<void> {
    await this.streamProviderEvents(`/sessions/${encodeURIComponent(sessionId)}/stream`, options)
  }

  async streamThreadTimeline(threadId: string, options: AgentTimelineStreamOptions = {}): Promise<void> {
    await this.streamTimelineEvents(`/threads/${encodeURIComponent(threadId)}/timeline/stream`, options)
  }

  async streamSessionTimeline(sessionId: string, options: AgentTimelineStreamOptions = {}): Promise<void> {
    const params = new URLSearchParams()
    if (options.threadId) params.set('threadId', options.threadId)
    await this.streamTimelineEvents(`/sessions/${encodeURIComponent(sessionId)}/timeline/stream${params.size ? `?${params.toString()}` : ''}`, options)
  }

  async streamPlan(taskGraphId: string, options: PlanStreamOptions = {}): Promise<void> {
    await this.streamProviderEvents(`/plans/${encodeURIComponent(taskGraphId)}/stream`, options)
  }

  private async streamProviderEvents(
    path: string,
    options: { onProviderEvent?: (event: ProviderSessionEventV2) => void; signal?: AbortSignal } = {},
  ): Promise<void> {
    const stream = await this.openMeasuredEventStream(path, {
      headers: this.authHeaders({ Accept: 'text/event-stream' }),
      signal: options.signal,
    })
    if (!stream.ok) throw await providerSessionStreamError(stream)

    for await (const data of stream.messages()) {
      try {
        const event = parseProviderSessionEvent(data)
        if (event) options.onProviderEvent?.(event)
      } catch {
        continue
      }
    }
  }

  private async streamTimelineEvents(
    path: string,
    options: AgentTimelineStreamOptions = {},
  ): Promise<void> {
    const stream = await this.openMeasuredEventStream(path, {
      headers: this.authHeaders({ Accept: 'text/event-stream' }),
      signal: options.signal,
    })
    if (!stream.ok) throw await providerSessionStreamError(stream)

    for await (const data of stream.messages()) {
      try {
        const event = parseTimelineEvent(data)
        if (event) options.onTimelineEvent?.(event)
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
      if (latestRun?.status === 'requires_action') return
      if (!controller.signal.aborted) controller.abort(createProviderSessionAbortError())
    }, timeoutMs)

    try {
      await this.streamThread(threadId, {
        signal: controller.signal,
        onProviderEvent: (event) => {
          options.onProviderEvent?.(event)
          if (providerSessionRunIdFromEvent(event) !== runId) return
          const eventRun = normalizeOptionalAgentRun(providerSessionRunFromEvent(event))
          if (eventRun) {
            latestRun = eventRun
            options.onRunUpdate?.(eventRun)
          }
          if (latestRun && isAgentRunTerminalStatus(latestRun.status)) {
            settled = true
            if (!controller.signal.aborted) controller.abort(createProviderSessionAbortError())
          }
        },
      })
    } catch (error) {
      if (externalSignal?.aborted) throw externalSignal.reason ?? createProviderSessionAbortError()
      if (!settled) return this.streamRun(runId, options)
    } finally {
      globalThis.clearTimeout(timeout)
      externalSignal?.removeEventListener('abort', abortFromExternal)
    }

    const settledRun = latestRun
    if (settledRun && isAgentRunTerminalStatus(settledRun.status)) {
      return settledRun.streamPartial
        ? await this.getRun(settledRun.id, externalSignal).catch(() => settledRun)
        : settledRun
    }
    return this.streamRun(runId, options)
  }

  private async readRunStreamAttempt(runId: string, options: RunMessageOptions, signal: AbortSignal): Promise<{ run: AgentRun }> {
    const stream = await this.openMeasuredEventStream(`/runs/${encodeURIComponent(runId)}/stream`, {
      headers: this.authHeaders({ Accept: 'text/event-stream' }),
      signal,
    })
    if (!stream.ok) throw await providerSessionStreamError(stream)

    let latestRun = await this.getRun(runId, signal)
    const processData = (data: string): AgentRun | undefined => {
      const event = parseProviderSessionEvent(data)
      if (!event) return undefined
      options.onProviderEvent?.(event)
      const eventRun = normalizeOptionalAgentRun(providerSessionRunFromEvent(event))
      if (eventRun) {
        latestRun = eventRun
        options.onRunUpdate?.(eventRun)
      }
      if (isAgentRunTerminalStatus(latestRun.status)) return latestRun
      return undefined
    }

    for await (const data of stream.messages()) {
      const settledRun = processData(data)
      if (settledRun) return { run: settledRun }
    }
    if (latestRun.streamPartial && isAgentRunTerminalStatus(latestRun.status)) {
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

  listMemories(query: { scope?: ProviderMemoryScope; projectId?: number; threadId?: string; kind?: ProviderMemoryKind } = {}): Promise<{ memories: ProviderMemory[] }> {
    const params = new URLSearchParams()
    if (query.scope) params.set('scope', query.scope)
    if (typeof query.projectId === 'number') params.set('projectId', String(query.projectId))
    if (query.threadId) params.set('threadId', query.threadId)
    if (query.kind) params.set('kind', query.kind)
    return this.getJSON(`/memories${params.size ? `?${params.toString()}` : ''}`)
  }

  listWorkspaceArtifacts(query: { projectId?: number; kind?: MovScriptWorkspaceKind; status?: WorkspaceArtifactStatus | WorkspaceArtifactStatus[]; threadId?: string; runId?: string; pageKey?: string; pageType?: string; pageRoute?: string; pageEntityType?: string; pageEntityId?: number | string; current?: boolean; limit?: number } = {}): Promise<{ workspaces: WorkspaceArtifact[] }> {
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
    if (typeof query.current === 'boolean') params.set('current', String(query.current))
    if (typeof query.limit === 'number') params.set('limit', String(query.limit))
    return this.getJSON(`/workspaces${params.size ? `?${params.toString()}` : ''}`)
  }

  getWorkspaceArtifact(workspaceId: string): Promise<WorkspaceArtifact> {
    return this.getJSON(`/workspaces/${encodeURIComponent(workspaceId)}`)
  }

  createWorkspaceArtifact(input: { projectId?: number; kind?: MovScriptWorkspaceKind; title: string; content: string; source?: Record<string, unknown>; target?: Record<string, unknown>; seed?: Record<string, unknown>; metadata?: Record<string, unknown> }): Promise<WorkspaceArtifact> {
    return this.postJSON('/workspace', input)
  }

  updateWorkspaceArtifact(workspaceId: string, input: { status?: WorkspaceArtifactStatus; title?: string; content?: string; target?: Record<string, unknown>; metadata?: Record<string, unknown> }): Promise<WorkspaceArtifact> {
    return this.patchJSON(`/workspaces/${encodeURIComponent(workspaceId)}`, input)
  }

  previewApplyWorkspaceArtifact(workspaceId: string, input: { target?: Record<string, unknown>; targetEntityType?: string; targetEntityId?: number | string; targetField?: string; currentValue?: unknown; proposedValue?: unknown } = {}): Promise<WorkspaceArtifactApplyPreview> {
    return this.postJSON(`/workspaces/${encodeURIComponent(workspaceId)}/apply-preview`, input)
  }

  applyWorkspaceArtifact(workspaceId: string, input: { target?: Record<string, unknown>; targetEntityType?: string; targetEntityId?: number | string; targetField?: string; currentValue?: unknown; proposedValue?: unknown } = {}): Promise<WorkspaceArtifactApplyPreview> {
    return this.postJSON(`/workspaces/${encodeURIComponent(workspaceId)}/apply`, input)
  }

  rejectWorkspaceArtifact(workspaceId: string, reason?: string): Promise<WorkspaceArtifact> {
    return this.postJSON(`/workspaces/${encodeURIComponent(workspaceId)}/reject`, { reason })
  }

  createMemory(input: { scope: ProviderMemoryScope; kind: ProviderMemoryKind; content: string; projectId?: number; threadId?: string }): Promise<ProviderMemory> {
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
    clientInput?: ProviderSessionClientInput
    toolCall?: AgentToolCall
    approvedToolNames?: string[]
    activeRunMode?: 'runtime_input' | 'new_run'
    runProfile?: AgentRunProfileSelection
    threadControl?: Partial<AgentThreadControlState>
  }, options: RunMessageOptions = {}): Promise<RunMessageResult> {
    if (input.threadId?.trim()) {
      throw new Error('message send no longer accepts a client-selected thread')
    }
    const sessionId = this.sessionId?.trim()
    if (!sessionId) {
      throw new Error('message send requires a provider session')
    }
    return await this.runSessionMessageStream(sessionId, input, options)
  }

  private async runSessionMessageStream(sessionId: string, input: {
    message: string
    sourceMessageId?: string
    title?: string
    projectId?: number
    clientInput?: ProviderSessionClientInput
    toolCall?: AgentToolCall
    approvedToolNames?: string[]
    activeRunMode?: 'runtime_input' | 'new_run'
    runProfile?: AgentRunProfileSelection
    threadControl?: Partial<AgentThreadControlState>
  }, options: RunMessageOptions = {}): Promise<RunMessageResult> {
    options.onPhase?.('resolve_session_start', { sessionId })
    const session = await this.getSession(sessionId, options.signal)
    options.onPhase?.('resolve_session_done', {
      sessionId: session.id,
      activeThreadId: session.activeThreadId,
      interactiveThreadId: session.interactiveThreadId,
      rootThreadId: session.rootThreadId,
    })
    options.onPhase?.('create_session_message_run_start', {
      sessionId,
      activeRunMode: input.activeRunMode ?? 'runtime_input',
      hasClientInput: Boolean(input.clientInput),
      hasProviderManifest: Boolean(options.providerManifest ?? options.agentManifest),
      hasProviderSessionLimits: Boolean(options.providerSessionLimits ?? options.runtimeLimits),
    })
    const providerManifest = options.providerManifest ?? options.agentManifest
    const created = await this.createSessionMessageRun(sessionId, {
      message: input.message,
      ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
      ...(input.toolCall ? { toolCall: input.toolCall } : {}),
      ...(providerManifest ? { providerManifest } : {}),
      ...(input.approvedToolNames?.length ? { approvedToolNames: input.approvedToolNames } : {}),
      ...(input.clientInput ? { clientInput: input.clientInput } : {}),
      activeRunMode: input.activeRunMode ?? 'runtime_input',
      ...((options.providerSessionLimits ?? options.runtimeLimits) ? { providerSessionLimits: options.providerSessionLimits ?? options.runtimeLimits } : {}),
      ...(input.runProfile ? { runProfile: input.runProfile } : {}),
      ...(input.threadControl ? { threadControl: input.threadControl } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(typeof input.projectId === 'number' ? { projectId: input.projectId } : {}),
    }, options.signal)
    const run = normalizeAgentRun(created.run)
    const providerSessionInput = created.providerSessionInput
    const threadId = run.threadId || created.message.threadId
    options.onPhase?.('create_session_message_run_done', {
      sessionId,
      threadId,
      runId: run.id,
      runStatus: run.status,
      sourceMessageId: created.message.id,
      providerSessionInputAccepted: Boolean(providerSessionInput?.accepted),
    })
    options.onSourceMessage?.(created.message, run)
    options.onRunUpdate?.(run)
    if (providerSessionInput?.accepted) {
      options.onPhase?.('provider_session_input_final_thread_start', { sessionId, threadId, runId: run.id })
      const finalThread = await this.getThread(threadId)
      options.onPhase?.('provider_session_input_final_thread_done', { sessionId, threadId: finalThread.id, runId: run.id })
      return {
        run,
        thread: finalThread,
        threadResolution: {
          threadId: finalThread.id,
          reusedExistingThread: true,
          createdNewThread: false,
          missingRequestedThread: false,
        },
        sourceMessage: created.message,
      }
    }
    options.onPhase?.('run_stream_start', { sessionId, threadId, runId: run.id })
    const finalRun = await this.streamRunFromThread(threadId, run.id, options, run)
    options.onPhase?.('run_stream_done_client', { sessionId, threadId, runId: finalRun.id, runStatus: finalRun.status })
    options.onPhase?.('final_session_thread_fetch_start', { sessionId, threadId, runId: finalRun.id })
    const finalThread = await this.getThread(threadId)
    options.onPhase?.('final_session_thread_fetch_done', { sessionId, threadId: finalThread.id, runId: finalRun.id })
    return {
      run: finalRun,
      thread: finalThread,
      threadResolution: {
        threadId: finalThread.id,
        reusedExistingThread: true,
        createdNewThread: false,
        missingRequestedThread: false,
      },
      sourceMessage: created.message,
    }
  }

  private async getJSON<T>(path: string, options: { auth?: boolean; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
    const request = createProviderSessionRequestSignal(options.signal, options.timeoutMs ?? this.requestTimeoutMs)
    try {
      const res = await this.requestMeasured(path, {
        headers: options.auth === false ? {} : this.authHeaders(),
        signal: request.signal,
      })
      if (!res.ok) throw await providerSessionResponseError(res)
      return await res.json() as T
    } finally {
      request.cleanup()
    }
  }

  private async postJSON<T>(path: string, body: object, signal?: AbortSignal, options: { backendContext?: boolean } = {}): Promise<T> {
    const request = createProviderSessionRequestSignal(signal, this.requestTimeoutMs)
    try {
      const res = await this.requestMeasured(path, {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(options.backendContext === false ? body : this.withBackendContext(body)),
        signal: request.signal,
      })
      if (!res.ok) throw await providerSessionResponseError(res)
      return await res.json() as T
    } finally {
      request.cleanup()
    }
  }

  private async patchJSON<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const request = createProviderSessionRequestSignal(signal, this.requestTimeoutMs)
    try {
      const res = await this.requestMeasured(path, {
        method: 'PATCH',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(this.withBackendContext(body)),
        signal: request.signal,
      })
      if (!res.ok) throw await providerSessionResponseError(res)
      return await res.json() as T
    } finally {
      request.cleanup()
    }
  }

  private async deleteJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
    const request = createProviderSessionRequestSignal(signal, this.requestTimeoutMs)
    try {
      const res = await this.requestMeasured(path, {
        method: 'DELETE',
        headers: this.authHeaders(),
        signal: request.signal,
      })
      if (!res.ok) throw await providerSessionResponseError(res)
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

  private withBackendContext(body: object): Record<string, unknown> {
    return {
      ...(body as Record<string, unknown>),
      backendAPIBaseURL: getAPIV1BaseURL(),
    }
  }
}

function providerPluginCatalogFilesWireKey(): string {
  return ['agent', 'Catalog', 'Files'].join('')
}

function providerCatalogWireRoute(kind: 'catalog' | 'config-files' | 'skills', suffix?: string): string {
  const base = `/${['agent', kind].join('-')}`
  return suffix ? `${base}/${suffix}` : base
}

function providerPluginCatalogFilesWireValue(files: ProviderPluginFile[]): ProviderPluginFile[] {
  return files.map((file) => ({
    ...file,
    path: providerPluginCatalogPathWireValue(file.path),
  }))
}

function providerPluginCatalogPathWireValue(path: string): string {
  const mappings: Array<[string, string]> = [
    ['plugin-skills', ['agent', 'skills'].join('-')],
    ['plugin-tools', ['agent', 'tools'].join('-')],
    ['plugin-packs', ['agent', 'packs'].join('-')],
    ['plugin-config-files', ['agent', 'config', 'files'].join('-')],
  ]
  for (const [source, target] of mappings) {
    if (path === source || path.startsWith(`${source}/`)) return `${target}${path.slice(source.length)}`
  }
  return path
}

export const providerSessionClient = new ProviderSessionClient()

function isBackendAPIV1Endpoint(endpoint: string): boolean {
  return endpoint.replace(/\/+$/, '').endsWith('/api/v1')
}

function emptyProviderSessionTelemetrySnapshot(): ProviderSessionTelemetrySnapshot {
  return {
    schema: 'movscript.agent.runtime-telemetry.v1',
    generatedAt: new Date().toISOString(),
    service: {
      name: 'mova',
      storage: 'memory',
      metricsEndpoint: '/metrics',
      snapshotEndpoint: '/runtime/telemetry',
    },
    retention: {
      operations: 0,
      spans: 0,
      metrics: 0,
      logs: 0,
    },
    operations: [],
    spans: [],
    metrics: [],
    logs: [],
    summary: {
      operationCount: 0,
      runningOperationCount: 0,
      slowOperationCount: 0,
      errorOperationCount: 0,
      spanCount: 0,
      slowSpanCount: 0,
      errorSpanCount: 0,
    },
  }
}

function statusClass(status: number): string {
  if (!Number.isFinite(status) || status <= 0) return 'unknown'
  return `${Math.floor(status / 100)}xx`
}

function parseTimelineEvent(data: string): AgentTimelineStreamEvent | undefined {
  const parsed = JSON.parse(data) as unknown
  if (!isPlainRecord(parsed)) return undefined
  const type = parsed.type
  if (
    type !== 'timeline.item.created'
    && type !== 'timeline.item.updated'
    && type !== 'timeline.reset_required'
  ) return undefined
  const revision = typeof parsed.revision === 'number' && Number.isFinite(parsed.revision)
    ? parsed.revision
    : Date.now()
  if (type === 'timeline.reset_required') {
    return {
      type,
      revision,
      ...(typeof parsed.reason === 'string' ? { reason: parsed.reason } : {}),
    }
  }
  if (!isPlainRecord(parsed.item)) return undefined
  return {
    type,
    revision,
    item: normalizeTimelineItem(parsed.item as unknown as AgentTimelineItem) as Extract<AgentTimelineStreamEvent, { type: typeof type }>['item'],
  }
}

function normalizeTimelinePage(page: AgentTimelinePage): AgentTimelinePage {
  return {
    ...page,
    items: (page.items ?? []).map(normalizeTimelineItem),
  }
}

function normalizeTimelineItem(item: AgentTimelineItem): AgentTimelineItem {
  const providerSessionRefs = item.providerSessionRefs ?? item.runtimeRefs
  const { runtimeRefs: _compatRuntimeRefs, ...rest } = item
  return {
    ...rest,
    ...(providerSessionRefs ? { providerSessionRefs } : {}),
  }
}

function normalizeCreateMessageRunResult(input: CreateMessageRunResult): CreateMessageRunResult {
  const providerSessionInput = input.providerSessionInput ?? input.runtimeInput
  return {
    ...input,
    run: normalizeAgentRun(input.run),
    ...(providerSessionInput ? { providerSessionInput } : {}),
  }
}

type AgentRunCompatInput = Omit<AgentRun, 'providerSessionLimits'> & {
  providerSessionLimits?: ProviderSessionLimits
  runtimeLimits?: ProviderSessionLimits
}

function normalizeAgentRun(input: AgentRunCompatInput): AgentRun {
  const run = normalizeProviderManifestCarrier(input)
  const providerSessionLimits = run.providerSessionLimits ?? run.runtimeLimits
  return {
    ...run,
    ...(providerSessionLimits ? { providerSessionLimits } : {}),
  } as AgentRun
}

function normalizeOptionalAgentRun(input: AgentRunCompatInput | undefined): AgentRun | undefined {
  return input ? normalizeAgentRun(input) : undefined
}

function normalizeAgentRunList<T extends { runs: AgentRunCompatInput[] }>(input: T): Omit<T, 'runs'> & { runs: AgentRun[] } {
  return {
    ...input,
    runs: input.runs.map(normalizeAgentRun),
  }
}

function normalizeAgentTaskGraphSnapshot(input: AgentTaskGraphSnapshot): AgentTaskGraphSnapshot {
  return {
    ...input,
    runs: (input.runs ?? []).map(normalizeAgentRun),
  }
}

function normalizeDispatchTaskGraphResult(input: DispatchTaskGraphResult): DispatchTaskGraphResult {
  return {
    ...input,
    spawnedRuns: (input.spawnedRuns ?? []).map(normalizeAgentRun),
  }
}

function normalizeUpdateTaskGraphResult(input: UpdateTaskGraphResult): UpdateTaskGraphResult {
  return {
    ...input,
    ...(input.dispatch ? { dispatch: normalizeDispatchTaskGraphResult(input.dispatch) } : {}),
  }
}

function normalizeProviderSessionSnapshot(input: ProviderSessionSnapshotV2): ProviderSessionSnapshotV2 {
  return {
    ...input,
    entities: {
      ...input.entities,
      ...(input.entities.runs ? { runs: input.entities.runs.map(normalizeAgentRun) } : {}),
    },
  }
}

function normalizeAgentRunPreview(input: AgentRunPreview): AgentRunPreview {
  const preview = normalizeProviderManifestCarrier(input)
  const providerSessionLimits = preview.providerSessionLimits ?? preview.runtimeLimits
  return {
    ...preview,
    ...(providerSessionLimits ? { providerSessionLimits } : {}),
  }
}

function normalizeAgentTraceDebugView(input: AgentTraceDebugView): AgentTraceDebugView {
  return {
    ...input,
    providerSessionSummary: input.providerSessionSummary ?? input.runtimeSummary,
    providerSessionFrames: input.providerSessionFrames ?? input.runtimeFrames ?? [],
  }
}

function providerManifestRequestBody<T extends { providerManifest?: ProviderManifest; agentManifest?: ProviderManifest; providerSessionInputMode?: 'soft' | 'hard'; runtimeInputMode?: 'soft' | 'hard'; providerSessionLimits?: ProviderSessionLimitsOverride; runtimeLimits?: ProviderSessionLimitsOverride }>(
  input: T,
): Omit<T, 'providerManifest' | 'agentManifest' | 'providerSessionInputMode' | 'runtimeInputMode' | 'providerSessionLimits' | 'runtimeLimits'> & { agentManifest?: ProviderManifest; runtimeInputMode?: 'soft' | 'hard'; runtimeLimits?: ProviderSessionLimitsOverride } {
  const { providerManifest, agentManifest, providerSessionInputMode, runtimeInputMode, providerSessionLimits, runtimeLimits, ...rest } = input
  const manifest = providerManifest ?? agentManifest
  const providerInputMode = providerSessionInputMode ?? runtimeInputMode
  const providerLimits = providerSessionLimits ?? runtimeLimits
  return {
    ...rest,
    ...(providerInputMode ? { runtimeInputMode: providerInputMode } : {}),
    ...(providerLimits ? { runtimeLimits: providerLimits } : {}),
    ...(manifest ? { agentManifest: manifest } : {}),
  }
}

function normalizeActiveProviderManifestResponse<T extends { activeProviderManifest?: ProviderManifest; activeAgentManifest?: ProviderManifest }>(input: T): Omit<T, 'activeProviderManifest'> & { activeProviderManifest: ProviderManifest; activeAgentManifest?: ProviderManifest } {
  const manifest = input.activeProviderManifest ?? input.activeAgentManifest
  return {
    ...input,
    activeProviderManifest: manifest as ProviderManifest,
  }
}

function normalizeProviderManifestCarrier<T extends { providerManifest?: ProviderManifest; agentManifest?: ProviderManifest }>(input: T): T & { providerManifest?: ProviderManifest } {
  const manifest = input.providerManifest ?? input.agentManifest
  return {
    ...input,
    ...(manifest ? { providerManifest: manifest } : {}),
  }
}

function normalizeOptionalProviderManifestCarrier<T extends { providerManifest?: ProviderManifest; agentManifest?: ProviderManifest }>(input: T | undefined): (T & { providerManifest?: ProviderManifest }) | undefined {
  return input ? normalizeProviderManifestCarrier(input) : undefined
}

function providerModelConfigPublicFromWorkspaceConfig(modelConfig: Record<string, unknown> | undefined): ProviderModelConfigPublic {
  if (!modelConfig) {
    return {
      configured: false,
      provider: 'backend-model-config',
      model: 'movscript-default-chat',
      apiKind: 'openai_responses',
      apiKeyConfigured: false,
      useForChat: true,
      useForPlanner: true,
      source: 'none',
      credentialStatus: {
        required: false,
        configured: false,
        sourceEnv: [],
        acceptedEnv: [],
      },
    }
  }
  const input = modelConfigInputFromRecord(modelConfig)
  return {
    configured: Boolean(input.model?.trim()),
    provider: 'backend-model-config',
    ...(input.modelConfigId ? { modelConfigId: input.modelConfigId } : {}),
    model: input.model || (input.modelConfigId ? `model_config:${input.modelConfigId}` : 'movscript-default-chat'),
    apiKind: input.apiKind ?? 'openai_responses',
    ...(input.baseURL ? { baseURL: input.baseURL } : {}),
    apiKeyConfigured: Boolean(input.apiKey?.trim()),
    useForChat: input.useForChat ?? true,
    useForPlanner: input.useForPlanner ?? true,
    updatedAt: typeof modelConfig.updatedAt === 'string' ? modelConfig.updatedAt : undefined,
    source: input.model || input.modelConfigId ? 'file' : 'none',
    credentialStatus: {
      required: Boolean(input.baseURL?.trim()),
      configured: Boolean(input.apiKey?.trim()),
      sourceEnv: [],
      acceptedEnv: [],
    },
  }
}

function modelConfigInputFromRecord(value: Record<string, unknown>): Parameters<ProviderSessionClient['saveModelConfig']>[0] {
  const modelConfigId = positiveIntegerField(value.modelConfigId)
  const model = stringField(value.model) || (modelConfigId ? `model_config:${modelConfigId}` : '')
  return {
    ...(modelConfigId ? { modelConfigId } : {}),
    model,
    ...(providerModelAPIKindField(value.apiKind) ? { apiKind: providerModelAPIKindField(value.apiKind) } : {}),
    ...(stringField(value.baseURL) ? { baseURL: stringField(value.baseURL) } : {}),
    ...(stringField(value.apiKey) ? { apiKey: stringField(value.apiKey) } : {}),
    ...(typeof value.useForChat === 'boolean' ? { useForChat: value.useForChat } : {}),
    ...(typeof value.useForPlanner === 'boolean' ? { useForPlanner: value.useForPlanner } : {}),
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function positiveIntegerField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function providerModelAPIKindField(value: unknown): ProviderModelAPIKind | undefined {
  return typeof value === 'string' && (PROVIDER_MODEL_API_KINDS as readonly string[]).includes(value)
    ? value as ProviderModelAPIKind
    : undefined
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}
