import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AgentClientInput, AgentManifest, AgentRun, AgentThread } from '@/shared/infrastructure/localAgentClient'
import type { AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'

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
  pageTasks: Record<string, AgentPageTaskState>
  conversationRuntimes: Record<string, AgentConversationRuntimeState>
  localThreadIdsByConversation: Record<string, string>
  sessionIdsByConversation: Record<string, string>
  standaloneTasks: Record<string, AgentStandaloneTaskState>

  enqueuePageTask: (payload: AgentPageTaskPayload) => AgentPageTaskPayload & { requestId: string; taskType: string }
  claimNextQueuedPageTask: () => (AgentPageTaskPayload & { requestId: string; taskType: string }) | null
  attachPageTaskConversation: (requestId: string, conversationId: string) => void
  setPageTaskRunning: (requestId: string | undefined, patch: { conversationId?: string; sessionId?: string; run?: AgentRun; thread?: AgentThread; threadId?: string; artifacts?: AgentTaskArtifactRef[] }) => void
  updatePageTaskFromRuntime: (payload: { requestId?: string; run?: AgentRun; thread?: AgentThread; error?: string; artifacts?: AgentTaskArtifactRef[]; status?: 'completed' | 'error' | 'cancelled' }) => void

  setConversationRuntime: (conversationId: string, patch: Partial<Omit<AgentConversationRuntimeState, 'conversationId' | 'updatedAt'>>) => void
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

export const useAgentSessionStore = create<AgentSessionStore>()(
  persist(
    (set, get) => ({
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
      partialize: (state) => ({
        localThreadIdsByConversation: state.localThreadIdsByConversation,
        sessionIdsByConversation: state.sessionIdsByConversation,
        conversationRuntimes: Object.fromEntries(
          Object.entries(state.conversationRuntimes)
            .filter(([, runtime]) => runtime.threadId || runtime.runId)
            .map(([conversationId, runtime]) => [conversationId, {
              ...defaultConversationRuntime(conversationId),
              sessionId: runtime.sessionId,
              threadId: runtime.threadId,
              runId: runtime.runId,
              status: runtime.status,
              loading: false,
              building: false,
              approving: false,
              stopping: false,
              stopRequested: false,
              error: undefined,
              updatedAt: runtime.updatedAt,
            }]),
        ),
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AgentSessionStore> | undefined
        return {
          ...currentState,
          localThreadIdsByConversation: normalizeStringRecord(persisted?.localThreadIdsByConversation),
          sessionIdsByConversation: normalizeStringRecord(persisted?.sessionIdsByConversation),
          conversationRuntimes: normalizeConversationRuntimes(persisted?.conversationRuntimes),
        }
      },
    },
  ),
)

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .flatMap(([key, item]) => typeof item === 'string' && item.trim() ? [[key, item]] : []),
  )
}

function normalizeConversationRuntimes(value: unknown): Record<string, AgentConversationRuntimeState> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .flatMap(([conversationId, runtime]) => {
        if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) return []
        const record = runtime as Record<string, unknown>
        const sessionId = typeof record.sessionId === 'string' && record.sessionId ? record.sessionId : undefined
        const threadId = typeof record.threadId === 'string' && record.threadId ? record.threadId : undefined
        const runId = typeof record.runId === 'string' && record.runId ? record.runId : undefined
        if (!threadId && !runId) return []
        return [[conversationId, {
          ...defaultConversationRuntime(conversationId),
          ...(sessionId ? { sessionId } : {}),
          ...(threadId ? { threadId } : {}),
          ...(runId ? { runId } : {}),
          ...(typeof record.status === 'string' ? { status: record.status } : {}),
          updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : Date.now(),
        }]]
      }),
  )
}

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
