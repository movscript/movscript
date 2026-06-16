import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createInstrumentedAgentStateStorage } from '@/features/agent/state/agentPerformanceStore'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'
import {
  EMPTY_CONVERSATION_WORKSPACE,
  type AgentConversationRunPatch,
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
  type AgentPageTaskPayload,
} from '@/features/agent/state/agentSessionTaskModel'
import {
  attachAgentPageTaskConversation,
  claimNextQueuedAgentPageTask,
  enqueueAgentPageTask,
  initialAgentSessionVolatileState,
  setAgentPageTaskRunning,
  settleAgentStandaloneTask,
  startAgentStandaloneTask,
  updateAgentPageTaskFromProviderSession,
  updateAgentStandaloneTask,
} from '@/features/agent/state/agentSessionTaskState'
import {
  persistedAgentSessionState,
  type AgentSessionStore,
  type PersistedAgentSessionStore,
} from '@/features/agent/state/agentSessionStoreTypes'
import {
  agentConversationIdForRegistryInput,
  upsertAgentConversationRegistryRecord,
} from '@movscript/core/agent'

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

export const useAgentSessionStore = create<AgentSessionStore>()(
  persist(
    (set, get) => ({
      activeConversationIdsByUser: {},
      conversationsById: {},
      workspacesByUser: {},
      ...initialAgentSessionVolatileState(),

      enqueuePageTask: (payload) => {
        const now = Date.now()
        let normalized: AgentPageTaskPayload & { requestId: string; taskType: string }
        set((state) => {
          const result = enqueueAgentPageTask({
            now,
            pageTasks: state.pageTasks,
            payload,
          })
          normalized = result.normalized
          return {
            pageTasks: result.pageTasks,
          }
        })
        return normalized!
      },

      upsertConversation: (input) => {
        const conversationId = agentConversationIdForRegistryInput(input)
        set((state) => ({
          conversationsById: upsertAgentConversationRegistryRecord(state.conversationsById, input),
          activeConversationIdsByUser: {
            ...(state.activeConversationIdsByUser ?? {}),
            [input.userId]: state.activeConversationIdsByUser[input.userId] ?? conversationId,
          },
        }))
        return conversationId
      },

      setConversationOpen: (userId, conversationId, open) => set((state) => setAgentSessionConversationOpenState(state, { conversationId, open, userId })),

      createProviderSessionConversation: (userId, input) => {
        let conversationId = ''
        set((state) => {
          const result = createProviderSessionConversationState(state, userId, input)
          conversationId = result.conversationId
          return result.patch ?? {}
        })
        return conversationId
      },

      removeProviderSessionConversation: (userId, conversationId) => {
        set((state) => removeProviderSessionConversationState(state, { conversationId, userId }))
      },

      setActiveConversation: (userId, conversationId) => set((state) => {
        if (activeConversationIdForUser(state, userId) === conversationId) return {}
        return {
          activeConversationIdsByUser: {
            ...(state.activeConversationIdsByUser ?? {}),
            [userId]: conversationId,
          },
        }
      }),

      getActiveConversationId: (userId) => activeConversationIdForUser(get(), userId),

      updateConversationTitle: (_userId, conversationId, title) => {
        const trimmed = title.trim()
        if (!trimmed) return
        set((state) => ({
          conversationsById: state.conversationsById[conversationId]
            ? {
              ...state.conversationsById,
              [conversationId]: {
                ...state.conversationsById[conversationId],
                title: trimmed,
                updatedAt: Date.now(),
              },
            }
            : state.conversationsById,
        }))
      },

      getConversationWorkspace: (userId, conversationId) => get().workspacesByUser[userId]?.[conversationId] ?? EMPTY_CONVERSATION_WORKSPACE,

      updateConversationWorkspace: (userId, conversationId, patch) => set((state) => updateConversationWorkspaceState(state, { conversationId, patch, userId })),

      clearConversationWorkspace: (userId, conversationId) => set((state) => clearConversationWorkspaceState(state, { conversationId, userId })),

      claimNextQueuedPageTask: () => {
        const now = Date.now()
        const result = claimNextQueuedAgentPageTask({
          now,
          pageTasks: get().pageTasks,
        })
        if (!result) return null
        set({ pageTasks: result.pageTasks })
        return result.payload
      },

      attachPageTaskConversation: (requestId, conversationId) => set((state) => {
        const pageTasks = attachAgentPageTaskConversation({
          conversationId,
          now: Date.now(),
          pageTasks: state.pageTasks,
          requestId,
        })
        if (!pageTasks) return {}
        return {
          pageTasks,
        }
      }),

      setPageTaskRunning: (requestId, patch) => {
        if (!requestId) return
        set((state) => {
          const pageTasks = setAgentPageTaskRunning({
            now: Date.now(),
            pageTasks: state.pageTasks,
            patch,
            requestId,
          })
          if (!pageTasks) return {}
          return {
            pageTasks,
          }
        })
      },

      updatePageTaskFromProviderSession: (payload) => {
        if (!payload.requestId) return
        set((state) => {
          const pageTasks = updateAgentPageTaskFromProviderSession({
            now: Date.now(),
            pageTasks: state.pageTasks,
            payload,
          })
          if (!pageTasks) return {}
          return {
            pageTasks,
          }
        })
      },

      bindConversationToProviderThread: (input) => set((state) => bindConversationToProviderThreadState(state, input)),

      clearConversationThreadBinding: (conversationId) => set((state) => {
        const conversationThreadBindings = { ...state.conversationThreadBindings }
        delete conversationThreadBindings[conversationId]
        return {
          conversationThreadBindings,
        }
      }),

      updateConversationRuntimeState: (conversationId, patch) => set((state) => updateConversationRuntimeStatePatch(state, { conversationId, patch })),

      setConversationRun: (conversationId, run, patch = {}) => set((state) => setConversationRunState(state, { conversationId, patch, run })),

      setConversationProviderThreadBindingId: (conversationId, providerThreadId) => {
        const sessionId = get().conversationThreadBindings[conversationId]?.providerSessionTreeId
          ?? get().conversationsById[conversationId]?.providerSessionId
        get().bindConversationToProviderThread({
          conversationId,
          providerThreadId,
          ...(sessionId ? { providerSessionTreeId: sessionId } : {}),
        })
      },

      setConversationProviderSessionTreeId: (conversationId, providerSessionTreeId) => {
        const sessionId = providerSessionTreeId.trim()
        if (!sessionId) return
        const threadId = get().conversationThreadBindings[conversationId]?.providerThreadId
        if (threadId) {
          get().bindConversationToProviderThread({
            conversationId,
            providerThreadId: threadId,
            providerSessionTreeId: sessionId,
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
                providerSessionId: sessionId,
                updatedAt: Date.now(),
              },
            },
          }
        })
      },

      startStandaloneTask: ({ taskId, taskType, title, prompt }) => set((state) => ({
        standaloneTasks: startAgentStandaloneTask({
          now: Date.now(),
          standaloneTasks: state.standaloneTasks,
          taskId,
          taskType,
          title,
          prompt,
        }),
      })),

      updateStandaloneTask: (taskId, patch) => set((state) => {
        const standaloneTasks = updateAgentStandaloneTask({
          now: Date.now(),
          patch,
          standaloneTasks: state.standaloneTasks,
          taskId,
        })
        if (!standaloneTasks) return {}
        return {
          standaloneTasks,
        }
      }),

      settleStandaloneTask: (payload) => set((state) => {
        const standaloneTasks = settleAgentStandaloneTask({
          now: Date.now(),
          payload,
          standaloneTasks: state.standaloneTasks,
        })
        if (!standaloneTasks) return {}
        return {
          standaloneTasks,
        }
      }),
    }),
    {
      name: 'agent-session-store-v2',
      storage: createJSONStorage(() => createInstrumentedAgentStateStorage('agent_session_store')),
      partialize: persistedAgentSessionState,
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<PersistedAgentSessionStore> | undefined
        return {
          ...currentState,
          activeConversationIdsByUser: persisted?.activeConversationIdsByUser ?? {},
          conversationsById: persisted?.conversationsById ?? {},
          workspacesByUser: persisted?.workspacesByUser ?? {},
        }
      },
    },
  ),
)
