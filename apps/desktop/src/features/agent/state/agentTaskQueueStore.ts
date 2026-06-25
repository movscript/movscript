import type { AgentSessionStore } from '@/features/agent/state/agentSessionStoreTypes'
import type {
  AgentPageTaskPayload,
  AgentPageTaskState,
} from '@/features/agent/state/agentSessionTaskModel'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'

export interface AgentTaskQueueActions {
  enqueuePageTask: AgentSessionStore['enqueuePageTask']
  claimNextQueuedPageTask: AgentSessionStore['claimNextQueuedPageTask']
  attachPageTaskConversation: AgentSessionStore['attachPageTaskConversation']
  setPageTaskRunning: AgentSessionStore['setPageTaskRunning']
  updatePageTaskFromProviderSession: AgentSessionStore['updatePageTaskFromProviderSession']
}

export type AgentQueuedPageTaskPayload = AgentPageTaskPayload & { requestId: string; taskType: string }

export function useAgentPageTasks(): Record<string, AgentPageTaskState> {
  return useAgentSessionStore((state) => state.pageTasks)
}

export function readAgentPageTasks(): Record<string, AgentPageTaskState> {
  return useAgentSessionStore.getState().pageTasks
}

export function enqueueAgentQueuedPageTask(payload: AgentPageTaskPayload): AgentQueuedPageTaskPayload {
  return useAgentSessionStore.getState().enqueuePageTask(payload)
}

export function claimNextAgentQueuedPageTask(): AgentQueuedPageTaskPayload | null {
  return useAgentSessionStore.getState().claimNextQueuedPageTask()
}

export function attachAgentQueuedPageTaskConversation(requestId: string, conversationId: string): void {
  useAgentSessionStore.getState().attachPageTaskConversation(requestId, conversationId)
}

export function updateAgentQueuedPageTaskFromProviderSession(
  payload: Parameters<AgentSessionStore['updatePageTaskFromProviderSession']>[0],
): void {
  useAgentSessionStore.getState().updatePageTaskFromProviderSession(payload)
}

export function agentTaskQueueActions(): AgentTaskQueueActions {
  const state = useAgentSessionStore.getState()
  return {
    enqueuePageTask: state.enqueuePageTask,
    claimNextQueuedPageTask: state.claimNextQueuedPageTask,
    attachPageTaskConversation: state.attachPageTaskConversation,
    setPageTaskRunning: state.setPageTaskRunning,
    updatePageTaskFromProviderSession: state.updatePageTaskFromProviderSession,
  }
}
