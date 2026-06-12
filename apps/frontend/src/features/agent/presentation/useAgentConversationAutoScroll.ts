import { useCallback, useEffect, useRef, type UIEvent } from 'react'

export interface UseAgentConversationAutoScrollOptions {
  conversationId: string
}

export function useAgentConversationAutoScroll({
  conversationId,
}: UseAgentConversationAutoScrollOptions) {
  const threadRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const thread = threadRef.current
    if (!thread) return
    thread.scrollTo({ top: thread.scrollHeight, behavior: 'auto' })
  }, [conversationId])

  const handleThreadScroll = useCallback((_event: UIEvent<HTMLDivElement>) => {
    // Intentionally do not re-enable message-driven auto-scroll.
  }, [])

  return {
    bottomRef,
    onThreadScroll: handleThreadScroll,
    threadRef,
  }
}
