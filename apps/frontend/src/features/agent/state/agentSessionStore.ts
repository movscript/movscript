import { create } from 'zustand'
import type { AgentRun } from '@movscript/core/agent/protocol'
import {
  EMPTY_CONVERSATION_WORKSPACE,
  type AgentConversationRunPatch,
  type AgentConversationRuntimePatch,
  type AgentConversationRuntimeState,
  type AgentStandaloneTaskState,
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
  type AgentPageTaskRun,
  type AgentPageTaskState,
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
  attachAgentConversationRegistryBroadcastBridge,
  publishAgentConversationRegistryEvent,
  subscribeAgentConversationRegistryEvents,
  type AgentConversationRegistryEvent,
} from '@/features/agent/state/agentConversationRegistryEvents'
import {
  agentConversationIdForRegistryInput,
  setAgentConversationRegistryDeckOrders,
  upsertAgentConversationRegistryRecord,
} from '@movscript/core/agent'
import {
  publishAgentActivityEvent,
  type AgentActivityEventPayload,
  type AgentActivityStatus,
  type AgentActivityTopic,
} from '@/features/agent/application/agentActivityEvents'
import { readBrowserStorageItem, removeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import type { ElectronAgentSessionState } from '@/shared/contracts/electronApi'

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

const AGENT_SESSION_LEGACY_STORAGE_KEY = 'agent-session-store-v2'

export const useAgentSessionStore = create<AgentSessionStore>()((set, get) => ({
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
        publishAgentTaskActivity('agent.activity.started', {
          activityId: normalized!.requestId,
          kind: 'task',
          title: normalized!.title || normalized!.displayMessage || normalized!.taskType,
          summary: normalized!.displayMessage || normalized!.message,
          status: 'pending',
          origin: 'user',
          projectId: normalized!.projectId,
          rawRef: { type: 'agent_page_task', id: normalized!.requestId },
        }, `page-task:${normalized!.requestId}:queued`)
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

      setConversationOpen: (userId, conversationId, open) => {
        const current = get().conversationsById[conversationId]
        set((state) => setAgentSessionConversationOpenState(state, { conversationId, open, userId }))
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

      setActiveConversation: (userId, conversationId) => {
        const current = activeConversationIdForUser(get(), userId)
        if (current === conversationId) return
        set((state) => ({
          activeConversationIdsByUser: {
            ...(state.activeConversationIdsByUser ?? {}),
            [userId]: conversationId,
          },
        }))
        publishAgentSessionRegistryEvent(get, {
          kind: 'active-conversation-changed',
          userId,
          conversationId,
          activeConversationId: conversationId,
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

      getActiveConversationId: (userId) => activeConversationIdForUser(get(), userId),

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
                updatedAt: Date.now(),
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

      claimNextQueuedPageTask: () => {
        const now = Date.now()
        const result = claimNextQueuedAgentPageTask({
          now,
          pageTasks: get().pageTasks,
        })
        if (!result) return null
        set({ pageTasks: result.pageTasks })
        publishAgentTaskActivity('agent.activity.updated', {
          activityId: result.payload.requestId,
          kind: 'task',
          title: result.payload.title || result.payload.displayMessage || result.payload.taskType,
          summary: result.payload.displayMessage || result.payload.message,
          status: 'running',
          origin: 'system',
          projectId: result.payload.projectId,
          rawRef: { type: 'agent_page_task', id: result.payload.requestId },
        }, `page-task:${result.payload.requestId}:claimed`)
        return result.payload
      },

      attachPageTaskConversation: (requestId, conversationId) => {
        set((state) => {
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
        })
        const task = get().pageTasks[requestId]
        if (task) {
          publishAgentTaskActivity('agent.activity.updated', agentTaskActivityPayload(task, 'running'), `page-task:${requestId}:conversation:${conversationId}`)
        }
      },

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
        const task = get().pageTasks[requestId]
        if (task) {
          publishAgentTaskActivity('agent.activity.updated', agentTaskActivityPayload(task, 'running'), `page-task:${requestId}:running:${task.runId ?? task.threadId ?? ''}`)
          publishAgentRunStepActivity(task.conversationId, task.payload.projectId, task.run)
          publishAgentRunInteractionRequests(task.conversationId, task.payload.projectId, task.run)
        }
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
        const task = get().pageTasks[payload.requestId]
        if (task) {
          const status = agentActivityStatusFromPageTask(task.status)
          publishAgentTaskActivity(agentActivityTopicForStatus(status), agentTaskActivityPayload(task, status), `page-task:${task.requestId}:${status}:${task.runId ?? task.threadId ?? ''}`)
          publishAgentRunStepActivity(task.conversationId, task.payload.projectId, task.run)
          publishAgentRunInteractionRequests(task.conversationId, task.payload.projectId, task.run)
          if (task.artifacts?.length) {
            publishAgentTaskActivity('agent.output.created', {
              ...agentTaskActivityPayload(task, 'completed'),
              kind: 'output',
              title: task.payload.title || 'Agent output created',
              origin: 'agent',
              targetIds: task.artifacts.map((artifact) => artifact.workspaceId).filter(Boolean),
              rawRef: { type: 'agent_page_task_artifacts', id: task.requestId },
            }, `page-task:${task.requestId}:output:${task.artifacts.map((artifact) => artifact.workspaceId).join(',')}`)
          }
        }
      },

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
                updatedAt: Date.now(),
              },
            },
          }
        })
      },

      startStandaloneTask: ({ taskId, taskType, title, prompt }) => {
        set((state) => ({
          standaloneTasks: startAgentStandaloneTask({
            now: Date.now(),
            standaloneTasks: state.standaloneTasks,
            taskId,
            taskType,
            title,
            prompt,
          }),
        }))
        publishAgentTaskActivity('agent.activity.started', {
          activityId: taskId,
          kind: 'task',
          title: title || taskType,
          summary: prompt,
          status: 'running',
          origin: 'user',
          rawRef: { type: 'agent_standalone_task', id: taskId },
        }, `standalone:${taskId}:started`)
      },

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

      settleStandaloneTask: (payload) => {
        set((state) => {
          const standaloneTasks = settleAgentStandaloneTask({
            now: Date.now(),
            payload,
            standaloneTasks: state.standaloneTasks,
          })
          if (!standaloneTasks) return {}
          return {
            standaloneTasks,
          }
        })
        const task = get().standaloneTasks[payload.taskId]
        if (task) {
          const status = agentActivityStatusFromStandaloneStatus(task.status)
          publishAgentTaskActivity(agentActivityTopicForStatus(status), {
            activityId: task.taskId,
            kind: 'task',
            title: task.title || task.taskType,
            summary: task.error || task.result,
            status,
            origin: 'system',
            threadId: task.threadId,
            runId: task.runId,
            rawRef: { type: 'agent_standalone_task', id: task.taskId },
          }, `standalone:${task.taskId}:${status}`)
          publishAgentRunStepActivity(undefined, undefined, task.run)
          publishAgentRunInteractionRequests(undefined, undefined, task.run)
        }
      },
}))

