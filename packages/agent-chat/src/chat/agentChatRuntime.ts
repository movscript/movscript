import { agentChatRecentCapabilityEventEntryId } from './agentChatRecentCapabilityEvents.js'
import {
  agentChatNotificationEventShouldDisplayAsRecent,
  agentChatVisibleThreadItemViewId,
  buildAgentChatVisibleItems,
  dispatchAgentChatNotification,
  type AgentChatVisibleThreadItem,
  type AgentChatPendingUserItem,
  type AgentChatRealtimeAudioItem,
  type AgentChatRealtimeTranscriptItem,
  type AgentChatStreamingAgentItem,
} from './agentChatNotificationDispatcher.js'
import {
  resolveAgentChatPendingServerRequest,
  upsertAgentChatPendingServerRequest,
  visibleAgentChatPendingServerRequests,
  type AgentChatPendingServerRequestQueueEntry,
  type AgentChatPendingServerRequestResolver,
} from './agentChatPendingServerRequests.js'
import type {
  AgentChatNotification,
  AgentChatNotificationEvent,
  AgentChatServerRequest,
  AgentChatServerRequestResponse,
  AgentChatThread,
  AgentChatThreadReadInput,
  AgentChatTurn,
} from './agentChatProtocol.js'
import type { AgentChatThreadItem } from './agentChatThreadItems.js'

export type AgentChatRuntimeStatusSummaryTone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand'

export interface AgentChatRuntimeStatusSummaryEntry {
  id: string
  threadId?: string | null
  title: string
  detail?: string
  badge?: string
  tone?: AgentChatRuntimeStatusSummaryTone
  updatedAt: number
}

export interface AgentChatRuntimeRecentCapabilityEvent {
  id: string
  event: AgentChatNotificationEvent
}

export type AgentChatRuntimePendingServerRequest = AgentChatPendingServerRequestQueueEntry

export type AgentChatRuntimeThreadReadRequestStatus = 'pending' | 'inFlight'

export interface AgentChatRuntimeThreadReadRequest {
  id: number
  threadId: string
  status: AgentChatRuntimeThreadReadRequestStatus
  input: AgentChatThreadReadInput
  refreshAfterInFlight?: boolean
}

export interface AgentChatRuntimeThreadReadState {
  threadId: string
  earliestTurnId?: string
  latestTurnId?: string
  earliestItemId?: string
  latestItemId?: string
  loadedTurnCount: number
  loadedItemCount: number
  hasCompleteHistory: boolean
}

export type AgentChatRuntimeThreadResumeRequestStatus = 'pending' | 'inFlight'
export type AgentChatRuntimeManagedThreadResumeStatus = 'pending' | 'inFlight' | 'resumed' | 'failed'

export interface AgentChatRuntimeThreadResumeRequest {
  id: number
  threadId: string
  status: AgentChatRuntimeThreadResumeRequestStatus
  refreshAfterInFlight?: boolean
}

export interface AgentChatRuntimeManagedThreadResumeState {
  threadId: string
  status: AgentChatRuntimeManagedThreadResumeStatus
  error?: string
}

export type AgentChatRuntimeThreadLifecycleStatus = 'draft' | 'materializing' | 'ready' | 'failed'

export interface AgentChatRuntimeThreadLifecycleState {
  threadId: string
  status: AgentChatRuntimeThreadLifecycleStatus
  error?: string
}

export interface AgentChatRuntimeState {
  threads: AgentChatThread[]
  activeThreadId: string | null
  pendingUserItems: AgentChatPendingUserItem[]
  pendingServerRequests: AgentChatRuntimePendingServerRequest[]
  recentCapabilityEvents: AgentChatRuntimeRecentCapabilityEvent[]
  statusSummaryEntries: AgentChatRuntimeStatusSummaryEntry[]
  streamingAgentItems: Record<string, AgentChatStreamingAgentItem>
  realtimeTranscriptItems: Record<string, AgentChatRealtimeTranscriptItem>
  realtimeAudioItems: Record<string, AgentChatRealtimeAudioItem>
  threadReadRequests: AgentChatRuntimeThreadReadRequest[]
  nextThreadReadRequestId: number
  threadReadStates: Record<string, AgentChatRuntimeThreadReadState>
  threadResumeRequests: AgentChatRuntimeThreadResumeRequest[]
  nextThreadResumeRequestId: number
  managedThreadResumes: Record<string, AgentChatRuntimeManagedThreadResumeState>
  threadLifecycles: Record<string, AgentChatRuntimeThreadLifecycleState>
}

export interface AgentChatRuntimeView {
  activeThread: AgentChatThread | null
  activeTurn: AgentChatTurn | null
  historyThreads: AgentChatThread[]
  visibleItems: AgentChatVisibleThreadItem[]
  visiblePendingServerRequests: AgentChatRuntimePendingServerRequest[]
  visibleStatusItems: AgentChatRuntimeStatusSummaryEntry[]
}

export const AGENT_CHAT_VISIBLE_ITEM_WINDOW_INITIAL_SIZE = 5
export const AGENT_CHAT_VISIBLE_ITEM_WINDOW_PAGE_SIZE = 20
export const AGENT_CHAT_THREAD_READ_INITIAL_LIMIT = 1
export const AGENT_CHAT_THREAD_READ_INCREMENTAL_LIMIT = 1

export interface AgentChatVisibleItemWindow<TItem> {
  hiddenCount: number
  nextVisibleCount: number
  totalCount: number
  visibleCount: number
  visibleItems: TItem[]
}

