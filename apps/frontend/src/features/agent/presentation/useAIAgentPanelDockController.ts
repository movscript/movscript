import { useEffect, useRef } from 'react'
import { AGENT_PANEL_WORKSPACE_EVENT, AGENT_PANEL_NEW_CONVERSATION_EVENT, AGENT_PANEL_THREAD_EVENT } from '@/features/agent/application/agentPanelBridge'
import { useAgentPanelUiStore } from '@/features/agent/presentation/agentPanelUiStore'
import { useResizablePanel } from '@movscript/ui'
import {
  DETAIL_AGENT_PANEL_MAX_WIDTH,
  DETAIL_AGENT_PANEL_MIN_WIDTH,
} from '@/features/agent/presentation/agentDetailAssistantPaneSizing'

export function useAIAgentPanelDockController({
  panelWidth,
  onPanelWidthChange,
}: {
  panelWidth: number
  onPanelWidthChange: (width: number) => void
}) {
  const open = useAgentPanelUiStore((state) => state.open)
  const setOpen = useAgentPanelUiStore((state) => state.setOpen)
  const toggleOpen = useAgentPanelUiStore((state) => state.toggleOpen)
  const dockLayout = true
  const panelRef = useRef<HTMLDivElement | null>(null)

  const panelResize = useResizablePanel({
    size: panelWidth,
    onSizeChange: onPanelWidthChange,
    onSizeCommit: onPanelWidthChange,
    minSize: DETAIL_AGENT_PANEL_MIN_WIDTH,
    maxSize: DETAIL_AGENT_PANEL_MAX_WIDTH,
    resizeEdge: 'left',
    collapsed: !open,
    onCollapsedChange: (collapsed) => {
      if (collapsed) setOpen(false)
    },
    collapseMode: 'after-min',
    ariaLabel: 'Resize assistant panel',
  })

  useEffect(() => {
    function handleWorkspace() {
      setOpen(true)
    }
    function handleNewConversation() {
      setOpen(true)
    }
    function handleThreadOpen() {
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
  }, [setOpen])

  return {
    dockLayout,
    open,
    panelRef,
    panelWidth,
    resizeHandleProps: panelResize.resizeHandleProps,
    toggleOpen,
  }
}
