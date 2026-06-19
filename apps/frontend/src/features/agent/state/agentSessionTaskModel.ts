import type { AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import type {
  AgentRun, AgentThread, ProviderManifest, ProviderSessionClientInput } from '@movscript/core/agent/protocol'

export type AgentPageTaskStatus = 'queued' | 'claimed' | 'running' | 'completed' | 'error' | 'cancelled'
export type AgentTaskRenderMode = 'chat' | 'panel' | 'page'
export interface AgentPageTaskProviderSessionRef {
  providerSessionTreeId?: string
  sessionId?: string // deprecated legacy provider-session input; normalize to providerSessionTreeId.
}
export type AgentPageTaskRun = (AgentRun & AgentPageTaskProviderSessionRef) | {
  id: string
  threadId?: string
  providerSessionTreeId?: string
  sessionId?: string // deprecated legacy provider-session input; normalize to providerSessionTreeId.
  status?: string
  error?: string | null
}
export type AgentPageTaskThread = (AgentThread & AgentPageTaskProviderSessionRef) | {
  id: string
  providerSessionTreeId?: string
  sessionId?: string // deprecated legacy provider-session input; normalize to providerSessionTreeId.
}

export interface AgentPageTaskPayload {
  requestId?: string
  taskType?: string
  message: string
  displayMessage?: string
  title?: string
  newConversation?: boolean
  autoSend?: boolean
  projectId?: number
  clientInput?: ProviderSessionClientInput
  providerManifest?: ProviderManifest
  timeoutMs?: number
  renderMode?: AgentTaskRenderMode
}

export interface AgentPageTaskState {
  requestId: string
  taskType: string
  status: AgentPageTaskStatus
  payload: AgentPageTaskPayload & { requestId: string; taskType: string }
  artifacts?: AgentTaskArtifactRef[]
  conversationId?: string
  providerSessionTreeId?: string
  threadId?: string
  runId?: string
  run?: AgentPageTaskRun
  thread?: AgentPageTaskThread
  error?: string
  createdAt: number
  updatedAt: number
  settledAt?: number
}

export interface AgentPageTaskRunningPatch {
  conversationId?: string
  providerSessionTreeId?: string
  sessionId?: string // deprecated legacy provider-session input; normalize to providerSessionTreeId.
  run?: AgentRun
  thread?: AgentThread
  threadId?: string
  artifacts?: AgentTaskArtifactRef[]
}

export function normalizeTaskPayload(payload: AgentPageTaskPayload): AgentPageTaskPayload & { requestId: string; taskType: string } {
  return {
    ...payload,
    requestId: payload.requestId || genTaskId(),
    taskType: payload.taskType || inferTaskType(payload),
  }
}

export function isTerminalAgentPageTaskRun(run: AgentPageTaskRun): boolean {
  return run.status === 'completed'
    || run.status === 'completed_with_warnings'
    || run.status === 'failed'
    || run.status === 'cancelled'
}

export function pageTaskStatusFromProviderSession(
  payload: { status?: 'completed' | 'error' | 'cancelled'; run?: AgentPageTaskRun },
  currentStatus: AgentPageTaskStatus,
): AgentPageTaskStatus {
  if (payload.status) return payload.status
  if (!payload.run) return currentStatus === 'queued' ? 'claimed' : currentStatus
  switch (payload.run.status) {
    case 'completed':
    case 'completed_with_warnings':
      return 'completed'
    case 'failed':
      return 'error'
    case 'cancelled':
      return 'cancelled'
    default:
      return currentStatus === 'queued' ? 'claimed' : currentStatus
  }
}

function genTaskId() {
  return `agent_task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function inferTaskType(payload: AgentPageTaskPayload): string {
  const labels = payload.clientInput?.uiSnapshot?.labels ?? []
  const known = labels.find((label) => /workbench|orchestrate|script|creative|page-tool/i.test(label))
  if (known) return known
  if (payload.title?.trim()) return payload.title.trim().split(':')[0] || 'agent_task'
  return 'agent_task'
}
