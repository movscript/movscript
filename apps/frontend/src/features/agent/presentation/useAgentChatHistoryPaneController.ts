import { useCallback, useEffect, useState } from 'react'
import { useResizablePanel } from '@movscript/ui'

const AGENT_CHAT_HISTORY_MIN_RATIO = 1 / 3
const AGENT_CHAT_HISTORY_MAX_RATIO = 0.78

export interface AgentChatHistoryPaneControllerOptions {
  activeConversationId: string
  ariaLabel: string
  conversationStarted: boolean
}

export function useAgentChatHistoryPaneController({
  activeConversationId,
  ariaLabel,
  conversationStarted,
}: AgentChatHistoryPaneControllerOptions) {
  const [open, setOpen] = useState(false)
  const [height, setHeight] = useState<number | null>(null)

  const resize = useResizablePanel({
    size: height ?? 0,
    onSizeChange: setHeight,
    minSize: (rect) => Math.round(rect.height * AGENT_CHAT_HISTORY_MIN_RATIO),
    maxSize: (rect) => Math.round(rect.height * AGENT_CHAT_HISTORY_MAX_RATIO),
    resizeEdge: 'top',
    collapsed: !open,
    onCollapsedChange: (collapsed) => {
      if (collapsed) {
        setOpen(false)
        setHeight(null)
      }
    },
    collapseMode: 'after-min',
    ariaLabel,
    getContainer: (handle) => handle.closest('.ai-agent-panel-main') as HTMLElement | null,
  })

  useEffect(() => {
    setOpen(false)
    setHeight(null)
  }, [activeConversationId])

  useEffect(() => {
    if (!conversationStarted) return
    setOpen(false)
    setHeight(null)
  }, [conversationStarted])

  const toggleOpen = useCallback(() => {
    setOpen((current) => !current)
  }, [])

  return {
    height,
    open,
    resize,
    setOpen,
    toggleOpen,
  }
}
