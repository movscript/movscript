import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { AGENT_MESSAGE_FEED_LOCAL_EVENT, isAcceptedSourceFeedMessage } from '@/features/agent/application/agentMessageFeedBridge'
import {
  EMPTY_AGENT_MESSAGE_FEED_STATE,
  applyMessageFeedEvent,
  mergeMessageFeedPage,
  mergeMessageFeedResetPage,
  replaceMessageFeedPage,
  type AgentMessageFeedState,
} from '@/features/agent/application/agentMessageFeedState'
import {
  beginAgentPerformanceOperation,
  finishAgentPerformanceOperation,
  markAgentPerformancePhase,
  performanceNow,
  recordAgentPerformanceMetric,
} from '@/features/agent/state/agentPerformanceStore'
import {
  localAgentClient,
  type AgentFeedMessage,
  type AgentFeedMessagePage,
} from '@/shared/infrastructure/localAgentClient'
import { generationProgressListFromEvents } from '@/features/agent/domain/agentGenerationMedia'
import type { ChatMessage, ChatMessageMeta } from '@/features/agent/state/agentStore'

const MESSAGE_FEED_PAGE_SIZE = 10

interface UseAgentMessageFeedInput {
  localSessionId?: string
  localThreadId?: string
  requireThread?: boolean
}

interface AgentMessageFeedView {
  messages: ChatMessage[]
  rawMessages: AgentFeedMessage[]
  hasMoreBefore: boolean
  initialLoading: boolean
  loading: boolean
  loadOlder: () => Promise<void>
}

type FeedAction =
  | { type: 'replace'; scopeKey: string; page: AgentFeedMessagePage }
  | { type: 'merge'; scopeKey: string; page: AgentFeedMessagePage }
  | { type: 'event'; scopeKey: string; event: Parameters<typeof applyMessageFeedEvent>[1] }
  | { type: 'loading'; scopeKey: string; loading: boolean }
  | { type: 'reset'; scopeKey: string }

export interface FeedViewState extends AgentMessageFeedState {
  scopeKey: string
  loaded: boolean
  loading: boolean
}

const EMPTY_FEED_VIEW_STATE: FeedViewState = {
  ...EMPTY_AGENT_MESSAGE_FEED_STATE,
  scopeKey: '',
  loaded: false,
  loading: false,
}