export type AgentChatRuntimeAction =
  | { type: 'reset'; activeThreadId: string | null }
  | { type: 'setActiveThreadId'; threadId: string | null }
  | { type: 'setThreads'; threads: AgentChatThread[] }
  | { type: 'updateThreads'; update: (current: AgentChatThread[]) => AgentChatThread[] }
  | { type: 'upsertThread'; thread: AgentChatThread; lifecycleStatus?: AgentChatRuntimeThreadLifecycleStatus }
  | { type: 'upsertThreadReadResult'; thread: AgentChatThread; input?: AgentChatThreadReadInput }
  | { type: 'removeThread'; threadId: string }
  | { type: 'appendPendingUserItem'; item: AgentChatPendingUserItem }
  | { type: 'updatePendingServerRequests'; update: (current: AgentChatRuntimePendingServerRequest[]) => AgentChatRuntimePendingServerRequest[] }
  | { type: 'enqueueServerRequest'; request: AgentChatServerRequest; resolve: AgentChatPendingServerRequestResolver }
  | { type: 'resolveServerRequest'; request: AgentChatServerRequest; response: AgentChatServerRequestResponse | undefined }
  | { type: 'setStreamingAgentItems'; items: Record<string, AgentChatStreamingAgentItem> }
  | { type: 'updateStreamingAgentItems'; update: (current: Record<string, AgentChatStreamingAgentItem>) => Record<string, AgentChatStreamingAgentItem> }
  | { type: 'setRealtimeTranscriptItems'; items: Record<string, AgentChatRealtimeTranscriptItem> }
  | { type: 'setRealtimeAudioItems'; items: Record<string, AgentChatRealtimeAudioItem> }
  | { type: 'applyNotification'; notification: AgentChatNotification; nowMs: number; recentEventSequence: number }
  | { type: 'requestThreadRead'; threadId: string; direction?: AgentChatThreadReadInput['direction'] }
  | { type: 'beginThreadReadRequest'; requestId: number }
  | { type: 'completeThreadReadRequest'; requestId: number }
  | { type: 'clearThreadReadRequest'; requestId: number }
  | { type: 'requestThreadResume'; threadId: string }
  | { type: 'beginThreadResumeRequest'; requestId: number }
  | { type: 'completeThreadResumeRequest'; requestId: number; thread?: AgentChatThread; error?: string }
  | { type: 'clearThreadResumeRequest'; requestId: number }
  | { type: 'markThreadMaterializing'; threadId: string }
  | { type: 'markThreadReady'; threadId: string }
  | { type: 'markThreadFailed'; threadId: string; error?: string }

export function createAgentChatRuntimeState(activeThreadId: string | null = null): AgentChatRuntimeState {
  return {
    threads: [],
    activeThreadId,
    pendingUserItems: [],
    pendingServerRequests: [],
    recentCapabilityEvents: [],
    statusSummaryEntries: [],
    streamingAgentItems: {},
    realtimeTranscriptItems: {},
    realtimeAudioItems: {},
    threadReadRequests: [],
    nextThreadReadRequestId: 1,
    threadReadStates: {},
    threadResumeRequests: [],
    nextThreadResumeRequestId: 1,
    managedThreadResumes: {},
    threadLifecycles: {},
  }
}

