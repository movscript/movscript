import { useCallback, useEffect, useRef, type UIEvent } from 'react'

export interface UseAgentConversationAutoScrollOptions {
  blockCount: number
  building: boolean
  conversationId: string
  generationProgressKey?: string
  hasPendingAssistantState: boolean
  hasStreamingAssistantContent: boolean
  loading: boolean
  messageCount: number
  streamingAssistantText: string
  visibleActivityEventCount: number
}

export function useAgentConversationAutoScroll({
  blockCount,
  building,
  conversationId,
  generationProgressKey,
  hasPendingAssistantState,
  hasStreamingAssistantContent,
  loading,
  messageCount,
  streamingAssistantText,
  visibleActivityEventCount,
}: UseAgentConversationAutoScrollOptions) {
  const threadRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)

  useEffect(() => {
    shouldAutoScrollRef.current = true
  }, [conversationId])

  useEffect(() => {
    const thread = threadRef.current
    if (!thread || !shouldAutoScrollRef.current) return
    thread.scrollTo({ top: thread.scrollHeight, behavior: 'auto' })
  }, [
    blockCount,
    building,
    conversationId,
    generationProgressKey,
    hasPendingAssistantState,
    hasStreamingAssistantContent,
    loading,
    messageCount,
    streamingAssistantText,
    visibleActivityEventCount,
  ])

  const handleThreadScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const thread = event.currentTarget
    shouldAutoScrollRef.current = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 48
  }, [])

  return {
    bottomRef,
    onThreadScroll: handleThreadScroll,
    threadRef,
  }
}
