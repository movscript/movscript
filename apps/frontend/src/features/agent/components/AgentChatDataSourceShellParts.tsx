import { useEffect, useState, type UIEvent } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import {
  AgentBody,
  AgentConversationItem,
  AgentConversationTabsPanel,
  AgentEmpty,
  AgentHeader,
  AgentThreadFill,
  type AgentConversationTabItem,
} from '@movscript/ui/business/agent'
import { Button } from '@movscript/ui/primitives'
import { AgentComposerSection, type AgentComposerSectionProps } from '@/features/agent/components/AgentComposerSection'
import { ProviderControls } from '@/features/agent/components/ProviderControls'
import { AgentChatRecentCapabilityEventCard } from '@/features/agent/components/agent-chat-events/AgentChatRecentCapabilityEventCard'
import { AgentPinnedStatusShelf, type AgentPinnedStatusSummaryItem } from '@/features/agent/components/AgentPinnedStatusShelf'
import { AgentChatServerRequestCard } from '@/features/agent/components/agent-chat-items/AgentChatServerRequestCard'
import { AgentChatThreadItemView } from '@/features/agent/components/agent-chat-items/AgentChatThreadItemView'
import {
  agentChatPendingServerRequestEntryKey,
  agentChatServerRequestResponseForAction,
  type AgentChatServerRequest,
  type AgentChatServerRequestResponse,
  type AgentChatThread,
  type AgentChatThreadItem,
} from '@movscript/core/agent/chat'
import type {
  AgentChatRuntimePendingServerRequest,
  AgentChatRuntimeRecentCapabilityEvent,
} from '@movscript/core/agent/chat'
import { formatAgentChatTime } from '@/features/agent/presentation/agentChatDataSourceShellModel'

interface AgentChatDataSourceThreadBodyProps {
  canLoadEarlierItems: boolean
  emptyThreadLabel?: string
  error: string | null
  hiddenItemCount: number
  recentCapabilityEvents: AgentChatRuntimeRecentCapabilityEvent[]
  scrollRef: { current: HTMLDivElement | null }
  statusItems: AgentPinnedStatusSummaryItem[]
  visibleItems: Array<{ viewId: string; item: AgentChatThreadItem; streaming: boolean }>
  onScroll: (event: UIEvent<HTMLDivElement>) => void
  onShowOlderItems: () => void
}

interface AgentChatDataSourcePanelCardProps extends AgentChatDataSourceThreadBodyProps {
  activeConversationId: string
  conversationTabs: AgentConversationTabItem[]
  conversationTabsLabel: string
  hasChatContent: boolean
  historyOpen: boolean
  onCloseConversation: (threadId: string) => void
  onNewConversation: () => void
  onOpenConversation: (threadId: string) => void
  onReorderConversation: (draggedId: string, targetId: string, position: 'before' | 'after') => void
  onToggleHistory: () => void
}

export function AgentChatDataSourcePanelCard({
  activeConversationId,
  conversationTabs,
  conversationTabsLabel,
  hasChatContent,
  historyOpen,
  onCloseConversation,
  onNewConversation,
  onOpenConversation,
  onReorderConversation,
  onToggleHistory,
  ...threadBodyProps
}: AgentChatDataSourcePanelCardProps) {
  return (
    <section
      className="ai-agent-panel-content-card"
      data-empty-conversation={!hasChatContent ? 'true' : undefined}
      data-history-open={historyOpen ? 'true' : undefined}
    >
      <AgentHeader className="ai-agent-panel-chat-header">
        <div className="ai-agent-panel-chat-toolbar">
          <div className="ai-agent-panel-chat-toolbar-tabs">
            <AgentConversationTabsPanel
              activeConversationId={activeConversationId}
              conversations={conversationTabs}
              endAccessory={(
                <ProviderControls
                  historyOpen={historyOpen}
                  onNewConversation={onNewConversation}
                  onToggleHistory={onToggleHistory}
                  showNewConversation
                />
              )}
              onCloseConversation={onCloseConversation}
              onCloseTabContextMenu={() => undefined}
              onOpenKeyboardMenu={() => undefined}
              onOpenMenu={() => undefined}
              onReorderConversation={onReorderConversation}
              onSelectConversation={onOpenConversation}
              conversationTabsLabel={conversationTabsLabel}
              closeConversationLabel="Close conversation"
              archiveConversationLabel="Archive conversation"
              renameConversationLabel="Rename conversation"
            />
          </div>
        </div>
      </AgentHeader>
      <AgentChatDataSourceThreadBody {...threadBodyProps} />
    </section>
  )
}

interface AgentChatDataSourcePageThreadShellProps extends AgentChatDataSourceThreadBodyProps {
  ariaLabel: string
  hasChatContent: boolean
}