export function agentChatRuntimeReducer(
  state: AgentChatRuntimeState,
  action: AgentChatRuntimeAction,
): AgentChatRuntimeState {
  switch (action.type) {
    case 'reset':
      return createAgentChatRuntimeState(action.activeThreadId)
    case 'setActiveThreadId':
      return state.activeThreadId === action.threadId
        ? state
        : requestAgentChatRuntimeActiveThreadResume(resetAgentChatRuntimeFailedThreadResume({
          ...state,
          activeThreadId: action.threadId,
        }, action.threadId))
    case 'setThreads':
      return requestAgentChatRuntimeActiveThreadResume({
        ...state,
        threads: action.threads,
        pendingUserItems: removeAgentChatRuntimeConfirmedPendingUserItems(state.pendingUserItems, action.threads),
        threadReadStates: updateAgentChatRuntimeThreadReadStates(state.threadReadStates, action.threads),
      })
    case 'updateThreads':
      return { ...state, threads: action.update(state.threads) }
    case 'upsertThread':
      return upsertAgentChatRuntimeThreadResult(state, action.thread, undefined, action.lifecycleStatus)
    case 'upsertThreadReadResult':
      return upsertAgentChatRuntimeThreadResult(state, action.thread, action.input)
    case 'removeThread':
      return removeAgentChatRuntimeThread(state, action.threadId)
    case 'appendPendingUserItem':
      return { ...state, pendingUserItems: appendAgentChatRuntimePendingUserItem(state.pendingUserItems, action.item) }
    case 'updatePendingServerRequests':
      return { ...state, pendingServerRequests: action.update(state.pendingServerRequests) }
    case 'enqueueServerRequest':
      return {
        ...state,
        pendingServerRequests: upsertAgentChatPendingServerRequest(state.pendingServerRequests, action.request, action.resolve),
      }
    case 'resolveServerRequest':
      return {
        ...state,
        pendingServerRequests: resolveAgentChatPendingServerRequest(state.pendingServerRequests, action.request, action.response),
      }
    case 'setStreamingAgentItems':
      return { ...state, streamingAgentItems: action.items }
    case 'updateStreamingAgentItems':
      return { ...state, streamingAgentItems: action.update(state.streamingAgentItems) }
    case 'setRealtimeTranscriptItems':
      return { ...state, realtimeTranscriptItems: action.items }
    case 'setRealtimeAudioItems':
      return { ...state, realtimeAudioItems: action.items }
    case 'applyNotification':
      return applyAgentChatRuntimeNotification(state, action.notification, {
        nowMs: action.nowMs,
        recentEventSequence: action.recentEventSequence,
      })
    case 'requestThreadRead':
      return queueAgentChatRuntimeThreadReadRequest(state, action.threadId, action.direction)
    case 'beginThreadReadRequest':
      return {
        ...state,
        threadReadRequests: state.threadReadRequests.map((request) => request.id === action.requestId
          ? {
            ...request,
            status: 'inFlight',
            refreshAfterInFlight: false,
            input: buildAgentChatRuntimeThreadReadInput(state, request.threadId, request.input.direction),
          }
          : request),
      }
    case 'completeThreadReadRequest':
      return {
        ...state,
        threadReadRequests: state.threadReadRequests.flatMap((request) => {
          if (request.id !== action.requestId) return [request]
          return request.refreshAfterInFlight
            ? [{ ...request, status: 'pending', refreshAfterInFlight: false }]
            : []
        }),
      }
    case 'clearThreadReadRequest':
      return {
        ...state,
        threadReadRequests: state.threadReadRequests.filter((request) => request.id !== action.requestId),
      }
    case 'requestThreadResume':
      return queueAgentChatRuntimeThreadResumeRequest(state, action.threadId)
    case 'beginThreadResumeRequest':
      return beginAgentChatRuntimeThreadResumeRequest(state, action.requestId)
    case 'completeThreadResumeRequest':
      return completeAgentChatRuntimeThreadResumeRequest(state, action.requestId, {
        thread: action.thread,
        error: action.error,
      })
    case 'clearThreadResumeRequest':
      return {
        ...state,
        threadResumeRequests: state.threadResumeRequests.filter((request) => request.id !== action.requestId),
      }
    case 'markThreadMaterializing':
      return markAgentChatRuntimeThreadLifecycle(state, action.threadId, 'materializing')
    case 'markThreadReady':
      return markAgentChatRuntimeThreadLifecycle(state, action.threadId, 'ready')
    case 'markThreadFailed':
      return markAgentChatRuntimeThreadLifecycle(state, action.threadId, 'failed', action.error)
  }
}

export function upsertAgentChatRuntimeThread(
  threads: AgentChatThread[],
  thread: AgentChatThread,
): AgentChatThread[] {
  const without = threads.filter((item) => item.id !== thread.id)
  return [thread, ...without].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function mergeAgentChatRuntimeThreadReadResult(
  current: AgentChatThread | undefined,
  incoming: AgentChatThread,
  input: AgentChatThreadReadInput = {},
): AgentChatThread {
  if (!current || !agentChatRuntimeThreadReadInputIsIncremental(input)) return incoming
  if (input.direction === 'older') {
    return {
      ...incoming,
      ...current,
      turns: mergeAgentChatRuntimeTurns(current.turns, incoming.turns, input),
    }
  }
  return {
    ...current,
    ...incoming,
    turns: mergeAgentChatRuntimeTurns(current.turns, incoming.turns, input),
  }
}

export function buildAgentChatRuntimeThreadReadInput(
  state: AgentChatRuntimeState,
  threadId: string,
  direction: AgentChatThreadReadInput['direction'] = 'newer',
): AgentChatThreadReadInput {
  const normalizedThreadId = threadId.trim()
  const readState = normalizedThreadId ? state.threadReadStates[normalizedThreadId] : undefined
  if (direction === 'older') {
    return compactAgentChatThreadReadInput({
      includeTurns: true,
      beforeTurnId: readState?.earliestTurnId ?? null,
      beforeItemId: readState?.earliestItemId ?? null,
      limit: AGENT_CHAT_THREAD_READ_INCREMENTAL_LIMIT,
      direction: 'older',
    })
  }
  return compactAgentChatThreadReadInput({
    includeTurns: true,
    afterTurnId: readState?.latestTurnId ?? null,
    afterItemId: readState?.latestItemId ?? null,
    limit: readState?.latestItemId
      ? AGENT_CHAT_THREAD_READ_INCREMENTAL_LIMIT
      : AGENT_CHAT_THREAD_READ_INITIAL_LIMIT,
    direction: 'newer',
  })
}

export function agentChatRuntimeThreadReadStateFromThread(
  thread: AgentChatThread,
  input: AgentChatThreadReadInput = {},
): AgentChatRuntimeThreadReadState {
  const items = agentChatRuntimeThreadItems(thread)
  const limit = normalizedAgentChatThreadReadLimit(input.limit)
  const countForLimit = thread.turns.length
  return {
    threadId: thread.id,
    earliestTurnId: thread.turns[0]?.id,
    latestTurnId: thread.turns.at(-1)?.id,
    earliestItemId: items[0]?.id,
    latestItemId: items.at(-1)?.id,
    loadedTurnCount: thread.turns.length,
    loadedItemCount: items.length,
    hasCompleteHistory: !limit || countForLimit < limit,
  }
}

export function selectAgentChatRuntimeView(state: AgentChatRuntimeState): AgentChatRuntimeView {
  const activeThread = state.threads.find((thread) => thread.id === state.activeThreadId) ?? null
  const visiblePendingServerRequests = visibleAgentChatPendingServerRequests(state.pendingServerRequests, state.activeThreadId)
  return {
    activeThread,
    activeTurn: activeThread?.turns.find(agentChatRuntimeTurnIsActive) ?? null,
    historyThreads: state.activeThreadId
      ? state.threads.filter((thread) => thread.id !== state.activeThreadId)
      : state.threads,
    visibleItems: activeThread
      ? buildAgentChatVisibleItems(
        activeThread,
        state.pendingUserItems,
        state.streamingAgentItems,
        state.realtimeTranscriptItems,
        state.realtimeAudioItems,
      )
      : buildAgentChatPendingUserVisibleItems(state.pendingUserItems, state.activeThreadId),
    visiblePendingServerRequests,
    visibleStatusItems: agentChatRuntimeVisibleStatusItems(state, visiblePendingServerRequests),
  }
}

function agentChatRuntimeVisibleStatusItems(
  state: AgentChatRuntimeState,
  visiblePendingServerRequests: AgentChatRuntimePendingServerRequest[],
): AgentChatRuntimeStatusSummaryEntry[] {
  const statusItems = state.statusSummaryEntries
    .filter((item) => !item.threadId || item.threadId === state.activeThreadId)
  const activeThread = state.threads.find((thread) => thread.id === state.activeThreadId) ?? null
  const activeTurn = activeThread?.turns.find(agentChatRuntimeTurnIsActive) ?? null
  const activeThreadStatus = activeThread ? String(activeThread.status) : undefined

  if (activeThread && (activeThreadStatus === 'running' || activeThreadStatus === 'requires_action' || activeTurn)) {
    statusItems.push({
      id: `active-thread:${activeThread.id}`,
      threadId: activeThread.id,
      title: 'Agent run',
      detail: activeTurn ? 'A turn is currently active.' : undefined,
      badge: activeThreadStatus === 'requires_action' ? 'waiting' : 'running',
      tone: activeThreadStatus === 'requires_action' ? 'warning' : 'brand',
      updatedAt: Number.MAX_SAFE_INTEGER - 1,
    })
  }

  if (visiblePendingServerRequests.length > 0) {
    statusItems.push({
      id: `pending-server-request:${state.activeThreadId ?? 'global'}`,
      ...(state.activeThreadId ? { threadId: state.activeThreadId } : {}),
      title: 'Waiting for user',
      detail: visiblePendingServerRequests.length === 1
        ? 'A tool request needs approval or input.'
        : `${visiblePendingServerRequests.length} tool requests need approval or input.`,
      badge: 'action required',
      tone: 'warning',
      updatedAt: Number.MAX_SAFE_INTEGER,
    })
  }

  return statusItems
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 8)
}

