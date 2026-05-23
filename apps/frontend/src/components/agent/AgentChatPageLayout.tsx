import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentMain } from '@movscript/ui'
import { AgentDebugPreviewDialog } from '@/components/agent/AgentDebugPreviewDialog'
import { AgentConversationThreadSection } from '@/components/agent/AgentConversationThreadSection'
import { AgentComposerSection } from '@/components/agent/AgentComposerSection'
import type { AgentChatViewLayoutProps } from '@/components/agent/AgentChatViewLayout'

export function AgentChatPageLayout({
  composer,
  debugPreview,
  emptyAccessory,
  thread,
}: AgentChatViewLayoutProps & { emptyAccessory?: ReactNode }) {
  const { t } = useTranslation()
  const emptyConversation = thread.messages.length === 0

  return (
    <AgentMain className="agent-page-chat-main">
      <AgentDebugPreviewDialog {...debugPreview} />
      {emptyConversation ? (
        <section className="agent-page-chat-empty" aria-label={composer.composerPlaceholder}>
          <div className="agent-page-chat-empty-composer">
            <h1 className="agent-page-chat-empty-title">
              {t('agents.chat.agentModeEmptyTitle')}
            </h1>
            <AgentComposerSection {...composer} />
            {emptyAccessory ? (
              <div className="agent-page-chat-empty-accessory">
                {emptyAccessory}
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="agent-page-chat-thread-shell">
          <div className="agent-page-chat-thread">
            <AgentConversationThreadSection {...thread} />
          </div>
          <div className="agent-page-chat-composer">
            <AgentComposerSection {...composer} />
          </div>
        </section>
      )}
    </AgentMain>
  )
}
