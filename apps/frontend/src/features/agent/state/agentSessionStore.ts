import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ProviderSessionClientInput, ProviderManifest, AgentRun, AgentThread } from '@/shared/infrastructure/providerSessionClient'
import type { AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import { createInstrumentedAgentStateStorage } from '@/features/agent/state/agentPerformanceStore'
import type { ConversationWorkspace } from '@/features/agent/state/agentStore'
import type { AgentChatProviderKind, AgentChatTurnStatus, AgentThreadControlState } from '@/features/agent/domain/agentChatProtocol'

export type AgentPageTaskStatus = 'queued' | 'claimed' | 'running' | 'completed' | 'error' | 'cancelled'
export type AgentTaskRenderMode = 'chat' | 'panel' | 'page'
export type AgentPageTaskRun = AgentRun | {
  id: string
  threadId?: string
  sessionId?: string
  status?: string
  error?: string | null
}
export type AgentPageTaskThread = AgentThread | {
  id: string
  sessionId?: string
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
  sessionId?: string
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
  sessionId?: string
  run?: AgentRun
  thread?: AgentThread
  threadId?: string
  artifacts?: AgentTaskArtifactRef[]
}

export interface AgentConversationProviderSessionState {
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

export interface AgentConversationThreadBinding {
  conversationId: string
  provider?: AgentChatProviderKind
  providerId?: string
  providerInstanceId?: string
  providerThreadId: string
  providerSessionTreeId?: string
  providerThreadCwd?: string
  updatedAt: number
}

export interface AgentConversationRuntimeState {
  conversationId: string
  activeTurnId?: string
  turnStatus?: AgentChatTurnStatus
  activeRunId?: string
  threadControl?: AgentThreadControlState
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

export type AgentConversationRuntimePatch = Partial<Omit<AgentConversationRuntimeState, 'conversationId' | 'updatedAt'>>
type AgentConversationRuntimeCompatPatch = AgentConversationRuntimePatch & {
  sessionId?: string
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
  conversationThreadBindings: Record<string, AgentConversationThreadBinding>
  conversationRuntimeStates: Record<string, AgentConversationRuntimeState>
  /** @deprecated Use conversationRuntimeStates for runtime UI state. */
  conversationProviderSessionStates: Record<string, AgentConversationProviderSessionState>
  standaloneTasks: Record<string, AgentStandaloneTaskState>

  enqueuePageTask: (payload: AgentPageTaskPayload) => AgentPageTaskPayload & { requestId: string; taskType: string }
  createProviderSessionConversation: (userId: string, input: { threadId: string; sessionId?: string; title?: string; createdAt?: number; updatedAt?: number }) => string
  removeProviderSessionConversation: (userId: string, conversationId: string) => void
  setActiveConversation: (userId: string, conversationId: string | null) => void
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
  /** @deprecated Use updateConversationRuntimeState for runtime flags and bindConversationToProviderThread for thread refs. */
  clearConversationProviderSessionState: (conversationId: string) => void
  /** @deprecated Use updateConversationRuntimeState for runtime flags and bindConversationToProviderThread for thread refs. */
  setConversationProviderSessionState: (conversationId: string, patch: Partial<Omit<AgentConversationProviderSessionState, 'conversationId' | 'updatedAt'>>) => void
  setConversationProviderSessionTreeId: (conversationId: string, providerSessionTreeId: string) => void
  setConversationProviderThreadBindingId: (conversationId: string, providerThreadId: string) => void
  /** @deprecated Use setConversationProviderSessionTreeId. */
  setConversationProviderSessionId: (userId: string, conversationId: string, sessionId: string) => void
  /** @deprecated Use setConversationProviderThreadBindingId. */
  setConversationProviderThreadId: (userId: string, conversationId: string, threadId: string) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch?: AgentConversationRuntimeCompatPatch) => void
  clearConversationProviderSessionProjection: (conversationId: string) => void
  /** @deprecated Use setConversationProviderThreadBindingId. */
  setProviderThreadId: (conversationId: string, threadId: string) => void
  /** @deprecated Use setConversationProviderSessionTreeId. */
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

function compactRun(run: AgentRun): AgentRun
function compactRun(run: AgentPageTaskRun | undefined): AgentPageTaskRun | undefined
function compactRun(run: AgentPageTaskRun | undefined): AgentPageTaskRun | undefined {
  if (!run) return undefined
  if (!('steps' in run)) return run
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

function defaultConversationProviderSessionState(conversationId: string): AgentConversationProviderSessionState {
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

function defaultConversationRuntimeState(conversationId: string): AgentConversationRuntimeState {
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
      conversationThreadBindings: {},
      conversationRuntimeStates: {},
      conversationProviderSessionStates: {},
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

      createProviderSessionConversation: (userId, input) => {
        const conversationId = input.sessionId?.trim() || input.threadId.trim()
        if (!conversationId) return activeConversationIdForUser(get(), userId) ?? ''
        const title = input.title?.trim()
        const threadId = input.threadId.trim()
        set((state) => ({
          activeConversationIdsByUser: {
            ...(state.activeConversationIdsByUser ?? {}),
            [userId]: conversationId,
          },
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
          conversationProviderSessionStates: {
            ...state.conversationProviderSessionStates,
            [conversationId]: {
              ...defaultConversationProviderSessionState(conversationId),
              ...(state.conversationProviderSessionStates[conversationId] ?? {}),
              ...(input.sessionId?.trim() ? { sessionId: input.sessionId.trim() } : {}),
              ...(title ? { title } : {}),
              ...(threadId ? { threadId } : {}),
              loading: false,
              building: false,
              updatedAt: Date.now(),
            },
          },
        }))
        return conversationId
      },

      removeProviderSessionConversation: (userId, conversationId) => {
        get().clearConversationProviderSessionState(conversationId)
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
          conversationProviderSessionStates: {
            ...state.conversationProviderSessionStates,
            [conversationId]: {
              ...defaultConversationProviderSessionState(conversationId),
              ...(state.conversationProviderSessionStates[conversationId] ?? {}),
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
          conversationProviderSessionStates: {
            ...state.conversationProviderSessionStates,
            [conversationId]: {
              ...defaultConversationProviderSessionState(conversationId),
              ...(state.conversationProviderSessionStates[conversationId] ?? {}),
              threadId: providerThreadId,
              ...(providerSessionTreeId ? { sessionId: providerSessionTreeId } : {}),
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
          conversationRuntimeStates: {
            ...state.conversationRuntimeStates,
            [conversationId]: {
              ...defaultConversationRuntimeState(conversationId),
              ...(state.conversationRuntimeStates[conversationId] ?? {}),
              ...patch,
              updatedAt: now,
            },
          },
          conversationProviderSessionStates: {
            ...state.conversationProviderSessionStates,
            [conversationId]: {
              ...defaultConversationProviderSessionState(conversationId),
              ...(state.conversationProviderSessionStates[conversationId] ?? {}),
              ...patch,
              ...(patch.activeRunId ? { runId: patch.activeRunId } : {}),
              updatedAt: now,
            },
          },
        }
      }),

      clearConversationProviderSessionState: (conversationId) => set((state) => {
        const conversationProviderSessionStates = { ...state.conversationProviderSessionStates }
        const conversationThreadBindings = { ...state.conversationThreadBindings }
        const conversationRuntimeStates = { ...state.conversationRuntimeStates }
        delete conversationProviderSessionStates[conversationId]
        delete conversationThreadBindings[conversationId]
        delete conversationRuntimeStates[conversationId]
        return {
          conversationProviderSessionStates,
          conversationThreadBindings,
          conversationRuntimeStates,
          pageTasks: Object.fromEntries(
            Object.entries(state.pageTasks).filter(([, task]) => task.conversationId !== conversationId),
          ),
        }
      }),

      setConversationProviderSessionState: (conversationId, patch) => set((state) => {
        const sessionId = patch.sessionId ?? state.conversationProviderSessionStates[conversationId]?.sessionId
        const threadId = patch.threadId ?? state.conversationProviderSessionStates[conversationId]?.threadId
        const now = Date.now()
        return {
          conversationThreadBindings: threadId
            ? {
              ...state.conversationThreadBindings,
              [conversationId]: {
                ...(state.conversationThreadBindings[conversationId] ?? {}),
                conversationId,
                providerThreadId: threadId,
                ...(sessionId ? { providerSessionTreeId: sessionId } : {}),
                updatedAt: now,
              },
            }
            : state.conversationThreadBindings,
          conversationRuntimeStates: {
            ...state.conversationRuntimeStates,
            [conversationId]: {
              ...defaultConversationRuntimeState(conversationId),
              ...(state.conversationRuntimeStates[conversationId] ?? {}),
              loading: patch.loading ?? state.conversationRuntimeStates[conversationId]?.loading ?? false,
              building: patch.building ?? state.conversationRuntimeStates[conversationId]?.building ?? false,
              approving: patch.approving ?? state.conversationRuntimeStates[conversationId]?.approving ?? false,
              stopping: patch.stopping ?? state.conversationRuntimeStates[conversationId]?.stopping ?? false,
              stopRequested: patch.stopRequested ?? state.conversationRuntimeStates[conversationId]?.stopRequested ?? false,
              ...(patch.run ? { run: compactRun(patch.run), activeRunId: patch.run.id } : {}),
              ...(patch.runId ? { activeRunId: patch.runId } : {}),
              ...(patch.status !== undefined ? { status: patch.status } : {}),
              ...(patch.error !== undefined ? { error: patch.error } : {}),
              updatedAt: now,
            },
          },
          conversationProviderSessionStates: {
            ...state.conversationProviderSessionStates,
            [conversationId]: {
              ...defaultConversationProviderSessionState(conversationId),
              ...(state.conversationProviderSessionStates[conversationId] ?? {}),
              ...patch,
              ...(sessionId ? { sessionId } : {}),
              updatedAt: now,
            },
          },
        }
      }),

      setConversationProviderSessionId: (_userId, conversationId, sessionId) => {
        get().setConversationProviderSessionTreeId(conversationId, sessionId)
      },

      setConversationProviderThreadId: (_userId, conversationId, threadId) => {
        get().setConversationProviderThreadBindingId(conversationId, threadId)
      },

      setConversationRun: (conversationId, run, patch = {}) => set((state) => {
        const sessionId = patch.sessionId ?? run.sessionId ?? state.conversationProviderSessionStates[conversationId]?.sessionId
        const now = Date.now()
        return {
          conversationThreadBindings: run.threadId
            ? {
              ...state.conversationThreadBindings,
              [conversationId]: {
                ...(state.conversationThreadBindings[conversationId] ?? {}),
                conversationId,
                providerThreadId: run.threadId,
                ...(sessionId ? { providerSessionTreeId: sessionId } : {}),
                updatedAt: now,
              },
            }
            : state.conversationThreadBindings,
          conversationRuntimeStates: {
            ...state.conversationRuntimeStates,
            [conversationId]: {
              ...defaultConversationRuntimeState(conversationId),
              ...(state.conversationRuntimeStates[conversationId] ?? {}),
              ...patch,
              run: compactRun(run) as AgentRun,
              activeRunId: run.id,
              status: run.status,
              updatedAt: now,
            },
          },
          conversationProviderSessionStates: {
            ...state.conversationProviderSessionStates,
            [conversationId]: {
              ...defaultConversationProviderSessionState(conversationId),
              ...(state.conversationProviderSessionStates[conversationId] ?? {}),
              ...patch,
              run: compactRun(run),
              runId: run.id,
              ...(sessionId ? { sessionId } : {}),
              threadId: run.threadId,
              status: run.status,
              updatedAt: now,
            },
          },
        }
      }),

      clearConversationProviderSessionProjection: (conversationId) => set((state) => {
        const conversationProviderSessionStates = { ...state.conversationProviderSessionStates }
        const conversationRuntimeStates = { ...state.conversationRuntimeStates }
        delete conversationProviderSessionStates[conversationId]
        delete conversationRuntimeStates[conversationId]
        return { conversationProviderSessionStates, conversationRuntimeStates }
      }),

      setProviderThreadId: (conversationId, threadId) => {
        get().setConversationProviderThreadBindingId(conversationId, threadId)
      },

      setConversationSessionId: (conversationId, sessionId) => {
        get().setConversationProviderSessionTreeId(conversationId, sessionId)
      },

      setConversationProviderThreadBindingId: (conversationId, providerThreadId) => {
        const sessionId = get().conversationThreadBindings[conversationId]?.providerSessionTreeId
          ?? get().conversationProviderSessionStates[conversationId]?.sessionId
        get().bindConversationToProviderThread({
          conversationId,
          providerThreadId,
          ...(sessionId ? { providerSessionTreeId: sessionId } : {}),
        })
      },

      setConversationProviderSessionTreeId: (conversationId, providerSessionTreeId) => {
        const threadId = get().conversationThreadBindings[conversationId]?.providerThreadId
          ?? get().conversationProviderSessionStates[conversationId]?.threadId
        if (threadId) {
          get().bindConversationToProviderThread({
            conversationId,
            providerThreadId: threadId,
            providerSessionTreeId,
          })
          return
        }
        set((state) => ({
          conversationProviderSessionStates: {
            ...state.conversationProviderSessionStates,
            [conversationId]: {
              ...defaultConversationProviderSessionState(conversationId),
              ...(state.conversationProviderSessionStates[conversationId] ?? {}),
              sessionId: providerSessionTreeId,
              updatedAt: Date.now(),
            },
          },
        }))
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
      partialize: () => ({}),
      merge: (_persistedState, currentState) => currentState,
    },
  ),
)

function isTerminalAgentPageTaskRun(run: AgentPageTaskRun): boolean {
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