export function selectAgentChatRuntimePendingThreadReadRequests(
  state: AgentChatRuntimeState,
): AgentChatRuntimeThreadReadRequest[] {
  return state.threadReadRequests.filter((request) => request.status === 'pending')
}

export function selectAgentChatRuntimePendingThreadResumeRequests(
  state: AgentChatRuntimeState,
): AgentChatRuntimeThreadResumeRequest[] {
  return state.threadResumeRequests.filter((request) => request.status === 'pending')
}

export function agentChatRuntimeThreadCanReadTurns(state: AgentChatRuntimeState, threadId: string | null | undefined): boolean {
  const normalizedThreadId = threadId?.trim()
  if (!normalizedThreadId) return false
  const lifecycle = state.threadLifecycles[normalizedThreadId]
  return !lifecycle || lifecycle.status === 'ready'
}

export function agentChatThreadShouldKeepResumed(thread: Pick<AgentChatThread, 'status'>): boolean {
  return thread.status === 'running'
}

export function buildAgentChatVisibleItemWindow<TItem>(input: {
  items: TItem[]
  visibleCount: number
  pageSize?: number
  keepItem?: (item: TItem) => boolean
}): AgentChatVisibleItemWindow<TItem> {
  const totalCount = input.items.length
  const normalizedVisibleCount = Math.max(1, Math.floor(input.visibleCount))
  const normalizedPageSize = Math.max(1, Math.floor(input.pageSize ?? AGENT_CHAT_VISIBLE_ITEM_WINDOW_PAGE_SIZE))
  let startIndex = Math.max(0, totalCount - normalizedVisibleCount)
  if (input.keepItem) {
    for (let index = 0; index < input.items.length; index += 1) {
      if (input.keepItem(input.items[index] as TItem)) startIndex = Math.min(startIndex, index)
    }
  }
  const hiddenCount = startIndex
  const effectiveVisibleCount = totalCount - hiddenCount
  return {
    hiddenCount,
    nextVisibleCount: Math.min(totalCount, effectiveVisibleCount + normalizedPageSize),
    totalCount,
    visibleCount: effectiveVisibleCount,
    visibleItems: hiddenCount > 0 ? input.items.slice(hiddenCount) : input.items,
  }
}

export function queueAgentChatRuntimeThreadResumeRequest(
  state: AgentChatRuntimeState,
  threadId: string,
): AgentChatRuntimeState {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) return state

  const managed = state.managedThreadResumes[normalizedThreadId]
  const existing = state.threadResumeRequests.find((request) => request.threadId === normalizedThreadId)
  if (!existing && managed?.status === 'resumed') return state

  if (!existing) {
    return {
      ...state,
      threadResumeRequests: [
        ...state.threadResumeRequests,
        {
          id: state.nextThreadResumeRequestId,
          threadId: normalizedThreadId,
          status: 'pending',
        },
      ],
      nextThreadResumeRequestId: state.nextThreadResumeRequestId + 1,
      managedThreadResumes: {
        ...state.managedThreadResumes,
        [normalizedThreadId]: { threadId: normalizedThreadId, status: 'pending' },
      },
    }
  }

  if (existing.status !== 'inFlight' || existing.refreshAfterInFlight) return state
  return {
    ...state,
    threadResumeRequests: state.threadResumeRequests.map((request) => request.id === existing.id
      ? { ...request, refreshAfterInFlight: true }
      : request),
  }
}