let agentSessionPersistenceInstalled = false
let agentSessionHydratedFromHome = false
let agentSessionSaveTimer: ReturnType<typeof setTimeout> | undefined
let agentSessionSaveInFlight: Promise<unknown> | undefined
let agentSessionSaveQueued = false

installAgentSessionHomePersistence()

function installAgentSessionHomePersistence(): void {
  if (agentSessionPersistenceInstalled || typeof window === 'undefined') return
  agentSessionPersistenceInstalled = true
  attachAgentConversationRegistryBroadcastBridge()
  subscribeAgentConversationRegistryEvents((event) => {
    if (event.delivery !== 'cross-window' || !event.snapshot) return
    useAgentSessionStore.setState((current) => applyRemoteAgentSessionRegistryEvent(current, event))
  })
  useAgentSessionStore.subscribe(() => {
    if (!agentSessionHydratedFromHome) return
    scheduleAgentSessionHomeSave()
  })
  void hydrateAgentSessionStoreFromHome()
  window.addEventListener('pagehide', flushAgentSessionHomeSave)
  window.addEventListener('beforeunload', flushAgentSessionHomeSave)
}

async function hydrateAgentSessionStoreFromHome(): Promise<void> {
  const api = readElectronApi()
  const legacyState = readLegacyAgentSessionState()
  if (!api?.getAgentSessionState) {
    if (legacyState && hasPersistedAgentSessionState(legacyState)) {
      useAgentSessionStore.setState((current) => mergePersistedAgentSessionState(current, legacyState))
    }
    agentSessionHydratedFromHome = true
    return
  }

  try {
    const result = await api.getAgentSessionState()
    const homeState = result.state
    const homeHasState = hasPersistedAgentSessionState(homeState)
    const state = homeHasState ? homeState : legacyState
    if (state && hasPersistedAgentSessionState(state)) {
      useAgentSessionStore.setState((current) => mergePersistedAgentSessionState(current, state))
    }
    if (legacyState) removeBrowserStorageItem('local', AGENT_SESSION_LEGACY_STORAGE_KEY)
    agentSessionHydratedFromHome = true
    if (!homeHasState && legacyState && api.setAgentSessionState) {
      await saveAgentSessionHomeState()
    }
  } catch {
    if (legacyState && hasPersistedAgentSessionState(legacyState)) {
      useAgentSessionStore.setState((current) => mergePersistedAgentSessionState(current, legacyState))
    }
    agentSessionHydratedFromHome = true
  }
}

