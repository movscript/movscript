import { AgentShell } from '@movscript/ui'
import { AgentChatView } from '@/components/agent/AgentChatView'
import { ConversationList } from '@/components/agent/AgentConversationList'
import { useAgentBuiltinChatController } from '@/components/agent/useAgentBuiltinChatController'

export interface AgentBuiltinChatShellProps {
  userId: string
  onCollapse: () => void
  showCollapse?: boolean
  surface?: 'panel' | 'page'
  pendingThreadIdToOpen?: string | null
  onPendingThreadHandled?: (threadId: string) => void
}

export function AgentBuiltinChatShell({
  userId,
  onCollapse,
  showCollapse = true,
  surface = 'panel',
  pendingThreadIdToOpen,
  onPendingThreadHandled,
}: AgentBuiltinChatShellProps) {
  const {
    activeConversation,
    activeTask,
    clearActiveConversation,
    conversations,
    deleteConversation,
    deleteConversations,
    newConversation,
    restoreLocalThread,
    selectConversation,
  } = useAgentBuiltinChatController({
    userId,
    pendingThreadIdToOpen,
    onPendingThreadHandled,
  })

  return (
    <AgentShell density="compact" className={surface === 'page' ? 'ai-agent-panel-shell project-agent-chat-shell' : 'ai-agent-panel-shell'}>
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
          externalTask={activeTask}
          pageToolRequestId={activeTask?.requestId}
          showConversationControls={surface !== 'page'}
        />
      ) : (
        <ConversationList
          conversations={conversations}
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
