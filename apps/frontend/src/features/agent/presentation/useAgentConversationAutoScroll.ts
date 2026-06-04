import { useCallback, useEffect, useRef, type UIEvent } from 'react'

export interface UseAgentConversationAutoScrollOptions {
  conversationId: string
  conversationProjectionScrollKey: string
  generationProgressKey?: string
}

export function useAgentConversationAutoScroll({
  conversationId,
  conversationProjectionScrollKey,
  generationProgressKey,
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
    conversationId,
    conversationProjectionScrollKey,
    generationProgressKey,
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