export function AgentChatDataSourcePageThreadShell({
  ariaLabel,
  emptyThreadLabel,
  hasChatContent,
  ...threadBodyProps
}: AgentChatDataSourcePageThreadShellProps) {
  return (
    <section className={`agent-page-chat-thread-shell${!hasChatContent ? ' agent-page-chat-thread-shell--empty' : ''}`} aria-label={ariaLabel}>
      {!hasChatContent && emptyThreadLabel ? (
        <div className="agent-page-chat-empty">
          <h1 className="agent-page-chat-empty-title">{emptyThreadLabel}</h1>
        </div>
      ) : (
        <div className="agent-page-chat-thread">
          <AgentChatDataSourceThreadBody
            emptyThreadLabel={emptyThreadLabel}
            {...threadBodyProps}
          />
        </div>
      )}
    </section>
  )
}

export function AgentChatDataSourceThreadBody({
  canLoadEarlierItems,
  emptyThreadLabel,
  error,
  hiddenItemCount,
  recentCapabilityEvents,
  scrollRef,
  statusItems,
  visibleItems,
  onScroll,
  onShowOlderItems,
}: AgentChatDataSourceThreadBodyProps) {
  return (
    <AgentBody className="ai-agent-panel-thread-body">
      <AgentPinnedStatusShelf statusItems={statusItems} defaultExpanded={false} />
      <AgentThreadFill ref={(node) => { scrollRef.current = node }} className="ms-agent-chat-thread-fill" onScroll={onScroll}>
        {error ? (
          <div className="ms-agent-chat-thread-error">{error}</div>
        ) : null}
        {recentCapabilityEvents.length > 0 ? (
          <div className="ms-agent-chat-capability-events" data-testid="agent-chat-capability-events">
            {recentCapabilityEvents.map((item) => (
              <AgentChatRecentCapabilityEventCard key={item.id} event={item.event} />
            ))}
          </div>
        ) : null}
        {canLoadEarlierItems ? (
          <div className="ai-agent-panel-thread-window-control">
            <Button type="button" size="xs" variant="ghost" onClick={onShowOlderItems}>
              {hiddenItemCount > 0 ? `Load earlier items (${hiddenItemCount})` : 'Load earlier items'}
            </Button>
          </div>
        ) : null}
        <div className="ms-agent-chat-thread-items">
          {visibleItems.map((item) => (
            <AgentChatThreadItemView key={item.viewId} item={item.item} streaming={item.streaming} />
          ))}
          {!visibleItems.length && emptyThreadLabel ? (
            <AgentEmpty>
              <span>{emptyThreadLabel}</span>
            </AgentEmpty>
          ) : null}
        </div>
      </AgentThreadFill>
    </AgentBody>
  )
}

interface AgentChatDataSourceHistoryPanelProps {
  dataSourceLabel: string
  emptyThreadListLabel: string
  endpoint?: string
  hasMoreThreadPages: boolean
  historyThreads: AgentChatThread[]
  loading: boolean
  loadingMore: boolean
  threadListLabel: string
  onLoadMoreThreads: () => Promise<void>
  onLoadThreads: () => Promise<void>
  onOpenThread: (threadId: string) => Promise<void>
}

