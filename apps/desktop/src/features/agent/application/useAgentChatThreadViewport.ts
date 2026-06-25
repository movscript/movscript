import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type UIEvent } from 'react'
import {
  AGENT_CHAT_VISIBLE_ITEM_WINDOW_INITIAL_SIZE,
  buildAgentChatVisibleItemWindow,
  type AgentChatRuntimeAction,
  type AgentChatRuntimeState,
  type AgentChatRuntimeView,
} from '@movscript/agent-chat'

const AGENT_CHAT_OLDER_ITEMS_SCROLL_THRESHOLD_PX = 96

interface UseAgentChatThreadViewportInput {
  activeThreadId: string | null
  dispatchRuntime: Dispatch<AgentChatRuntimeAction>
  optimisticVisibleItems: AgentChatRuntimeView['visibleItems']
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
  optimisticVisibleItems,
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

  const viewportVisibleItems = useMemo(
    () => mergeAgentChatViewportVisibleItems(runtimeVisibleItems, optimisticVisibleItems),
    [optimisticVisibleItems, runtimeVisibleItems],
  )

  useEffect(() => {
    if (suppressNextAutoScrollRef.current) {
      suppressNextAutoScrollRef.current = false
      return
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [threads, pendingUserItems, streamingAgentItems, realtimeTranscriptItems, realtimeAudioItems, viewportVisibleItems, activeThreadId])

  useEffect(() => {
    setVisibleThreadItemCount(AGENT_CHAT_VISIBLE_ITEM_WINDOW_INITIAL_SIZE)
  }, [activeThreadId])

  const visibleItemWindow = useMemo(() => buildAgentChatVisibleItemWindow({
    items: viewportVisibleItems,
    visibleCount: visibleThreadItemCount,
    keepItem: (item) => item.streaming,
  }), [viewportVisibleItems, visibleThreadItemCount])
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

export function mergeAgentChatViewportVisibleItems(
  runtimeVisibleItems: AgentChatRuntimeView['visibleItems'],
  optimisticVisibleItems: AgentChatRuntimeView['visibleItems'],
): AgentChatRuntimeView['visibleItems'] {
  if (optimisticVisibleItems.length === 0) return runtimeVisibleItems
  const viewIds = new Set(runtimeVisibleItems.map((item) => item.viewId))
  const merged = [...runtimeVisibleItems]
  for (const item of optimisticVisibleItems) {
    if (viewIds.has(item.viewId)) continue
    viewIds.add(item.viewId)
    merged.push(item)
  }
  return merged
}
