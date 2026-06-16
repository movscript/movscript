import { isProviderSessionNotFoundError, ProviderSessionHTTPError } from '@/shared/infrastructure/provider-session-client/errors'
import { withProviderSessionModelConfigError } from '@/shared/infrastructure/provider-session-client/modelConfigError'
import * as providerSessionRoutes from '@/shared/infrastructure/provider-session-client/providerSessionHttpRoutes'
import { AGENT_TRACE_EVENT_KINDS } from '@movscript/core/agent/protocol'
import {
  emptyProviderSessionTelemetrySnapshot,
  isBackendAPIV1Endpoint,
  normalizeActiveProviderManifestResponse,
  normalizeCreateMessageRunResult,
  normalizeOptionalProviderManifestCarrier,
  normalizeProviderSessionSnapshot,
  normalizeTimelinePage,
  providerCatalogWireRoute,
  providerManifestRequestBody,
  providerPluginCatalogFilesWireKey,
  providerPluginCatalogFilesWireValue,
} from '@/shared/infrastructure/provider-session-client/providerSessionHttpProtocol'
import {
  clearProviderSessionProviderModelConfig,
  deleteProviderSessionConfigFile,
  getProviderSessionProviderModelConfig,
  getProviderSessionWorkspaceConfig,
  inspectProviderSessionCatalogFromWorkspace,
  listProviderSessionsFromElectronWorkspace,
  saveActiveProviderSessionConfigFile,
  saveProviderSessionConfigFile,
  saveProviderSessionProviderModelConfig,
  saveProviderSessionWorkspaceConfig,
} from '@/shared/infrastructure/provider-session-client/providerSessionWorkspaceConfigClient'
import { ProviderSessionRunClient } from '@/shared/infrastructure/provider-session-client/providerSessionRunClient'
import type { ProviderSessionCreateMessageRunInput } from '@/shared/infrastructure/provider-session-client/providerSessionStreamingClient'
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
  WorkspaceArtifactApplyReview,
  AgentRunDebugEvidenceKind,
  AgentRunDebugEvidenceRef,
  MovScriptWorkspaceConfig,
  MovScriptWorkspaceConfigSaveInput,
} from '@/shared/infrastructure/provider-session-client/types'
import type { ProviderSessionWorkspaceScopeInput } from '@/shared/infrastructure/provider-session-client/providerSessionHttpRoutes'

export { AGENT_TRACE_EVENT_KINDS }
export { isProviderSessionNotFoundError, ProviderSessionHTTPError }
export type { ProviderSessionApprovalDecisionInput } from '@/shared/infrastructure/provider-session-client/providerSessionRunClient'
export type * from '@/shared/infrastructure/provider-session-client/publicTypes'