export function queueAgentChatRuntimeThreadReadRequest(
  state: AgentChatRuntimeState,
  threadId: string,
  direction: AgentChatThreadReadInput['direction'] = 'newer',
): AgentChatRuntimeState {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) return state
  if (!agentChatRuntimeThreadCanReadTurns(state, normalizedThreadId)) return state
  const input = buildAgentChatRuntimeThreadReadInput(state, normalizedThreadId, direction)
  const existing = state.threadReadRequests.find((request) => (
    request.threadId === normalizedThreadId
    && (request.input.direction ?? 'newer') === (input.direction ?? 'newer')
  ))
  if (!existing) {
    return {
      ...state,
      threadReadRequests: [
        ...state.threadReadRequests,
        {
          id: state.nextThreadReadRequestId,
          threadId: normalizedThreadId,
          status: 'pending',
          input,
        },
      ],
      nextThreadReadRequestId: state.nextThreadReadRequestId + 1,
    }
  }
  if (existing.status !== 'inFlight' || existing.refreshAfterInFlight) return state
  return {
    ...state,
    threadReadRequests: state.threadReadRequests.map((request) => request.id === existing.id
      ? { ...request, refreshAfterInFlight: true }
      : request),
  }
}

function upsertAgentChatRuntimeThreadResult(
  state: AgentChatRuntimeState,
  thread: AgentChatThread,
  input: AgentChatThreadReadInput = {},
  lifecycleStatus: AgentChatRuntimeThreadLifecycleStatus = 'ready',
): AgentChatRuntimeState {
  const current = state.threads.find((item) => item.id === thread.id)
  const existingReadState = state.threadReadStates[thread.id]
  const mergedThread = mergeAgentChatRuntimeThreadReadResult(current, thread, input)
  const mergedReadState = agentChatRuntimeThreadReadStateFromThread(mergedThread, input)
  const incomingItemCount = agentChatRuntimeThreadItems(thread).length
  const incomingTurnCount = thread.turns.length
  const limit = normalizedAgentChatThreadReadLimit(input.limit)
  const incomingCount = incomingTurnCount
  const olderReadReachedStart = input.direction === 'older' && Boolean(input.beforeItemId || input.beforeTurnId) && (
    incomingCount === 0
    || (limit !== undefined && incomingCount < limit)
    || agentChatRuntimeEarliestCursorUnchanged(existingReadState, mergedReadState)
  )
  return requestAgentChatRuntimeActiveThreadResume(markAgentChatRuntimeThreadLifecycle({
    ...state,
    threads: upsertAgentChatRuntimeThread(state.threads, mergedThread),
    pendingUserItems: removeAgentChatRuntimeConfirmedPendingUserItems(state.pendingUserItems, [mergedThread]),
    threadReadStates: {
      ...state.threadReadStates,
      [mergedThread.id]: agentChatRuntimeThreadReadInputIsIncremental(input)
        ? { ...mergedReadState, hasCompleteHistory: olderReadReachedStart || existingReadState?.hasCompleteHistory || false }
        : mergedReadState,
    },
  }, mergedThread.id, lifecycleStatus))
}

function removeAgentChatRuntimeThread(
  state: AgentChatRuntimeState,
  threadId: string,
): AgentChatRuntimeState {
  const nextReadStates = { ...state.threadReadStates }
  delete nextReadStates[threadId]
  const nextManagedThreadResumes = { ...state.managedThreadResumes }
  delete nextManagedThreadResumes[threadId]
  const nextThreadLifecycles = { ...state.threadLifecycles }
  delete nextThreadLifecycles[threadId]
  return {
    ...state,
    threads: state.threads.filter((thread) => thread.id !== threadId),
    threadReadRequests: state.threadReadRequests.filter((request) => request.threadId !== threadId),
    threadReadStates: nextReadStates,
    threadResumeRequests: state.threadResumeRequests.filter((request) => request.threadId !== threadId),
    managedThreadResumes: nextManagedThreadResumes,
    threadLifecycles: nextThreadLifecycles,
  }
}

function markAgentChatRuntimeThreadLifecycle(
  state: AgentChatRuntimeState,
  threadId: string,
  status: AgentChatRuntimeThreadLifecycleStatus,
  error?: string,
): AgentChatRuntimeState {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) return state
  const current = state.threadLifecycles[normalizedThreadId]
  if (current?.status === status && current.error === error) return state
  return {
    ...state,
    threadLifecycles: {
      ...state.threadLifecycles,
      [normalizedThreadId]: {
        threadId: normalizedThreadId,
        status,
        ...(error ? { error } : {}),
      },
    },
  }
}