function scheduleAgentSessionHomeSave(): void {
  if (agentSessionSaveTimer) return
  agentSessionSaveTimer = setTimeout(() => {
    agentSessionSaveTimer = undefined
    void saveAgentSessionHomeState()
  }, 250)
}

function flushAgentSessionHomeSave(): void {
  if (agentSessionSaveTimer) {
    clearTimeout(agentSessionSaveTimer)
    agentSessionSaveTimer = undefined
  }
  void saveAgentSessionHomeState()
}

async function saveAgentSessionHomeState(): Promise<void> {
  const api = readElectronApi()
  if (!api?.setAgentSessionState || !agentSessionHydratedFromHome) return
  if (agentSessionSaveInFlight) {
    agentSessionSaveQueued = true
    return agentSessionSaveInFlight.then(() => undefined)
  }
  const state = persistedAgentSessionState(useAgentSessionStore.getState())
  agentSessionSaveInFlight = api.setAgentSessionState({ state })
    .catch(() => null)
    .finally(() => {
      agentSessionSaveInFlight = undefined
      if (agentSessionSaveQueued) {
        agentSessionSaveQueued = false
        void saveAgentSessionHomeState()
      }
    })
  await agentSessionSaveInFlight
}

function readLegacyAgentSessionState(): PersistedAgentSessionStore | null {
  const raw = readBrowserStorageItem('local', AGENT_SESSION_LEGACY_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    const state = isRecord(parsed) && isRecord(parsed.state) ? parsed.state : parsed
    return normalizePersistedAgentSessionState(state)
  } catch {
    return null
  }
}

function normalizePersistedAgentSessionState(value: unknown): PersistedAgentSessionStore | null {
  if (!isRecord(value)) return null
  return {
    activeConversationIdsByUser: normalizeStringNullableRecord(value.activeConversationIdsByUser),
    conversationsById: normalizeRecordMap(value.conversationsById) as unknown as PersistedAgentSessionStore['conversationsById'],
    workspacesByUser: normalizeNestedRecordMap(value.workspacesByUser) as unknown as PersistedAgentSessionStore['workspacesByUser'],
  }
}

function mergePersistedAgentSessionState(current: AgentSessionStore, persisted: ElectronAgentSessionState): Partial<AgentSessionStore> {
  return {
    activeConversationIdsByUser: {
      ...persisted.activeConversationIdsByUser,
      ...current.activeConversationIdsByUser,
    },
    conversationsById: {
      ...persisted.conversationsById,
      ...current.conversationsById,
    },
    workspacesByUser: mergeNestedRecordMap(persisted.workspacesByUser, current.workspacesByUser),
  }
}

function applyRemoteAgentSessionRegistryEvent(
  current: AgentSessionStore,
  event: AgentConversationRegistryEvent,
): Partial<AgentSessionStore> {
  if (!event.snapshot) return {}
  const conversationsById = {
    ...current.conversationsById,
    ...event.snapshot.conversationsById,
  }
  const workspacesByUser = mergeNestedRecordMap(current.workspacesByUser, event.snapshot.workspacesByUser)
  if (event.kind === 'conversation-removed' && event.conversationId) {
    delete conversationsById[event.conversationId]
    if (event.userId && workspacesByUser[event.userId]) {
      workspacesByUser[event.userId] = { ...workspacesByUser[event.userId] }
      delete workspacesByUser[event.userId][event.conversationId]
    }
  }
  return {
    activeConversationIdsByUser: {
      ...current.activeConversationIdsByUser,
      ...event.snapshot.activeConversationIdsByUser,
    },
    conversationsById,
    workspacesByUser,
  }
}

function publishAgentSessionRegistryEvent(
  getState: () => AgentSessionStore,
  event: Parameters<typeof publishAgentConversationRegistryEvent>[0],
): void {
  publishAgentConversationRegistryEvent({
    ...event,
    snapshot: persistedAgentSessionState(getState()),
  })
}

