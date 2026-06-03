import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Copy, MoreHorizontal, Route } from 'lucide-react'
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
  AgentActivityTotals,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@movscript/ui'
import {
  agentActivityFeedMarkdown,
  agentActivityTraceJSON,
  buildAgentActivityFeed,
  feedTotalsLine,
  type AgentActivityDebugDetail,
  type AgentActivityFeed,
  type AgentActivityItem,
  type AgentActivityKind,
  type AgentActivityRound as AgentActivityRoundModel,
} from '@/features/agent/domain/agentActivityFeed'
import { agentRunPath } from '@/routes/projectRoutes'
import { LocalAgentApprovalRequestCard, LocalAgentInputRequestCard, type LocalAgentApprovalRequest } from '@/features/agent/components/localRuntime'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { AgentInputAnswer } from '@/features/agent/domain/agentRunInteraction'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export function AgentActivityFeedView({
  activity,
  run,
  events,
  className,
  approving = false,
  onApprove,
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
  onReject?: (approvalIds?: string[]) => void
  onAnswerInput?: (requestId: string, answer: AgentInputAnswer) => void
  approvalDetails?: (approval: LocalAgentApprovalRequest) => ReactNode
  hiddenActionItemIds?: Set<string>
}) {
  const [expandedDebugItems, setExpandedDebugItems] = useState<Set<string>>(() => new Set())
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
  return (
    <AgentActivityFeedRoot className={className}>
      {rounds.map((round) => (
        <AgentActivityRoundSection
          key={round.id}
          round={round}
          approving={approving}
          expandedDebugItems={expandedDebugItems}
          onApprove={onApprove}
          onReject={onReject}
          onAnswerInput={onAnswerInput}
          approvalDetails={approvalDetails}
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
              <DropdownMenuItem onClick={() => navigate(agentRunPath(activity.runId))}>
                <AgentActivityMenuIcon><Route size={12} /></AgentActivityMenuIcon>
                打开 trace
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
  onReject,
  onAnswerInput,
  approvalDetails,
  onToggleDebugItem,
}: {
  round: AgentActivityRoundModel
  approving?: boolean
  expandedDebugItems: Set<string>
  onApprove?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
  onAnswerInput?: (requestId: string, answer: AgentInputAnswer) => void
  approvalDetails?: (approval: LocalAgentApprovalRequest) => ReactNode
  onToggleDebugItem: (itemId: string) => void
}) {
  return (
    <AgentActivityRound>
      <AgentActivityRoundHeader>{round.label}</AgentActivityRoundHeader>
      {round.items.length > 0 ? (
        <AgentActivityRoundItems>
          {round.items.map((item) => (
            <AgentActivityItemRow
              key={item.id}
              item={item}
              approving={approving}
              expanded={expandedDebugItems.has(item.id)}
              onApprove={onApprove}
              onReject={onReject}
              onAnswerInput={onAnswerInput}
              approvalDetails={approvalDetails}
              onToggleDebug={() => onToggleDebugItem(item.id)}
            />
          ))}
        </AgentActivityRoundItems>
      ) : (
        <AgentActivityRoundEmpty>
          {round.status === 'final' ? '形成最终回复。' : '正在等待模型返回。'}
        </AgentActivityRoundEmpty>
      )}
    </AgentActivityRound>
  )
}

function AgentActivityItemRow({
  item,
  approving = false,
  expanded = false,
  onApprove,
  onReject,
  onAnswerInput,
  approvalDetails,
  onToggleDebug,
}: {
  item: AgentActivityItem
  approving?: boolean
  expanded?: boolean
  onApprove?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
  onAnswerInput?: (requestId: string, answer: AgentInputAnswer) => void
  approvalDetails?: (approval: LocalAgentApprovalRequest) => ReactNode
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
        <LocalAgentInputRequestCard
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
        <LocalAgentApprovalRequestCard
          approval={item.approval}
          approving={approving}
          onApprove={onApprove}
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

function formatDebugDetail(detail: AgentActivityDebugDetail): string {
  const sections: string[] = []
  if (detail.args !== undefined) sections.push(`参数\n${safeJSONStringify(detail.args)}`)
  if (detail.result !== undefined) sections.push(`返回\n${safeJSONStringify(detail.result)}`)
  if (detail.error) sections.push(`错误\n${detail.error}`)
  return sections.join('\n\n')
}

function safeJSONStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return '--'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function kindLabel(kind: AgentActivityKind): string {
  if (kind === 'read') return '读取'
  if (kind === 'workspace') return '工作区'
  if (kind === 'write') return '写入'
  if (kind === 'task') return '任务'
  if (kind === 'system') return '系统'
  if (kind === 'error') return '错误'
  return '处理'
}