function beginAgentChatRuntimeThreadResumeRequest(
  state: AgentChatRuntimeState,
  requestId: number,
): AgentChatRuntimeState {
  const request = state.threadResumeRequests.find((item) => item.id === requestId)
  if (!request) return state
  return {
    ...state,
    threadResumeRequests: state.threadResumeRequests.map((item) => item.id === requestId
      ? { ...item, status: 'inFlight', refreshAfterInFlight: false }
      : item),
    managedThreadResumes: {
      ...state.managedThreadResumes,
      [request.threadId]: { threadId: request.threadId, status: 'inFlight' },
    },
  }
}

function completeAgentChatRuntimeThreadResumeRequest(
  state: AgentChatRuntimeState,
  requestId: number,
  input: { thread?: AgentChatThread; error?: string },
): AgentChatRuntimeState {
  const request = state.threadResumeRequests.find((item) => item.id === requestId)
  if (!request) return state

  let next: AgentChatRuntimeState = {
    ...state,
    threadResumeRequests: state.threadResumeRequests.filter((item) => item.id !== requestId),
    managedThreadResumes: {
      ...state.managedThreadResumes,
      [request.threadId]: input.error
        ? { threadId: request.threadId, status: 'failed', error: input.error }
        : { threadId: request.threadId, status: 'resumed' },
    },
  }
  if (input.thread) next = upsertAgentChatRuntimeThreadResult(next, input.thread)
  return next
}

function requestAgentChatRuntimeActiveThreadResume(state: AgentChatRuntimeState): AgentChatRuntimeState {
  const activeThread = state.activeThreadId
    ? state.threads.find((thread) => thread.id === state.activeThreadId)
    : undefined
  const activeManagedResume = activeThread ? state.managedThreadResumes[activeThread.id] : undefined
  if (activeManagedResume?.status === 'failed') return state
  return activeThread && agentChatThreadShouldKeepResumed(activeThread)
    ? queueAgentChatRuntimeThreadResumeRequest(state, activeThread.id)
    : state
}

function resetAgentChatRuntimeFailedThreadResume(
  state: AgentChatRuntimeState,
  threadId: string | null,
): AgentChatRuntimeState {
  const normalizedThreadId = threadId?.trim()
  if (!normalizedThreadId || state.managedThreadResumes[normalizedThreadId]?.status !== 'failed') return state
  const nextManagedThreadResumes = { ...state.managedThreadResumes }
  delete nextManagedThreadResumes[normalizedThreadId]
  return {
    ...state,
    managedThreadResumes: nextManagedThreadResumes,
  }
}

function updateAgentChatRuntimeThreadReadStates(
  current: Record<string, AgentChatRuntimeThreadReadState>,
  threads: AgentChatThread[],
): Record<string, AgentChatRuntimeThreadReadState> {
  const next: Record<string, AgentChatRuntimeThreadReadState> = { ...current }
  for (const thread of threads) {
    next[thread.id] = agentChatRuntimeThreadReadStateFromThread(thread)
  }
  return next
}

function agentChatRuntimeEarliestCursorUnchanged(
  existing: AgentChatRuntimeThreadReadState | undefined,
  next: AgentChatRuntimeThreadReadState,
): boolean {
  if (!existing) return false
  if (existing.earliestItemId || next.earliestItemId) {
    return existing.earliestItemId === next.earliestItemId
  }
  return existing.earliestTurnId === next.earliestTurnId
}

function mergeAgentChatRuntimeTurns(
  currentTurns: AgentChatTurn[],
  incomingTurns: AgentChatTurn[],
  input: AgentChatThreadReadInput,
): AgentChatTurn[] {
  const incomingById = new Map(incomingTurns.map((turn) => [turn.id, turn]))
  const currentIds = new Set(currentTurns.map((turn) => turn.id))
  const mergedExisting = currentTurns.map((turn) => {
    const incoming = incomingById.get(turn.id)
    return incoming ? mergeAgentChatRuntimeTurn(turn, incoming, input) : turn
  })
  const newTurns = incomingTurns.filter((turn) => !currentIds.has(turn.id))
  return input.direction === 'older'
    ? [...newTurns, ...mergedExisting]
    : [...mergedExisting, ...newTurns]
}

function mergeAgentChatRuntimeTurn(
  current: AgentChatTurn,
  incoming: AgentChatTurn,
  input: AgentChatThreadReadInput,
): AgentChatTurn {
  return {
    ...current,
    ...incoming,
    items: mergeAgentChatRuntimeThreadItems(current.items, incoming.items, input.direction),
  }
}

function mergeAgentChatRuntimeThreadItems(
  currentItems: AgentChatThreadItem[],
  incomingItems: AgentChatThreadItem[],
  direction: AgentChatThreadReadInput['direction'] = 'newer',
): AgentChatThreadItem[] {
  const incomingById = new Map(incomingItems.map((item) => [item.id, item]))
  const currentIds = new Set(currentItems.map((item) => item.id))
  const mergedExisting = currentItems.map((item) => incomingById.get(item.id) ?? item)
  const newItems = incomingItems.filter((item) => !currentIds.has(item.id))
  return direction === 'older'
    ? [...newItems, ...mergedExisting]
    : [...mergedExisting, ...newItems]
}

function agentChatRuntimeThreadItems(thread: AgentChatThread): AgentChatThreadItem[] {
  return thread.turns.flatMap((turn) => turn.items)
}

function buildAgentChatPendingUserVisibleItems(
  pendingUserItems: AgentChatPendingUserItem[],
  activeThreadId: string | null,
): AgentChatVisibleThreadItem[] {
  if (!activeThreadId) return []
  const viewIds = new Set<string>()
  const items: AgentChatVisibleThreadItem[] = []
  for (const pending of pendingUserItems) {
    if (pending.threadId !== activeThreadId) continue
    const viewId = agentChatVisibleThreadItemViewId('pending', pending.item)
    if (viewIds.has(viewId)) continue
    viewIds.add(viewId)
    items.push({ viewId, item: pending.item, streaming: false })
  }
  return items
}

