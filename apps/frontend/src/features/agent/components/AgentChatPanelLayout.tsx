import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Archive, Loader2 } from 'lucide-react'
import { AgentConversationItem, AgentMain, Button } from '@movscript/ui'
import { AgentDebugPreviewDialog } from '@/features/agent/components/AgentDebugPreviewDialog'
import { AgentChatHeaderActions } from '@/features/agent/components/AgentChatHeaderActions'
import { AgentChatHeaderSection } from '@/features/agent/components/AgentChatHeaderSection'
import { AgentConversationThreadSection, latestPlanFromMessages } from '@/features/agent/components/AgentConversationThreadSection'
import { AgentComposerSection } from '@/features/agent/components/AgentComposerSection'
import { hasAgentPinnedStatus } from '@/features/agent/components/AgentPinnedStatusShelf'
import { useAgentPanelUiStore } from '@/features/agent/presentation/agentPanelUiStore'
import { conversationDisplayTitle, formatAgentDate, localThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import { localAgentClient } from '@/shared/infrastructure/localAgentClient'
import type { AgentChatViewLayoutProps } from '@/features/agent/components/AgentChatViewLayout'
import type { AgentChatHost } from '@/features/agent/components/AgentBuiltinChatShell'

const HISTORY_PAGE_SIZE = 20
const HISTORY_MIN_RATIO = 1 / 3
const HISTORY_MAX_RATIO = 0.78
const HISTORY_COLLAPSE_DRAG_THRESHOLD = 12

export function AgentChatPanelLayout({
  composer,
  debugPreview,
  header,
  host = 'dock-panel',
  runtimeHistory,
  thread,
}: AgentChatViewLayoutProps & { host?: AgentChatHost }) {
  const { t, i18n } = useTranslation()
  const conversationStarted = thread.messages.length > 0 || thread.conversationBlocks.length > 0 || !!debugPreview.draft
  const emptyConversation = !conversationStarted
  const [historyOpen, setHistoryOpen] = useState(emptyConversation)
  const [historyHeight, setHistoryHeight] = useState<number | null>(null)
  const [historyResizing, setHistoryResizing] = useState(false)
  const resizeStartRef = useRef({ y: 0, height: 0, mainHeight: 0 })
  const [pinnedStatusExpanded, setPinnedStatusExpanded] = useState(false)
  const [restoringThreadId, setRestoringThreadId] = useState<string | null>(null)
  const setDetailHeaderActions = useAgentPanelUiStore((s) => s.setDetailHeaderActions)
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
  const hasPinnedStatus = hasAgentPinnedStatus({
    plan: latestPlanFromMessages(thread.messages),
    generationProgressStates: thread.generationProgressStates,
    planSnapshot: thread.activePlanSnapshot,
  })

  async function restoreThread(threadId: string) {
    setRestoringThreadId(threadId)
    try {
      await runtimeHistory.onRestoreLocalThread(threadId)
    } finally {
      setRestoringThreadId(null)
    }
  }

  function startHistoryResize(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target?.closest('button, a, input, textarea, select')) return
    const main = event.currentTarget.closest('.ai-agent-panel-main')
    const mainHeight = main?.getBoundingClientRect().height ?? 0
    if (mainHeight <= 0) return
    event.preventDefault()

    const minHeight = Math.round(mainHeight * HISTORY_MIN_RATIO)
    const panelHeight = event.currentTarget.closest('.ai-agent-panel-empty-history')?.getBoundingClientRect().height
    resizeStartRef.current = {
      y: event.clientY,
      height: historyHeight ?? panelHeight ?? minHeight,
      mainHeight,
    }
    setHistoryResizing(true)

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const start = resizeStartRef.current
      const min = Math.round(start.mainHeight * HISTORY_MIN_RATIO)
      const max = Math.round(start.mainHeight * HISTORY_MAX_RATIO)
      const nextHeight = start.height + start.y - moveEvent.clientY

      if (nextHeight < min) {
        if (start.height <= min + 1 && nextHeight < min - HISTORY_COLLAPSE_DRAG_THRESHOLD) {
          setHistoryOpen(false)
          setHistoryHeight(null)
          return
        }
        setHistoryHeight(min)
        return
      }

      setHistoryHeight(Math.min(max, nextHeight))
    }

    const finishResize = () => {
      setHistoryResizing(false)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finishResize)
      window.removeEventListener('pointercancel', finishResize)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', finishResize)
    window.addEventListener('pointercancel', finishResize)
  }

  useEffect(() => {
    setHistoryOpen(!conversationStarted)
  }, [header.activeConversation.id])

  useEffect(() => {
    if (conversationStarted) setHistoryOpen(false)
    if (conversationStarted) setHistoryHeight(null)
  }, [conversationStarted])

  useEffect(() => {
    setDetailHeaderActions(
      <AgentChatHeaderActions
        historyOpen={historyOpen}
        pinnedStatusExpanded={pinnedStatusExpanded}
        showPinnedStatusControl={hasPinnedStatus}
        onNewConversation={header.onNewConversation}
        onToggleHistory={() => setHistoryOpen((open) => !open)}
        onTogglePinnedStatus={() => setPinnedStatusExpanded((expanded) => !expanded)}
      />,
    )
    return () => setDetailHeaderActions(null)
  }, [hasPinnedStatus, header.onNewConversation, historyOpen, pinnedStatusExpanded, setDetailHeaderActions])

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
        tabIndex={0}
        onPointerDown={startHistoryResize}
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
    <AgentMain
      className="ai-agent-panel-main"
      data-agent-chat-host={host}
      data-history-resizing={historyResizing ? 'true' : undefined}
    >
      <AgentDebugPreviewDialog {...debugPreview} />
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
