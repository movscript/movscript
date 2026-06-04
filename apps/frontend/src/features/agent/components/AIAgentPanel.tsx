import { useEffect, useMemo, useState } from 'react'
import { AgentUnifiedChatShell } from '@/features/agent/components/AgentUnifiedChatShell'
import { useAIAgentPanelDockController } from '@/features/agent/presentation/useAIAgentPanelDockController'
import { useHasOpenAgentConversations } from '@/features/agent/presentation/useHasOpenAgentConversations'
import {
  resolveNewConversationAgentProvider,
  useAgentProviderConfigStore,
} from '@/features/agent/state/agentProviderConfigStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { AgentPanelShell } from '@movscript/ui'

export function AIAgentPanel() {
  const currentUser = useUserStore((s) => s.currentUser)
  const userId = currentUser ? String(currentUser.ID) : ''
  const hasOpenConversations = useHasOpenAgentConversations(userId)
  const agentProviderSettings = useAgentProviderConfigStore((s) => s.settings)
  const activeProvider = useMemo(() => resolveNewConversationAgentProvider(agentProviderSettings), [agentProviderSettings])
  const usesRuntimeConversationIndex = activeProvider.kind !== 'codex'
  const {
    dockLayout,
    handlePendingPanelActionSettled,
    handlePendingThreadHandled,
    open,
    panelRef,
    panelWidth,
    pendingPanelAction,
    pendingThreadIdToOpen,
    pendingThreadSessionIdToOpen,
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

  if (usesRuntimeConversationIndex && !hasOpenConversations && open && !pendingPanelAction && !pendingThreadIdToOpen) {
    return (
      <div className="hidden">
        <AgentUnifiedChatShell
          userId={userId}
          onCollapse={toggleOpen}
          pendingStartupStatus={pendingPanelAction}
          pendingThreadIdToOpen={pendingThreadIdToOpen}
          pendingThreadSessionIdToOpen={pendingThreadSessionIdToOpen}
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
      <AgentUnifiedChatShell
        userId={userId}
        onCollapse={toggleOpen}
        showCollapse={false}
        host={dockLayout ? 'dock-panel' : 'floating-panel'}
        pendingStartupStatus={pendingPanelAction}
        pendingThreadIdToOpen={pendingThreadIdToOpen}
        pendingThreadSessionIdToOpen={pendingThreadSessionIdToOpen}
        onPendingThreadHandled={handlePendingThreadHandled}
        onStartupSettled={handlePendingPanelActionSettled}
      />
    </AgentPanelShell>
  )
}
