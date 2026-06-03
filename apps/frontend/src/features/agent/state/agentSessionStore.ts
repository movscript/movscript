import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AgentClientInput, AgentManifest, AgentRun, AgentThread } from '@/shared/infrastructure/localAgentClient'
import type { AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import { createInstrumentedAgentStateStorage } from '@/features/agent/state/agentPerformanceStore'
import type { ConversationWorkspace } from '@/features/agent/state/agentStore'

export type AgentPageTaskStatus = 'queued' | 'claimed' | 'running' | 'completed' | 'error' | 'cancelled'
export type AgentTaskRenderMode = 'chat' | 'panel' | 'page'

export interface AgentPageTaskPayload {
  requestId?: string
  taskType?: string
  message: string
  displayMessage?: string
  title?: string
  newConversation?: boolean
  autoSend?: boolean
  projectId?: number
  clientInput?: AgentClientInput
  agentManifest?: AgentManifest
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
  sessionId?: string
  threadId?: string
  runId?: string
  run?: AgentRun
  thread?: AgentThread
  error?: string
  createdAt: number
  updatedAt: number
  settledAt?: number
}

export interface AgentConversationRuntimeState {
  conversationId: string
  title?: string
  requestId?: string
  sessionId?: string
  threadId?: string
  runId?: string
  run?: AgentRun
  status?: string
  loading: boolean
  building: boolean
  approving: boolean
  stopping: boolean
  stopRequested: boolean
  error?: string
  updatedAt: number
}

export interface AgentStandaloneTaskState {
  taskId: string
  taskType: string
  title?: string
  prompt: string
  status: 'running' | 'completed' | 'cancelled' | 'error' | 'requires_action'
  runId?: string
  threadId?: string
  run?: AgentRun
  thread?: AgentThread
  result?: string
  error?: string
  startedAt: number
  updatedAt: number
  settledAt?: number
}

interface AgentSessionStore {
  activeConversationIdsByUser: Record<string, string | null>
  workspacesByUser: Record<string, Record<string, ConversationWorkspace>>
  pageTasks: Record<string, AgentPageTaskState>
  conversationRuntimes: Record<string, AgentConversationRuntimeState>
  localThreadIdsByConversation: Record<string, string>
  sessionIdsByConversation: Record<string, string>
  standaloneTasks: Record<string, AgentStandaloneTaskState>

  enqueuePageTask: (payload: AgentPageTaskPayload) => AgentPageTaskPayload & { requestId: string; taskType: string }
  createRuntimeConversation: (userId: string, input: { threadId: string; sessionId?: string; title?: string; createdAt?: number; updatedAt?: number }) => string
  removeRuntimeConversation: (userId: string, conversationId: string) => void
  setActiveConversation: (userId: string, conversationId: string | null) => void
  getActiveConversationId: (userId: string) => string | null
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  getConversationWorkspace: (userId: string, conversationId: string) => ConversationWorkspace
  updateConversationWorkspace: (userId: string, conversationId: string, patch: Partial<ConversationWorkspace>) => void
  clearConversationWorkspace: (userId: string, conversationId: string) => void
  claimNextQueuedPageTask: () => (AgentPageTaskPayload & { requestId: string; taskType: string }) | null
  attachPageTaskConversation: (requestId: string, conversationId: string) => void
  setPageTaskRunning: (requestId: string | undefined, patch: { conversationId?: string; sessionId?: string; run?: AgentRun; thread?: AgentThread; threadId?: string; artifacts?: AgentTaskArtifactRef[] }) => void
  updatePageTaskFromRuntime: (payload: { requestId?: string; run?: AgentRun; thread?: AgentThread; error?: string; artifacts?: AgentTaskArtifactRef[]; status?: 'completed' | 'error' | 'cancelled' }) => void

  clearConversationRuntimeState: (conversationId: string) => void
  setConversationRuntime: (conversationId: string, patch: Partial<Omit<AgentConversationRuntimeState, 'conversationId' | 'updatedAt'>>) => void
  setConversationRuntimeSessionId: (userId: string, conversationId: string, sessionId: string) => void
  setConversationRuntimeThreadId: (userId: string, conversationId: string, threadId: string) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch?: Partial<Omit<AgentConversationRuntimeState, 'conversationId' | 'run' | 'runId' | 'threadId' | 'status' | 'updatedAt'>>) => void
  clearConversationRuntime: (conversationId: string) => void
  setLocalThreadId: (conversationId: string, threadId: string) => void
  setConversationSessionId: (conversationId: string, sessionId: string) => void
  startStandaloneTask: (input: { taskId: string; taskType: string; title?: string; prompt: string }) => void
  updateStandaloneTask: (taskId: string, patch: Partial<Omit<AgentStandaloneTaskState, 'taskId' | 'taskType' | 'prompt' | 'startedAt'>>) => void
  settleStandaloneTask: (payload: { taskId: string; status: 'completed' | 'cancelled' | 'error' | 'requires_action'; run?: AgentRun; thread?: AgentThread; result?: string; error?: string }) => void
}