function hasPersistedAgentSessionState(state: PersistedAgentSessionStore | ElectronAgentSessionState | null | undefined): boolean {
  return Boolean(state && (
    Object.keys(state.activeConversationIdsByUser).length > 0
    || Object.keys(state.conversationsById).length > 0
    || Object.keys(state.workspacesByUser).length > 0
  ))
}

function mergeNestedRecordMap<T>(base: Record<string, Record<string, T>>, overlay: Record<string, Record<string, T>>): Record<string, Record<string, T>> {
  const output: Record<string, Record<string, T>> = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    output[key] = {
      ...(output[key] ?? {}),
      ...value,
    }
  }
  return output
}

function normalizeStringNullableRecord(input: unknown): Record<string, string | null> {
  if (!isRecord(input)) return {}
  const output: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') output[key] = value
    else if (value === null) output[key] = null
  }
  return output
}

function normalizeRecordMap(input: unknown): Record<string, Record<string, unknown>> {
  if (!isRecord(input)) return {}
  const output: Record<string, Record<string, unknown>> = {}
  for (const [key, value] of Object.entries(input)) {
    if (isRecord(value)) output[key] = value
  }
  return output
}

function normalizeNestedRecordMap(input: unknown): Record<string, Record<string, Record<string, unknown>>> {
  if (!isRecord(input)) return {}
  const output: Record<string, Record<string, Record<string, unknown>>> = {}
  for (const [key, value] of Object.entries(input)) {
    const normalized = normalizeRecordMap(value)
    if (Object.keys(normalized).length > 0) output[key] = normalized
  }
  return output
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function publishAgentTaskActivity(
  topic: AgentActivityTopic,
  payload: AgentActivityEventPayload,
  dedupeKey: string,
): void {
  publishAgentActivityEvent(topic, payload, {
    id: `agent:${dedupeKey}`,
    source: 'agent-session-store',
  })
}

function agentTaskActivityPayload(task: AgentPageTaskState, status: AgentActivityStatus): AgentActivityEventPayload {
  return {
    conversationId: task.conversationId,
    threadId: task.threadId,
    runId: task.runId,
    projectId: task.payload.projectId,
    activityId: task.requestId,
    kind: 'task',
      title: task.payload.title || task.payload.displayMessage || task.taskType,
      summary: task.error || task.payload.displayMessage || task.payload.message,
      status,
      origin: 'system',
      rawRef: { type: 'agent_page_task', id: task.requestId },
  }
}

function agentActivityStatusFromPageTask(status: AgentPageTaskState['status']): AgentActivityStatus {
  switch (status) {
    case 'completed':
      return 'completed'
    case 'error':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    case 'queued':
      return 'pending'
    default:
      return 'running'
  }
}

function agentActivityStatusFromStandaloneStatus(status: AgentStandaloneTaskState['status']): AgentActivityStatus {
  switch (status) {
    case 'completed':
      return 'completed'
    case 'error':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    case 'requires_action':
      return 'requires_action'
    default:
      return 'running'
  }
}

function agentActivityStatusFromRun(run: AgentRun): AgentActivityStatus {
  switch (run.status) {
    case 'completed':
    case 'completed_with_warnings':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    case 'requires_action':
      return 'requires_action'
    default:
      return 'running'
  }
}

function agentActivityTopicForStatus(status: AgentActivityStatus): AgentActivityTopic {
  switch (status) {
    case 'completed':
      return 'agent.activity.completed'
    case 'failed':
      return 'agent.activity.failed'
    default:
      return 'agent.activity.updated'
  }
}

function agentRuntimeActivityTitle(patch: AgentConversationRuntimePatch): string {
  if (patch.error) return 'Agent run failed'
  if (patch.approving) return 'Agent waiting for approval'
  if (patch.stopping) return 'Agent stopping'
  if (patch.building) return 'Agent preparing request'
  if (patch.loading) return 'Agent running'
  return 'Agent runtime updated'
}

function publishAgentRunStepActivity(
  conversationId: string | undefined,
  projectId: number | undefined,
  run: AgentRun | AgentPageTaskRun | undefined,
): void {
  if (!run || !('steps' in run) || !Array.isArray(run.steps)) return
  for (const step of run.steps) {
    if (!isAgentToolStep(step)) continue
    const status = agentToolStatus(step.status)
    publishAgentTaskActivity(agentToolTopicForStatus(status), {
      conversationId,
      threadId: run.threadId,
      runId: run.id,
      projectId,
      activityId: step.id,
      kind: 'tool_call',
      title: step.toolName || 'Agent tool',
      summary: typeof step.error === 'string' ? step.error : undefined,
      status,
      origin: 'agent-mcp',
      toolName: step.toolName,
      rawRef: { type: 'agent_run_step', id: step.id },
    }, `run:${run.id}:step:${step.id}:${status}`)
  }
}

function publishAgentPlanActivity(conversationId: string, run: AgentRun): void {
  const planId = stringValue((run as unknown as { planId?: unknown }).planId)
    ?? stringValue((run as unknown as { plan?: { id?: unknown } }).plan?.id)
  const planSummary = stringValue((run as unknown as { planSummary?: unknown }).planSummary)
    ?? stringValue((run as unknown as { plan?: { summary?: unknown; title?: unknown } }).plan?.summary)
    ?? stringValue((run as unknown as { plan?: { title?: unknown } }).plan?.title)
  if (!planId && !planSummary) return
  publishAgentTaskActivity('agent.plan.updated', {
    conversationId,
    threadId: run.threadId,
    runId: run.id,
    activityId: planId ?? `${run.id}:plan`,
    kind: 'plan',
    title: 'Agent plan updated',
    summary: planSummary,
    status: agentActivityStatusFromRun(run),
    origin: 'agent',
    rawRef: { type: 'agent_run_plan', id: planId ?? run.id },
  }, `run:${run.id}:plan:${planId ?? planSummary ?? ''}`)
}

function publishAgentRunInteractionRequests(
  conversationId: string | undefined,
  projectId: number | undefined,
  run: AgentRun | AgentPageTaskRun | undefined,
): void {
  if (!run || !('pendingInputRequests' in run || 'pendingApprovals' in run)) return
  const threadId = stringValue((run as { threadId?: unknown }).threadId)
  const runId = stringValue((run as { id?: unknown }).id)
  for (const request of Array.isArray((run as { pendingInputRequests?: unknown }).pendingInputRequests) ? (run as { pendingInputRequests: unknown[] }).pendingInputRequests : []) {
    if (!isPendingInteractionRequest(request)) continue
    publishAgentTaskActivity('agent.user-input.requested', {
      conversationId,
      threadId,
      runId,
      projectId,
      activityId: request.id,
      kind: 'user_input',
      title: request.title ?? 'Agent needs input',
      summary: request.prompt,
      status: 'requires_action',
      origin: 'agent',
      rawRef: { type: 'agent_pending_input_request', id: request.id },
    }, `run:${runId ?? 'unknown'}:input:${request.id}:${request.updatedAt ?? ''}`)
  }
  for (const approval of Array.isArray((run as { pendingApprovals?: unknown }).pendingApprovals) ? (run as { pendingApprovals: unknown[] }).pendingApprovals : []) {
    if (!isPendingInteractionRequest(approval)) continue
    publishAgentTaskActivity('agent.approval.requested', {
      conversationId,
      threadId,
      runId,
      projectId,
      activityId: approval.id,
      kind: 'approval',
      title: approval.title ?? 'Agent approval requested',
      summary: approval.prompt ?? approval.reason,
      status: 'requires_action',
      origin: 'agent',
      rawRef: { type: 'agent_pending_approval_request', id: approval.id },
    }, `run:${runId ?? 'unknown'}:approval:${approval.id}:${approval.updatedAt ?? ''}`)
  }
}

function isAgentToolStep(step: unknown): step is {
  id: string
  type: string
  status?: string
  toolName?: string
  error?: unknown
} {
  return !!step
    && typeof step === 'object'
    && (step as { type?: unknown }).type === 'tool_call'
    && typeof (step as { id?: unknown }).id === 'string'
}

function isPendingInteractionRequest(value: unknown): value is {
  id: string
  status?: string
  title?: string
  prompt?: string
  reason?: string
  updatedAt?: string
} {
  return !!value
    && typeof value === 'object'
    && typeof (value as { id?: unknown }).id === 'string'
    && ((value as { status?: unknown }).status === undefined || (value as { status?: unknown }).status === 'pending')
}

function agentToolStatus(status: string | undefined): AgentActivityStatus {
  switch (status) {
    case 'completed':
    case 'success':
      return 'completed'
    case 'failed':
    case 'error':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    case 'pending':
      return 'pending'
    default:
      return 'running'
  }
}

function agentToolTopicForStatus(status: AgentActivityStatus): AgentActivityTopic {
  switch (status) {
    case 'completed':
      return 'agent.tool.completed'
    case 'failed':
      return 'agent.tool.failed'
    default:
      return 'agent.tool.started'
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
