import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AgentClientInput, AgentManifest, AgentRun, AgentRunPolicyOverride, AgentThread } from '@/lib/localAgentClient'
import type { AgentTaskArtifactRef } from '@/lib/agentArtifacts'

export type AgentPageTaskStatus = 'queued' | 'claimed' | 'running'
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
  runPolicy?: AgentRunPolicyOverride
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

export interface AgentStandaloneSessionState {
  sessionId: string
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
  standaloneSessions: Record<string, AgentStandaloneSessionState>

  enqueuePageTask: (payload: AgentPageTaskPayload) => AgentPageTaskPayload & { requestId: string; taskType: string }
  claimNextQueuedPageTask: () => (AgentPageTaskPayload & { requestId: string; taskType: string }) | null
  attachPageTaskConversation: (requestId: string, conversationId: string) => void
  setPageTaskRunning: (requestId: string | undefined, patch: { conversationId?: string; run?: AgentRun; threadId?: string; artifacts?: AgentTaskArtifactRef[] }) => void
  updatePageTaskFromRuntime: (payload: { requestId?: string; run?: AgentRun; thread?: AgentThread; error?: string; artifacts?: AgentTaskArtifactRef[]; status?: 'completed' | 'error' | 'cancelled' }) => void

  setConversationRuntime: (conversationId: string, patch: Partial<Omit<AgentConversationRuntimeState, 'conversationId' | 'updatedAt'>>) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch?: Partial<Omit<AgentConversationRuntimeState, 'conversationId' | 'run' | 'runId' | 'threadId' | 'status' | 'updatedAt'>>) => void
  clearConversationRuntime: (conversationId: string) => void
  setLocalThreadId: (conversationId: string, threadId: string) => void
  startStandaloneSession: (input: { sessionId: string; taskType: string; title?: string; prompt: string }) => void
  updateStandaloneSession: (sessionId: string, patch: Partial<Omit<AgentStandaloneSessionState, 'sessionId' | 'taskType' | 'prompt' | 'startedAt'>>) => void
  settleStandaloneSession: (payload: { sessionId: string; status: 'completed' | 'cancelled' | 'error' | 'requires_action'; run?: AgentRun; thread?: AgentThread; result?: string; error?: string }) => void
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

export function conversationIdForLocalThread(input: {
  threadId: string
  localThreadIdsByConversation: Record<string, string>
  conversationRuntimes: Record<string, Pick<AgentConversationRuntimeState, 'threadId' | 'updatedAt'>>
}): string | undefined {
  const directEntry = Object.entries(input.localThreadIdsByConversation)
    .find(([, mappedThreadId]) => mappedThreadId === input.threadId)
  if (directEntry) return directEntry[0]

  return Object.entries(input.conversationRuntimes)
    .filter(([, runtime]) => runtime.threadId === input.threadId)
    .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)[0]?.[0]
}

export const useAgentSessionStore = create<AgentSessionStore>()(
  persist(
    (set, get) => ({
      pageTasks: {},
      conversationRuntimes: {},
      localThreadIdsByConversation: {},
      standaloneSessions: {},

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
          return {
            pageTasks: {
              ...state.pageTasks,
              [requestId]: {
                ...task,
                conversationId: patch.conversationId ?? task.conversationId,
                threadId: patch.threadId ?? run?.threadId ?? task.threadId,
                runId: run?.id ?? task.runId,
                run,
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
                status: task.status === 'queued' ? 'claimed' : task.status,
                run: payload.run ?? task.run,
                thread: payload.thread ?? task.thread,
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
        return {
          conversationRuntimes: {
            ...state.conversationRuntimes,
            [conversationId]: {
              ...defaultConversationRuntime(conversationId),
              ...(state.conversationRuntimes[conversationId] ?? {}),
              ...patch,
              updatedAt: Date.now(),
            },
          },
        }
      }),

      setConversationRun: (conversationId, run, patch = {}) => set((state) => {
        return {
          conversationRuntimes: {
            ...state.conversationRuntimes,
            [conversationId]: {
              ...defaultConversationRuntime(conversationId),
              ...(state.conversationRuntimes[conversationId] ?? {}),
              ...patch,
              run: compactRun(run),
              runId: run.id,
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

      startStandaloneSession: ({ sessionId, taskType, title, prompt }) => set((state) => {
        const now = Date.now()
        return {
          standaloneSessions: {
            ...state.standaloneSessions,
            [sessionId]: {
              sessionId,
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

      updateStandaloneSession: (sessionId, patch) => set((state) => {
        const current = state.standaloneSessions[sessionId]
        if (!current) return {}
        return {
          standaloneSessions: {
            ...state.standaloneSessions,
            [sessionId]: {
              ...current,
              ...patch,
              updatedAt: Date.now(),
            },
          },
        }
      }),

      settleStandaloneSession: (payload) => set((state) => {
        const current = state.standaloneSessions[payload.sessionId]
        if (!current) return {}
        const now = Date.now()
        return {
          standaloneSessions: {
            ...state.standaloneSessions,
            [payload.sessionId]: {
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
        conversationRuntimes: Object.fromEntries(
          Object.entries(state.conversationRuntimes)
            .filter(([, runtime]) => runtime.threadId || runtime.runId)
            .map(([conversationId, runtime]) => [conversationId, {
              ...defaultConversationRuntime(conversationId),
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
        const threadId = typeof record.threadId === 'string' && record.threadId ? record.threadId : undefined
        const runId = typeof record.runId === 'string' && record.runId ? record.runId : undefined
        if (!threadId && !runId) return []
        return [[conversationId, {
          ...defaultConversationRuntime(conversationId),
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
