import { useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Archive, Loader2 } from 'lucide-react'
import { AgentConversationHistoryPanel, AgentConversationItem, AgentMain } from '@movscript/ui/business/agent'
import { Button } from '@movscript/ui/primitives'
import { AgentDebugPreviewDialog } from '@/features/agent/components/AgentDebugPreviewDialog'
import { ContextDiagnosticDialog } from '@/features/agent/components/ContextDiagnosticDialog'
import { AgentChatHeaderSection } from '@/features/agent/components/AgentChatHeaderSection'
import { AgentConversationThreadSection } from '@/features/agent/components/AgentConversationThreadSection'
import { AgentComposerSection } from '@/features/agent/components/AgentComposerSection'
import { hasAgentPinnedStatus } from '@/features/agent/components/AgentPinnedStatusShelf'
import { conversationDisplayTitle, formatAgentDate, providerThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import { latestTranscriptChatMessage } from '@/features/agent/domain/agentMessageBoundaries'
import { listProviderSessionThreadPageFromWorkspace } from '@/features/agent/application/providerSessionThreadQueryCache'
import { providerSessionThreadKeys } from '@/features/agent/application/providerSessionQueryKeys'
import { useAgentChatHistoryPaneController } from '@/features/agent/presentation/useAgentChatHistoryPaneController'
import { providerSessionClient } from '@/shared/infrastructure/providerSessionClient'
import type { AgentChatViewLayoutProps } from '@/features/agent/components/AgentChatViewLayout'
import type { AgentChatHost } from '@/features/agent/components/agentChatHost'

const HISTORY_PAGE_SIZE = 20

export function AgentChatPanelLayout({
  composer,
  contextDiagnosticDialog,
  debugPreview,
  header,
  host = 'dock-panel',
  providerSessionHistory,
  thread,
}: AgentChatViewLayoutProps & { host?: AgentChatHost }) {
  const { t, i18n } = useTranslation()
  const conversationStarted = thread.conversationStarted || !!debugPreview.workspace
  const emptyConversation = !conversationStarted
  const [pinnedStatusExpanded, setPinnedStatusExpanded] = useState(false)
  const [restoringThreadId, setRestoringThreadId] = useState<string | null>(null)
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const historyPane = useAgentChatHistoryPaneController({
    activeConversationId: header.activeConversation.id,
    ariaLabel: t('agents.chat.conversationHistory'),
    conversationStarted,
  })
  const historyQuery = useInfiniteQuery({
    queryKey: providerSessionThreadKeys.panelHistory(providerSessionClient.baseURL),
    queryFn: async ({ pageParam, signal }) => {
      return listProviderSessionThreadPageFromWorkspace({
        limit: HISTORY_PAGE_SIZE,
        includeProvisional: true,
        ...(typeof pageParam === 'string' ? { cursor: pageParam } : {}),
        signal,
      })
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: historyPane.open,
    retry: false,
  })
  const historyThreads = historyQuery.data?.pages
    .flatMap((page) => page.threads)
    .filter((providerThread) => providerThread.id !== header.activeConversation.providerThreadId) ?? []
  const archivedConversations = useMemo(
    () => providerSessionHistory.archivedConversations
      .filter((conversation) => conversation.id !== header.activeConversation.id)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [header.activeConversation.id, providerSessionHistory.archivedConversations],
  )
  const archivedProviderThreadIds = useMemo(
    () => new Set(archivedConversations.flatMap((conversation) => conversation.providerThreadId ? [conversation.providerThreadId] : [])),
    [archivedConversations],
  )
  const openProviderThreadIds = useMemo(
    () => new Set(providerSessionHistory.conversations.flatMap((conversation) => {
      const ids = conversation.providerThreadId ? [conversation.providerThreadId] : []
      if (conversation.id.startsWith('thread_')) ids.push(conversation.id)
      return ids
    })),
    [providerSessionHistory.conversations],
  )
  const historyItems = useMemo(() => [
    ...archivedConversations.map((conversation) => ({
      type: 'conversation' as const,
      id: conversation.id,
      timestamp: conversation.updatedAt,
      conversation,
    })),
    ...historyThreads
      .filter((providerThread) => !archivedProviderThreadIds.has(providerThread.id) && !openProviderThreadIds.has(providerThread.id))
      .map((providerThread) => ({
        type: 'provider-thread' as const,
        id: providerThread.id,
        timestamp: Date.parse(providerThread.updatedAt) || 0,
        providerThread,
      })),
  ].sort((a, b) => b.timestamp - a.timestamp), [archivedConversations, archivedProviderThreadIds, historyThreads, openProviderThreadIds])
  const hasPinnedStatus = hasAgentPinnedStatus({
    plan: thread.currentPlan,
    generationProgressStates: thread.generationProgressStates,
    planSnapshot: thread.activePlanSnapshot,
    statusItems: thread.statusItems,
  })

  async function restoreThread(threadId: string, sessionId?: string) {
    setRestoringThreadId(threadId)
    try {
      await providerSessionHistory.onRestoreProviderThread(threadId, sessionId)
    } finally {
      setRestoringThreadId(null)
    }
  }

  const historyPanel = historyPane.open ? (
    <AgentConversationHistoryPanel
      aria-label={t('agents.chat.conversationHistory')}
      height={historyPane.height}
    >
      <div
        className="ai-agent-panel-empty-history-divider"
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('agents.chat.conversationHistory')}
        {...historyPane.resize.resizeHandleProps}
      />
      <div className="ai-agent-panel-empty-history-header">
        <span>{t('agents.chat.conversationHistory')}</span>
        <span>{historyItems.length}</span>
      </div>
      <div className="ai-agent-panel-empty-history-list">
        {historyQuery.isLoading && historyItems.length === 0 ? (
          <div className="ai-agent-panel-empty-history-empty">
            <Loader2 size={14} className="animate-spin" />
            <span className="ml-2">{t('common.loadingShort')}</span>
          </div>
        ) : historyQuery.isError && historyItems.length === 0 ? (
          <div className="ai-agent-panel-empty-history-empty">
            <Button type="button" size="xs" variant="ghost" onClick={() => historyQuery.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : historyItems.length === 0 ? (
          <div className="ai-agent-panel-empty-history-empty">
            {t('agents.chat.noHistoryConversations')}
          </div>
        ) : historyItems.map((item) => {
          if (item.type === 'conversation') {
            const lastMessage = latestTranscriptChatMessage(item.conversation)?.content.trim()
            return (
              <div key={item.id} className="group relative">
                <AgentConversationItem
                  icon={<Archive size={12} />}
                  title={conversationDisplayTitle(item.conversation, t)}
                  description={lastMessage || t('agents.chat.archivedConversation')}
                  meta={formatAgentDate(item.conversation.updatedAt, locale)}
                  className="ai-agent-panel-empty-history-item"
                  onClick={() => providerSessionHistory.onRestoreArchivedConversation?.(item.conversation.id)}
                />
              </div>
            )
          }
          const providerThread = item.providerThread
          return (
            <div key={item.id} className="group relative">
              <AgentConversationItem
                title={providerThreadTitle(providerThread, t)}
                description={[
                  t('agents.chat.messagesCount', { count: providerThread.messageCount }),
                  providerThread.projectId ? t('agents.chat.panel.workspaces.projectBadge', { id: providerThread.projectId }) : null,
                ].filter(Boolean).join(' · ')}
                meta={restoringThreadId === providerThread.id ? t('agents.chat.restoring') : formatAgentDate(providerThread.updatedAt, locale)}
                className="ai-agent-panel-empty-history-item"
                onClick={() => { void restoreThread(providerThread.id, providerThread.sessionId) }}
              />
            </div>
          )
        })}
        {historyQuery.hasNextPage && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="ai-agent-panel-empty-history-more"
            disabled={historyQuery.isFetchingNextPage}
            onClick={() => { void historyQuery.fetchNextPage() }}
          >
            {historyQuery.isFetchingNextPage && <Loader2 size={12} className="animate-spin" />}
            {t('agents.chat.loadMoreHistory')}
          </Button>
        )}
      </div>
    </AgentConversationHistoryPanel>
  ) : null

  return (
    <AgentMain
      className="ai-agent-panel-main"
      data-agent-chat-host={host}
      data-history-resizing={historyPane.resize.resizing ? 'true' : undefined}
    >
      <AgentDebugPreviewDialog {...debugPreview} />
      <ContextDiagnosticDialog {...contextDiagnosticDialog} />
      <section
        className="ai-agent-panel-content-card"
        data-empty-conversation={emptyConversation ? 'true' : undefined}
        data-history-open={historyPane.open ? 'true' : undefined}
      >
        <AgentChatHeaderSection
          {...header}
          historyOpen={historyPane.open}
          pinnedStatusExpanded={pinnedStatusExpanded}
          showPinnedStatusControl={hasPinnedStatus}
          onTogglePinnedStatus={() => setPinnedStatusExpanded((expanded) => !expanded)}
          onToggleHistory={historyPane.toggleOpen}
        />
        <AgentConversationThreadSection
          {...thread}
          pinnedStatusExpanded={pinnedStatusExpanded}
          onPinnedStatusExpandedChange={setPinnedStatusExpanded}
        />
      </section>
      {historyPanel}
      <AgentComposerSection {...composer} chrome="flush" />
    </AgentMain>
  )
}