export class ProviderSessionClient extends ProviderSessionRunClient {
  forSession(input: ProviderSessionWorkspaceScopeInput & { sessionId: string }): ProviderSessionClient {
    const movScriptHomeDir = input.movScriptHomeDir ?? input.workspaceDir
    return new ProviderSessionClient(undefined, {
      healthTimeoutMs: this.healthTimeoutMs,
      requestTimeoutMs: this.requestTimeoutMs,
      providerProfileKey: this.providerProfileKey,
      movScriptHomeDir,
      workspaceDir: movScriptHomeDir,
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
    return inspectProviderSessionCatalogFromWorkspace(this, async () => (
      normalizeActiveProviderManifestResponse(await this.getJSON<ProviderCatalogInspectResponse>('/inspect'))
    ))
  }

  getProviderSessionTelemetry(signal?: AbortSignal): Promise<ProviderSessionTelemetrySnapshot> {
    if (isBackendAPIV1Endpoint(this.baseURL)) {
      return Promise.resolve(emptyProviderSessionTelemetrySnapshot())
    }
    return this.getJSON('/runtime/telemetry', { auth: false, signal })
  }

  async listProviderSessionsFromWorkspace(input: ProviderSessionWorkspaceScopeInput = {}): Promise<{ sessions: ProviderSessionSummary[] }> {
    return listProviderSessionsFromElectronWorkspace(input, this)
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
    return this.getJSON(providerSessionRoutes.providerSessionSessionPath(sessionId), { signal })
  }

  getSessionProviderSessionSnapshot(sessionId: string, signal?: AbortSignal): Promise<ProviderSessionSnapshotV2> {
    return this.getJSON(providerSessionRoutes.providerSessionSessionPath(sessionId, 'runtime'), { signal })
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
    return this.getJSON(providerSessionRoutes.providerSessionThreadListPath(query), { signal })
  }

  deleteThread(threadId: string, signal?: AbortSignal): Promise<AgentThreadDeletionResult> {
    return this.deleteJSON(providerSessionRoutes.providerSessionThreadPath(threadId), signal)
  }

  deleteAllThreads(signal?: AbortSignal): Promise<AgentThreadClearResult> {
    return this.deleteJSON('/threads', signal)
  }

  listThreadMessages(threadId: string, query: AgentThreadMessagesQuery = {}, signal?: AbortSignal): Promise<AgentThreadMessagesPage> {
    return this.getJSON(providerSessionRoutes.providerSessionThreadMessagesPath(threadId, query), { signal })
  }

  createSessionMessageRun(sessionId: string, input: ProviderSessionCreateMessageRunInput, signal?: AbortSignal): Promise<CreateMessageRunResult> {
    return this.postJSON<CreateMessageRunResult>(providerSessionRoutes.providerSessionSessionPath(sessionId, 'runs'), providerManifestRequestBody(input), signal)
      .then(normalizeCreateMessageRunResult)
  }

  async getThreadProviderSessionSnapshot(threadId: string, signal?: AbortSignal): Promise<ProviderSessionSnapshotV2> {
    return normalizeProviderSessionSnapshot(await this.getJSON(providerSessionRoutes.providerSessionThreadPath(threadId, 'runtime'), { signal }))
  }

  async listThreadTimeline(threadId: string, query: AgentTimelineQuery = {}, signal?: AbortSignal): Promise<AgentTimelinePage> {
    const page = await this.getJSON<AgentTimelinePage>(providerSessionRoutes.providerSessionThreadTimelinePath(threadId, query), { signal })
    return normalizeTimelinePage(page)
  }

  async listSessionTimeline(sessionId: string, query: AgentSessionTimelineQuery = {}, signal?: AbortSignal): Promise<AgentTimelinePage> {
    const page = await this.getJSON<AgentTimelinePage>(providerSessionRoutes.providerSessionTimelinePath(sessionId, query), { signal })
    return normalizeTimelinePage(page)
  }

  async getCapabilities(query: { projectId?: number } = {}): Promise<ProviderSessionCapabilitiesResponse> {
    return normalizeActiveProviderManifestResponse(await this.getJSON<ProviderSessionCapabilitiesResponse>(providerSessionRoutes.providerSessionCapabilitiesPath(query)))
  }

  reloadProviderCatalog(signal?: AbortSignal): Promise<unknown> {
    return this.postJSON(providerCatalogWireRoute('catalog', 'reload'), {}, signal)
  }

  saveActiveProviderConfigFile(input: { configFileId: string }, signal?: AbortSignal): Promise<ProviderManifest> {
    return saveActiveProviderSessionConfigFile(input, this, () => (
      this.postJSON(providerCatalogWireRoute('config-files', 'active'), input, signal)
    ))
  }

  async saveProviderConfigFile(input: { configFile: ProviderCatalogConfigFile; activate?: boolean }, signal?: AbortSignal): Promise<{ configFile: ProviderCatalogConfigFile; configFiles: ProviderCatalogConfigFile[]; activeProviderManifest: ProviderManifest; activeAgentManifest?: ProviderManifest }> {
    return saveProviderSessionConfigFile(input, this, async () => (
      normalizeActiveProviderManifestResponse(await this.postJSON<{ configFile: ProviderCatalogConfigFile; configFiles: ProviderCatalogConfigFile[]; activeProviderManifest?: ProviderManifest; activeAgentManifest?: ProviderManifest }>(providerCatalogWireRoute('config-files'), input, signal))
    ))
  }

  async deleteProviderConfigFile(input: { configFileId: string }, signal?: AbortSignal): Promise<{ configFiles: ProviderCatalogConfigFile[]; activeProviderManifest: ProviderManifest; activeAgentManifest?: ProviderManifest }> {
    return deleteProviderSessionConfigFile(input, this, async () => (
      normalizeActiveProviderManifestResponse(await this.deleteJSON<{ configFiles: ProviderCatalogConfigFile[]; activeProviderManifest?: ProviderManifest; activeAgentManifest?: ProviderManifest }>(`${providerCatalogWireRoute('config-files')}/${encodeURIComponent(input.configFileId)}`, signal))
    ))
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

  async getWorkspaceConfig(input: ProviderSessionWorkspaceScopeInput = {}): Promise<MovScriptWorkspaceConfig> {
    return getProviderSessionWorkspaceConfig(input, this)
  }

  async saveWorkspaceConfig(input: MovScriptWorkspaceConfigSaveInput): Promise<MovScriptWorkspaceConfig> {
    return saveProviderSessionWorkspaceConfig(input, this)
  }

  async getProviderModelConfig(): Promise<ProviderModelConfigPublic> {
    return getProviderSessionProviderModelConfig(this)
  }

  async saveProviderModelConfig(input: Parameters<ProviderSessionClient['saveModelConfig']>[0]): Promise<ProviderModelConfigPublic> {
    return saveProviderSessionProviderModelConfig(input, this)
  }

  async clearProviderModelConfig(): Promise<ProviderModelConfigPublic> {
    return clearProviderSessionProviderModelConfig(this)
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

  getThread(threadId: string, signal?: AbortSignal): Promise<AgentThread> {
    return this.getJSON(providerSessionRoutes.providerSessionThreadPath(threadId), { signal })
  }

  updateThread(threadId: string, input: {
    title?: string
    archived?: boolean
    metadata?: Record<string, unknown>
    lifecycle?: AgentConversationLifecycle
    expiresAt?: string
  }, signal?: AbortSignal): Promise<AgentThread> {
    return this.patchJSON(providerSessionRoutes.providerSessionThreadPath(threadId), input, signal)
  }

}

export const providerSessionClient = new ProviderSessionClient()
