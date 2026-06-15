import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type UIEvent } from 'react'
import {
  AGENT_CHAT_VISIBLE_ITEM_WINDOW_INITIAL_SIZE,
  buildAgentChatVisibleItemWindow,
  type AgentChatRuntimeAction,
  type AgentChatRuntimeState,
  type AgentChatRuntimeView,
} from '@movscript/core/agent/chat'

const AGENT_CHAT_OLDER_ITEMS_SCROLL_THRESHOLD_PX = 96

interface UseAgentChatThreadViewportInput {
  activeThreadId: string | null
  dispatchRuntime: Dispatch<AgentChatRuntimeAction>
  pendingUserItems: AgentChatRuntimeState['pendingUserItems']
  realtimeAudioItems: AgentChatRuntimeState['realtimeAudioItems']
  realtimeTranscriptItems: AgentChatRuntimeState['realtimeTranscriptItems']
  runtimeVisibleItems: AgentChatRuntimeView['visibleItems']
  streamingAgentItems: AgentChatRuntimeState['streamingAgentItems']
  threadReadRequests: AgentChatRuntimeState['threadReadRequests']
  threadReadStates: AgentChatRuntimeState['threadReadStates']
  threads: AgentChatRuntimeState['threads']
}

export function useAgentChatThreadViewport({
  activeThreadId,
  dispatchRuntime,
  pendingUserItems,
  realtimeAudioItems,
  realtimeTranscriptItems,
  runtimeVisibleItems,
  streamingAgentItems,
  threadReadRequests,
  threadReadStates,
  threads,
}: UseAgentChatThreadViewportInput) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const olderItemsScrollAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)
  const suppressNextAutoScrollRef = useRef(false)
  const [visibleThreadItemCount, setVisibleThreadItemCount] = useState(AGENT_CHAT_VISIBLE_ITEM_WINDOW_INITIAL_SIZE)

  useLayoutEffect(() => {
    const anchor = olderItemsScrollAnchorRef.current
    const thread = scrollRef.current
    if (!anchor || !thread) return
    olderItemsScrollAnchorRef.current = null
    suppressNextAutoScrollRef.current = true
    thread.scrollTop = anchor.scrollTop + Math.max(0, thread.scrollHeight - anchor.scrollHeight)
  }, [threads, visibleThreadItemCount])

  useEffect(() => {
    if (suppressNextAutoScrollRef.current) {
      suppressNextAutoScrollRef.current = false
      return
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [threads, pendingUserItems, streamingAgentItems, realtimeTranscriptItems, realtimeAudioItems, activeThreadId])

  useEffect(() => {
    setVisibleThreadItemCount(AGENT_CHAT_VISIBLE_ITEM_WINDOW_INITIAL_SIZE)
  }, [activeThreadId])

  const visibleItemWindow = useMemo(() => buildAgentChatVisibleItemWindow({
    items: runtimeVisibleItems,
    visibleCount: visibleThreadItemCount,
    keepItem: (item) => item.streaming,
  }), [runtimeVisibleItems, visibleThreadItemCount])
  const visibleItems = visibleItemWindow.visibleItems
  const activeThreadReadState = activeThreadId ? threadReadStates[activeThreadId] : undefined
  const olderThreadReadPending = Boolean(activeThreadId && threadReadRequests.some((request) => (
    request.threadId === activeThreadId
    && (request.input.direction ?? 'newer') === 'older'
  )))
  const canFetchEarlierThreadItems = Boolean(
    activeThreadId
    && activeThreadReadState
    && !activeThreadReadState.hasCompleteHistory
    && visibleItemWindow.hiddenCount === 0
    && !olderThreadReadPending,
  )
  const canShowOlderThreadItems = visibleItemWindow.hiddenCount > 0 || canFetchEarlierThreadItems
  const showOlderThreadItems = useCallback(() => {
    const thread = scrollRef.current
    if (thread) {
      olderItemsScrollAnchorRef.current = {
        scrollHeight: thread.scrollHeight,
        scrollTop: thread.scrollTop,
      }
    }
    if (visibleItemWindow.hiddenCount === 0) {
      if (activeThreadId && canFetchEarlierThreadItems) {
        dispatchRuntime({ type: 'requestThreadRead', threadId: activeThreadId, direction: 'older' })
      }
      return
    }
    const previousScrollHeight = thread?.scrollHeight ?? 0
    const previousScrollTop = thread?.scrollTop ?? 0
    setVisibleThreadItemCount(visibleItemWindow.nextVisibleCount)
    requestAnimationFrame(() => {
      if (!thread) return
      thread.scrollTop = previousScrollTop + Math.max(0, thread.scrollHeight - previousScrollHeight)
    })
  }, [activeThreadId, canFetchEarlierThreadItems, dispatchRuntime, visibleItemWindow.hiddenCount, visibleItemWindow.nextVisibleCount])
  const handleThreadScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (!canShowOlderThreadItems) return
    if (event.currentTarget.scrollTop > AGENT_CHAT_OLDER_ITEMS_SCROLL_THRESHOLD_PX) return
    showOlderThreadItems()
  }, [canShowOlderThreadItems, showOlderThreadItems])

  return {
    canShowOlderThreadItems,
    handleThreadScroll,
    scrollRef,
    showOlderThreadItems,
    visibleItemWindow,
    visibleItems,
  }
}
