import { useCallback, useEffect, useRef, useState } from 'react'
import { AGENT_PANEL_WORKSPACE_EVENT, AGENT_PANEL_NEW_CONVERSATION_EVENT, AGENT_PANEL_THREAD_EVENT, type AgentPanelThreadPayload } from '@/features/agent/application/agentPanelBridge'
import { useAgentPanelUiStore } from '@/features/agent/presentation/agentPanelUiStore'
import { useResizablePanel } from '@movscript/ui'

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const DETAIL_AGENT_PANEL_MIN_WIDTH = 260
const DETAIL_AGENT_PANEL_DEFAULT_WIDTH = 360
const DETAIL_AGENT_PANEL_WIDE_DEFAULT_WIDTH = 420
const DETAIL_AGENT_PANEL_MAX_WIDTH = 720
const DETAIL_AGENT_PANEL_RESERVED_WIDTH = 760

function agentPanelDefaultWidth(viewportWidth: number) {
  return viewportWidth >= 1440 ? DETAIL_AGENT_PANEL_WIDE_DEFAULT_WIDTH : DETAIL_AGENT_PANEL_DEFAULT_WIDTH
}

function agentPanelMaxWidth(viewportWidth: number) {
  return Math.min(
    DETAIL_AGENT_PANEL_MAX_WIDTH,
    Math.max(DETAIL_AGENT_PANEL_MIN_WIDTH, viewportWidth - DETAIL_AGENT_PANEL_RESERVED_WIDTH),
  )
}

function clampAgentPanelWidth(width: number, viewportWidth: number) {
  return clampNumber(width, DETAIL_AGENT_PANEL_MIN_WIDTH, agentPanelMaxWidth(viewportWidth))
}

export function useAIAgentPanelDockController() {
  const open = useAgentPanelUiStore((state) => state.open)
  const setOpen = useAgentPanelUiStore((state) => state.setOpen)
  const toggleOpen = useAgentPanelUiStore((state) => state.toggleOpen)
  const setDetailAgentPanelWidth = useAgentPanelUiStore((state) => state.setDetailAgentPanelWidth)
  const [pendingThreadIdToOpen, setPendingThreadIdToOpen] = useState<string | null>(null)
  const [pendingPanelAction, setPendingPanelAction] = useState<'creating' | 'restoring' | null>(null)
  const [panelWidth, setPanelWidth] = useState(() => {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440
    return clampAgentPanelWidth(agentPanelDefaultWidth(viewportWidth), viewportWidth)
  })
  const dockLayout = true
  const panelRef = useRef<HTMLDivElement | null>(null)
  const resizeBodyClassNames = useRef(['ai-agent-panel-resizing', 'ai-agent-panel-resizing--x'])
  const panelResize = useResizablePanel({
    size: panelWidth,
    onSizeChange: (nextWidth) => {
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440
      const resolvedWidth = clampAgentPanelWidth(nextWidth, viewportWidth)
      panelRef.current?.style.setProperty('--ui-agent-panel-width', `${resolvedWidth}px`)
      setDetailAgentPanelWidth(resolvedWidth)
      setPanelWidth(resolvedWidth)
    },
    minSize: DETAIL_AGENT_PANEL_MIN_WIDTH,
    maxSize: () => {
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440
      return agentPanelMaxWidth(viewportWidth)
    },
    resizeEdge: 'left',
    collapsed: !open,
    onCollapsedChange: (collapsed) => {
      if (collapsed) setOpen(false)
    },
    collapseMode: 'after-min',
    ariaLabel: 'Resize assistant panel',
    resizingBodyClassNames: resizeBodyClassNames.current,
  })

  useEffect(() => {
    setDetailAgentPanelWidth(panelWidth)
  }, [panelWidth, setDetailAgentPanelWidth])

  useEffect(() => {
    function handleWorkspace() {
      setPendingPanelAction('creating')
      setOpen(true)
    }
    function handleNewConversation() {
      setPendingPanelAction('creating')
      setOpen(true)
    }
    function handleThreadOpen(event: Event) {
      const detail = (event as CustomEvent<AgentPanelThreadPayload>).detail
      if (!detail?.threadId?.trim()) return
      setPendingThreadIdToOpen(detail.threadId)
      setPendingPanelAction('restoring')
      setOpen(true)
    }

    window.addEventListener(AGENT_PANEL_WORKSPACE_EVENT, handleWorkspace)
    window.addEventListener(AGENT_PANEL_NEW_CONVERSATION_EVENT, handleNewConversation)
    window.addEventListener(AGENT_PANEL_THREAD_EVENT, handleThreadOpen)
    return () => {
      window.removeEventListener(AGENT_PANEL_WORKSPACE_EVENT, handleWorkspace)
      window.removeEventListener(AGENT_PANEL_NEW_CONVERSATION_EVENT, handleNewConversation)
      window.removeEventListener(AGENT_PANEL_THREAD_EVENT, handleThreadOpen)
    }
  }, [])

  useEffect(() => {
    function updateDockLayout() {
      const viewportWidth = window.innerWidth
      setPanelWidth((current) => clampAgentPanelWidth(current, viewportWidth))
    }

    updateDockLayout()
    window.addEventListener('resize', updateDockLayout)
    return () => window.removeEventListener('resize', updateDockLayout)
  }, [])

  const handlePendingThreadHandled = useCallback((threadId: string) => {
    setPendingThreadIdToOpen((current) => current === threadId ? null : current)
  }, [])

  const handlePendingPanelActionSettled = useCallback(() => {
    setPendingPanelAction(null)
  }, [])

  return {
    dockLayout,
    handlePendingPanelActionSettled,
    handlePendingThreadHandled,
    open,
    panelRef,
    panelWidth,
    pendingPanelAction,
    pendingThreadIdToOpen,
    resizeHandleProps: panelResize.resizeHandleProps,
    toggleOpen,
  }
}