function appendAgentChatRuntimePendingUserItem(
  pendingUserItems: AgentChatPendingUserItem[],
  item: AgentChatPendingUserItem,
): AgentChatPendingUserItem[] {
  const nextClientId = agentChatRuntimeUserMessageClientId(item.item)
  const existingIndex = pendingUserItems.findIndex((pending) => {
    if (pending.threadId !== item.threadId) return false
    const pendingClientId = agentChatRuntimeUserMessageClientId(pending.item)
    if (nextClientId && pendingClientId === nextClientId) return true
    return pending.item.id === item.item.id
  })
  if (existingIndex < 0) return [...pendingUserItems, item]
  return pendingUserItems.map((pending, index) => (index === existingIndex ? item : pending))
}

function removeAgentChatRuntimeConfirmedPendingUserItems(
  pendingUserItems: AgentChatPendingUserItem[],
  threads: AgentChatThread[],
): AgentChatPendingUserItem[] {
  const confirmedByThread = new Map<string, { itemIds: Set<string>; clientIds: Set<string> }>()
  for (const thread of threads) {
    const itemIds = new Set<string>()
    const clientIds = new Set<string>()
    for (const item of agentChatRuntimeThreadItems(thread)) {
      if (item.type !== 'userMessage') continue
      itemIds.add(item.id)
      const clientId = agentChatRuntimeUserMessageClientId(item)
      if (clientId) clientIds.add(clientId)
    }
    if (itemIds.size > 0 || clientIds.size > 0) {
      confirmedByThread.set(thread.id, { itemIds, clientIds })
    }
  }
  if (confirmedByThread.size === 0) return pendingUserItems
  return pendingUserItems.filter((pending) => {
    const confirmed = confirmedByThread.get(pending.threadId)
    if (!confirmed) return true
    const pendingClientId = agentChatRuntimeUserMessageClientId(pending.item)
    if (pendingClientId && confirmed.clientIds.has(pendingClientId)) return false
    return !confirmed.itemIds.has(pending.item.id)
  })
}

function agentChatRuntimeUserMessageClientId(item: AgentChatThreadItem): string | null {
  return item.type === 'userMessage' && item.clientId?.trim() ? item.clientId.trim() : null
}

function agentChatRuntimeThreadReadInputIsIncremental(input: AgentChatThreadReadInput): boolean {
  return Boolean(input.afterItemId || input.beforeItemId || input.afterTurnId || input.beforeTurnId)
}

function compactAgentChatThreadReadInput(input: AgentChatThreadReadInput): AgentChatThreadReadInput {
  const limit = normalizedAgentChatThreadReadLimit(input.limit)
  const next: AgentChatThreadReadInput = {}
  if (input.includeTurns !== undefined) next.includeTurns = input.includeTurns
  if (input.afterTurnId) next.afterTurnId = input.afterTurnId
  if (input.beforeTurnId) next.beforeTurnId = input.beforeTurnId
  if (input.afterItemId) next.afterItemId = input.afterItemId
  if (input.beforeItemId) next.beforeItemId = input.beforeItemId
  if (limit !== undefined) next.limit = limit
  if (input.direction) next.direction = input.direction
  return next
}

function normalizedAgentChatThreadReadLimit(limit: AgentChatThreadReadInput['limit']): number | undefined {
  return typeof limit === 'number' && Number.isFinite(limit) && limit > 0
    ? Math.floor(limit)
    : undefined
}

function agentChatRuntimeTurnIsActive(turn: AgentChatTurn): boolean {
  return turn.status === 'inProgress'
}

function applyAgentChatRuntimeNotification(
  state: AgentChatRuntimeState,
  notification: AgentChatNotification,
  input: { nowMs: number; recentEventSequence: number },
): AgentChatRuntimeState {
  let next: AgentChatRuntimeState = state
  const statusSummary = agentChatRuntimeStatusSummaryEntryFromNotification(notification, input.nowMs)
  if (statusSummary) {
    next = {
      ...next,
      statusSummaryEntries: upsertAgentChatRuntimeStatusSummaryEntry(next.statusSummaryEntries, statusSummary),
    }
  }
  if (
    notification.event
    && !agentChatRuntimeNotificationEventIsStatusSummary(notification.event)
    && agentChatNotificationEventShouldDisplayAsRecent(notification.event)
  ) {
    next = {
      ...next,
      recentCapabilityEvents: [
        {
          id: agentChatRecentCapabilityEventEntryId({
            method: notification.method,
            nowMs: input.nowMs,
            sequence: input.recentEventSequence,
          }),
          event: notification.event,
        },
        ...next.recentCapabilityEvents,
      ].slice(0, 6),
    }
  }

  dispatchAgentChatNotification<AgentChatRuntimePendingServerRequest>(notification, {
    upsertThread: (thread) => {
      next = { ...next, threads: upsertAgentChatRuntimeThread(next.threads, thread) }
    },
    updateThreads: (update) => {
      next = { ...next, threads: update(next.threads) }
    },
    activeThreadId: next.activeThreadId,
    setActiveThreadId: (threadId) => {
      next = { ...next, activeThreadId: threadId }
    },
    updatePendingUserItems: (update) => {
      next = { ...next, pendingUserItems: update(next.pendingUserItems) }
    },
    updatePendingServerRequests: (update) => {
      next = { ...next, pendingServerRequests: update(next.pendingServerRequests) }
    },
    updateStreamingAgentItems: (update) => {
      next = { ...next, streamingAgentItems: update(next.streamingAgentItems) }
    },
    readStreamingAgentItems: () => next.streamingAgentItems,
    updateRealtimeTranscriptItems: (update) => {
      next = { ...next, realtimeTranscriptItems: update(next.realtimeTranscriptItems) }
    },
    updateRealtimeAudioItems: (update) => {
      next = { ...next, realtimeAudioItems: update(next.realtimeAudioItems) }
    },
    readThread: (threadId) => {
      next = queueAgentChatRuntimeThreadReadRequest(next, threadId)
    },
  })

  return requestAgentChatRuntimeActiveThreadResume(next)
}

