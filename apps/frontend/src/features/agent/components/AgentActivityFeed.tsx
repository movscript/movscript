import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Copy, MoreHorizontal, Route } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  AgentActivityCardItem,
  AgentActivityCodePanel,
  AgentActivityDividerActions,
  AgentActivityDuration,
  AgentActivityFeedRoot,
  AgentActivityFrame,
  AgentActivityFrameHeader,
  AgentActivityFrameLine,
  AgentActivityFrameLines,
  AgentActivityFrameTitle,
  AgentActivityLineItem,
  AgentActivityLineRow,
  AgentActivityLineText,
  AgentActivityMenuButton,
  AgentActivityMenuContent,
  AgentActivityMenuIcon,
  AgentActivityRound,
  AgentActivityRoundEmpty,
  AgentActivityRoundHeader,
  AgentActivityRoundItems,
  AgentActivityStatusLine,
  AgentActivityKindLabel,
  AgentActivityTotals
} from '@movscript/ui/business/agent'
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@movscript/ui/primitives'
import {
  agentActivityFeedMarkdown,
  agentActivityTraceJSON,
  buildAgentActivityFeed,
  feedTotalsLine,
  type AgentActivityDebugDetail,
  type AgentActivityFeed,
  type AgentActivityItem,
  type AgentActivityRound as AgentActivityRoundModel,
} from '@/features/agent/presentation/agentActivityFeed'
import { ROUTES } from '@/routes/projectRoutes'
import { ProviderSessionApprovalRequestCard, ProviderSessionInputRequestCard, type ProviderSessionApprovalRequest } from '@/features/agent/components/providerSessionInteractions'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'
import type { AgentInputAnswer } from '@/features/agent/domain/agentRunInteraction'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import {
  activityRoundRenderEntries,
  formatDebugDetail,
  formatDuration,
  kindLabel,
  type AgentActivityPagedRenderEntry,
} from '@/features/agent/components/AgentActivityFeedModel'

export function AgentActivityFeedView({
  activity,
  run,
  events,
  className,
  approving = false,
  onApprove,
  onApproveForSession,
  onReject,
  onAnswerInput,
  approvalDetails,
  hiddenActionItemIds,
}: {
  activity?: ChatRunActivity
  run?: AgentRun | null
  events?: ChatRunActivityEvent[]
  className?: string
  approving?: boolean
  onApprove?: (approvalIds?: string[]) => void
  onApproveForSession?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
  onAnswerInput?: (requestId: string, answer: AgentInputAnswer) => void
  approvalDetails?: (approval: ProviderSessionApprovalRequest) => ReactNode
  hiddenActionItemIds?: Set<string>
}) {
  const [expandedDebugItems, setExpandedDebugItems] = useState<Set<string>>(() => new Set())
  const [roundPageById, setRoundPageById] = useState<Record<string, number>>({})
  const feed = useMemo(() => buildAgentActivityFeed({ activity, run, events, hiddenActionItemIds }), [activity, events, hiddenActionItemIds, run])
  if (!feed || (feed.items.length === 0 && feed.rounds.length === 0)) return null
  const rounds = feed.rounds.length ? feed.rounds : [{ id: 'all', label: '活动', status: 'tool_calls' as const, items: feed.items }]
  const totalsLine = feedTotalsLine(feed)
  function toggleDebugItem(itemId: string) {
    setExpandedDebugItems((current) => {
      const next = new Set(current)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }
  function updateRoundPage(roundId: string, page: number) {
    setRoundPageById((current) => ({ ...current, [roundId]: page }))
  }
  return (
    <AgentActivityFeedRoot className={className}>
      {rounds.map((round) => (
        <AgentActivityRoundSection
          key={round.id}
          round={round}
          approving={approving}
          expandedDebugItems={expandedDebugItems}
          onApprove={onApprove}
          onApproveForSession={onApproveForSession}
          onReject={onReject}
          onAnswerInput={onAnswerInput}
          approvalDetails={approvalDetails}
          page={roundPageById[round.id] ?? 0}
          onPageChange={(page) => updateRoundPage(round.id, page)}
          onToggleDebugItem={toggleDebugItem}
        />
      ))}
      {totalsLine && rounds.length > 1 && (
        <AgentActivityTotals>
          {totalsLine}
        </AgentActivityTotals>
      )}
    </AgentActivityFeedRoot>
  )
}

export function AgentActivityStatusText({
  activity,
  run,
  events,
  fallback,
}: {
  activity?: ChatRunActivity
  run?: AgentRun | null
  events?: ChatRunActivityEvent[]
  fallback?: string
}) {
  const feed = useMemo(() => buildAgentActivityFeed({ activity, run, events }), [activity, events, run])
  const label = feed?.statusText ?? fallback
  if (!label) return null
  return (
    <AgentActivityStatusLine>{label}</AgentActivityStatusLine>
  )
}

export function AgentActivityDividerMenu({
  activity,
  className,
}: {
  activity?: ChatRunActivity
  className?: string
}) {
  const navigate = useNavigate()
  const [copied, setCopied] = useState<'md' | 'trace' | null>(null)
  const feed = useMemo(() => activity ? buildAgentActivityFeed({ activity }) : undefined, [activity])
  if (!activity || !feed) return null
  const resolvedFeed = feed
  const canOpenTrace = !!activity.runId && activity.runId !== 'pending'

  function copyText(kind: 'md' | 'trace') {
    const text = kind === 'md' ? agentActivityFeedMarkdown(resolvedFeed) : agentActivityTraceJSON(resolvedFeed)
    void navigator.clipboard.writeText(text)
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 1200)
  }

  return (
    <AgentActivityDividerActions className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <AgentActivityMenuButton
            type="button"
            aria-label="运行调试操作"
            title="运行调试操作"
          >
            <MoreHorizontal size={13} />
          </AgentActivityMenuButton>
        </DropdownMenuTrigger>
        <AgentActivityMenuContent align="end">
          <DropdownMenuItem onClick={() => copyText('md')}>
            <AgentActivityMenuIcon><Copy size={12} /></AgentActivityMenuIcon>
            {copied === 'md' ? '已复制 Markdown' : '复制 Markdown'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => copyText('trace')}>
            <AgentActivityMenuIcon><Copy size={12} /></AgentActivityMenuIcon>
            {copied === 'trace' ? '已复制 trace' : '复制 trace'}
          </DropdownMenuItem>
          {canOpenTrace && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate(ROUTES.agentConsole)}>
                <AgentActivityMenuIcon><Route size={12} /></AgentActivityMenuIcon>
                打开 Agent 控制台
              </DropdownMenuItem>
            </>
          )}
        </AgentActivityMenuContent>
      </DropdownMenu>
    </AgentActivityDividerActions>
  )
}