export function useAgentMessageFeed({
  localSessionId,
  localThreadId,
  requireThread = false,
}: UseAgentMessageFeedInput): AgentMessageFeedView {
  const { sessionId, threadId } = messageFeedEffectiveScope({ localSessionId, localThreadId, requireThread })
  const scopeKey = messageFeedScopeKey(sessionId, threadId)
  const [state, dispatch] = useReducer(feedViewReducer, EMPTY_FEED_VIEW_STATE)

  const fetchPage = useCallback(async (input: { before?: string; signal?: AbortSignal } = {}) => {
    const query = {
      limit: MESSAGE_FEED_PAGE_SIZE,
      ...(input.before ? { before: input.before } : {}),
    }
    const source = sessionId ? 'session' : threadId ? 'thread' : 'empty'
    const stage = input.before ? 'older_page' : 'latest_page'
    const startedAt = performanceNow()
    if (sessionId) {
      try {
        const page = await localAgentClient.listSessionMessages(sessionId, {
          ...query,
          ...(threadId ? { threadId } : {}),
        }, input.signal)
        recordMessageHistoryPageMetrics(page, { source, stage, status: 'success', startedAt })
        return page
      } catch (error) {
        recordMessageHistoryPageMetrics(undefined, { source, stage, status: input.signal?.aborted ? 'aborted' : 'error', startedAt })
        throw error
      }
    }
    if (threadId) {
      try {
        const page = await localAgentClient.listThreadMessages(threadId, query, input.signal)
        recordMessageHistoryPageMetrics(page, { source, stage, status: 'success', startedAt })
        return page
      } catch (error) {
        recordMessageHistoryPageMetrics(undefined, { source, stage, status: input.signal?.aborted ? 'aborted' : 'error', startedAt })
        throw error
      }
    }
    const page = {
      messages: [],
      hasMoreBefore: false,
      snapshotRevision: 0,
    } satisfies AgentFeedMessagePage
    recordMessageHistoryPageMetrics(page, { source, stage, status: 'success', startedAt })
    return page
  }, [sessionId, threadId])

  const reloadLatest = useCallback(async (signal?: AbortSignal) => {
    const operationId = beginAgentPerformanceOperation({
      kind: 'message_history_load',
      meta: {
        mode: 'latest',
        source: sessionId ? 'session' : threadId ? 'thread' : 'empty',
        hasThreadId: Boolean(threadId),
        hasSessionId: Boolean(sessionId),
      },
    })
    dispatch({ type: 'loading', scopeKey, loading: true })
    try {
      markAgentPerformancePhase(operationId, 'message_history_request_start')
      const page = await fetchPage({ signal })
      if (signal?.aborted) {
        finishAgentPerformanceOperation(operationId, 'cancelled', messageHistoryPageDetails(page))
        return
      }
      markAgentPerformancePhase(operationId, 'message_history_request_done', {
        details: messageHistoryPageDetails(page),
      })
      dispatch({ type: 'replace', scopeKey, page })
      markAgentPerformancePhase(operationId, 'message_history_state_replace_queued')
      finishAgentPerformanceOperation(operationId, 'success', messageHistoryPageDetails(page))
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
      kind: 'message_history_load',
      meta: {
        mode: 'older',
        source: sessionId ? 'session' : threadId ? 'thread' : 'empty',
        hasThreadId: Boolean(threadId),
        hasSessionId: Boolean(sessionId),
      },
    })
    dispatch({ type: 'loading', scopeKey, loading: true })
    try {
      markAgentPerformancePhase(operationId, 'message_history_request_start')
      const page = await fetchPage({ before: state.nextBefore })
      markAgentPerformancePhase(operationId, 'message_history_request_done', {
        details: messageHistoryPageDetails(page),
      })
      dispatch({ type: 'merge', scopeKey, page })
      markAgentPerformancePhase(operationId, 'message_history_state_merge_queued')
      finishAgentPerformanceOperation(operationId, 'success', messageHistoryPageDetails(page))
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
      ? localAgentClient.streamSessionMessages(sessionId, {
        signal: controller.signal,
        ...(threadId ? { threadId } : {}),
        onMessageEvent: (event) => {
          dispatch({ type: 'event', scopeKey, event })
          if (event.type === 'messages.reset_required') void reloadLatest(controller.signal).catch(() => undefined)
        },
      })
      : localAgentClient.streamThreadMessages(threadId, {
        signal: controller.signal,
        onMessageEvent: (event) => {
          dispatch({ type: 'event', scopeKey, event })
          if (event.type === 'messages.reset_required') void reloadLatest(controller.signal).catch(() => undefined)
        },
      })
    void stream.catch(() => undefined)
    return () => controller.abort()
  }, [reloadLatest, scopeKey, sessionId, threadId])

  useEffect(() => {
    if (!threadId && !sessionId) return
    function handleLocalMessage(event: Event) {
      const message = (event as CustomEvent<AgentFeedMessage>).detail
      if (!isAcceptedSourceFeedMessage(message)) return
      if (!localFeedMessageMatchesScope(message, { sessionId, threadId })) return
      dispatch({
        type: 'event',
        scopeKey,
        event: {
          type: 'message.created',
          revision: message.revision,
          message,
        },
      })
    }
    window.addEventListener(AGENT_MESSAGE_FEED_LOCAL_EVENT, handleLocalMessage)
    return () => window.removeEventListener(AGENT_MESSAGE_FEED_LOCAL_EVENT, handleLocalMessage)
  }, [scopeKey, sessionId, threadId])

  const visibleState = visibleMessageFeedStateForScope(state, scopeKey)
  const messages = useMemo(() => visibleState.messages.flatMap((message) => {
    const chatMessage = feedMessageToChatMessage(message)
    return chatMessage ? [chatMessage] : []
  }), [visibleState.messages])
  return {
    messages,
    rawMessages: visibleState.messages,
    hasMoreBefore: visibleState.hasMoreBefore,
    initialLoading: visibleState.loading && !visibleState.loaded && (!!threadId || !!sessionId),
    loading: visibleState.loading,
    loadOlder,
  }
}

