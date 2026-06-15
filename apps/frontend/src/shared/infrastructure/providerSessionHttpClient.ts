import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { isProviderSessionNotFoundError, ProviderSessionHTTPError } from '@/shared/infrastructure/provider-session-client/errors'
import { withProviderSessionModelConfigError } from '@/shared/infrastructure/provider-session-client/modelConfigError'
import { AGENT_TRACE_EVENT_KINDS } from '@movscript/core/agent/protocol'
import type { AgentThreadControlState } from '@movscript/core/agent/chat'
import type { AgentRunProfileSelection } from '@/features/agent/domain/agentRunProfilePreset'
import {
  emptyProviderSessionTelemetrySnapshot,
  isBackendAPIV1Endpoint,
  isPlainRecord,
  modelConfigInputFromRecord,
  normalizeActiveProviderManifestResponse,
  normalizeAgentRun,
  normalizeAgentRunList,
  normalizeAgentRunPreview,
  normalizeAgentTaskGraphSnapshot,
  normalizeCreateMessageRunResult,
  normalizeDispatchTaskGraphResult,
  normalizeOptionalProviderManifestCarrier,
  normalizeProviderSessionSnapshot,
  normalizeTimelinePage,
  normalizeUpdateTaskGraphResult,
  providerCatalogWireRoute,
  providerManifestRequestBody,
  providerModelConfigPublicFromWorkspaceConfig,
  providerPluginCatalogFilesWireKey,
  providerPluginCatalogFilesWireValue,
} from '@/shared/infrastructure/provider-session-client/providerSessionHttpProtocol'
import { ProviderSessionWorkspaceArtifactClient } from '@/shared/infrastructure/provider-session-client/providerSessionWorkspaceArtifactClient'
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

export { AGENT_TRACE_EVENT_KINDS }
export { isProviderSessionNotFoundError, ProviderSessionHTTPError }
export type * from '@/shared/infrastructure/provider-session-client/publicTypes'

export interface ProviderSessionApprovalDecisionInput {
  scope?: 'turn' | 'session'
  strictAutoReview?: boolean
  execPolicyAmendment?: unknown
  networkPolicyAmendment?: unknown
}
export class ProviderSessionClient extends ProviderSessionWorkspaceArtifactClient {
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
    const electronApi = readElectronApi()
    if (typeof electronApi?.listProviderSessions !== 'function') {
      return { sessions: [] }
    }
    const providerProfileKey = input.providerProfileKey ?? this.providerProfileKey
    return electronApi.listProviderSessions({
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

  createSessionMessageRun(sessionId: string, input: ProviderSessionCreateMessageRunInput, signal?: AbortSignal): Promise<CreateMessageRunResult> {
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

  async previewRun(input: { threadId?: string; message?: string; providerManifest?: ProviderManifest; agentManifest?: ProviderManifest; approvedToolNames?: string[]; clientInput?: ProviderSessionClientInput; providerSessionLimits?: ProviderSessionLimitsOverride; runProfile?: AgentRunProfileSelection; threadControl?: Partial<AgentThreadControlState> }, signal?: AbortSignal): Promise<AgentRunPreview> {
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
    const electronApi = readElectronApi()
    if (typeof electronApi?.getMovScriptWorkspaceConfig === 'function') {
      return electronApi.getMovScriptWorkspaceConfig({
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
    const electronApi = readElectronApi()
    if (typeof electronApi?.saveMovScriptWorkspaceConfig === 'function') {
      return electronApi.saveMovScriptWorkspaceConfig({
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
    if (typeof readElectronApi()?.getMovScriptWorkspaceConfig === 'function') {
      const config = await this.getWorkspaceConfig()
      return providerModelConfigPublicFromWorkspaceConfig(config.modelConfig)
    }
    return this.getModelConfig()
  }

  async saveProviderModelConfig(input: Parameters<ProviderSessionClient['saveModelConfig']>[0]): Promise<ProviderModelConfigPublic> {
    if (typeof readElectronApi()?.saveMovScriptWorkspaceConfig === 'function') {
      const config = await this.saveWorkspaceConfig({ modelConfig: input })
      return providerModelConfigPublicFromWorkspaceConfig(config.modelConfig)
    }
    return this.saveModelConfig(input)
  }

  async clearProviderModelConfig(): Promise<ProviderModelConfigPublic> {
    if (typeof readElectronApi()?.saveMovScriptWorkspaceConfig === 'function') {
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

  async answerRunInput(runId: string, input: { requestId?: string; choiceIds?: string[]; text?: string; sourceMessageId?: string }, signal?: AbortSignal): Promise<AgentRun> {
    return normalizeAgentRun(await this.postJSON(`/runs/${encodeURIComponent(runId)}/input`, input, signal))
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

}

export const providerSessionClient = new ProviderSessionClient()
