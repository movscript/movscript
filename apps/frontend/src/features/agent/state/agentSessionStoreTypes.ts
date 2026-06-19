import type { AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import type {
  AgentConversationRunPatch, AgentConversationRuntimePatch, AgentConversationRuntimeState, AgentConversationThreadBinding, AgentStandaloneTaskState, } from '@/features/agent/state/agentSessionRuntimeModel'
import type {
  AgentPageTaskPayload, AgentPageTaskRun, AgentPageTaskRunningPatch, AgentPageTaskState, AgentPageTaskThread, } from '@/features/agent/state/agentSessionTaskModel'
import type { ConversationWorkspace } from '@/features/agent/state/agentStore'
import type { AgentRun, AgentThread } from '@movscript/core/agent/protocol'
import type {
  AgentConversationRegistryInput,
  AgentConversationRegistryRecord,
  AgentSessionWorkspaceContext,
} from '@movscript/core/agent'
import type { AgentChatProviderKind } from '@movscript/core/agent/chat'

export interface AgentSessionStore {
  activeConversationIdsByUser: Record<string, string | null>
  conversationsById: Record<string, AgentConversationRegistryRecord>
  workspacesByUser: Record<string, Record<string, ConversationWorkspace>>
  pageTasks: Record<string, AgentPageTaskState>
  conversationThreadBindings: Record<string, AgentConversationThreadBinding>
  conversationRuntimeStates: Record<string, AgentConversationRuntimeState>
  standaloneTasks: Record<string, AgentStandaloneTaskState>

  enqueuePageTask: (payload: AgentPageTaskPayload) => AgentPageTaskPayload & { requestId: string; taskType: string }
  upsertConversation: (input: AgentConversationRegistryInput) => string
  setConversationOpen: (userId: string, conversationId: string, open: boolean) => void
  createProviderSessionConversation: (userId: string, input: AgentProviderSessionConversationInput) => string
  removeProviderSessionConversation: (userId: string, conversationId: string) => void
  setActiveConversation: (userId: string, conversationId: string | null) => void
  setConversationDeckOrders: (orders: Array<{ conversationId: string; deckOrder: number }>) => void
  getActiveConversationId: (userId: string) => string | null
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  getConversationWorkspace: (userId: string, conversationId: string) => ConversationWorkspace
  updateConversationWorkspace: (userId: string, conversationId: string, patch: Partial<ConversationWorkspace>) => void
  clearConversationWorkspace: (userId: string, conversationId: string) => void
  claimNextQueuedPageTask: () => (AgentPageTaskPayload & { requestId: string; taskType: string }) | null
  attachPageTaskConversation: (requestId: string, conversationId: string) => void
  setPageTaskRunning: (requestId: string | undefined, patch: AgentPageTaskRunningPatch) => void
  updatePageTaskFromProviderSession: (payload: { requestId?: string; run?: AgentPageTaskRun; thread?: AgentPageTaskThread; error?: string; artifacts?: AgentTaskArtifactRef[]; status?: 'completed' | 'error' | 'cancelled' }) => void

  bindConversationToProviderThread: (input: Omit<AgentConversationThreadBinding, 'updatedAt'> & { updatedAt?: number }) => void
  clearConversationThreadBinding: (conversationId: string) => void
  updateConversationRuntimeState: (conversationId: string, patch: AgentConversationRuntimePatch) => void
  setConversationProviderSessionTreeId: (conversationId: string, providerSessionTreeId: string) => void
  setConversationProviderThreadBindingId: (conversationId: string, providerThreadId: string) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch?: AgentConversationRunPatch) => void
  startStandaloneTask: (input: { taskId: string; taskType: string; title?: string; prompt: string }) => void
  updateStandaloneTask: (taskId: string, patch: Partial<Omit<AgentStandaloneTaskState, 'taskId' | 'taskType' | 'prompt' | 'startedAt'>>) => void
  settleStandaloneTask: (payload: { taskId: string; status: 'completed' | 'cancelled' | 'error' | 'requires_action'; run?: AgentRun; thread?: AgentThread; result?: string; error?: string }) => void
}

export interface AgentProviderSessionConversationInput {
  threadId: string
  providerSessionTreeId?: string
  sessionId?: string // legacy providerSessionTreeId fallback
  title?: string
  createdAt?: number
  updatedAt?: number
  projectId?: number
  provider?: AgentChatProviderKind | string
  providerId?: string
  providerInstanceId?: string
  providerProtocol?: string
  providerThreadCwd?: string
  workspaceContext?: AgentSessionWorkspaceContext
}

export type PersistedAgentSessionStore = Pick<AgentSessionStore, 'activeConversationIdsByUser' | 'conversationsById' | 'workspacesByUser'>

export function persistedAgentSessionState(state: AgentSessionStore): PersistedAgentSessionStore {
  return {
    activeConversationIdsByUser: state.activeConversationIdsByUser,
    conversationsById: state.conversationsById,
    workspacesByUser: state.workspacesByUser,
  }
}
