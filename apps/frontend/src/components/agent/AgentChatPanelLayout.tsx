import { useEffect, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { AgentConversationItem, AgentMain, Button } from '@movscript/ui'
import { AgentDebugPreviewDialog } from '@/components/agent/AgentDebugPreviewDialog'
import { AgentChatHeaderSection } from '@/components/agent/AgentChatHeaderSection'
import { AgentConversationThreadSection } from '@/components/agent/AgentConversationThreadSection'
import { AgentComposerSection } from '@/components/agent/AgentComposerSection'
import { formatAgentDate, localThreadTitle } from '@/components/agent/AgentConversationList'
import { localAgentClient } from '@/lib/localAgentClient'
import type { AgentChatViewLayoutProps } from '@/components/agent/AgentChatViewLayout'

const HISTORY_PAGE_SIZE = 20

export function AgentChatPanelLayout({
  composer,
  debugPreview,
  header,
  runtimeHistory,
  thread,
}: AgentChatViewLayoutProps) {
  const { t, i18n } = useTranslation()
  const emptyConversation = thread.messages.length === 0
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
  const composerInContent = emptyConversation || historyOpen

  async function restoreThread(threadId: string) {
    setRestoringThreadId(threadId)
    try {
      await runtimeHistory.onRestoreLocalThread(threadId)
    } finally {
      setRestoringThreadId(null)
    }
  }

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
              <span>{historyThreads.length}</span>
            </div>
            <div className="ai-agent-panel-empty-history-list">
              {historyQuery.isLoading ? (
                <div className="ai-agent-panel-empty-history-empty">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="ml-2">{t('common.loadingShort')}</span>
                </div>
              ) : historyQuery.isError ? (
                <div className="ai-agent-panel-empty-history-empty">
                  <Button type="button" size="xs" variant="ghost" onClick={() => historyQuery.refetch()}>
                    {t('common.retry')}
                  </Button>
                </div>
              ) : historyThreads.length === 0 ? (
                <div className="ai-agent-panel-empty-history-empty">
                  {t('agents.chat.noHistoryConversations')}
                </div>
              ) : historyThreads.map((runtimeThread) => (
                <div key={runtimeThread.id} className="group relative">
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
              ))}
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
        )}
      </section>
      {!composerInContent && <AgentComposerSection {...composer} />}
    </AgentMain>
  )
}