function feedViewReducer(state: FeedViewState, action: FeedAction): FeedViewState {
  if (action.type === 'reset') return { ...EMPTY_FEED_VIEW_STATE, scopeKey: action.scopeKey }
  if (state.scopeKey !== action.scopeKey) return state
  if (action.type === 'loading') return { ...state, loading: action.loading }
  if (action.type === 'replace') {
    return {
      ...(state.loaded && state.needsReset
        ? mergeMessageFeedResetPage(state, action.page)
        : replaceMessageFeedPage(action.page)),
      scopeKey: action.scopeKey,
      loaded: true,
      loading: false,
    }
  }
  if (action.type === 'merge') return { ...mergeMessageFeedPage(state, action.page), scopeKey: action.scopeKey, loaded: true, loading: false }
  const next = applyMessageFeedEvent(state, action.event)
  return { ...next, scopeKey: action.scopeKey, loaded: state.loaded, loading: state.loading }
}

export function visibleMessageFeedStateForScope(state: FeedViewState, scopeKey: string): FeedViewState {
  if (state.scopeKey === scopeKey) return state
  return {
    ...EMPTY_FEED_VIEW_STATE,
    scopeKey,
    loading: Boolean(scopeKey),
  }
}

export function messageFeedScopeKey(sessionId: string, threadId: string): string {
  return `${sessionId}\u0000${threadId}`
}

export function messageFeedEffectiveScope(input: UseAgentMessageFeedInput): { sessionId: string; threadId: string } {
  const threadId = input.localThreadId?.trim() ?? ''
  if (input.requireThread && !threadId) return { sessionId: '', threadId: '' }
  return {
    sessionId: input.localSessionId?.trim() ?? '',
    threadId,
  }
}

export function localFeedMessageMatchesScope(
  message: AgentFeedMessage,
  scope: { sessionId?: string; threadId?: string },
): boolean {
  const threadId = scope.threadId?.trim()
  const sessionId = scope.sessionId?.trim()
  if (threadId) return message.threadId === threadId
  if (sessionId) return message.sessionId === sessionId
  return false
}

export function feedMessageToChatMessage(message: AgentFeedMessage): ChatMessage | undefined {
  if (!isTranscriptFeedMessage(message)) return undefined
  const timestamp = Date.parse(message.createdAt)
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    ...(message.attachments?.length ? { attachments: message.attachments } : {}),
    meta: feedMessageMeta(message),
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
  }
}

export function isTranscriptFeedMessage(message: AgentFeedMessage): message is AgentFeedMessage & { role: 'user' | 'assistant' } {
  return (message.role === 'user' || message.role === 'assistant') && message.kind === 'text'
}

function feedMessageMeta(message: AgentFeedMessage): ChatMessageMeta {
  const runtimeMessage = {
    threadId: message.runtimeRefs.threadId,
    ...(message.runtimeRefs.messageId ? { messageId: message.runtimeRefs.messageId } : {}),
    ...(message.runtimeRefs.runId ? { runId: message.runtimeRefs.runId } : {}),
  }
  const generationJobs = message.activity ? generationProgressListFromEvents(message.activity.events ?? []) : []
  return {
    ...(message.meta ?? {}),
    runtimeMessage,
    ...(message.activity ? { localRunActivity: message.activity } : {}),
    ...(generationJobs.length > 0 ? { generationJobs } : {}),
    ...(message.role === 'user'
      ? {
        runtimeInput: {
          ...runtimeMessage,
          status: feedInputStatus(message),
        },
      }
      : {}),
  }
}

function feedInputStatus(message: AgentFeedMessage): NonNullable<ChatMessageMeta['runtimeInput']>['status'] {
  if (message.status === 'failed') return 'failed'
  if (message.status === 'pending') return 'pending'
  return 'accepted'
}

function recordMessageHistoryPageMetrics(
  page: AgentFeedMessagePage | undefined,
  input: {
    source: string
    stage: string
    status: string
    startedAt: number
  },
): void {
  const labels = {
    component: 'agent_message_feed',
    kind: input.source,
    stage: input.stage,
    status: input.status,
  }
  recordAgentPerformanceMetric({
    name: 'frontend_agent_message_history_page_duration_ms',
    value: Math.max(0, performanceNow() - input.startedAt),
    unit: 'ms',
    labels,
  })
  if (!page) return
  recordAgentPerformanceMetric({
    name: 'frontend_agent_message_history_page_messages',
    value: page.messages.length,
    unit: 'count',
    labels,
  })
  recordAgentPerformanceMetric({
    name: 'frontend_agent_message_history_page_payload_bytes',
    value: jsonByteLength(page),
    unit: 'bytes',
    labels,
  })
}

function messageHistoryPageDetails(page: AgentFeedMessagePage): Record<string, unknown> {
  return {
    messageCount: page.messages.length,
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