function AgentActivityRoundSection({
  round,
  approving,
  expandedDebugItems,
  onApprove,
  onApproveForSession,
  onReject,
  onAnswerInput,
  approvalDetails,
  page,
  onPageChange,
  onToggleDebugItem,
}: {
  round: AgentActivityRoundModel
  approving?: boolean
  expandedDebugItems: Set<string>
  onApprove?: (approvalIds?: string[]) => void
  onApproveForSession?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
  onAnswerInput?: (requestId: string, answer: AgentInputAnswer) => void
  approvalDetails?: (approval: ProviderSessionApprovalRequest) => ReactNode
  page: number
  onPageChange: (page: number) => void
  onToggleDebugItem: (itemId: string) => void
}) {
  const entries = useMemo(() => activityRoundRenderEntries(round.items), [round.items])
  const pagedEntries = entries.filter((entry): entry is AgentActivityPagedRenderEntry => entry.type === 'paged')
  const pageCount = Math.max(1, ...pagedEntries.map((entry) => entry.items.length))
  const safePage = Math.min(page, pageCount - 1)

  useEffect(() => {
    if (page !== safePage) onPageChange(safePage)
  }, [onPageChange, page, safePage])

  return (
    <AgentActivityRound>
      <AgentActivityRoundHeader>
        <span className="ms-text-truncate ms-agent-activity-round__label-text">{round.label}</span>
        {pageCount > 1 && (
          <AgentActivityRoundPager
            page={safePage}
            pageCount={pageCount}
            onPageChange={onPageChange}
          />
        )}
      </AgentActivityRoundHeader>
      {round.items.length > 0 ? (
        <AgentActivityRoundItems>
          {entries.map((entry) => {
            const item = entry.type === 'item' ? entry.item : entry.items[Math.min(safePage, entry.items.length - 1)]
            if (!item) return null
            return (
              <AgentActivityItemRow
                key={entry.id}
                item={item}
                approving={approving}
                expanded={expandedDebugItems.has(item.id)}
                onApprove={onApprove}
                onApproveForSession={onApproveForSession}
                onReject={onReject}
                onAnswerInput={onAnswerInput}
                approvalDetails={approvalDetails}
                onToggleDebug={() => onToggleDebugItem(item.id)}
              />
            )
          })}
        </AgentActivityRoundItems>
      ) : (
        <AgentActivityRoundEmpty>
          {round.status === 'thinking' ? '正在等待运行事件。' : '本轮没有记录可展示的明细。'}
        </AgentActivityRoundEmpty>
      )}
    </AgentActivityRound>
  )
}

function AgentActivityRoundPager({
  page,
  pageCount,
  onPageChange,
}: {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
}) {
  const previousPage = Math.max(0, page - 1)
  const nextPage = Math.min(pageCount - 1, page + 1)
  return (
    <span className="ms-action-row ms-agent-activity-round__pager">
      <button
        type="button"
        className="ms-inline-center ms-agent-activity-round__pager-button"
        disabled={page <= 0}
        onClick={() => onPageChange(previousPage)}
        aria-label="上一条请求"
        title="上一条请求"
      >
        <ChevronLeft size={12} />
      </button>
      <span className="ms-type-tiny ms-tabular-nums ms-agent-activity-round__pager-count">{page + 1}/{pageCount}</span>
      <button
        type="button"
        className="ms-inline-center ms-agent-activity-round__pager-button"
        disabled={page >= pageCount - 1}
        onClick={() => onPageChange(nextPage)}
        aria-label="下一条请求"
        title="下一条请求"
      >
        <ChevronRight size={12} />
      </button>
    </span>
  )
}

