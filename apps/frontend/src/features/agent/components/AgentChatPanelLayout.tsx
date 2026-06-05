import { useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Archive, Loader2 } from 'lucide-react'
import { AgentConversationItem, AgentMain, Button, useResizablePanel } from '@movscript/ui'
import { AgentDebugPreviewDialog } from '@/features/agent/components/AgentDebugPreviewDialog'
import { ContextDiagnosticDialog } from '@/features/agent/components/ContextDiagnosticDialog'
import { AgentChatHeaderSection } from '@/features/agent/components/AgentChatHeaderSection'
import { AgentConversationThreadSection } from '@/features/agent/components/AgentConversationThreadSection'
import { AgentComposerSection } from '@/features/agent/components/AgentComposerSection'
import { hasAgentPinnedStatus } from '@/features/agent/components/AgentPinnedStatusShelf'
import { conversationDisplayTitle, formatAgentDate, localThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import { latestTranscriptChatMessage } from '@/features/agent/domain/agentMessageBoundaries'
import { listRuntimeThreadPageFromWorkspace } from '@/features/agent/application/agentRuntimeThreadQueryCache'
import { localAgentClient } from '@/shared/infrastructure/localAgentClient'
import type { AgentChatViewLayoutProps } from '@/features/agent/components/AgentChatViewLayout'
import type { AgentChatHost } from '@/features/agent/components/AgentBuiltinChatShell'

const HISTORY_PAGE_SIZE = 20
const HISTORY_MIN_RATIO = 1 / 3
const HISTORY_MAX_RATIO = 0.78

export function AgentChatPanelLayout({
  composer,
  contextDiagnosticDialog,
  debugPreview,
  header,
  host = 'dock-panel',
  runtimeHistory,
  thread,
}: AgentChatViewLayoutProps & { host?: AgentChatHost }) {
  const { t, i18n } = useTranslation()
  const conversationStarted = thread.conversationStarted || !!debugPreview.workspace
  const emptyConversation = !conversationStarted
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyHeight, setHistoryHeight] = useState<number | null>(null)
  const [pinnedStatusExpanded, setPinnedStatusExpanded] = useState(false)
  const [restoringThreadId, setRestoringThreadId] = useState<string | null>(null)
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const historyQuery = useInfiniteQuery({
    queryKey: ['local-agent-panel-thread-history', localAgentClient.baseURL],
    queryFn: async ({ pageParam, signal }) => {
      return listRuntimeThreadPageFromWorkspace({
        limit: HISTORY_PAGE_SIZE,
        includeProvisional: true,
        ...(typeof pageParam === 'string' ? { cursor: pageParam } : {}),
        signal,
      })
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
  const openRuntimeThreadIds = useMemo(
    () => new Set(runtimeHistory.conversations.flatMap((conversation) => {
      const ids = conversation.runtimeThreadId ? [conversation.runtimeThreadId] : []
      if (conversation.id.startsWith('thread_')) ids.push(conversation.id)
      return ids
    })),
    [runtimeHistory.conversations],
  )
  const historyItems = useMemo(() => [
    ...archivedConversations.map((conversation) => ({
      type: 'conversation' as const,
      id: conversation.id,
      timestamp: conversation.updatedAt,
      conversation,
    })),
    ...historyThreads
      .filter((runtimeThread) => !archivedRuntimeThreadIds.has(runtimeThread.id) && !openRuntimeThreadIds.has(runtimeThread.id))
      .map((runtimeThread) => ({
        type: 'runtime-thread' as const,
        id: runtimeThread.id,
        timestamp: Date.parse(runtimeThread.updatedAt) || 0,
        runtimeThread,
      })),
  ].sort((a, b) => b.timestamp - a.timestamp), [archivedConversations, archivedRuntimeThreadIds, historyThreads, openRuntimeThreadIds])
  const hasPinnedStatus = hasAgentPinnedStatus({
    plan: thread.currentPlan,
    generationProgressStates: thread.generationProgressStates,
    planSnapshot: thread.activePlanSnapshot,
  })

  async function restoreThread(threadId: string, sessionId?: string) {
    setRestoringThreadId(threadId)
    try {
      await runtimeHistory.onRestoreLocalThread(threadId, sessionId)
    } finally {
      setRestoringThreadId(null)
    }
  }

  const historyResize = useResizablePanel({
    size: historyHeight ?? 0,
    onSizeChange: setHistoryHeight,
    minSize: (rect) => Math.round(rect.height * HISTORY_MIN_RATIO),
    maxSize: (rect) => Math.round(rect.height * HISTORY_MAX_RATIO),
    resizeEdge: 'top',
    collapsed: !historyOpen,
    onCollapsedChange: (collapsed) => {
      if (collapsed) {
        setHistoryOpen(false)
        setHistoryHeight(null)
      }
    },
    collapseMode: 'after-min',
    ariaLabel: t('agents.chat.conversationHistory'),
    getContainer: (handle) => handle.closest('.ai-agent-panel-main') as HTMLElement | null,
  })

  useEffect(() => {
    setHistoryOpen(false)
    setHistoryHeight(null)
  }, [header.activeConversation.id])

  useEffect(() => {
    if (conversationStarted) setHistoryOpen(false)
    if (conversationStarted) setHistoryHeight(null)
  }, [conversationStarted])

  const historyPanel = historyOpen ? (
    <section
      className="ai-agent-panel-empty-history"
      aria-label={t('agents.chat.conversationHistory')}
      style={historyHeight ? { flexBasis: historyHeight } : undefined}
    >
      <div
        className="ai-agent-panel-empty-history-divider"
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('agents.chat.conversationHistory')}
        {...historyResize.resizeHandleProps}
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
                  runtimeThread.projectId ? t('agents.chat.panel.workspaces.projectBadge', { id: runtimeThread.projectId }) : null,
                ].filter(Boolean).join(' · ')}
                meta={restoringThreadId === runtimeThread.id ? t('agents.chat.restoring') : formatAgentDate(runtimeThread.updatedAt, locale)}
                className="ai-agent-panel-empty-history-item"
                onClick={() => { void restoreThread(runtimeThread.id, runtimeThread.sessionId) }}
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
    <AgentMain
      className="ai-agent-panel-main"
      data-agent-chat-host={host}
      data-history-resizing={historyResize.resizing ? 'true' : undefined}
    >
      <AgentDebugPreviewDialog {...debugPreview} />
      <ContextDiagnosticDialog {...contextDiagnosticDialog} />
      <section
        className="ai-agent-panel-content-card"
        data-empty-conversation={emptyConversation ? 'true' : undefined}
        data-history-open={historyOpen ? 'true' : undefined}
      >
        <AgentChatHeaderSection
          {...header}
          historyOpen={historyOpen}
          pinnedStatusExpanded={pinnedStatusExpanded}
          showPinnedStatusControl={hasPinnedStatus}
          onTogglePinnedStatus={() => setPinnedStatusExpanded((expanded) => !expanded)}
          onToggleHistory={() => setHistoryOpen((open) => !open)}
        />
        <AgentConversationThreadSection
          {...thread}
          pinnedStatusExpanded={pinnedStatusExpanded}
          onPinnedStatusExpandedChange={setPinnedStatusExpanded}
        />
      </section>
      <AgentComposerSection {...composer} chrome="flush" />
      {historyPanel}
    </AgentMain>
  )
}
