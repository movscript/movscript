import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentMain } from '@movscript/ui'
import { AgentDebugPreviewDialog } from '@/features/agent/components/AgentDebugPreviewDialog'
import { AgentConversationThreadSection } from '@/features/agent/components/AgentConversationThreadSection'
import { AgentComposerSection } from '@/features/agent/components/AgentComposerSection'
import type { AgentChatViewLayoutProps } from '@/features/agent/components/AgentChatViewLayout'

export function AgentChatPageLayout({
  composer,
  debugPreview,
  emptyAccessory,
  thread,
}: AgentChatViewLayoutProps & { emptyAccessory?: ReactNode }) {
  const { t } = useTranslation()
  const conversationStarted = thread.messages.length > 0 || thread.conversationBlocks.length > 0 || !!debugPreview.draft

  return (
    <AgentMain className="agent-page-chat-main">
      <AgentDebugPreviewDialog {...debugPreview} />
      {!conversationStarted ? (
        <section className="agent-page-chat-thread-shell agent-page-chat-thread-shell--empty" aria-label={composer.composerPlaceholder}>
          <div className="agent-page-chat-empty">
            <h1 className="agent-page-chat-empty-title">
              {t('agents.chat.agentModeEmptyTitle')}
            </h1>
            {emptyAccessory ? (
              <div className="agent-page-chat-empty-accessory">
                {emptyAccessory}
              </div>
            ) : null}
            <div className="agent-page-chat-composer agent-page-chat-empty-composer">
              <AgentComposerSection {...composer} />
            </div>
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
