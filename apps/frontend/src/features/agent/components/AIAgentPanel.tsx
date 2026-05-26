import { AgentBuiltinChatShell } from '@/features/agent/components/AgentBuiltinChatShell'
import { useAIAgentPanelDockController } from '@/features/agent/presentation/useAIAgentPanelDockController'
import { useAgentStore } from '@/features/agent/state/agentStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { AgentPanelShell } from '@movscript/ui'

export function AIAgentPanel() {
  const currentUser = useUserStore((s) => s.currentUser)
  const userId = currentUser ? String(currentUser.ID) : ''
  const hasOpenConversations = useAgentStore((s) => (s.convsByUser[userId]?.conversations.length ?? 0) > 0)
  const {
    dockLayout,
    handlePendingThreadHandled,
    open,
    panelRef,
    panelWidth,
    pendingThreadIdToOpen,
    startPanelResize,
    toggleOpen,
  } = useAIAgentPanelDockController()

  if (!open) return null

  if (!hasOpenConversations) {
    return (
      <div className="hidden">
        <AgentBuiltinChatShell
          userId={userId}
          onCollapse={toggleOpen}
          pendingThreadIdToOpen={pendingThreadIdToOpen}
          onPendingThreadHandled={handlePendingThreadHandled}
        />
      </div>
    )
  }

  return (
    <AgentPanelShell
      open={open}
      dockLayout={dockLayout}
      panelRef={panelRef}
      panelWidth={panelWidth}
      onResizeStart={startPanelResize}
    >
      <AgentBuiltinChatShell
        userId={userId}
        onCollapse={toggleOpen}
        pendingThreadIdToOpen={pendingThreadIdToOpen}
        onPendingThreadHandled={handlePendingThreadHandled}
      />
    </AgentPanelShell>
  )
}
