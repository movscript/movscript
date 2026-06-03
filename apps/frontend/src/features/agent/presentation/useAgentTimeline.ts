import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { AGENT_TIMELINE_LOCAL_EVENT, isAcceptedSourceTimelineItem } from '@/features/agent/application/agentTimelineBridge'
import {
  EMPTY_AGENT_TIMELINE_STATE,
  applyTimelineEvent,
  mergeTimelinePage,
  mergeTimelineResetPage,
  replaceTimelinePage,
  type AgentTimelineState,
} from '@/features/agent/application/agentTimelineState'
import {
  beginAgentPerformanceOperation,
  finishAgentPerformanceOperation,
  markAgentPerformancePhase,
  performanceNow,
  recordAgentPerformanceMetric,
} from '@/features/agent/state/agentPerformanceStore'
import {
  localAgentClient,
  type AgentTimelineItem,
  type AgentTimelinePage,
} from '@/shared/infrastructure/localAgentClient'
import { generationProgressListFromEvents } from '@/features/agent/domain/agentGenerationMedia'
import type { ChatMessage, ChatMessageMeta } from '@/features/agent/state/agentStore'

const TIMELINE_PAGE_SIZE = 10

interface UseAgentTimelineInput {
  localSessionId?: string
  localThreadId?: string
  requireThread?: boolean
}

interface AgentTimelineView {
  transcriptMessages: ChatMessage[]
  timelineItems: AgentTimelineItem[]
  hasMoreBefore: boolean
  initialLoading: boolean
  loading: boolean
  loadOlder: () => Promise<void>
}

type TimelineAction =
  | { type: 'replace'; scopeKey: string; page: AgentTimelinePage }
  | { type: 'merge'; scopeKey: string; page: AgentTimelinePage }
  | { type: 'event'; scopeKey: string; event: Parameters<typeof applyTimelineEvent>[1] }
  | { type: 'loading'; scopeKey: string; loading: boolean }
  | { type: 'reset'; scopeKey: string }

export interface TimelineViewState extends AgentTimelineState {
  scopeKey: string
  loaded: boolean
  loading: boolean
}

const EMPTY_TIMELINE_VIEW_STATE: TimelineViewState = {
  ...EMPTY_AGENT_TIMELINE_STATE,
  scopeKey: '',
  loaded: false,
  loading: false,
}

