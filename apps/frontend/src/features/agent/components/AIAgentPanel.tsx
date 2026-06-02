import { useEffect, useState } from 'react'
import { AgentBuiltinChatShell } from '@/features/agent/components/AgentBuiltinChatShell'
import { useAIAgentPanelDockController } from '@/features/agent/presentation/useAIAgentPanelDockController'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { AgentPanelShell } from '@movscript/ui'

export function AIAgentPanel() {
  const currentUser = useUserStore((s) => s.currentUser)
  const userId = currentUser ? String(currentUser.ID) : ''
  const hasOpenConversations = useAgentSessionStore((s) => Boolean(s.activeConversationIdsByUser?.[userId]))
  const {
    dockLayout,
    handlePendingPanelActionSettled,
    handlePendingThreadHandled,
    open,
    panelRef,
    panelWidth,
    pendingPanelAction,
    pendingThreadIdToOpen,
    resizeHandleProps,
    toggleOpen,
  } = useAIAgentPanelDockController()
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

  if (!hasOpenConversations && open && !pendingPanelAction && !pendingThreadIdToOpen) {
    return (
      <div className="hidden">
        <AgentBuiltinChatShell
          userId={userId}
          onCollapse={toggleOpen}
          pendingStartupStatus={pendingPanelAction}
          pendingThreadIdToOpen={pendingThreadIdToOpen}
          onPendingThreadHandled={handlePendingThreadHandled}
          onStartupSettled={handlePendingPanelActionSettled}
        />
      </div>
    )
  }

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
      <AgentBuiltinChatShell
        userId={userId}
        onCollapse={toggleOpen}
        showCollapse={false}
        host={dockLayout ? 'dock-panel' : 'floating-panel'}
        pendingStartupStatus={pendingPanelAction}
        pendingThreadIdToOpen={pendingThreadIdToOpen}
        onPendingThreadHandled={handlePendingThreadHandled}
        onStartupSettled={handlePendingPanelActionSettled}
      />
    </AgentPanelShell>
  )
}