function genTaskId() {
  return `agent_task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export const EMPTY_CONVERSATION_WORKSPACE: ConversationWorkspace = {
  input: '',
  attachments: [],
}

function normalizeTaskPayload(payload: AgentPageTaskPayload): AgentPageTaskPayload & { requestId: string; taskType: string } {
  return {
    ...payload,
    requestId: payload.requestId || genTaskId(),
    taskType: payload.taskType || inferTaskType(payload),
  }
}

function inferTaskType(payload: AgentPageTaskPayload): string {
  const labels = payload.clientInput?.uiSnapshot?.labels ?? []
  const known = labels.find((label) => /workbench|orchestrate|script|creative|page-tool/i.test(label))
  if (known) return known
  if (payload.title?.trim()) return payload.title.trim().split(':')[0] || 'agent_task'
  return 'agent_task'
}

function compactRun(run: AgentRun | undefined): AgentRun | undefined {
  if (!run) return undefined
  return {
    ...run,
    steps: run.steps.map((step) => ({
      ...step,
      args: undefined,
      result: undefined,
    })),
    traceEvents: [],
  }
}

function defaultConversationRuntime(conversationId: string): AgentConversationRuntimeState {
  return {
    conversationId,
    loading: false,
    building: false,
    approving: false,
    stopping: false,
    stopRequested: false,
    updatedAt: Date.now(),
  }
}

function activeConversationIdForUser(state: Pick<AgentSessionStore, 'activeConversationIdsByUser'>, userId: string): string | null {
  return state.activeConversationIdsByUser?.[userId] ?? null
}

export const useAgentSessionStore = create<AgentSessionStore>()(
  persist(
    (set, get) => ({
      activeConversationIdsByUser: {},
      workspacesByUser: {},
      pageTasks: {},
      conversationRuntimes: {},
      localThreadIdsByConversation: {},
      sessionIdsByConversation: {},
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

      createRuntimeConversation: (userId, input) => {
        const conversationId = input.threadId.trim()
        if (!conversationId) return activeConversationIdForUser(get(), userId) ?? ''
        const title = input.title?.trim()
        set((state) => ({
          activeConversationIdsByUser: {
            ...(state.activeConversationIdsByUser ?? {}),
            [userId]: conversationId,
          },
          ...(input.sessionId?.trim()
            ? {
              sessionIdsByConversation: {
                ...state.sessionIdsByConversation,
                [conversationId]: input.sessionId.trim(),
              },
            }
            : {}),
          localThreadIdsByConversation: {
            ...state.localThreadIdsByConversation,
            [conversationId]: conversationId,
          },
          conversationRuntimes: {
            ...state.conversationRuntimes,
            [conversationId]: {
              ...defaultConversationRuntime(conversationId),
              ...(state.conversationRuntimes[conversationId] ?? {}),
              ...(input.sessionId?.trim() ? { sessionId: input.sessionId.trim() } : {}),
              ...(title ? { title } : {}),
              threadId: conversationId,
              loading: false,
              building: false,
              updatedAt: Date.now(),
            },
          },
        }))
        return conversationId
      },

      removeRuntimeConversation: (userId, conversationId) => {
        get().clearConversationRuntimeState(conversationId)
        set((state) => {
          const workspacesByUser = { ...state.workspacesByUser }
          if (workspacesByUser[userId]?.[conversationId]) {
            workspacesByUser[userId] = { ...workspacesByUser[userId] }
            delete workspacesByUser[userId][conversationId]
          }
          return {
            activeConversationIdsByUser: {
              ...(state.activeConversationIdsByUser ?? {}),
              [userId]: activeConversationIdForUser(state, userId) === conversationId ? null : activeConversationIdForUser(state, userId),
            },
            workspacesByUser,
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
          conversationRuntimes: {
            ...state.conversationRuntimes,
            [conversationId]: {
              ...defaultConversationRuntime(conversationId),
              ...(state.conversationRuntimes[conversationId] ?? {}),
              title: trimmed,
              updatedAt: Date.now(),
            },
          },
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
        delete userWorkspaces[conversationId]
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

      updatePageTaskFromRuntime: (payload) => {
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
                status: pageTaskStatusFromRuntime(payload, task.status),
                run: payload.run ?? task.run,
                thread: payload.thread ?? task.thread,
                sessionId: payload.thread?.sessionId ?? payload.run?.sessionId ?? task.sessionId,
                runId: payload.run?.id ?? task.runId,
                threadId: payload.thread?.id ?? payload.run?.threadId ?? task.threadId,
                artifacts: payload.artifacts ?? task.artifacts,
                error: payload.error,
                updatedAt: now,
                settledAt: payload.status !== undefined || (payload.run && isRuntimeTerminalRun(payload.run)) ? now : task.settledAt,
              },
            },
          }
        })
      },

      clearConversationRuntimeState: (conversationId) => set((state) => {
        const conversationRuntimes = { ...state.conversationRuntimes }
        const localThreadIdsByConversation = { ...state.localThreadIdsByConversation }
        const sessionIdsByConversation = { ...state.sessionIdsByConversation }
        delete conversationRuntimes[conversationId]
        delete localThreadIdsByConversation[conversationId]
        delete sessionIdsByConversation[conversationId]
        return {
          conversationRuntimes,
          localThreadIdsByConversation,
          sessionIdsByConversation,
          pageTasks: Object.fromEntries(
            Object.entries(state.pageTasks).filter(([, task]) => task.conversationId !== conversationId),
          ),
        }
      }),

      setConversationRuntime: (conversationId, patch) => set((state) => {
        const sessionId = patch.sessionId ?? state.conversationRuntimes[conversationId]?.sessionId
        return {
          sessionIdsByConversation: sessionId
            ? { ...state.sessionIdsByConversation, [conversationId]: sessionId }
            : state.sessionIdsByConversation,
          conversationRuntimes: {
            ...state.conversationRuntimes,
            [conversationId]: {
              ...defaultConversationRuntime(conversationId),
              ...(state.conversationRuntimes[conversationId] ?? {}),
              ...patch,
              ...(sessionId ? { sessionId } : {}),
              updatedAt: Date.now(),
            },
          },
        }
      }),

      setConversationRuntimeSessionId: (_userId, conversationId, sessionId) => {
        get().setConversationSessionId(conversationId, sessionId)
      },

      setConversationRuntimeThreadId: (_userId, conversationId, threadId) => {
        get().setLocalThreadId(conversationId, threadId)
      },

      setConversationRun: (conversationId, run, patch = {}) => set((state) => {
        const sessionId = patch.sessionId ?? run.sessionId ?? state.conversationRuntimes[conversationId]?.sessionId
        return {
          sessionIdsByConversation: sessionId
            ? { ...state.sessionIdsByConversation, [conversationId]: sessionId }
            : state.sessionIdsByConversation,
          conversationRuntimes: {
            ...state.conversationRuntimes,
            [conversationId]: {
              ...defaultConversationRuntime(conversationId),
              ...(state.conversationRuntimes[conversationId] ?? {}),
              ...patch,
              run: compactRun(run),
              runId: run.id,
              ...(sessionId ? { sessionId } : {}),
              threadId: run.threadId,
              status: run.status,
              updatedAt: Date.now(),
            },
          },
        }
      }),

      clearConversationRuntime: (conversationId) => set((state) => {
        const next = { ...state.conversationRuntimes }
        delete next[conversationId]
        return { conversationRuntimes: next }
      }),

      setLocalThreadId: (conversationId, threadId) => set((state) => ({
        localThreadIdsByConversation: {
          ...state.localThreadIdsByConversation,
          [conversationId]: threadId,
        },
        conversationRuntimes: {
          ...state.conversationRuntimes,
          [conversationId]: {
            ...defaultConversationRuntime(conversationId),
            ...(state.conversationRuntimes[conversationId] ?? {}),
            threadId,
            updatedAt: Date.now(),
          },
        },
      })),

      setConversationSessionId: (conversationId, sessionId) => set((state) => ({
        sessionIdsByConversation: {
          ...state.sessionIdsByConversation,
          [conversationId]: sessionId,
        },
        conversationRuntimes: {
          ...state.conversationRuntimes,
          [conversationId]: {
            ...defaultConversationRuntime(conversationId),
            ...(state.conversationRuntimes[conversationId] ?? {}),
            sessionId,
            updatedAt: Date.now(),
          },
        },
      })),

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
      partialize: () => ({}),
      merge: (_persistedState, currentState) => currentState,
    },
  ),
)

function isRuntimeTerminalRun(run: AgentRun): boolean {
  return run.status === 'completed'
    || run.status === 'completed_with_warnings'
    || run.status === 'failed'
    || run.status === 'cancelled'
}

export function pageTaskStatusFromRuntime(
  payload: { status?: 'completed' | 'error' | 'cancelled'; run?: AgentRun },
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
