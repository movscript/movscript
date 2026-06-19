import type { ConversationWorkspace } from '@/features/agent/state/agentStore'
import { EMPTY_CONVERSATION_WORKSPACE } from '@/features/agent/state/agentSessionRuntimeModel'
import type { AgentSessionStore } from '@/features/agent/state/agentSessionStoreTypes'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'

export interface AgentConversationDraftActions {
  getConversationWorkspace: AgentSessionStore['getConversationWorkspace']
  updateConversationWorkspace: AgentSessionStore['updateConversationWorkspace']
  clearConversationWorkspace: AgentSessionStore['clearConversationWorkspace']
}

export function useAgentConversationWorkspace(userId: string, conversationId: string): ConversationWorkspace {
  return useAgentSessionStore((state) => state.workspacesByUser[userId]?.[conversationId] ?? EMPTY_CONVERSATION_WORKSPACE)
}

export function readAgentConversationWorkspace(userId: string, conversationId: string): ConversationWorkspace {
  return useAgentSessionStore.getState().getConversationWorkspace(userId, conversationId)
}

export function updateAgentConversationWorkspace(
  userId: string,
  conversationId: string,
  patch: Partial<ConversationWorkspace>,
): void {
  useAgentSessionStore.getState().updateConversationWorkspace(userId, conversationId, patch)
}

export function clearAgentConversationWorkspace(userId: string, conversationId: string): void {
  useAgentSessionStore.getState().clearConversationWorkspace(userId, conversationId)
}

export function agentConversationDraftActions(): AgentConversationDraftActions {
  const state = useAgentSessionStore.getState()
  return {
    getConversationWorkspace: state.getConversationWorkspace,
    updateConversationWorkspace: state.updateConversationWorkspace,
    clearConversationWorkspace: state.clearConversationWorkspace,
  }
}
