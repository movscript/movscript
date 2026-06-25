import type { AgentConversationRuntimeState } from '@/features/agent/state/agentSessionRuntimeModel'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'

export function useAgentConversationRuntimeStates(): Record<string, AgentConversationRuntimeState> {
  return useAgentSessionStore((state) => state.conversationRuntimeStates)
}

export function useAgentConversationRuntimeState(conversationId: string): AgentConversationRuntimeState | undefined {
  return useAgentSessionStore((state) => state.conversationRuntimeStates[conversationId])
}

export function readAgentConversationRuntimeStates(): Record<string, AgentConversationRuntimeState> {
  return useAgentSessionStore.getState().conversationRuntimeStates
}
