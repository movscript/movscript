import { memo, useEffect, useState } from 'react'
import { AgentUnifiedChatShell } from '@/features/agent/components/AgentUnifiedChatShell'
import { useAIAgentPanelDockController } from '@/features/agent/presentation/useAIAgentPanelDockController'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { AgentPanelShell } from '@movscript/ui'

export const AIAgentPanel = memo(function AIAgentPanel({
  width,
  onWidthChange,
}: {
  width: number
  onWidthChange: (width: number) => void
}) {
  const currentUser = useUserStore((s) => s.currentUser)
  const userId = currentUser ? String(currentUser.ID) : ''
  const {
    dockLayout,
    open,
    panelRef,
    panelWidth,
    resizeHandleProps,
    toggleOpen,
  } = useAIAgentPanelDockController({
    panelWidth: width,
    onPanelWidthChange: onWidthChange,
  })
  const [renderPanel, setRenderPanel] = useState(open)
  const [animatedOpen, setAnimatedOpen] = useState(open)

  useEffect(() => {
    if (open) {
      setRenderPanel(true)
      const frame = window.requestAnimationFrame(() => setAnimatedOpen(true))
      return () => window.cancelAnimationFrame(frame)
    }
    setAnimatedOpen(false)
    const timeout = window.setTimeout(() => setRenderPanel(false), 260)
    return () => window.clearTimeout(timeout)
  }, [open])

  useEffect(() => {
    if (!renderPanel) {
      setAnimatedOpen(false)
      return
    }
  }, [renderPanel])

  if (!renderPanel) return null

  return (
    <AgentPanelShell
      open={renderPanel}
      dockLayout={dockLayout}
      chrome={dockLayout ? 'dock' : 'floating'}
      collapsed={!animatedOpen}
      panelRef={panelRef}
      panelWidth={animatedOpen ? panelWidth : 0}
      resizeHandleProps={resizeHandleProps}
    >
      <AgentUnifiedChatShell
        userId={userId}
        onCollapse={toggleOpen}
        showCollapse={false}
        host={dockLayout ? 'dock-panel' : 'floating-panel'}
      />
    </AgentPanelShell>
  )
})
