import { create } from 'zustand'
import {
  EMPTY_CONVERSATION_WORKSPACE,
  type AgentConversationRuntimePatch,
  type AgentConversationRuntimeState,
} from '@/features/agent/state/agentSessionRuntimeModel'
import {
  activeConversationIdForUser,
  bindConversationToProviderThreadState,
  clearConversationWorkspaceState,
  createProviderSessionConversationState,
  removeProviderSessionConversationState,
  setAgentSessionConversationOpenState,
  setConversationRunState,
  updateConversationRuntimeStatePatch,
  updateConversationWorkspaceState,
} from '@/features/agent/state/agentSessionConversationState'
import {
  pageTaskStatusFromProviderSession,
  type AgentPageTaskRun,
  type AgentPageTaskState,
} from '@/features/agent/state/agentSessionTaskModel'
import {
  initialAgentSessionVolatileState,
} from '@/features/agent/state/agentSessionTaskState'
import {
  persistedAgentSessionState,
  type AgentSessionStore,
} from '@/features/agent/state/agentSessionStoreTypes'
import {
  activeConversationStorePatch,
  clearActiveConversationsStorePatch,
} from '@/features/agent/state/agentSessionPersistenceModel'
import {
  publishAgentConversationRegistryEvent,
} from '@/features/agent/state/agentConversationRegistryEvents'
import {
  agentConversationIdForRegistryInput,
  setAgentConversationRegistryDeckOrders,
  upsertAgentConversationRegistryRecord,
} from '@movscript/core/agent'
import type { AgentActivityStatus } from '@/features/agent/application/agentActivityEvents'
import {
  agentActivityStatusFromRun,
  agentActivityTopicForStatus,
  agentRuntimeActivityTitle,
  publishAgentPlanActivity,
  publishAgentRunInteractionRequests,
  publishAgentRunStepActivity,
  publishAgentTaskActivity,
} from '@/features/agent/state/agentSessionActivityPublisher'
import { installAgentSessionHomePersistence } from '@/features/agent/state/agentSessionHomePersistence'
import { createAgentSessionTaskActions } from '@/features/agent/state/agentSessionTaskActions'

export {
  pageTaskStatusFromProviderSession,
} from '@/features/agent/state/agentSessionTaskModel'
export type {
  AgentPageTaskPayload,
  AgentPageTaskRun,
  AgentPageTaskRunningPatch,
  AgentPageTaskState,
  AgentPageTaskStatus,
  AgentPageTaskThread,
  AgentTaskRenderMode,
} from '@/features/agent/state/agentSessionTaskModel'
export type {
  AgentConversationRuntimePatch,
  AgentConversationRuntimeState,
  AgentConversationThreadBinding,
  AgentStandaloneTaskState,
} from '@/features/agent/state/agentSessionRuntimeModel'
export {
  EMPTY_CONVERSATION_WORKSPACE,
} from '@/features/agent/state/agentSessionRuntimeModel'