function agentChatRuntimeStatusSummaryEntryFromNotification(
  notification: AgentChatNotification,
  nowMs: number,
): AgentChatRuntimeStatusSummaryEntry | null {
  const params = isRecord(notification.params) ? notification.params : {}
  const threadId = stringValue(params.threadId)
  if (notification.event?.type === 'mcpStatus') {
    return {
      id: `mcp:${notification.event.server}`,
      title: `MCP ${notification.event.server}`,
      detail: notification.event.error ?? undefined,
      badge: notification.event.status,
      tone: agentChatRuntimeStatusTone(notification.event.status, notification.event.error),
      updatedAt: nowMs,
    }
  }
  if (notification.method === 'remoteControl/status/changed') {
    const status = stringValue(params.status) ?? 'updated'
    return {
      id: 'remote-control',
      title: 'Remote control',
      detail: [stringValue(params.server), stringValue(params.installation)].filter(Boolean).join(' · ') || undefined,
      badge: status,
      tone: agentChatRuntimeStatusTone(status),
      updatedAt: nowMs,
    }
  }
  if (notification.method === 'thread/tokenUsage/updated') {
    return {
      id: `token-usage:${threadId ?? 'global'}`,
      threadId,
      title: 'Token usage',
      detail: tokenUsageSummary(params.tokenUsage),
      badge: 'tokens',
      tone: 'neutral',
      updatedAt: nowMs,
    }
  }
  if (notification.method === 'thread/goal/updated') {
    const goal = isRecord(params.goal) ? params.goal : {}
    const status = stringValue(goal.status) ?? 'updated'
    const eventDetail = notification.event?.type === 'systemNotice' ? notification.event.detail ?? undefined : undefined
    return {
      id: `goal:${threadId ?? 'global'}`,
      threadId,
      title: 'Goal',
      detail: stringValue(goal.objective) ?? eventDetail,
      badge: status,
      tone: agentChatRuntimeStatusTone(status),
      updatedAt: nowMs,
    }
  }
  if (notification.method === 'thread/goal/cleared') {
    return {
      id: `goal:${threadId ?? 'global'}`,
      threadId,
      title: 'Goal',
      detail: 'Cleared',
      badge: 'cleared',
      tone: 'neutral',
      updatedAt: nowMs,
    }
  }
  return null
}

function upsertAgentChatRuntimeStatusSummaryEntry(
  current: AgentChatRuntimeStatusSummaryEntry[],
  entry: AgentChatRuntimeStatusSummaryEntry,
): AgentChatRuntimeStatusSummaryEntry[] {
  return [
    entry,
    ...current.filter((item) => item.id !== entry.id),
  ].slice(0, 24)
}

function agentChatRuntimeNotificationEventIsStatusSummary(event: AgentChatNotificationEvent): boolean {
  return event.type === 'mcpStatus'
    || (event.type === 'systemNotice' && event.code === 'remoteControl/status/changed')
    || (event.type === 'systemNotice' && event.code === 'thread/tokenUsage/updated')
    || (event.type === 'systemNotice' && event.code === 'thread/goal/updated')
    || (event.type === 'systemNotice' && event.code === 'thread/goal/cleared')
}

function tokenUsageSummary(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  const totalRecord = isRecord(value.total) ? value.total : value
  const lastRecord = isRecord(value.last) ? value.last : null
  const total = numberValue(totalRecord.total)
  const input = numberValue(totalRecord.input)
  const output = numberValue(totalRecord.output)
  const cached = numberValue(totalRecord.cached)
  const reasoning = numberValue(totalRecord.reasoning)
  const lastTotal = lastRecord ? numberValue(lastRecord.total) : undefined
  return [
    total !== undefined ? `total ${total}` : null,
    input !== undefined ? `input ${input}` : null,
    output !== undefined ? `output ${output}` : null,
    cached !== undefined ? `cached ${cached}` : null,
    reasoning !== undefined ? `reasoning ${reasoning}` : null,
    lastTotal !== undefined ? `last ${lastTotal}` : null,
  ].filter(Boolean).join(' · ') || undefined
}

function agentChatRuntimeStatusTone(status: string, error?: string | null): AgentChatRuntimeStatusSummaryTone {
  const value = status.toLowerCase()
  if (error || value.includes('error') || value.includes('failed') || value.includes('blocked')) return 'danger'
  if (value.includes('warn') || value.includes('limit')) return 'warning'
  if (value.includes('ready') || value.includes('connected') || value.includes('complete')) return 'success'
  if (value.includes('running') || value.includes('active')) return 'brand'
  return 'neutral'
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