function AgentActivityItemRow({
  item,
  approving = false,
  expanded = false,
  onApprove,
  onApproveForSession,
  onReject,
  onAnswerInput,
  approvalDetails,
  onToggleDebug,
}: {
  item: AgentActivityItem
  approving?: boolean
  expanded?: boolean
  onApprove?: (approvalIds?: string[]) => void
  onApproveForSession?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
  onAnswerInput?: (requestId: string, answer: AgentInputAnswer) => void
  approvalDetails?: (approval: ProviderSessionApprovalRequest) => ReactNode
  onToggleDebug?: () => void
}) {
  if (item.type === 'line') {
    const canExpand = !!item.detail
    return (
      <AgentActivityLineItem
        expandable={canExpand}
        onDoubleClick={canExpand ? onToggleDebug : undefined}
        title={canExpand ? '双击展开参数和返回' : undefined}
      >
        <AgentActivityLineRow>
          <AgentActivityKindLabel kind={item.kind}>{kindLabel(item.kind)}</AgentActivityKindLabel>
          <AgentActivityLineText>{item.text}</AgentActivityLineText>
          {item.durationMs !== undefined && (
            <AgentActivityDuration>{formatDuration(item.durationMs)}</AgentActivityDuration>
          )}
        </AgentActivityLineRow>
        {expanded && item.detail && <AgentActivityDebugDetailView detail={item.detail} />}
      </AgentActivityLineItem>
    )
  }

  if (item.type === 'input_request') {
    return (
      <AgentActivityCardItem>
        <ProviderSessionInputRequestCard
          request={item.request}
          disabled={approving || item.request.status !== 'pending' || !onAnswerInput}
          onAnswer={(answer) => onAnswerInput?.(item.request.id, answer)}
        />
      </AgentActivityCardItem>
    )
  }

  if (item.type === 'approval_request') {
    return (
      <AgentActivityCardItem>
        <ProviderSessionApprovalRequestCard
          approval={item.approval}
          approving={approving}
          onApprove={onApprove}
          onApproveForSession={onApproveForSession}
          onReject={onReject}
          approvalDetails={approvalDetails}
        />
      </AgentActivityCardItem>
    )
  }

  if (item.type === 'decision') {
    return (
      <AgentActivityCardItem>
        <AgentActivityFrame kind="system">
          <AgentActivityFrameHeader>
            <AgentActivityKindLabel kind="system">决策</AgentActivityKindLabel>
            <AgentActivityFrameTitle>{item.title}</AgentActivityFrameTitle>
            {item.durationMs !== undefined && (
              <AgentActivityDuration>{formatDuration(item.durationMs)}</AgentActivityDuration>
            )}
          </AgentActivityFrameHeader>
          <AgentActivityFrameLines>
            {item.lines.map((line, lineIndex) => (
              <AgentActivityFrameLine key={`${item.id}:line:${lineIndex}`}>{line}</AgentActivityFrameLine>
            ))}
          </AgentActivityFrameLines>
        </AgentActivityFrame>
      </AgentActivityCardItem>
    )
  }

  const canExpand = !!item.detail
  return (
    <AgentActivityCardItem>
      <AgentActivityFrame
        kind={item.kind}
        expandable={canExpand}
        onDoubleClick={canExpand ? onToggleDebug : undefined}
        title={canExpand ? '双击展开参数和返回' : undefined}
      >
        <AgentActivityFrameHeader>
          <AgentActivityKindLabel kind={item.kind}>{kindLabel(item.kind)}</AgentActivityKindLabel>
          <AgentActivityFrameTitle>{item.title}</AgentActivityFrameTitle>
          {item.durationMs !== undefined && (
            <AgentActivityDuration>{formatDuration(item.durationMs)}</AgentActivityDuration>
          )}
        </AgentActivityFrameHeader>
        <AgentActivityFrameLines>
          {item.lines.map((line, lineIndex) => (
            <AgentActivityFrameLine key={`${item.id}:line:${lineIndex}`}>{line}</AgentActivityFrameLine>
          ))}
        </AgentActivityFrameLines>
        {item.code && (
          <AgentActivityCodePanel title={item.code.label}>
            {item.code.text}
          </AgentActivityCodePanel>
        )}
        {expanded && item.detail && <AgentActivityDebugDetailView detail={item.detail} />}
      </AgentActivityFrame>
    </AgentActivityCardItem>
  )
}

function AgentActivityDebugDetailView({ detail }: { detail: AgentActivityDebugDetail }) {
  return (
    <AgentActivityCodePanel title="调试详情">
      {formatDebugDetail(detail)}
    </AgentActivityCodePanel>
  )
}
