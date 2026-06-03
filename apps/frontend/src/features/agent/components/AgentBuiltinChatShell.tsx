import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { AgentEmpty, AgentMain, AgentShell } from '@movscript/ui'
import { AgentChatView } from '@/features/agent/components/AgentChatView'
import { ConversationList } from '@/features/agent/components/AgentConversationList'
import { useAgentBuiltinChatController } from '@/features/agent/presentation/useAgentBuiltinChatController'
import { useAgentRuntimeSessionLease } from '@/features/agent/presentation/useAgentRuntimeSessionLease'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import { useTranslation } from 'react-i18next'

export type AgentChatHost = 'dock-panel' | 'floating-panel' | 'immersive'

export interface AgentBuiltinChatShellProps {
  userId: string
  onCollapse: () => void
  showCollapse?: boolean
  host?: AgentChatHost
  surface?: 'panel' | 'page'
  pageEmptyAccessory?: ReactNode
  pendingStartupStatus?: 'creating' | 'restoring' | null
  pendingThreadIdToOpen?: string | null
  pendingThreadSessionIdToOpen?: string | null
  onPendingThreadHandled?: (threadId: string) => void
  onStartupSettled?: () => void
}

export function AgentBuiltinChatShell({
  userId,
  onCollapse,
  showCollapse = true,
  host,
  surface = 'panel',
  pageEmptyAccessory,
  pendingStartupStatus,
  pendingThreadIdToOpen,
  pendingThreadSessionIdToOpen,
  onPendingThreadHandled,
  onStartupSettled,
}: AgentBuiltinChatShellProps) {
  const { t } = useTranslation()
  const {
    activeConversation,
    activeTask,
    archivedConversations,
    archiveConversation,
    archiveConversations,
    clearActiveConversation,
    conversations,
    deleteConversation,
    newConversation,
    renameConversation,
    reorderConversation,
    restoreLocalThread,
    selectConversation,
    startupStatus,
  } = useAgentBuiltinChatController({
    userId,
    pendingThreadIdToOpen,
    pendingThreadSessionIdToOpen,
    onPendingThreadHandled,
    onStartupSettled,
  })
  const resolvedHost = host ?? (surface === 'page' ? 'immersive' : 'dock-panel')
  const resolvedSurface = resolvedHost === 'immersive' ? 'page' : 'panel'
  const visibleStartupStatus = startupStatus ?? pendingStartupStatus ?? null
  const activeRuntimeSessionId = useAgentSessionStore((state) => activeConversation
    ? state.sessionIdsByConversation[activeConversation.id]
    : undefined)
  const leaseSessionId = activeRuntimeSessionId ?? activeConversation?.runtimeSessionId
  useAgentRuntimeSessionLease({
    enabled: !!leaseSessionId,
    sessionId: leaseSessionId,
    holder: `chat:${resolvedHost}`,
  })

  return (
    <AgentShell
      density="compact"
      data-agent-chat-host={resolvedHost}
      className={resolvedHost === 'immersive' ? 'ai-agent-panel-shell agent-page-chat-shell project-agent-chat-shell' : 'ai-agent-panel-shell'}
    >
      {visibleStartupStatus ? (
        <AgentMain className="ai-agent-panel-main" data-agent-chat-host={resolvedHost}>
          <AgentEmpty role="status" aria-live="polite">
            <Loader2 size={16} className="animate-spin" />
            <span>
              {visibleStartupStatus === 'creating'
                ? t('agents.chat.connectingConversation')
                : t('agents.chat.loadingConversationTimeline')}
            </span>
          </AgentEmpty>
        </AgentMain>
      ) : activeConversation ? (
        <AgentChatView
          key={activeConversation.id}
          conv={activeConversation}
          conversations={conversations}
          userId={userId}
          onBack={clearActiveConversation}
          onCollapse={onCollapse}
          showCollapse={showCollapse}
          onSelectConversation={selectConversation}
          onNewConversation={newConversation}
          onRenameConversation={renameConversation}
          onCloseConversation={archiveConversation}
          onCloseConversations={archiveConversations}
          onReorderConversation={reorderConversation}
          onRestoreLocalThread={restoreLocalThread}
          archivedConversations={archivedConversations}
          onRestoreArchivedConversation={selectConversation}
          host={resolvedHost}
          surface={resolvedSurface}
          pageEmptyAccessory={pageEmptyAccessory}
          externalTask={activeTask}
          pageToolRequestId={activeTask?.requestId}
          showConversationControls={resolvedHost !== 'immersive'}
        />
      ) : (
        <ConversationList
          conversations={conversations}
          archivedConversations={archivedConversations}
          onSelect={selectConversation}
          onNew={newConversation}
          onArchive={archiveConversation}
          onDelete={deleteConversation}
          onRename={renameConversation}
          onCollapse={onCollapse}
          showCollapse={showCollapse}
          onRestoreLocalThread={restoreLocalThread}
        />
      )}
    </AgentShell>
  )
}