export const useAgentSessionStore = create<AgentSessionStore>()((set, get) => ({
      activeConversationIdsByUser: {},
      activeConversationIdsByScope: {},
      conversationsById: {},
      workspacesByUser: {},
      ...initialAgentSessionVolatileState(),
      ...createAgentSessionTaskActions(set, get),

      upsertConversation: (input) => {
        const conversationId = agentConversationIdForRegistryInput(input)
        set((state) => ({
          conversationsById: upsertAgentConversationRegistryRecord(state.conversationsById, input),
          activeConversationIdsByUser: {
            ...(state.activeConversationIdsByUser ?? {}),
            [input.userId]: state.activeConversationIdsByUser[input.userId] ?? conversationId,
          },
        }))
        if (conversationId) {
          publishAgentSessionRegistryEvent(get, {
            kind: 'conversation-upserted',
            userId: input.userId,
            conversationId,
            providerThreadId: input.providerThreadId,
          })
        }
        return conversationId
      },

      setConversationOpen: (userId, conversationId, open, focusScope) => {
        const current = get().conversationsById[conversationId]
        set((state) => setAgentSessionConversationOpenState(state, { conversationId, open, userId, focusScope }))
        if (current) {
          publishAgentSessionRegistryEvent(get, {
            kind: 'conversation-open-changed',
            userId,
            conversationId,
            providerThreadId: current.providerThreadId,
            open,
          })
        }
      },

      createProviderSessionConversation: (userId, input) => {
        let conversationId = ''
        set((state) => {
          const result = createProviderSessionConversationState(state, userId, input)
          conversationId = result.conversationId
          return result.patch ?? {}
        })
        if (conversationId) {
          publishAgentSessionRegistryEvent(get, {
            kind: 'provider-session-conversation-created',
            userId,
            conversationId,
            providerThreadId: input.threadId,
          })
        }
        return conversationId
      },

      removeProviderSessionConversation: (userId, conversationId) => {
        const current = get().conversationsById[conversationId]
        set((state) => removeProviderSessionConversationState(state, { conversationId, userId }))
        if (current) {
          publishAgentSessionRegistryEvent(get, {
            kind: 'conversation-removed',
            userId,
            conversationId,
            providerThreadId: current.providerThreadId,
          })
        }
      },

      setActiveConversation: (userId, conversationId, focusScope) => {
        const current = activeConversationIdForUser(get(), userId, focusScope)
        if (current === conversationId) return
        set((state) => activeConversationStorePatch(state, userId, conversationId, focusScope))
        publishAgentSessionRegistryEvent(get, {
          kind: 'active-conversation-changed',
          userId,
          conversationId,
          activeConversationId: conversationId,
          ...(focusScope !== undefined ? { focusScope } : {}),
        })
      },

      clearActiveConversations: (userId) => {
        const current = get()
        const hasUserActiveConversation = current.activeConversationIdsByUser[userId] !== null
          && current.activeConversationIdsByUser[userId] !== undefined
        const hasScopedActiveConversation = Object.entries(current.activeConversationIdsByScope ?? {})
          .some(([key, value]) => value !== null && key.endsWith(`\u0000${userId}`))
        if (!hasUserActiveConversation && !hasScopedActiveConversation) return
        set((state) => clearActiveConversationsStorePatch(state, userId))
        publishAgentSessionRegistryEvent(get, {
          kind: 'active-conversation-changed',
          userId,
          conversationId: null,
          activeConversationId: null,
        })
      },

      setConversationDeckOrders: (orders) => {
        set((state) => ({
          conversationsById: setAgentConversationRegistryDeckOrders(state.conversationsById, orders),
        }))
        if (orders.length > 0) {
          publishAgentSessionRegistryEvent(get, {
            kind: 'conversation-deck-order-changed',
            conversationIds: orders.map((order) => order.conversationId),
          })
        }
      },

      getActiveConversationId: (userId, focusScope) => activeConversationIdForUser(get(), userId, focusScope),

      updateConversationTitle: (_userId, conversationId, title) => {
        const trimmed = title.trim()
        if (!trimmed) return
        const current = get().conversationsById[conversationId]
        set((state) => ({
          conversationsById: state.conversationsById[conversationId]
            ? {
              ...state.conversationsById,
              [conversationId]: {
                ...state.conversationsById[conversationId],
                title: trimmed,
              },
            }
            : state.conversationsById,
        }))
        if (current) {
          publishAgentSessionRegistryEvent(get, {
            kind: 'conversation-title-changed',
            userId: current.userId,
            conversationId,
            providerThreadId: current.providerThreadId,
            title: trimmed,
          })
        }
      },

      getConversationWorkspace: (userId, conversationId) => get().workspacesByUser[userId]?.[conversationId] ?? EMPTY_CONVERSATION_WORKSPACE,

      updateConversationWorkspace: (userId, conversationId, patch) => set((state) => updateConversationWorkspaceState(state, { conversationId, patch, userId })),

      clearConversationWorkspace: (userId, conversationId) => set((state) => clearConversationWorkspaceState(state, { conversationId, userId })),

      bindConversationToProviderThread: (input) => {
        set((state) => bindConversationToProviderThreadState(state, input))
        publishAgentTaskActivity('agent.activity.updated', {
          conversationId: input.conversationId,
          threadId: input.providerThreadId,
          activityId: `${input.conversationId}:provider-thread`,
          kind: 'run',
          title: 'Provider thread linked',
          status: 'running',
          origin: 'system',
          rawRef: { type: 'agent_conversation_thread_binding', id: input.conversationId },
        }, `conversation:${input.conversationId}:thread:${input.providerThreadId}`)
      },

      clearConversationThreadBinding: (conversationId) => set((state) => {
        const conversationThreadBindings = { ...state.conversationThreadBindings }
        delete conversationThreadBindings[conversationId]
        return {
          conversationThreadBindings,
        }
      }),

      updateConversationRuntimeState: (conversationId, patch) => {
        set((state) => updateConversationRuntimeStatePatch(state, { conversationId, patch }))
        const runtime = get().conversationRuntimeStates[conversationId]
        if (runtime) {
          const status: AgentActivityStatus = patch.error ? 'failed' : patch.loading || patch.building || patch.approving || patch.stopping ? 'running' : 'completed'
          publishAgentTaskActivity(agentActivityTopicForStatus(status), {
            conversationId,
            threadId: get().conversationThreadBindings[conversationId]?.providerThreadId,
            runId: runtime.activeRunId,
            activityId: `${conversationId}:runtime`,
            kind: patch.approving ? 'approval' : 'run',
            title: agentRuntimeActivityTitle(patch),
            summary: patch.error,
            status,
            origin: patch.approving ? 'agent' : 'system',
            rawRef: { type: 'agent_conversation_runtime', id: conversationId },
          }, `conversation:${conversationId}:runtime:${status}:${runtime.updatedAt}`)
          if (patch.approving) {
            publishAgentTaskActivity('agent.approval.requested', {
              conversationId,
              threadId: get().conversationThreadBindings[conversationId]?.providerThreadId,
              runId: runtime.activeRunId,
              activityId: `${conversationId}:approval`,
              kind: 'approval',
              title: 'Agent approval requested',
              status: 'requires_action',
              origin: 'agent',
              rawRef: { type: 'agent_conversation_runtime', id: conversationId },
            }, `conversation:${conversationId}:approval:${runtime.activeRunId ?? runtime.updatedAt}`)
          }
        }
      },

      setConversationRun: (conversationId, run, patch = {}) => {
        set((state) => setConversationRunState(state, { conversationId, patch, run }))
        const binding = get().conversationThreadBindings[conversationId]
        const status = agentActivityStatusFromRun(run)
        publishAgentTaskActivity(agentActivityTopicForStatus(status), {
          conversationId,
          threadId: run.threadId ?? binding?.providerThreadId,
          runId: run.id,
          activityId: `${conversationId}:run:${run.id}`,
          kind: 'run',
          title: 'Agent run updated',
          status,
          origin: 'agent',
          rawRef: { type: 'agent_run', id: run.id },
        }, `conversation:${conversationId}:run:${run.id}:${status}`)
        publishAgentRunStepActivity(conversationId, undefined, run)
        publishAgentRunInteractionRequests(conversationId, undefined, run)
        publishAgentPlanActivity(conversationId, run)
      },

      setConversationProviderThreadBindingId: (conversationId, providerThreadId) => {
        const providerSessionTreeId = get().conversationThreadBindings[conversationId]?.providerSessionTreeId
          ?? get().conversationsById[conversationId]?.providerSessionId
        get().bindConversationToProviderThread({
          conversationId,
          providerThreadId,
          ...(providerSessionTreeId ? { providerSessionTreeId } : {}),
        })
      },

      setConversationProviderSessionTreeId: (conversationId, providerSessionTreeId) => {
        const normalizedProviderSessionTreeId = providerSessionTreeId.trim()
        if (!normalizedProviderSessionTreeId) return
        const threadId = get().conversationThreadBindings[conversationId]?.providerThreadId
        if (threadId) {
          get().bindConversationToProviderThread({
            conversationId,
            providerThreadId: threadId,
            providerSessionTreeId: normalizedProviderSessionTreeId,
          })
          return
        }
        set((state) => {
          const conversation = state.conversationsById[conversationId]
          if (!conversation) return {}
          return {
            conversationsById: {
              ...state.conversationsById,
              [conversationId]: {
                ...conversation,
                providerSessionId: normalizedProviderSessionTreeId,
              },
            },
          }
        })
      },

}))

installAgentSessionHomePersistence(useAgentSessionStore)

function publishAgentSessionRegistryEvent(
  getState: () => AgentSessionStore,
  event: Parameters<typeof publishAgentConversationRegistryEvent>[0],
): void {
  publishAgentConversationRegistryEvent({
    ...event,
    snapshot: persistedAgentSessionState(getState()),
  })
}
