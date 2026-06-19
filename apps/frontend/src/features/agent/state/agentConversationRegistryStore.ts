import type {
  AgentConversationRegistryInput,
  AgentConversationRegistryRecord,
} from '@movscript/core/agent'
import type { AgentConversationFocusScope } from '@/features/agent/state/agentConversationFocusScope'
import type { AgentConversationThreadBinding } from '@/features/agent/state/agentSessionRuntimeModel'
import type { AgentSessionStore } from '@/features/agent/state/agentSessionStoreTypes'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
export {
  attachAgentConversationRegistryBroadcastBridge,
  subscribeAgentConversationRegistryEvents,
  type AgentConversationRegistryEvent,
  type AgentConversationRegistryEventKind,
} from '@/features/agent/state/agentConversationRegistryEvents'

export interface AgentConversationRegistrySnapshot {
  activeConversationIdsByUser: Record<string, string | null>
  activeConversationIdsByScope: Record<string, string | null>
  conversationsById: Record<string, AgentConversationRegistryRecord>
  conversationThreadBindings: Record<string, AgentConversationThreadBinding>
}

export interface AgentConversationRegistryActions {
  upsertConversation: AgentSessionStore['upsertConversation']
  setConversationOpen: AgentSessionStore['setConversationOpen']
  removeProviderSessionConversation: AgentSessionStore['removeProviderSessionConversation']
  setActiveConversation: AgentSessionStore['setActiveConversation']
  setConversationDeckOrders: AgentSessionStore['setConversationDeckOrders']
  getActiveConversationId: AgentSessionStore['getActiveConversationId']
  updateConversationTitle: AgentSessionStore['updateConversationTitle']
}

type AgentConversationRegistryState = Pick<
  AgentSessionStore,
  | 'activeConversationIdsByUser'
  | 'activeConversationIdsByScope'
  | 'conversationsById'
  | 'conversationThreadBindings'
>

export function useAgentConversationRecordsById(): Record<string, AgentConversationRegistryRecord> {
  return useAgentSessionStore((state) => state.conversationsById)
}

export function readAgentConversationRecordsById(): Record<string, AgentConversationRegistryRecord> {
  return useAgentSessionStore.getState().conversationsById
}

export function useAgentActiveConversationIdsByUser(): Record<string, string | null> {
  return useAgentSessionStore((state) => state.activeConversationIdsByUser)
}

export function useAgentActiveConversationId(userId: string, focusScope?: AgentConversationFocusScope): string | null {
  return useAgentSessionStore((state) => state.getActiveConversationId(userId, focusScope))
}

export function useAgentConversationThreadBindings(): Record<string, AgentConversationThreadBinding> {
  return useAgentSessionStore((state) => state.conversationThreadBindings)
}

export function useAgentConversationThreadBinding(conversationId: string): AgentConversationThreadBinding | undefined {
  return useAgentSessionStore((state) => state.conversationThreadBindings[conversationId])
}

export function readAgentConversationThreadBindings(): Record<string, AgentConversationThreadBinding> {
  return useAgentSessionStore.getState().conversationThreadBindings
}

export function readAgentConversationRegistrySnapshot(): AgentConversationRegistrySnapshot {
  return selectAgentConversationRegistrySnapshot(useAgentSessionStore.getState())
}

export function selectAgentConversationRegistrySnapshot(
  state: AgentConversationRegistryState,
): AgentConversationRegistrySnapshot {
  return {
    activeConversationIdsByUser: state.activeConversationIdsByUser,
    activeConversationIdsByScope: state.activeConversationIdsByScope,
    conversationsById: state.conversationsById,
    conversationThreadBindings: state.conversationThreadBindings,
  }
}

export function agentConversationRegistryActions(): AgentConversationRegistryActions {
  const state = useAgentSessionStore.getState()
  return {
    upsertConversation: state.upsertConversation,
    setConversationOpen: state.setConversationOpen,
    removeProviderSessionConversation: state.removeProviderSessionConversation,
    setActiveConversation: state.setActiveConversation,
    setConversationDeckOrders: state.setConversationDeckOrders,
    getActiveConversationId: state.getActiveConversationId,
    updateConversationTitle: state.updateConversationTitle,
  }
}

export function registerAgentConversation(input: AgentConversationRegistryInput): string {
  return useAgentSessionStore.getState().upsertConversation(input)
}
