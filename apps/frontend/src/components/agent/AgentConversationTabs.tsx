import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquareText, X } from 'lucide-react'
import { conversationDisplayTitle } from '@/components/agent/AgentConversationList'
import type { Conversation } from '@/store/agentStore'

export interface AgentConversationTabsProps {
  activeConversationId: string
  conversations: Conversation[]
  onCloseConversation: (id: string) => void
  onCloseTabContextMenu: () => void
  onOpenKeyboardMenu: (event: KeyboardEvent, conversationId: string) => void
  onOpenMenu: (event: MouseEvent, conversationId: string) => void
  onSelectConversation: (id: string) => void
}

export function AgentConversationTabs({
  activeConversationId,
  conversations,
  onCloseConversation,
  onCloseTabContextMenu,
  onOpenKeyboardMenu,
  onOpenMenu,
  onSelectConversation,
}: AgentConversationTabsProps) {
  const { t } = useTranslation()

  return (
    <div
      className="ai-agent-panel-conversation-tabs"
      role="tablist"
      aria-label={t('agents.chat.conversationTabs')}
      data-density={conversations.length > 4 ? 'scroll' : 'fit'}
      style={{ '--ai-agent-panel-tab-count': conversations.length } as CSSProperties}
    >
      {conversations.map((item) => {
        const title = conversationDisplayTitle(item, t)
        return (
          <div
            key={item.id}
            className="ai-agent-panel-conversation-tab"
            data-active={item.id === activeConversationId ? 'true' : 'false'}
            onContextMenu={(event) => onOpenMenu(event, item.id)}
          >
            <button
              type="button"
              role="tab"
              aria-selected={item.id === activeConversationId}
              aria-label={title}
              className="ai-agent-panel-conversation-tab-main"
              title={`${title} · ${t('agents.chat.tabActions')}`}
              onClick={() => {
                onCloseTabContextMenu()
                onSelectConversation(item.id)
              }}
              onKeyDown={(event) => onOpenKeyboardMenu(event, item.id)}
              onAuxClick={(event) => {
                if (event.button !== 1) return
                event.preventDefault()
                onCloseConversation(item.id)
              }}
            >
              <MessageSquareText size={11} aria-hidden="true" />
              <span className="ai-agent-panel-conversation-tab-title">{title}</span>
              {item.messages.length > 0 ? (
                <span className="ai-agent-panel-conversation-tab-count" aria-label={t('agents.chat.messagesCount', { count: item.messages.length })}>
                  {item.messages.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="ai-agent-panel-conversation-tab-close"
              aria-label={t('agents.chat.closeConversation')}
              title={t('agents.chat.closeConversation')}
              onClick={(event) => {
                event.stopPropagation()
                onCloseConversation(item.id)
              }}
            >
              <X size={10} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
