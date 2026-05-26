import { useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Archive, Loader2 } from 'lucide-react'
import { AgentConversationItem, AgentMain, Button } from '@movscript/ui'
import { AgentDebugPreviewDialog } from '@/features/agent/components/AgentDebugPreviewDialog'
import { AgentChatHeaderSection } from '@/features/agent/components/AgentChatHeaderSection'
import { AgentConversationThreadSection } from '@/features/agent/components/AgentConversationThreadSection'
import { AgentComposerSection } from '@/features/agent/components/AgentComposerSection'
import { conversationDisplayTitle, formatAgentDate, localThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import { localAgentClient } from '@/shared/infrastructure/localAgentClient'
import type { AgentChatViewLayoutProps } from '@/features/agent/components/AgentChatViewLayout'

const HISTORY_PAGE_SIZE = 20

export function AgentChatPanelLayout({
  composer,
  debugPreview,
  header,
  runtimeHistory,
  thread,
}: AgentChatViewLayoutProps) {
  const { t, i18n } = useTranslation()
  const conversationStarted = thread.messages.length > 0 || thread.conversationBlocks.length > 0 || !!debugPreview.draft
  const emptyConversation = !conversationStarted
  const [historyOpen, setHistoryOpen] = useState(emptyConversation)
  const [restoringThreadId, setRestoringThreadId] = useState<string | null>(null)
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const historyQuery = useInfiniteQuery({
    queryKey: ['local-agent-panel-thread-history', localAgentClient.baseURL],
    queryFn: async ({ pageParam, signal }) => {
      await localAgentClient.ensureRunning()
      return localAgentClient.listThreads({
        limit: HISTORY_PAGE_SIZE,
        ...(typeof pageParam === 'string' ? { cursor: pageParam } : {}),
      }, signal)
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: historyOpen,
    retry: false,
  })
  const historyThreads = historyQuery.data?.pages
    .flatMap((page) => page.threads)
    .filter((runtimeThread) => runtimeThread.id !== header.activeConversation.runtimeThreadId) ?? []
  const archivedConversations = useMemo(
    () => runtimeHistory.archivedConversations
      .filter((conversation) => conversation.id !== header.activeConversation.id)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [header.activeConversation.id, runtimeHistory.archivedConversations],
  )
  const archivedRuntimeThreadIds = useMemo(
    () => new Set(archivedConversations.flatMap((conversation) => conversation.runtimeThreadId ? [conversation.runtimeThreadId] : [])),
    [archivedConversations],
  )
  const historyItems = useMemo(() => [
    ...archivedConversations.map((conversation) => ({
      type: 'conversation' as const,
      id: conversation.id,
      timestamp: conversation.updatedAt,
      conversation,
    })),
    ...historyThreads
      .filter((runtimeThread) => !archivedRuntimeThreadIds.has(runtimeThread.id))
      .map((runtimeThread) => ({
        type: 'runtime-thread' as const,
        id: runtimeThread.id,
        timestamp: Date.parse(runtimeThread.updatedAt) || 0,
        runtimeThread,
      })),
  ].sort((a, b) => b.timestamp - a.timestamp), [archivedConversations, archivedRuntimeThreadIds, historyThreads])

  async function restoreThread(threadId: string) {
    setRestoringThreadId(threadId)
    try {
      await runtimeHistory.onRestoreLocalThread(threadId)
    } finally {
      setRestoringThreadId(null)
    }
  }

  useEffect(() => {
    setHistoryOpen(!conversationStarted)
  }, [header.activeConversation.id])

  useEffect(() => {
    if (conversationStarted) setHistoryOpen(false)
  }, [conversationStarted])

  const historyPanel = historyOpen ? (
    <section className="ai-agent-panel-empty-history" aria-label={t('agents.chat.conversationHistory')}>
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
            const lastMessage = item.conversation.messages[item.conversation.messages.length - 1]?.content.trim()
            return (
              <div key={item.id} className="group relative">
                <AgentConversationItem
                  icon={<Archive size={12} />}
                  title={conversationDisplayTitle(item.conversation, t)}
                  description={lastMessage || t('agents.chat.archivedConversation')}
                  meta={formatAgentDate(item.conversation.updatedAt, locale)}
                  className="ai-agent-panel-empty-history-item"
                  onClick={() => runtimeHistory.onRestoreArchivedConversation?.(item.conversation.id)}
                />
              </div>
            )
          }
          const runtimeThread = item.runtimeThread
          return (
            <div key={item.id} className="group relative">
              <AgentConversationItem
                title={localThreadTitle(runtimeThread, t)}
                description={[
                  t('agents.chat.messagesCount', { count: runtimeThread.messageCount }),
                  runtimeThread.projectId ? t('agents.chat.panel.drafts.projectBadge', { id: runtimeThread.projectId }) : null,
                ].filter(Boolean).join(' · ')}
                meta={restoringThreadId === runtimeThread.id ? t('agents.chat.restoring') : formatAgentDate(runtimeThread.updatedAt, locale)}
                className="ai-agent-panel-empty-history-item"
                onClick={() => { void restoreThread(runtimeThread.id) }}
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
    </section>
  ) : null

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
      </section>
      <AgentComposerSection {...composer} />
      {historyPanel}
    </AgentMain>
  )
}
