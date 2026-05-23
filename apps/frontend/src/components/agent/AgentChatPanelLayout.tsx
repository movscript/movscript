import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { AgentConversationItem, AgentMain, Button } from '@movscript/ui'
import { AgentDebugPreviewDialog } from '@/components/agent/AgentDebugPreviewDialog'
import { AgentChatHeaderSection } from '@/components/agent/AgentChatHeaderSection'
import { AgentConversationThreadSection } from '@/components/agent/AgentConversationThreadSection'
import { AgentComposerSection } from '@/components/agent/AgentComposerSection'
import { conversationDisplayTitle, formatAgentDate } from '@/components/agent/AgentConversationList'
import type { AgentChatViewLayoutProps } from '@/components/agent/AgentChatViewLayout'

export function AgentChatPanelLayout({
  composer,
  debugPreview,
  header,
  thread,
}: AgentChatViewLayoutProps) {
  const { t, i18n } = useTranslation()
  const emptyConversation = thread.messages.length === 0
  const [historyOpen, setHistoryOpen] = useState(emptyConversation)
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const historyConversations = historyOpen
    ? header.conversations.filter((conversation) => conversation.id !== header.activeConversation.id)
    : []
  const composerInContent = emptyConversation || historyOpen

  useEffect(() => {
    setHistoryOpen(thread.messages.length === 0)
  }, [header.activeConversation.id])

  useEffect(() => {
    if (thread.messages.length > 0) setHistoryOpen(false)
  }, [thread.messages.length])

  return (
    <AgentMain className="ai-agent-panel-main">
      <AgentDebugPreviewDialog {...debugPreview} />
      <section
        className="ai-agent-panel-content-card"
        data-empty-conversation={emptyConversation ? 'true' : undefined}
        data-history-open={historyOpen ? 'true' : undefined}
      >
        <AgentChatHeaderSection
          {...header}
          historyOpen={historyOpen}
          onToggleHistory={() => setHistoryOpen((open) => !open)}
        />
        <AgentConversationThreadSection {...thread} />
        {composerInContent && <AgentComposerSection {...composer} />}
        {historyOpen && (
          <section className="ai-agent-panel-empty-history" aria-label={t('agents.chat.conversationHistory')}>
            <div className="ai-agent-panel-empty-history-header">
              <span>{t('agents.chat.conversationHistory')}</span>
              <span>{historyConversations.length}</span>
            </div>
            <div className="ai-agent-panel-empty-history-list">
              {historyConversations.length === 0 ? (
                <div className="ai-agent-panel-empty-history-empty">
                  {t('agents.chat.noHistoryConversations')}
                </div>
              ) : historyConversations.map((conversation) => (
                <div key={conversation.id} className="group relative">
                  <AgentConversationItem
                    title={conversationDisplayTitle(conversation, t)}
                    description={conversation.messages[conversation.messages.length - 1]?.content.slice(0, 54) ?? ''}
                    meta={formatAgentDate(conversation.updatedAt, locale)}
                    className="ai-agent-panel-empty-history-item pr-9"
                    onClick={() => header.onSelectConversation(conversation.id)}
                  />
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={(event) => {
                      event.stopPropagation()
                      header.onCloseConversation(conversation.id)
                    }}
                    className="ai-agent-panel-empty-history-close absolute right-2 top-1/2 -translate-y-1/2"
                    aria-label={t('agents.chat.closeConversation')}
                    title={t('agents.chat.closeConversation')}
                  >
                    <X size={12} />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
      </section>
      {!composerInContent && <AgentComposerSection {...composer} />}
    </AgentMain>
  )
}
