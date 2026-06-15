import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'
import { createInstrumentedAgentStateStorage } from '@/features/agent/state/agentPerformanceStore'
import {
  EMPTY_CONVERSATION_WORKSPACE,
  compactRun,
  defaultConversationRuntimeState,
  type AgentConversationRunPatch,
  type AgentConversationRuntimePatch,
  type AgentConversationRuntimeState,
  type AgentConversationThreadBinding,
  type AgentStandaloneTaskState,
} from '@/features/agent/state/agentSessionRuntimeModel'
import {
  isTerminalAgentPageTaskRun,
  normalizeTaskPayload,
  pageTaskStatusFromProviderSession,
  type AgentPageTaskPayload,
} from '@/features/agent/state/agentSessionTaskModel'
import {
  persistedAgentSessionState,
  type AgentSessionStore,
  type PersistedAgentSessionStore,
} from '@/features/agent/state/agentSessionStoreTypes'
import {
  activeAgentConversationIdForUser,
  agentConversationIdForRegistryInput,
  removeAgentConversationRegistryRecord,
  setAgentConversationRegistryOpen,
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

function activeConversationIdForUser(state: Pick<AgentSessionStore, 'activeConversationIdsByUser'>, userId: string): string | null {
  return activeAgentConversationIdForUser(state, userId)
}

export const useAgentSessionStore = create<AgentSessionStore>()(
  persist(
    (set, get) => ({
      activeConversationIdsByUser: {},
      conversationsById: {},
      workspacesByUser: {},
      pageTasks: {},
      conversationThreadBindings: {},
      conversationRuntimeStates: {},
      standaloneTasks: {},

      enqueuePageTask: (payload) => {
        const normalized = normalizeTaskPayload(payload)
        const now = Date.now()
        set((state) => {
          const existing = state.pageTasks[normalized.requestId]
          return {
            pageTasks: {
              ...state.pageTasks,
              [normalized.requestId]: {
                requestId: normalized.requestId,
                taskType: normalized.taskType,
                status: existing?.status ?? 'queued',
                payload: normalized,
                conversationId: existing?.conversationId,
                sessionId: existing?.sessionId,
                threadId: existing?.threadId,
                runId: existing?.runId,
                run: existing?.run,
                thread: existing?.thread,
                error: existing?.error,
                createdAt: existing?.createdAt ?? now,
                updatedAt: now,
                settledAt: existing?.settledAt,
              },
            },
          }
        })
        return normalized
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

      setConversationOpen: (userId, conversationId, open) => set((state) => {
        return {
          conversationsById: setAgentConversationRegistryOpen(state.conversationsById, conversationId, open),
          activeConversationIdsByUser: {
            ...(state.activeConversationIdsByUser ?? {}),
            [userId]: !open && activeConversationIdForUser(state, userId) === conversationId
              ? null
              : activeConversationIdForUser(state, userId),
          },
        }
      }),

      createProviderSessionConversation: (userId, input) => {
        const title = input.title?.trim()
        const threadId = input.threadId.trim()
        const conversationInput = {
          userId,
          providerThreadId: threadId,
          ...(input.sessionId?.trim() ? { providerSessionId: input.sessionId.trim() } : {}),
          ...(input.provider ? { provider: input.provider } : {}),
          ...(input.providerId?.trim() ? { providerId: input.providerId.trim() } : {}),
          ...(input.providerInstanceId?.trim() ? { providerInstanceId: input.providerInstanceId.trim() } : {}),
          ...(input.providerProtocol?.trim() ? { providerProtocol: input.providerProtocol } : {}),
          ...(input.providerThreadCwd?.trim() ? { providerThreadCwd: input.providerThreadCwd.trim() } : {}),
          ...(input.workspaceContext ? { workspaceContext: input.workspaceContext } : {}),
          ...(typeof input.projectId === 'number' ? { projectId: input.projectId } : {}),
          ...(title ? { title } : {}),
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
          open: true,
          archived: false,
        }
        const conversationId = agentConversationIdForRegistryInput(conversationInput)
        if (!conversationId) return activeConversationIdForUser(get(), userId) ?? ''
        set((state) => ({
          activeConversationIdsByUser: {
            ...(state.activeConversationIdsByUser ?? {}),
            [userId]: conversationId,
          },
          conversationsById: upsertAgentConversationRegistryRecord(state.conversationsById, conversationInput),
          ...(threadId
            ? {
              conversationThreadBindings: {
                ...state.conversationThreadBindings,
                [conversationId]: {
                  ...(state.conversationThreadBindings[conversationId] ?? {}),
                  conversationId,
                  providerThreadId: threadId,
                  ...(input.sessionId?.trim() ? { providerSessionTreeId: input.sessionId.trim() } : {}),
                  updatedAt: Date.now(),
                },
              },
            }
            : {}),
        }))
        return conversationId
      },

      removeProviderSessionConversation: (userId, conversationId) => {
        set((state) => {
          const workspacesByUser = { ...state.workspacesByUser }
          const conversationsById = removeAgentConversationRegistryRecord(state.conversationsById, conversationId)
          const conversationThreadBindings = { ...state.conversationThreadBindings }
          const conversationRuntimeStates = { ...state.conversationRuntimeStates }
          delete conversationThreadBindings[conversationId]
          delete conversationRuntimeStates[conversationId]
          if (workspacesByUser[userId]?.[conversationId]) {
            workspacesByUser[userId] = { ...workspacesByUser[userId] }
            delete workspacesByUser[userId][conversationId]
          }
          return {
            activeConversationIdsByUser: {
              ...(state.activeConversationIdsByUser ?? {}),
              [userId]: activeConversationIdForUser(state, userId) === conversationId ? null : activeConversationIdForUser(state, userId),
            },
            conversationsById,
            conversationThreadBindings,
            conversationRuntimeStates,
            workspacesByUser,
            pageTasks: Object.fromEntries(
              Object.entries(state.pageTasks).filter(([, task]) => task.conversationId !== conversationId),
            ),
          }
        })
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

      updateConversationWorkspace: (userId, conversationId, patch) => set((state) => {
        const current = state.workspacesByUser[userId]?.[conversationId] ?? EMPTY_CONVERSATION_WORKSPACE
        return {
          workspacesByUser: {
            ...state.workspacesByUser,
            [userId]: {
              ...(state.workspacesByUser[userId] ?? {}),
              [conversationId]: {
                ...current,
                ...patch,
              },
            },
          },
        }
      }),

      clearConversationWorkspace: (userId, conversationId) => set((state) => {
        if (!state.workspacesByUser[userId]?.[conversationId]) return {}
        const userWorkspaces = { ...state.workspacesByUser[userId] }
        const workspaceContext = userWorkspaces[conversationId]?.workspaceContext
        if (workspaceContext) {
          userWorkspaces[conversationId] = {
            input: '',
            attachments: [],
            workspaceContext,
          }
        } else {
          delete userWorkspaces[conversationId]
        }
        return {
          workspacesByUser: {
            ...state.workspacesByUser,
            [userId]: userWorkspaces,
          },
        }
      }),

      claimNextQueuedPageTask: () => {
        const task = Object.values(get().pageTasks)
          .filter((item) => item.status === 'queued')
          .sort((a, b) => a.createdAt - b.createdAt)[0]
        if (!task) return null
        const now = Date.now()
        set((state) => ({
          pageTasks: {
            ...state.pageTasks,
            [task.requestId]: { ...task, status: 'claimed', updatedAt: now },
          },
        }))
        return task.payload
      },

      attachPageTaskConversation: (requestId, conversationId) => set((state) => {
        const task = state.pageTasks[requestId]
        if (!task) return {}
        return {
          pageTasks: {
            ...state.pageTasks,
            [requestId]: {
              ...task,
              conversationId,
              status: task.status === 'queued' ? 'claimed' : task.status,
              updatedAt: Date.now(),
            },
          },
        }
      }),

      setPageTaskRunning: (requestId, patch) => {
        if (!requestId) return
        set((state) => {
          const task = state.pageTasks[requestId]
          if (!task) return {}
          const run = patch.run ?? task.run
          const thread = patch.thread ?? task.thread
          const sessionId = patch.sessionId ?? thread?.sessionId ?? run?.sessionId ?? task.sessionId
          return {
            pageTasks: {
              ...state.pageTasks,
              [requestId]: {
                ...task,
                conversationId: patch.conversationId ?? task.conversationId,
                sessionId,
                threadId: patch.threadId ?? thread?.id ?? run?.threadId ?? task.threadId,
                runId: run?.id ?? task.runId,
                run,
                thread,
                artifacts: patch.artifacts ?? task.artifacts,
                status: 'running',
                updatedAt: Date.now(),
              },
            },
          }
        })
      },

      updatePageTaskFromProviderSession: (payload) => {
        if (!payload.requestId) return
        set((state) => {
          const task = state.pageTasks[payload.requestId!]
          if (!task) return {}
          const now = Date.now()
          return {
            pageTasks: {
              ...state.pageTasks,
              [payload.requestId!]: {
                ...task,
                status: pageTaskStatusFromProviderSession(payload, task.status),
                run: payload.run ?? task.run,
                thread: payload.thread ?? task.thread,
                sessionId: payload.thread?.sessionId ?? payload.run?.sessionId ?? task.sessionId,
                runId: payload.run?.id ?? task.runId,
                threadId: payload.thread?.id ?? payload.run?.threadId ?? task.threadId,
                artifacts: payload.artifacts ?? task.artifacts,
                error: payload.error,
                updatedAt: now,
                settledAt: payload.status !== undefined || (payload.run && isTerminalAgentPageTaskRun(payload.run)) ? now : task.settledAt,
              },
            },
          }
        })
      },

      bindConversationToProviderThread: (input) => set((state) => {
        const conversationId = input.conversationId
        const providerThreadId = input.providerThreadId.trim()
        if (!conversationId || !providerThreadId) return {}
        const providerSessionTreeId = input.providerSessionTreeId?.trim()
        const now = input.updatedAt ?? Date.now()
        return {
          conversationsById: upsertAgentConversationRegistryRecord(state.conversationsById, {
            id: conversationId,
            userId: state.conversationsById[conversationId]?.userId ?? 'anonymous',
            ...(input.provider ? { provider: input.provider } : {}),
            ...(input.providerId ? { providerId: input.providerId } : {}),
            ...(input.providerInstanceId ? { providerInstanceId: input.providerInstanceId } : {}),
            providerThreadId,
            ...(providerSessionTreeId ? { providerSessionId: providerSessionTreeId } : {}),
            ...(input.providerThreadCwd ? { providerThreadCwd: input.providerThreadCwd } : {}),
            updatedAt: now,
          }),
          conversationThreadBindings: {
            ...state.conversationThreadBindings,
            [conversationId]: {
              ...(state.conversationThreadBindings[conversationId] ?? {}),
              ...input,
              conversationId,
              providerThreadId,
              ...(providerSessionTreeId ? { providerSessionTreeId } : {}),
              updatedAt: now,
            },
          },
        }
      }),

      clearConversationThreadBinding: (conversationId) => set((state) => {
        const conversationThreadBindings = { ...state.conversationThreadBindings }
        delete conversationThreadBindings[conversationId]
        return {
          conversationThreadBindings,
        }
      }),

      updateConversationRuntimeState: (conversationId, patch) => set((state) => {
        const now = Date.now()
        return {
          conversationsById: state.conversationsById[conversationId]
            ? {
              ...state.conversationsById,
              [conversationId]: {
                ...state.conversationsById[conversationId],
                ...(patch.status !== undefined ? { status: patch.status } : {}),
                ...(patch.activeRunId ? { activeRunId: patch.activeRunId } : {}),
                updatedAt: now,
              },
            }
            : state.conversationsById,
          conversationRuntimeStates: {
            ...state.conversationRuntimeStates,
            [conversationId]: {
              ...defaultConversationRuntimeState(conversationId),
              ...(state.conversationRuntimeStates[conversationId] ?? {}),
              ...patch,
              updatedAt: now,
            },
          },
        }
      }),

      setConversationRun: (conversationId, run, patch = {}) => set((state) => {
        const { providerSessionTreeId: patchProviderSessionTreeId, ...runtimePatch } = patch
        const providerSessionTreeId = patchProviderSessionTreeId ?? run.sessionId ?? state.conversationThreadBindings[conversationId]?.providerSessionTreeId
        const now = Date.now()
        return {
          conversationsById: state.conversationsById[conversationId]
            ? {
              ...state.conversationsById,
              [conversationId]: {
                ...state.conversationsById[conversationId],
                providerThreadId: run.threadId || state.conversationsById[conversationId].providerThreadId,
                ...(providerSessionTreeId ? { providerSessionId: providerSessionTreeId } : {}),
                activeRunId: run.id,
                lastRunId: run.id,
                status: run.status,
                updatedAt: now,
              },
            }
            : state.conversationsById,
          conversationThreadBindings: run.threadId
            ? {
              ...state.conversationThreadBindings,
              [conversationId]: {
                ...(state.conversationThreadBindings[conversationId] ?? {}),
                conversationId,
                providerThreadId: run.threadId,
                ...(providerSessionTreeId ? { providerSessionTreeId } : {}),
                updatedAt: now,
              },
            }
            : state.conversationThreadBindings,
          conversationRuntimeStates: {
            ...state.conversationRuntimeStates,
            [conversationId]: {
              ...defaultConversationRuntimeState(conversationId),
              ...(state.conversationRuntimeStates[conversationId] ?? {}),
              ...runtimePatch,
              run: compactRun(run) as AgentRun,
              activeRunId: run.id,
              status: run.status,
              updatedAt: now,
            },
          },
        }
      }),

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

      startStandaloneTask: ({ taskId, taskType, title, prompt }) => set((state) => {
        const now = Date.now()
        return {
          standaloneTasks: {
            ...state.standaloneTasks,
            [taskId]: {
              taskId,
              taskType,
              title,
              prompt,
              status: 'running',
              startedAt: now,
              updatedAt: now,
            },
          },
        }
      }),

      updateStandaloneTask: (taskId, patch) => set((state) => {
        const current = state.standaloneTasks[taskId]
        if (!current) return {}
        return {
          standaloneTasks: {
            ...state.standaloneTasks,
            [taskId]: {
              ...current,
              ...patch,
              updatedAt: Date.now(),
            },
          },
        }
      }),

      settleStandaloneTask: (payload) => set((state) => {
        const current = state.standaloneTasks[payload.taskId]
        if (!current) return {}
        const now = Date.now()
        return {
          standaloneTasks: {
            ...state.standaloneTasks,
            [payload.taskId]: {
              ...current,
              status: payload.status,
              run: payload.run ?? current.run,
              thread: payload.thread ?? current.thread,
              runId: payload.run?.id ?? current.runId,
              threadId: payload.thread?.id ?? payload.run?.threadId ?? current.threadId,
              result: payload.result,
              error: payload.error,
              updatedAt: now,
              settledAt: now,
            },
          },
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
