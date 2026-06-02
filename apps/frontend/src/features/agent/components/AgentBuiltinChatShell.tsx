import type { ReactNode } from 'react'
import { AgentShell } from '@movscript/ui'
import { AgentChatView } from '@/features/agent/components/AgentChatView'
import { ConversationList } from '@/features/agent/components/AgentConversationList'
import { useAgentBuiltinChatController } from '@/features/agent/presentation/useAgentBuiltinChatController'

export type AgentChatHost = 'dock-panel' | 'floating-panel' | 'immersive'

export interface AgentBuiltinChatShellProps {
  userId: string
  onCollapse: () => void
  showCollapse?: boolean
  host?: AgentChatHost
  surface?: 'panel' | 'page'
  pageEmptyAccessory?: ReactNode
  pendingThreadIdToOpen?: string | null
  onPendingThreadHandled?: (threadId: string) => void
}

export function AgentBuiltinChatShell({
  userId,
  onCollapse,
  showCollapse = true,
  host,
  surface = 'panel',
  pageEmptyAccessory,
  pendingThreadIdToOpen,
  onPendingThreadHandled,
}: AgentBuiltinChatShellProps) {
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
    reorderConversation,
    restoreLocalThread,
    selectConversation,
  } = useAgentBuiltinChatController({
    userId,
    pendingThreadIdToOpen,
    onPendingThreadHandled,
  })
  const resolvedHost = host ?? (surface === 'page' ? 'immersive' : 'dock-panel')
  const resolvedSurface = resolvedHost === 'immersive' ? 'page' : 'panel'

  return (
    <AgentShell
      density="compact"
      data-agent-chat-host={resolvedHost}
      className={resolvedHost === 'immersive' ? 'ai-agent-panel-shell agent-page-chat-shell project-agent-chat-shell' : 'ai-agent-panel-shell'}
    >
      {activeConversation ? (
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
          onCollapse={onCollapse}
          showCollapse={showCollapse}
          onRestoreLocalThread={restoreLocalThread}
        />
      )}
    </AgentShell>
  )
}
