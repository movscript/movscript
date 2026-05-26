import type { ReactNode } from 'react'
import { AgentShell } from '@movscript/ui'
import { AgentChatView } from '@/features/agent/components/AgentChatView'
import { ConversationList } from '@/features/agent/components/AgentConversationList'
import { useAgentBuiltinChatController } from '@/features/agent/presentation/useAgentBuiltinChatController'

export interface AgentBuiltinChatShellProps {
  userId: string
  onCollapse: () => void
  showCollapse?: boolean
  surface?: 'panel' | 'page'
  pageEmptyAccessory?: ReactNode
  pendingThreadIdToOpen?: string | null
  onPendingThreadHandled?: (threadId: string) => void
}

export function AgentBuiltinChatShell({
  userId,
  onCollapse,
  showCollapse = true,
  surface = 'panel',
  pageEmptyAccessory,
  pendingThreadIdToOpen,
  onPendingThreadHandled,
}: AgentBuiltinChatShellProps) {
  const {
    activeConversation,
    activeTask,
    archivedConversations,
    clearActiveConversation,
    conversations,
    deleteConversation,
    deleteConversations,
    newConversation,
    reorderConversation,
    restoreLocalThread,
    selectConversation,
  } = useAgentBuiltinChatController({
    userId,
    pendingThreadIdToOpen,
    onPendingThreadHandled,
  })

  return (
    <AgentShell density="compact" className={surface === 'page' ? 'ai-agent-panel-shell agent-page-chat-shell project-agent-chat-shell' : 'ai-agent-panel-shell'}>
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
          onCloseConversation={deleteConversation}
          onCloseConversations={deleteConversations}
          onReorderConversation={reorderConversation}
          onRestoreLocalThread={restoreLocalThread}
          archivedConversations={archivedConversations}
          onRestoreArchivedConversation={selectConversation}
          surface={surface}
          pageEmptyAccessory={pageEmptyAccessory}
          externalTask={activeTask}
          pageToolRequestId={activeTask?.requestId}
          showConversationControls={surface !== 'page'}
        />
      ) : (
        <ConversationList
          conversations={conversations}
          archivedConversations={archivedConversations}
          onSelect={selectConversation}
          onNew={newConversation}
          onDelete={deleteConversation}
          onCollapse={onCollapse}
          showCollapse={showCollapse}
          onRestoreLocalThread={restoreLocalThread}
        />
      )}
    </AgentShell>
  )
}
