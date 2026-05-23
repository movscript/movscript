import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Copy, MoreHorizontal, Route } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  semanticToneClass,
} from '@movscript/ui'
import {
  agentActivityFeedMarkdown,
  agentActivityTraceJSON,
  buildAgentActivityFeed,
  feedTotalsLine,
  type AgentActivityDebugDetail,
  type AgentActivityFeed,
  type AgentActivityItem,
  type AgentActivityRound,
  type AgentActivityTone,
} from '@/lib/agentActivityFeed'
import { cn } from '@/lib/utils'
import { agentRunPath } from '@/routes/projectRoutes'
import { LocalAgentApprovalRequestCard, LocalAgentInputRequestCard, type LocalAgentApprovalRequest } from '@/components/agent/localRuntime'
import type { AgentRun } from '@/lib/localAgentClient'
import type { AgentInputAnswer } from '@/lib/agentWorkflowInteraction'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/store/agentStore'

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
}) {
  const [expandedDebugItems, setExpandedDebugItems] = useState<Set<string>>(() => new Set())
  const feed = useMemo(() => buildAgentActivityFeed({ activity, run, events }), [activity, events, run])
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
    <div className={cn('mt-2 divide-y divide-border/70 type-label', className)}>
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
        <div className="pt-1.5 type-micro text-muted-foreground/80">
          {totalsLine}
        </div>
      )}
    </div>
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
    <div className="flex justify-start pl-8">
      <div className="inline-flex max-w-[80%] items-center gap-1.5 type-tiny leading-4 text-muted-foreground">
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-muted-foreground/60" />
        <span className="truncate">{label}</span>
      </div>
    </div>
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
    <div className={cn('absolute right-0 top-0 z-20 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="h-5 w-6 rounded bg-background/90 text-muted-foreground shadow-sm"
            aria-label="运行调试操作"
            title="运行调试操作"
          >
            <MoreHorizontal size={13} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => copyText('md')}>
            <Copy size={12} className="mr-2" />
            {copied === 'md' ? '已复制 Markdown' : '复制 Markdown'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => copyText('trace')}>
            <Copy size={12} className="mr-2" />
            {copied === 'trace' ? '已复制 trace' : '复制 trace'}
          </DropdownMenuItem>
          {canOpenTrace && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate(agentRunPath(activity.runId))}>
                <Route size={12} className="mr-2" />
                打开 trace
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
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
  round: AgentActivityRound
  approving?: boolean
  expandedDebugItems: Set<string>
  onApprove?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
  onAnswerInput?: (requestId: string, answer: AgentInputAnswer) => void
  approvalDetails?: (approval: LocalAgentApprovalRequest) => ReactNode
  onToggleDebugItem: (itemId: string) => void
}) {
  return (
    <section className="py-1.5 first:pt-0 last:pb-0">
      <div className="mb-1 flex min-w-0 items-center gap-2 type-micro text-muted-foreground">
        <span className="h-px w-4 shrink-0 bg-border" />
        <span className="truncate">{round.label}</span>
      </div>
      {round.items.length > 0 ? (
        <div className="divide-y divide-border/60">
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
        </div>
      ) : (
        <div className="py-1 type-tiny text-muted-foreground">
          {round.status === 'final' ? '形成最终回复。' : '正在等待模型返回。'}
        </div>
      )}
    </section>
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
      <div
        className={cn('py-1.5', canExpand && 'cursor-default select-text')}
        onDoubleClick={canExpand ? onToggleDebug : undefined}
        title={canExpand ? '双击展开参数和返回' : undefined}
      >
        <div className="flex min-w-0 items-baseline gap-2">
          <span className={cn('shrink-0 type-micro font-medium', toneTextClass(item.tone))}>{toneLabel(item.tone)}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.text}</span>
          {item.durationMs !== undefined && (
            <span className="shrink-0 type-micro text-muted-foreground/70">{formatDuration(item.durationMs)}</span>
          )}
        </div>
        {expanded && item.detail && <AgentActivityDebugDetailView detail={item.detail} />}
      </div>
    )
  }

  if (item.type === 'input_request') {
    return (
      <div className="py-2">
        <LocalAgentInputRequestCard
          request={item.request}
          disabled={approving || item.request.status !== 'pending' || !onAnswerInput}
          onAnswer={(answer) => onAnswerInput?.(item.request.id, answer)}
        />
      </div>
    )
  }

  if (item.type === 'approval_request') {
    return (
      <div className="py-2">
        <LocalAgentApprovalRequestCard
          approval={item.approval}
          approving={approving}
          onApprove={onApprove}
          onReject={onReject}
          approvalDetails={approvalDetails}
        />
      </div>
    )
  }

  if (item.type === 'decision') {
    return (
      <div className="py-2">
        <div className="border-l-2 border-muted-foreground/30 bg-muted/15 px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="type-micro font-medium text-muted-foreground">决策</span>
            <span className="truncate type-tiny font-medium text-foreground">{item.title}</span>
            {item.durationMs !== undefined && (
              <span className="ml-auto shrink-0 type-micro text-muted-foreground/70">{formatDuration(item.durationMs)}</span>
            )}
          </div>
          <div className="mt-1 space-y-0.5">
            {item.lines.map((line) => (
              <div key={line} className="type-tiny leading-relaxed text-muted-foreground">{line}</div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const canExpand = !!item.detail
  return (
    <div className="py-2">
      <div
        className={cn('rounded-md border-l-2 bg-muted/25 px-2 py-1.5', toneBorderClass(item.tone), canExpand && 'cursor-default')}
        onDoubleClick={canExpand ? onToggleDebug : undefined}
        title={canExpand ? '双击展开参数和返回' : undefined}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn('type-micro font-medium', toneTextClass(item.tone))}>{toneLabel(item.tone)}</span>
          <span className="truncate type-tiny font-medium text-foreground">{item.title}</span>
          {item.durationMs !== undefined && (
            <span className="ml-auto shrink-0 type-micro text-muted-foreground/70">{formatDuration(item.durationMs)}</span>
          )}
        </div>
        <div className="mt-1 space-y-0.5">
          {item.lines.map((line) => (
            <div key={line} className="type-tiny leading-relaxed text-muted-foreground">{line}</div>
          ))}
        </div>
        {item.code && (
          <div className="mt-1.5 overflow-hidden rounded border border-border/60 bg-background/70">
            <div className="border-b border-border/60 px-2 py-1 type-micro font-medium text-muted-foreground">{item.code.label}</div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words px-2 py-1.5 font-mono type-micro leading-relaxed text-muted-foreground">
              {item.code.text}
            </pre>
          </div>
        )}
        {expanded && item.detail && <AgentActivityDebugDetailView detail={item.detail} />}
      </div>
    </div>
  )
}

function AgentActivityDebugDetailView({ detail }: { detail: AgentActivityDebugDetail }) {
  return (
    <div className="mt-1.5 overflow-hidden rounded border border-border/60 bg-background/70">
      <div className="border-b border-border/60 px-2 py-1 type-micro font-medium text-muted-foreground">调试详情</div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words px-2 py-1.5 font-mono type-micro leading-relaxed text-muted-foreground">
        {formatDebugDetail(detail)}
      </pre>
    </div>
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

function toneLabel(tone: AgentActivityTone): string {
  if (tone === 'read') return '读取'
  if (tone === 'draft') return '草稿'
  if (tone === 'write') return '写入'
  if (tone === 'task') return '任务'
  if (tone === 'system') return '系统'
  if (tone === 'error') return '错误'
  return '处理'
}

function toneTextClass(tone: AgentActivityTone): string {
  if (tone === 'read') return semanticToneClass('info', 'icon')
  if (tone === 'draft') return semanticToneClass('warning', 'icon')
  if (tone === 'write') return 'text-destructive'
  if (tone === 'task') return semanticToneClass('success', 'icon')
  if (tone === 'error') return 'text-destructive'
  return 'text-muted-foreground'
}

function toneBorderClass(tone: AgentActivityTone): string {
  if (tone === 'read') return 'border-l-blue-500'
  if (tone === 'draft') return 'border-l-amber-500'
  if (tone === 'write') return 'border-l-destructive'
  if (tone === 'task') return 'border-l-green-600'
  if (tone === 'error') return 'border-l-destructive'
  return 'border-l-muted-foreground/40'
}
