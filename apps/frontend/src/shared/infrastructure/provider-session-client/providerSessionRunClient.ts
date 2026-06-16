import type { AgentThreadControlState } from '@movscript/core/agent/chat'
import type { AgentRunProfileSelection } from '@/features/agent/domain/agentRunProfilePreset'
import * as providerSessionRoutes from '@/shared/infrastructure/provider-session-client/providerSessionHttpRoutes'
import {
  normalizeAgentRun,
  normalizeAgentRunList,
  normalizeAgentRunPreview,
  normalizeAgentTaskGraphSnapshot,
  normalizeDispatchTaskGraphResult,
  normalizeUpdateTaskGraphResult,
  providerManifestRequestBody,
} from '@/shared/infrastructure/provider-session-client/providerSessionHttpProtocol'
import { ProviderSessionWorkspaceArtifactClient } from '@/shared/infrastructure/provider-session-client/providerSessionWorkspaceArtifactClient'
import type {
  AgentRun,
  AgentRunPreview,
  AgentTask,
  AgentTaskGraphSnapshot,
  DispatchTaskGraphResult,
  ProviderInteraction,
  ProviderManifest,
  ProviderSessionClientInput,
  ProviderSessionLimitsOverride,
  UpdateTaskGraphResult,
} from '@/shared/infrastructure/provider-session-client/types'

export interface ProviderSessionApprovalDecisionInput {
  scope?: 'turn' | 'session'
  strictAutoReview?: boolean
  execPolicyAmendment?: unknown
  networkPolicyAmendment?: unknown
}

export abstract class ProviderSessionRunClient extends ProviderSessionWorkspaceArtifactClient {
  async listRuns(): Promise<{ runs: AgentRun[] }> {
    return normalizeAgentRunList(await this.getJSON<{ runs: AgentRun[] }>('/runs'))
  }

  async listRunsByParent(parentRunId: string, signal?: AbortSignal): Promise<{ runs: AgentRun[] }> {
    return normalizeAgentRunList(await this.getJSON<{ runs: AgentRun[] }>(providerSessionRoutes.providerSessionRunParentListPath(parentRunId), { signal }))
  }

  async listRunsByThread(threadId: string, signal?: AbortSignal): Promise<{ threadId: string; runs: AgentRun[] }> {
    const result = await this.getJSON<{ threadId: string; runs: AgentRun[] }>(providerSessionRoutes.providerSessionThreadPath(threadId, 'runs'), { signal })
    return { ...result, runs: result.runs.map(normalizeAgentRun) }
  }

  async previewRun(input: { threadId?: string; message?: string; providerManifest?: ProviderManifest; agentManifest?: ProviderManifest; approvedToolNames?: string[]; clientInput?: ProviderSessionClientInput; providerSessionLimits?: ProviderSessionLimitsOverride; runProfile?: AgentRunProfileSelection; threadControl?: Partial<AgentThreadControlState> }, signal?: AbortSignal): Promise<AgentRunPreview> {
    return normalizeAgentRunPreview(await this.postJSON<AgentRunPreview>('/runs/preview', providerManifestRequestBody(input), signal))
  }

  async cancelRun(runId: string, input: { reason?: string } = {}, signal?: AbortSignal): Promise<AgentRun> {
    return normalizeAgentRun(await this.postJSON<AgentRun>(providerSessionRoutes.providerSessionRunPath(runId, 'cancel'), input, signal))
  }

  async getRun(runId: string, signal?: AbortSignal): Promise<AgentRun> {
    return normalizeAgentRun(await this.getJSON<AgentRun>(providerSessionRoutes.providerSessionRunPath(runId), { signal }))
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
    const result = await this.getJSON<{ runId: string; children: AgentRun[] }>(providerSessionRoutes.providerSessionRunPath(runId, 'children'), { signal })
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
    return normalizeUpdateTaskGraphResult(await this.postJSON(providerSessionRoutes.providerSessionRunPath(runId, 'updateTaskGraph'), input, signal))
  }

  cancelRunTree(runId: string, input: { reason?: string } = {}, signal?: AbortSignal): Promise<{ cancelledRunIds: string[] }> {
    return this.postJSON(providerSessionRoutes.providerSessionRunPath(runId, 'cancel-tree'), input, signal)
  }

  async answerRunInput(runId: string, input: { requestId?: string; choiceIds?: string[]; text?: string; sourceMessageId?: string }, signal?: AbortSignal): Promise<AgentRun> {
    return normalizeAgentRun(await this.postJSON(providerSessionRoutes.providerSessionRunPath(runId, 'input'), input, signal))
  }
}
