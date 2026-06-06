import { useMemo, type KeyboardEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentConversationTabsPanel, type AgentConversationTabItem } from '@movscript/ui'
import { conversationDisplayTitle } from '@/features/agent/presentation/agentConversationLabels'
import { transcriptMessageCount } from '@/features/agent/domain/agentMessageBoundaries'
import type { ProviderSessionStatusLight } from '@/features/agent/domain/providerSessionStatusLight'
import type { Conversation } from '@/features/agent/state/agentStore'
import { ProviderControls } from '@/features/agent/components/ProviderControls'

export interface AgentConversationTabsProps {
  activeConversationId: string
  conversations: Conversation[]
  onCloseConversation: (id: string) => void
  onCloseTabContextMenu: () => void
  onOpenKeyboardMenu: (event: KeyboardEvent, conversationId: string) => void
  onOpenMenu: (event: MouseEvent, conversationId: string) => void
  onNewConversation: () => void
  onRenameConversation: (id: string, title: string) => void
  onReorderConversation: (draggedId: string, targetId: string, position: 'before' | 'after') => void
  onSelectConversation: (id: string) => void
  onToggleHistory?: () => void
  historyOpen?: boolean
  providerSessionStatusLights?: Partial<Record<string, ProviderSessionStatusLight>>
}

export function AgentConversationTabs({
  activeConversationId,
  conversations,
  onCloseConversation,
  onCloseTabContextMenu,
  onOpenKeyboardMenu,
  onOpenMenu,
  onNewConversation,
  onRenameConversation,
  onReorderConversation,
  onSelectConversation,
  onToggleHistory,
  historyOpen,
  providerSessionStatusLights,
}: AgentConversationTabsProps) {
  const { t } = useTranslation()

  const mappedConversations: AgentConversationTabItem[] = useMemo(() => conversations.map((item) => {
    const providerSessionStatusLight = providerSessionStatusLights?.[item.id]
    const visibleMessageCount = transcriptMessageCount(item)
    return {
      id: item.id,
      title: conversationDisplayTitle(item, t),
      messageCount: visibleMessageCount > 0 ? visibleMessageCount : undefined,
      sessionState: providerSessionStatusLight?.state,
      sessionDetail: providerSessionStatusLight?.detail,
      onRename: (title: string) => onRenameConversation(item.id, title),
    }
  }), [conversations, onRenameConversation, providerSessionStatusLights, t])

  return (
    <AgentConversationTabsPanel
      activeConversationId={activeConversationId}
      conversations={mappedConversations}
      endAccessory={(
        <ProviderControls
          historyOpen={historyOpen}
          onNewConversation={onNewConversation}
          onToggleHistory={onToggleHistory}
        />
      )}
      onCloseConversation={onCloseConversation}
      onCloseTabContextMenu={onCloseTabContextMenu}
      onOpenKeyboardMenu={onOpenKeyboardMenu}
      onOpenMenu={onOpenMenu}
      onReorderConversation={onReorderConversation}
      onSelectConversation={onSelectConversation}
      conversationTabsLabel={t('agents.chat.conversationTabs')}
      archiveConversationLabel={t('agents.chat.archiveConversation')}
      closeConversationLabel={t('agents.chat.closeConversation')}
      renameConversationLabel={t('agents.chat.renameConversation')}
    />
  )
}
