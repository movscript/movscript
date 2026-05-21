import { AgentBuiltinChatShell } from '@/components/agent/AgentBuiltinChatShell'
import { useAIAgentPanelDockController } from '@/components/agent/useAIAgentPanelDockController'
import { cn } from '@/lib/utils'
import { useUserStore } from '@/store/userStore'

export function AIAgentPanel() {
  const currentUser = useUserStore((s) => s.currentUser)
  const userId = currentUser ? String(currentUser.ID) : ''
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

  return (
    <div ref={panelRef} className={cn(
      'ai-agent-panel z-20 flex min-h-0 min-w-0 bg-background flex-col overflow-hidden transition-[width] duration-200',
      dockLayout
        ? cn(
            'relative h-full shrink-0 border-l border-border',
            'w-[var(--ai-agent-panel-width)]',
          )
        : cn(
            'fixed right-3 top-3 h-[calc(100vh-1.5rem)] rounded-md border border-border shadow-lg',
            'w-[min(392px,calc(100vw-1.5rem))]',
          ),
    )} style={{ ['--ai-agent-panel-width' as string]: `${panelWidth}px` }}>
      {dockLayout && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize assistant panel"
          className="absolute left-0 top-0 z-20 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/30"
          onPointerDown={startPanelResize}
        >
          <div className="absolute left-1/2 top-1/2 h-10 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border/80" />
        </div>
      )}

      <div className="flex flex-col flex-1 min-h-0">
        <AgentBuiltinChatShell
          userId={userId}
          onCollapse={toggleOpen}
          pendingThreadIdToOpen={pendingThreadIdToOpen}
          onPendingThreadHandled={handlePendingThreadHandled}
        />
      </div>
    </div>
  )
}
