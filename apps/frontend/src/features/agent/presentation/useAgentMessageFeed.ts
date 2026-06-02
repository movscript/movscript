import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { AGENT_MESSAGE_FEED_LOCAL_EVENT } from '@/features/agent/application/agentMessageFeedBridge'
import {
  EMPTY_AGENT_MESSAGE_FEED_STATE,
  applyMessageFeedEvent,
  mergeMessageFeedPage,
  replaceMessageFeedPage,
  type AgentMessageFeedState,
} from '@/features/agent/application/agentMessageFeedState'
import {
  localAgentClient,
  type AgentFeedMessage,
  type AgentFeedMessagePage,
} from '@/shared/infrastructure/localAgentClient'
import type { ChatMessage, ChatMessageMeta } from '@/features/agent/state/agentStore'

const MESSAGE_FEED_PAGE_SIZE = 10

interface UseAgentMessageFeedInput {
  localSessionId?: string
  localThreadId?: string
}

interface AgentMessageFeedView {
  messages: ChatMessage[]
  rawMessages: AgentFeedMessage[]
  hasMoreBefore: boolean
  loading: boolean
  loadOlder: () => Promise<void>
}

type FeedAction =
  | { type: 'replace'; page: AgentFeedMessagePage }
  | { type: 'merge'; page: AgentFeedMessagePage }
  | { type: 'event'; event: Parameters<typeof applyMessageFeedEvent>[1] }
  | { type: 'loading'; loading: boolean }
  | { type: 'reset' }

interface FeedViewState extends AgentMessageFeedState {
  loading: boolean
}

const EMPTY_FEED_VIEW_STATE: FeedViewState = {
  ...EMPTY_AGENT_MESSAGE_FEED_STATE,
  loading: false,
}

export function useAgentMessageFeed({
  localSessionId,
  localThreadId,
}: UseAgentMessageFeedInput): AgentMessageFeedView {
  const threadId = localThreadId?.trim() ?? ''
  const sessionId = localSessionId?.trim() ?? ''
  const [state, dispatch] = useReducer(feedViewReducer, EMPTY_FEED_VIEW_STATE)

  const fetchPage = useCallback((input: { before?: string; signal?: AbortSignal } = {}) => {
    const query = {
      limit: MESSAGE_FEED_PAGE_SIZE,
      ...(input.before ? { before: input.before } : {}),
    }
    if (sessionId) {
      return localAgentClient.listSessionMessages(sessionId, {
        ...query,
        ...(threadId ? { threadId } : {}),
      }, input.signal)
    }
    if (threadId) {
      return localAgentClient.listThreadMessages(threadId, query, input.signal)
    }
    return Promise.resolve({
      messages: [],
      hasMoreBefore: false,
      snapshotRevision: 0,
    } satisfies AgentFeedMessagePage)
  }, [sessionId, threadId])

  const reloadLatest = useCallback(async (signal?: AbortSignal) => {
    dispatch({ type: 'loading', loading: true })
    try {
      const page = await fetchPage({ signal })
      if (signal?.aborted) return
      dispatch({ type: 'replace', page })
    } finally {
      if (!signal?.aborted) dispatch({ type: 'loading', loading: false })
    }
  }, [fetchPage])

  const loadOlder = useCallback(async () => {
    if (!state.hasMoreBefore || !state.nextBefore || state.loading) return
    dispatch({ type: 'loading', loading: true })
    try {
      const page = await fetchPage({ before: state.nextBefore })
      dispatch({ type: 'merge', page })
    } finally {
      dispatch({ type: 'loading', loading: false })
    }
  }, [fetchPage, state.hasMoreBefore, state.loading, state.nextBefore])

  useEffect(() => {
    dispatch({ type: 'reset' })
    if (!threadId && !sessionId) return
    const controller = new AbortController()
    void reloadLatest(controller.signal).catch(() => undefined)
    return () => controller.abort()
  }, [reloadLatest, sessionId, threadId])

  useEffect(() => {
    if (!threadId && !sessionId) return
    const controller = new AbortController()
    const stream = sessionId
      ? localAgentClient.streamSessionMessages(sessionId, {
        signal: controller.signal,
        ...(threadId ? { threadId } : {}),
        onMessageEvent: (event) => {
          dispatch({ type: 'event', event })
          if (event.type === 'messages.reset_required') void reloadLatest(controller.signal).catch(() => undefined)
        },
      })
      : localAgentClient.streamThreadMessages(threadId, {
        signal: controller.signal,
        onMessageEvent: (event) => {
          dispatch({ type: 'event', event })
          if (event.type === 'messages.reset_required') void reloadLatest(controller.signal).catch(() => undefined)
        },
      })
    void stream.catch(() => undefined)
    return () => controller.abort()
  }, [reloadLatest, sessionId, threadId])

  useEffect(() => {
    if (!threadId && !sessionId) return
    function handleLocalMessage(event: Event) {
      const message = (event as CustomEvent<AgentFeedMessage>).detail
      if (!message) return
      if (threadId && message.threadId !== threadId) return
      if (sessionId && message.sessionId && message.sessionId !== sessionId) return
      dispatch({
        type: 'event',
        event: {
          type: 'message.created',
          revision: message.revision,
          message,
        },
      })
    }
    window.addEventListener(AGENT_MESSAGE_FEED_LOCAL_EVENT, handleLocalMessage)
    return () => window.removeEventListener(AGENT_MESSAGE_FEED_LOCAL_EVENT, handleLocalMessage)
  }, [sessionId, threadId])

  const messages = useMemo(() => state.messages.map(feedMessageToChatMessage), [state.messages])
  return {
    messages,
    rawMessages: state.messages,
    hasMoreBefore: state.hasMoreBefore,
    loading: state.loading,
    loadOlder,
  }
}

function feedViewReducer(state: FeedViewState, action: FeedAction): FeedViewState {
  if (action.type === 'reset') return EMPTY_FEED_VIEW_STATE
  if (action.type === 'loading') return { ...state, loading: action.loading }
  if (action.type === 'replace') return { ...replaceMessageFeedPage(action.page), loading: false }
  if (action.type === 'merge') return { ...mergeMessageFeedPage(state, action.page), loading: false }
  const next = applyMessageFeedEvent(state, action.event)
  return { ...next, loading: state.loading }
}

function feedMessageToChatMessage(message: AgentFeedMessage): ChatMessage {
  const timestamp = Date.parse(message.createdAt)
  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    content: message.content,
    ...(message.attachments?.length ? { attachments: message.attachments } : {}),
    meta: feedMessageMeta(message),
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
  }
}

function feedMessageMeta(message: AgentFeedMessage): ChatMessageMeta {
  const runtimeMessage = {
    threadId: message.runtimeRefs.threadId,
    ...(message.runtimeRefs.messageId ? { messageId: message.runtimeRefs.messageId } : {}),
    ...(message.runtimeRefs.runId ? { runId: message.runtimeRefs.runId } : {}),
  }
  return {
    runtimeMessage,
    ...(message.activity ? { localRunActivity: message.activity } : {}),
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
