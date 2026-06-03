import { useMemo, type KeyboardEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentConversationTabsPanel, type AgentConversationTabItem } from '@movscript/ui'
import { conversationDisplayTitle } from '@/features/agent/presentation/agentConversationLabels'
import { visibleTranscriptChatMessages } from '@/features/agent/domain/agentMessageBoundaries'
import type { AgentRuntimeStatusLight } from '@/features/agent/domain/agentRuntimeStatusLight'
import type { Conversation } from '@/features/agent/state/agentStore'

export interface AgentConversationTabsProps {
  activeConversationId: string
  conversations: Conversation[]
  onCloseConversation: (id: string) => void
  onCloseTabContextMenu: () => void
  onOpenKeyboardMenu: (event: KeyboardEvent, conversationId: string) => void
  onOpenMenu: (event: MouseEvent, conversationId: string) => void
  onReorderConversation: (draggedId: string, targetId: string, position: 'before' | 'after') => void
  onSelectConversation: (id: string) => void
  runtimeStatusLights?: Partial<Record<string, AgentRuntimeStatusLight>>
}

export function AgentConversationTabs({
  activeConversationId,
  conversations,
  onCloseConversation,
  onCloseTabContextMenu,
  onOpenKeyboardMenu,
  onOpenMenu,
  onReorderConversation,
  onSelectConversation,
  runtimeStatusLights,
}: AgentConversationTabsProps) {
  const { t } = useTranslation()

  const mappedConversations: AgentConversationTabItem[] = useMemo(() => conversations.map((item) => {
    const runtimeStatusLight = runtimeStatusLights?.[item.id]
    const visibleMessageCount = visibleTranscriptChatMessages(item.messages).length
    return {
      id: item.id,
      title: conversationDisplayTitle(item, t),
      messageCount: visibleMessageCount > 0 ? visibleMessageCount : undefined,
      runtimeState: runtimeStatusLight?.state,
      runtimeDetail: runtimeStatusLight?.detail,
    }
  }), [conversations, runtimeStatusLights, t])

  return (
    <AgentConversationTabsPanel
      activeConversationId={activeConversationId}
      conversations={mappedConversations}
      onCloseConversation={onCloseConversation}
      onCloseTabContextMenu={onCloseTabContextMenu}
      onOpenKeyboardMenu={onOpenKeyboardMenu}
      onOpenMenu={onOpenMenu}
      onReorderConversation={onReorderConversation}
      onSelectConversation={onSelectConversation}
      conversationTabsLabel={t('agents.chat.conversationTabs')}
      archiveConversationLabel={t('agents.chat.archiveConversation')}
      closeConversationLabel={t('agents.chat.closeConversation')}
    />
  )
}