export function useAgentTimeline({
  localSessionId,
  localThreadId,
  requireThread = false,
}: UseAgentTimelineInput): AgentTimelineView {
  const { sessionId, threadId } = timelineEffectiveScope({ localSessionId, localThreadId, requireThread })
  const scopeKey = timelineScopeKey(sessionId, threadId)
  const runtimeClient = useMemo(() => sessionId
    ? localAgentClient.forSession({ sessionId })
    : localAgentClient, [sessionId])
  const [state, dispatch] = useReducer(timelineViewReducer, EMPTY_TIMELINE_VIEW_STATE)

  const fetchPage = useCallback(async (input: { before?: string; signal?: AbortSignal } = {}) => {
    const query = {
      limit: TIMELINE_PAGE_SIZE,
      ...(input.before ? { before: input.before } : {}),
    }
    const source = sessionId ? 'session' : threadId ? 'thread' : 'empty'
    const stage = input.before ? 'older_page' : 'latest_page'
    const startedAt = performanceNow()
    if (sessionId) {
      try {
        const page = await runtimeClient.listSessionTimeline(sessionId, {
          ...query,
          ...(threadId ? { threadId } : {}),
        }, input.signal)
        recordTimelinePageMetrics(page, { source, stage, status: 'success', startedAt })
        return page
      } catch (error) {
        recordTimelinePageMetrics(undefined, { source, stage, status: input.signal?.aborted ? 'aborted' : 'error', startedAt })
        throw error
      }
    }
    if (threadId) {
      try {
        const page = await runtimeClient.listThreadTimeline(threadId, query, input.signal)
        recordTimelinePageMetrics(page, { source, stage, status: 'success', startedAt })
        return page
      } catch (error) {
        recordTimelinePageMetrics(undefined, { source, stage, status: input.signal?.aborted ? 'aborted' : 'error', startedAt })
        throw error
      }
    }
    const page = {
      items: [],
      hasMoreBefore: false,
      snapshotRevision: 0,
    } satisfies AgentTimelinePage
    recordTimelinePageMetrics(page, { source, stage, status: 'success', startedAt })
    return page
  }, [runtimeClient, sessionId, threadId])

  const reloadLatest = useCallback(async (signal?: AbortSignal) => {
    const operationId = beginAgentPerformanceOperation({
      kind: 'timeline_load',
      meta: {
        mode: 'latest',
        source: sessionId ? 'session' : threadId ? 'thread' : 'empty',
        hasThreadId: Boolean(threadId),
        hasSessionId: Boolean(sessionId),
      },
    })
    dispatch({ type: 'loading', scopeKey, loading: true })
    try {
      markAgentPerformancePhase(operationId, 'timeline_request_start')
      const page = await fetchPage({ signal })
      if (signal?.aborted) {
        finishAgentPerformanceOperation(operationId, 'cancelled', timelinePageDetails(page))
        return
      }
      markAgentPerformancePhase(operationId, 'timeline_request_done', {
        details: timelinePageDetails(page),
      })
      dispatch({ type: 'replace', scopeKey, page })
      markAgentPerformancePhase(operationId, 'timeline_state_replace_queued')
      finishAgentPerformanceOperation(operationId, 'success', timelinePageDetails(page))
    } catch (error) {
      finishAgentPerformanceOperation(operationId, signal?.aborted ? 'cancelled' : 'error', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      if (!signal?.aborted) dispatch({ type: 'loading', scopeKey, loading: false })
    }
  }, [fetchPage, scopeKey, sessionId, threadId])

  const loadOlder = useCallback(async () => {
    if (!state.hasMoreBefore || !state.nextBefore || state.loading) return
    const operationId = beginAgentPerformanceOperation({
      kind: 'timeline_load',
      meta: {
        mode: 'older',
        source: sessionId ? 'session' : threadId ? 'thread' : 'empty',
        hasThreadId: Boolean(threadId),
        hasSessionId: Boolean(sessionId),
      },
    })
    dispatch({ type: 'loading', scopeKey, loading: true })
    try {
      markAgentPerformancePhase(operationId, 'timeline_request_start')
      const page = await fetchPage({ before: state.nextBefore })
      markAgentPerformancePhase(operationId, 'timeline_request_done', {
        details: timelinePageDetails(page),
      })
      dispatch({ type: 'merge', scopeKey, page })
      markAgentPerformancePhase(operationId, 'timeline_state_merge_queued')
      finishAgentPerformanceOperation(operationId, 'success', timelinePageDetails(page))
    } catch (error) {
      finishAgentPerformanceOperation(operationId, 'error', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      dispatch({ type: 'loading', scopeKey, loading: false })
    }
  }, [fetchPage, scopeKey, sessionId, state.hasMoreBefore, state.loading, state.nextBefore, threadId])

  useEffect(() => {
    dispatch({ type: 'reset', scopeKey })
    if (!threadId && !sessionId) return
    const controller = new AbortController()
    void reloadLatest(controller.signal).catch(() => undefined)
    return () => controller.abort()
  }, [reloadLatest, scopeKey, sessionId, threadId])

  useEffect(() => {
    if (!threadId && !sessionId) return
    const controller = new AbortController()
    const stream = sessionId
      ? runtimeClient.streamSessionTimeline(sessionId, {
        signal: controller.signal,
        ...(threadId ? { threadId } : {}),
        onTimelineEvent: (event) => {
          dispatch({ type: 'event', scopeKey, event })
          if (event.type === 'timeline.reset_required') void reloadLatest(controller.signal).catch(() => undefined)
        },
      })
      : runtimeClient.streamThreadTimeline(threadId, {
        signal: controller.signal,
        onTimelineEvent: (event) => {
          dispatch({ type: 'event', scopeKey, event })
          if (event.type === 'timeline.reset_required') void reloadLatest(controller.signal).catch(() => undefined)
        },
      })
    void stream.catch(() => undefined)
    return () => controller.abort()
  }, [reloadLatest, runtimeClient, scopeKey, sessionId, threadId])

  useEffect(() => {
    if (!threadId && !sessionId) return
    function handleLocalTimelineItem(event: Event) {
      const item = (event as CustomEvent<AgentTimelineItem>).detail
      if (!isAcceptedSourceTimelineItem(item)) return
      if (!localTimelineItemMatchesScope(item, { sessionId, threadId })) return
      dispatch({
        type: 'event',
        scopeKey,
        event: {
          type: 'timeline.item.created',
          revision: item.revision,
          item,
        },
      })
    }
    window.addEventListener(AGENT_TIMELINE_LOCAL_EVENT, handleLocalTimelineItem)
    return () => window.removeEventListener(AGENT_TIMELINE_LOCAL_EVENT, handleLocalTimelineItem)
  }, [scopeKey, sessionId, threadId])

  const visibleState = visibleTimelineStateForScope(state, scopeKey)
  const transcriptMessages = useMemo(() => visibleState.items.flatMap((item) => {
    const chatMessage = timelineItemToChatMessage(item)
    return chatMessage ? [chatMessage] : []
  }), [visibleState.items])
  return {
    transcriptMessages,
    timelineItems: visibleState.items,
    hasMoreBefore: visibleState.hasMoreBefore,
    initialLoading: visibleState.loading && !visibleState.loaded && (!!threadId || !!sessionId),
    loading: visibleState.loading,
    loadOlder,
  }
}

function timelineViewReducer(state: TimelineViewState, action: TimelineAction): TimelineViewState {
  if (action.type === 'reset') return { ...EMPTY_TIMELINE_VIEW_STATE, scopeKey: action.scopeKey }
  if (state.scopeKey !== action.scopeKey) return state
  if (action.type === 'loading') return { ...state, loading: action.loading }
  if (action.type === 'replace') {
    return {
      ...(state.loaded && state.needsReset
        ? mergeTimelineResetPage(state, action.page)
        : replaceTimelinePage(action.page)),
      scopeKey: action.scopeKey,
      loaded: true,
      loading: false,
    }
  }
  if (action.type === 'merge') return { ...mergeTimelinePage(state, action.page), scopeKey: action.scopeKey, loaded: true, loading: false }
  const next = applyTimelineEvent(state, action.event)
  return { ...next, scopeKey: action.scopeKey, loaded: state.loaded, loading: state.loading }
}

export function visibleTimelineStateForScope(state: TimelineViewState, scopeKey: string): TimelineViewState {
  if (state.scopeKey === scopeKey) return state
  return {
    ...EMPTY_TIMELINE_VIEW_STATE,
    scopeKey,
    loading: Boolean(scopeKey),
  }
}

export function timelineScopeKey(sessionId: string, threadId: string): string {
  return `${sessionId}\u0000${threadId}`
}

export function timelineEffectiveScope(input: UseAgentTimelineInput): { sessionId: string; threadId: string } {
  const threadId = input.localThreadId?.trim() ?? ''
  if (input.requireThread && !threadId) return { sessionId: '', threadId: '' }
  return {
    sessionId: input.localSessionId?.trim() ?? '',
    threadId,
  }
}

export function localTimelineItemMatchesScope(
  item: AgentTimelineItem,
  scope: { sessionId?: string; threadId?: string },
): boolean {
  const threadId = scope.threadId?.trim()
  const sessionId = scope.sessionId?.trim()
  if (threadId) return item.threadId === threadId
  if (sessionId) return item.sessionId === sessionId
  return false
}

export function timelineItemToChatMessage(item: AgentTimelineItem): ChatMessage | undefined {
  if (!isTranscriptTimelineItem(item)) return undefined
  const timestamp = Date.parse(item.createdAt)
  return {
    id: item.id,
    role: item.origin === 'user' ? 'user' : 'assistant',
    content: item.content ?? '',
    ...(item.attachments?.length ? { attachments: item.attachments } : {}),
    meta: timelineItemMeta(item),
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
  }
}

export function isTranscriptTimelineItem(item: AgentTimelineItem): boolean {
  return (item.origin === 'user' || item.origin === 'agent')
    && item.purpose === 'transcript'
    && item.surface === 'message_stream'
}

function timelineItemMeta(item: AgentTimelineItem): ChatMessageMeta {
  const runtimeMessage = {
    threadId: item.runtimeRefs.threadId,
    ...(item.runtimeRefs.messageId ? { messageId: item.runtimeRefs.messageId } : {}),
    ...(item.runtimeRefs.runId ? { runId: item.runtimeRefs.runId } : {}),
  }
  const generationJobs = item.activity ? generationProgressListFromEvents(item.activity.events ?? []) : []
  return {
    runtimeMessage,
    ...(generationJobs.length > 0 ? { generationJobs } : {}),
    ...(item.origin === 'user'
      ? {
        runtimeInput: {
          ...runtimeMessage,
          deliveryStatus: runtimeInputDeliveryStatusFromTimelineItem(item),
        },
      }
      : {}),
  }
}

function runtimeInputDeliveryStatusFromTimelineItem(item: AgentTimelineItem): NonNullable<ChatMessageMeta['runtimeInput']>['deliveryStatus'] {
  if (item.status === 'failed') return 'failed'
  if (item.status === 'pending') return 'pending'
  return 'accepted'
}

function recordTimelinePageMetrics(
  page: AgentTimelinePage | undefined,
  input: {
    source: string
    stage: string
    status: 'success' | 'error' | 'aborted'
    startedAt: number
  },
): void {
  const labels = {
    component: 'agent_timeline',
    kind: input.source,
    stage: input.stage,
    status: input.status,
  }
  recordAgentPerformanceMetric({
    name: 'frontend_agent_timeline_page_duration_ms',
    value: Math.max(0, performanceNow() - input.startedAt),
    unit: 'ms',
    labels,
  })
  if (!page) return
  recordAgentPerformanceMetric({
    name: 'frontend_agent_timeline_page_items',
    value: page.items.length,
    unit: 'count',
    labels,
  })
  recordAgentPerformanceMetric({
    name: 'frontend_agent_timeline_page_payload_bytes',
    value: jsonByteLength(page),
    unit: 'bytes',
    labels,
  })
}

function timelinePageDetails(page: AgentTimelinePage): Record<string, unknown> {
  return {
    itemCount: page.items.length,
    hasMoreBefore: page.hasMoreBefore,
    snapshotRevision: page.snapshotRevision,
    payloadBytes: jsonByteLength(page),
  }
}

function jsonByteLength(value: unknown): number {
  const json = JSON.stringify(value)
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).byteLength
  return json.length
}
