import { AgentShell } from '@movscript/ui'
import { AgentChatView } from '@/components/agent/AgentChatView'
import { ConversationList } from '@/components/agent/AgentConversationList'
import { useAgentBuiltinChatController } from '@/components/agent/useAgentBuiltinChatController'

export interface AgentBuiltinChatShellProps {
  userId: string
  onCollapse: () => void
  pendingThreadIdToOpen?: string | null
  onPendingThreadHandled?: (threadId: string) => void
}

export function AgentBuiltinChatShell({
  userId,
  onCollapse,
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
    <AgentShell density="compact" className="ai-agent-panel-shell">
      {activeConversation ? (
        <AgentChatView
          key={activeConversation.id}
          conv={activeConversation}
          conversations={conversations}
          userId={userId}
          onBack={clearActiveConversation}
          onCollapse={onCollapse}
          onSelectConversation={selectConversation}
          onNewConversation={newConversation}
          onCloseConversation={deleteConversation}
          onCloseConversations={deleteConversations}
          externalTask={activeTask}
          pageToolRequestId={activeTask?.requestId}
        />
      ) : (
        <ConversationList
          conversations={conversations}
          onSelect={selectConversation}
          onNew={newConversation}
          onDelete={deleteConversation}
          onCollapse={onCollapse}
          onRestoreLocalThread={restoreLocalThread}
        />
      )}
    </AgentShell>
  )
}