export function AgentChatDataSourceHistoryPanel({
  dataSourceLabel,
  emptyThreadListLabel,
  endpoint,
  hasMoreThreadPages,
  historyThreads,
  loading,
  loadingMore,
  threadListLabel,
  onLoadMoreThreads,
  onLoadThreads,
  onOpenThread,
}: AgentChatDataSourceHistoryPanelProps) {
  return (
    <section className="ai-agent-panel-empty-history" aria-label={threadListLabel}>
      <div className="ai-agent-panel-empty-history-header">
        <span>{threadListLabel}</span>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="ai-agent-panel-empty-history-more"
          disabled={loading}
          onClick={() => void onLoadThreads()}
        >
          Refresh
        </Button>
      </div>
      <div className="ai-agent-panel-empty-history-list">
        {loading && historyThreads.length === 0 ? (
          <div className="ai-agent-panel-empty-history-empty">
            <Loader2 size={14} className="animate-spin" />
            <span className="ml-2">Loading</span>
          </div>
        ) : historyThreads.length === 0 ? (
          <div className="ai-agent-panel-empty-history-empty">
            {emptyThreadListLabel}
          </div>
        ) : historyThreads.map((thread) => (
          <AgentConversationItem
            key={thread.id}
            title={thread.name || thread.preview || 'Untitled thread'}
            description={thread.preview || endpoint || dataSourceLabel}
            meta={formatAgentChatTime(thread.updatedAt)}
            className="ai-agent-panel-empty-history-item"
            onClick={() => void onOpenThread(thread.id)}
          />
        ))}
      </div>
      {hasMoreThreadPages ? (
        <div className="ai-agent-panel-empty-history-more-row">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="ai-agent-panel-empty-history-more"
            disabled={loadingMore}
            onClick={() => void onLoadMoreThreads()}
          >
            {loadingMore ? 'Loading' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

type AgentChatDataSourceComposerPanelProps = AgentComposerSectionProps & {
  hasChatContent: boolean
  pendingServerRequests: AgentChatRuntimePendingServerRequest[]
  surface: 'panel' | 'page'
  onResolveServerRequest: (request: AgentChatServerRequest, response: AgentChatServerRequestResponse | undefined) => void
}

export function AgentChatDataSourceComposerPanel({
  hasChatContent,
  pendingServerRequests,
  surface,
  onResolveServerRequest,
  ...composerProps
}: AgentChatDataSourceComposerPanelProps) {
  return (
    <div className={surface === 'page'
      ? `agent-page-chat-composer relative z-30${!hasChatContent ? ' agent-page-chat-empty-composer' : ''}`
      : 'ai-agent-panel-composer-wrap relative z-30'}
    >
      <AgentComposerActionLayer
        pendingServerRequests={pendingServerRequests}
        onResolveServerRequest={onResolveServerRequest}
      />
      <AgentComposerSection {...composerProps} />
    </div>
  )
}

interface AgentComposerActionLayerProps {
  pendingServerRequests: AgentChatRuntimePendingServerRequest[]
  onResolveServerRequest: (request: AgentChatServerRequest, response: AgentChatServerRequestResponse | undefined) => void
}

export function AgentComposerActionLayer({
  pendingServerRequests,
  onResolveServerRequest,
}: AgentComposerActionLayerProps) {
  const [page, setPage] = useState(0)
  const pageCount = pendingServerRequests.length
  const safePage = clampPage(page, pageCount)
  const entry = pendingServerRequests[safePage]

  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  if (!entry) return null
  const previousPage = Math.max(0, safePage - 1)
  const nextPage = Math.min(pageCount - 1, safePage + 1)
  return (
    <div
      className="ms-agent-chat-action-layer"
      data-testid="agent-composer-action-layer"
      aria-live="polite"
    >
      <div className="ms-agent-chat-action-layer__surface">
        {pageCount > 1 ? (
          <div className="ms-agent-chat-action-layer__pager">
            <button
              type="button"
              className="ms-agent-run-interaction-pager__button"
              disabled={safePage <= 0}
              onClick={() => setPage(previousPage)}
              aria-label="Previous tool request"
              title="Previous tool request"
            >
              <ChevronLeft size={12} />
            </button>
            <span className="ms-agent-run-interaction-pager__count">{safePage + 1}/{pageCount}</span>
            <button
              type="button"
              className="ms-agent-run-interaction-pager__button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(nextPage)}
              aria-label="Next tool request"
              title="Next tool request"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        ) : null}
        <AgentChatServerRequestCard
          key={agentChatPendingServerRequestEntryKey(entry)}
          request={entry.request}
          onApprove={() => onResolveServerRequest(entry.request, agentChatServerRequestResponseForAction(entry.request, { type: 'approve' }))}
          onApproveForSession={() => onResolveServerRequest(entry.request, agentChatServerRequestResponseForAction(entry.request, { type: 'approveForSession' }))}
          onApproveWithExecPolicyAmendment={() => onResolveServerRequest(entry.request, agentChatServerRequestResponseForAction(entry.request, { type: 'approveWithExecPolicyAmendment' }))}
          onApproveWithNetworkPolicyAmendment={(amendmentIndex) => onResolveServerRequest(entry.request, agentChatServerRequestResponseForAction(entry.request, { type: 'approveWithNetworkPolicyAmendment', amendmentIndex }))}
          onApproveWithStrictAutoReview={() => onResolveServerRequest(entry.request, agentChatServerRequestResponseForAction(entry.request, { type: 'approveWithStrictAutoReview' }))}
          onAnswer={(response) => onResolveServerRequest(entry.request, response)}
          onCancel={() => onResolveServerRequest(entry.request, agentChatServerRequestResponseForAction(entry.request, { type: 'cancel' }))}
          onReject={() => onResolveServerRequest(entry.request, agentChatServerRequestResponseForAction(entry.request, { type: 'reject' }))}
        />
      </div>
    </div>
  )
}

function clampPage(page: number, itemCount: number): number {
  if (itemCount <= 0) return 0
  if (!Number.isFinite(page)) return 0
  return Math.min(Math.max(0, Math.floor(page)), itemCount - 1)
}
