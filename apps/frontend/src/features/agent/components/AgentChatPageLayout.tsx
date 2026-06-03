import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, MoreHorizontal } from 'lucide-react'
import {
  AgentEmpty,
  AgentMain,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@movscript/ui'
import { AgentDebugPreviewDialog } from '@/features/agent/components/AgentDebugPreviewDialog'
import { ContextDiagnosticDialog } from '@/features/agent/components/ContextDiagnosticDialog'
import { AgentConversationThreadSection, latestPlanFromTimelineItems } from '@/features/agent/components/AgentConversationThreadSection'
import { AgentComposerSection } from '@/features/agent/components/AgentComposerSection'
import { hasAgentPinnedStatus } from '@/features/agent/components/AgentPinnedStatusShelf'
import { transcriptMessageCount } from '@/features/agent/domain/agentMessageBoundaries'
import type { AgentChatViewLayoutProps } from '@/features/agent/components/AgentChatViewLayout'
import type { AgentChatHost } from '@/features/agent/components/AgentBuiltinChatShell'

export function AgentChatPageLayout({
  composer,
  contextDiagnosticDialog,
  debugPreview,
  emptyAccessory,
  host = 'immersive',
  thread,
}: AgentChatViewLayoutProps & { emptyAccessory?: ReactNode; host?: AgentChatHost }) {
  const { t } = useTranslation()
  const [pinnedStatusExpanded, setPinnedStatusExpanded] = useState(false)
  const conversationStarted = transcriptMessageCount({ transcriptMessages: thread.transcriptMessages, transcriptMessageCount: thread.transcriptMessageCount }) > 0 || thread.conversationBlocks.length > 0 || !!debugPreview.workspace
  const loadingConversationTimeline = thread.timelineLoading && !conversationStarted
  const hasPinnedStatus = hasAgentPinnedStatus({
    plan: latestPlanFromTimelineItems(thread.timelineItems),
    generationProgressStates: thread.generationProgressStates,
    planSnapshot: thread.activePlanSnapshot,
  })
  const pageActions = hasPinnedStatus ? (
    <div className="agent-page-chat-actions">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t('agents.chat.pinnedStatus.title')}
            title={t('agents.chat.pinnedStatus.title')}
            className="agent-page-chat-actions__trigger"
          >
            <MoreHorizontal size={15} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="agent-page-chat-status-menu">
          <DropdownMenuItem onSelect={() => setPinnedStatusExpanded((expanded) => !expanded)}>
            {pinnedStatusExpanded ? t('agents.chat.pinnedStatus.collapse') : t('agents.chat.pinnedStatus.expand')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ) : null

  return (
    <AgentMain className="agent-page-chat-main" data-agent-chat-host={host}>
      <AgentDebugPreviewDialog {...debugPreview} />
      <ContextDiagnosticDialog {...contextDiagnosticDialog} />
      {!conversationStarted ? (
        <section className="agent-page-chat-thread-shell agent-page-chat-thread-shell--empty" aria-label={composer.composerPlaceholder}>
          {pageActions}
          <div className="agent-page-chat-empty">
            {loadingConversationTimeline ? (
              <AgentEmpty role="status" aria-live="polite" className="agent-page-chat-empty-status">
                <Loader2 size={16} className="animate-spin" />
                <span>{t('agents.chat.loadingConversationTimeline')}</span>
              </AgentEmpty>
            ) : (
              <h1 className="agent-page-chat-empty-title">
                {t('agents.chat.agentModeEmptyTitle')}
              </h1>
            )}
            {emptyAccessory ? (
              <div className="agent-page-chat-empty-accessory">
                {emptyAccessory}
              </div>
            ) : null}
            <div className="agent-page-chat-composer agent-page-chat-empty-composer">
              <AgentComposerSection {...composer} chrome="flush" />
            </div>
          </div>
        </section>
      ) : (
        <section className="agent-page-chat-thread-shell">
          {pageActions}
          <div className="agent-page-chat-thread">
            <AgentConversationThreadSection
              {...thread}
              pinnedStatusExpanded={pinnedStatusExpanded}
              onPinnedStatusExpandedChange={setPinnedStatusExpanded}
            />
          </div>
          <div className="agent-page-chat-composer">
            <AgentComposerSection {...composer} chrome="flush" />
          </div>
        </section>
      )}
    </AgentMain>
  )
}
