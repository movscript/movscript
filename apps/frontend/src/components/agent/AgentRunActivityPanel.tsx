import { useState } from 'react'
import { Bot, ChevronRight, Loader2, Route, Workflow, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AgentChatMessage, Badge, Button } from '@movscript/ui'
import { agentTimelineSummary, buildAgentRunTimeline, formatToolCallStreamDetail } from '@/lib/agentTimeline'
import { formatAgentDividerTime } from '@/lib/agentMessageDivider'
import { runStatusLabel } from '@/lib/agentRunUi'
import { agentToolNameLabel } from '@/lib/agentToolDisplay'
import { cn } from '@/lib/utils'
import { agentRunPath } from '@/routes/projectRoutes'
import type { AgentRun } from '@/lib/localAgentClient'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/store/agentStore'

function formatActivityTime(value: string | undefined, locale: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function durationLabel(start: string | undefined, end: string | undefined) {
  if (!start || !end) return ''
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return ''
  const ms = endMs - startMs
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
}

function formatDurationLabel(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60_000)}m`
}

function agentStepStatusLabel(status: string): string {
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '失败'
  if (status === 'in_progress') return '进行中'
  if (status === 'cancelled') return '已取消'
  if (status === 'pending') return '待处理'
  if (status === 'blocked') return '已阻塞'
  return `未知状态 (${status})`
}

function genericRunStatusLabel(status: string): string {
  if (status === 'queued' || status === 'in_progress' || status === 'requires_action' || status === 'completed' || status === 'completed_with_warnings' || status === 'failed' || status === 'cancelled') {
    return runStatusLabel(status)
  }
  return `未知状态 (${status})`
}

function workflowStatusClass(status: string) {
  if (status === 'completed' || status === 'approved' || status === 'answered') return 'bg-green-500/10 text-green-700'
  if (status === 'failed' || status === 'rejected' || status === 'cancelled') return 'bg-destructive/10 text-destructive'
  if (status === 'skipped' || status === 'pending') return 'bg-amber-500/10 text-amber-700'
  if (status === 'in_progress') return 'bg-blue-500/10 text-blue-700'
  return 'bg-muted text-muted-foreground'
}

function workflowDotClass(status: string) {
  if (status === 'completed' || status === 'approved' || status === 'answered') return 'border-green-600/50 bg-green-500/10 text-green-700'
  if (status === 'failed' || status === 'rejected' || status === 'cancelled') return 'border-destructive/30 bg-destructive/10 text-destructive'
  return 'border-blue-500/30 bg-blue-500/10 text-blue-700'
}

function runStatusVariant(status: string): 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' {
  if (status === 'completed') return 'success'
  if (status === 'completed_with_warnings' || status === 'requires_action') return 'warning'
  if (status === 'failed') return 'destructive'
  if (status === 'in_progress' || status === 'queued' || status === 'cancelled') return 'secondary'
  return 'outline'
}

function ActivityJSONBlock({ label, value }: { label: string; value: unknown }) {
  const text = safeJSONStringify(value)
  return (
    <details className="mt-1 rounded border border-border/70 bg-muted/20">
      <summary className="cursor-pointer px-2 py-1 type-micro font-medium text-muted-foreground">
        {label}
      </summary>
      <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words border-t border-border/60 px-2 py-1.5 type-micro leading-relaxed text-muted-foreground">
        {text}
      </pre>
    </details>
  )
}

export function RunActivityPanel({
  activity,
  run,
  events,
  title = 'Activity',
  defaultOpen = false,
  className,
}: {
  activity?: ChatRunActivity
  run?: AgentRun | null
  events?: ChatRunActivityEvent[]
  title?: string
  defaultOpen?: boolean
  className?: string
}) {
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const timeline = buildAgentRunTimeline({ activity, run, events })
  if (!timeline) return null
  const runId = run?.id ?? activity?.runId ?? timeline.runId

  return (
    <details
      className={cn('mt-2 rounded-md border border-border/80 bg-background/70 type-label shadow-sm', className)}
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 marker:hidden">
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
          <Workflow size={12} />
          <span className="truncate">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {runId && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="px-1.5 type-micro"
              title="打开完整运行详情"
              aria-label="打开完整运行详情"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                navigate(agentRunPath(runId))
              }}
            >
              <Route size={10} />
              详情
            </Button>
          )}
          <Badge variant={runStatusVariant(timeline.status)} className="type-micro leading-4 px-1.5 py-0">
            {genericRunStatusLabel(timeline.status)}
          </Badge>
          <span className="type-micro text-muted-foreground">{agentTimelineSummary(timeline)}</span>
        </span>
      </summary>
      <div className="space-y-1.5 border-t border-border/80 px-2.5 py-2">
        {timeline.items.length === 0 ? (
          <div className="rounded border border-border/80 bg-muted/20 px-2 py-1.5 type-tiny text-muted-foreground">
            这次运行没有记录工具调用或交互。
          </div>
        ) : timeline.items.map((item) => (
          <div key={item.id} className="rounded border border-border/80 bg-background px-2 py-1.5">
            <div className="flex min-w-0 items-start gap-1.5">
              <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', workflowDotClass(item.status))} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate type-tiny font-medium text-foreground">{item.title}</span>
                  <span className={cn('shrink-0 rounded px-1.5 py-0.5 type-micro', workflowStatusClass(item.status))}>
                    {item.statusLabel ?? agentStepStatusLabel(item.status)}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1.5 type-micro text-muted-foreground">
                  <span>{item.kind}</span>
                  <span>{formatActivityTime(item.createdAt, locale)}</span>
                  {durationLabel(item.createdAt, item.completedAt) && <span>{durationLabel(item.createdAt, item.completedAt)}</span>}
                </div>
                {item.summary && (
                  <p className={cn('mt-1 type-tiny leading-relaxed', item.error ? 'text-destructive' : 'text-muted-foreground')}>
                    {item.summary}
                  </p>
                )}
                {item.args !== undefined && <ActivityJSONBlock label="参数" value={item.args} />}
                {item.result !== undefined && <ActivityJSONBlock label={item.error ? '错误数据' : '结果'} value={item.result} />}
              </div>
            </div>
          </div>
        ))}
        {timeline.warnings?.length ? (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 type-tiny leading-relaxed text-amber-800 dark:text-amber-300">
            {timeline.warnings.map((warning) => <div key={warning}>{warning}</div>)}
          </div>
        ) : null}
        {timeline.error && (
          <div className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1.5 type-tiny leading-relaxed text-destructive">
            {timeline.error}
          </div>
        )}
      </div>
    </details>
  )
}

export function RunActivityTitleBubble({
  activity,
  run,
  events,
  title = '运行过程',
  className,
}: {
  activity?: ChatRunActivity
  run?: AgentRun | null
  events?: ChatRunActivityEvent[]
  title?: string
  className?: string
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const timeline = buildAgentRunTimeline({ activity, run, events })
  if (!timeline) return null
  const runId = run?.id ?? activity?.runId ?? timeline.runId

  const openCard = () => setOpen(true)
  if (open) {
    return (
      <RunActivityPanel
        activity={activity}
        run={run}
        events={events}
        title={title}
        defaultOpen
        className={cn('mt-2', className)}
      />
    )
  }

  return (
    <div className={cn('mt-2 type-label', className)}>
      <div className="flex w-full min-w-0 items-center gap-1 rounded-md border border-border bg-background/70 transition-colors hover:bg-muted/30">
        <button
          type="button"
          onClick={openCard}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') openCard()
          }}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          title="展开运行过程"
          aria-expanded={open}
        >
          <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
            <ChevronRight size={12} />
            <span className="truncate">{title}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <Badge variant={runStatusVariant(timeline.status)} className="type-micro leading-4 px-1.5 py-0">
              {genericRunStatusLabel(timeline.status)}
            </Badge>
            <span className="type-micro text-muted-foreground">{agentTimelineSummary(timeline)}</span>
          </span>
        </button>
        {runId && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="mr-1 shrink-0 px-1.5 type-micro"
            title="打开完整运行详情"
            aria-label="打开完整运行详情"
            onClick={() => navigate(agentRunPath(runId))}
          >
            <Route size={10} />
            详情
          </Button>
        )}
      </div>
    </div>
  )
}

export function LiveRunActivityBubble({
  run,
  events,
}: {
  run: AgentRun | null
  events: ChatRunActivityEvent[]
}) {
  const { t } = useTranslation()
  if (!run && events.length === 0) return null
  const statusLabel = latestModelRetryStatus(events) ?? latestAgentStatusLabel(run, events)
  const activeTool = activeToolStatus(run, events)
  return (
    <div className="space-y-1">
      <AgentBubbleStatusText label={statusLabel} />
      <AgentChatMessage
        role="assistant"
        avatar={<Bot size={14} />}
        data-agent-divider-label={formatAgentDividerTime(run?.startedAt ?? events[0]?.createdAt)}
        footer={(
          <Badge variant="outline" className="type-micro leading-4 px-1.5 py-0">
            {workflowRunStatusLabel('in_progress', t)}
          </Badge>
        )}
      >
        {activeTool && <ActiveToolStatusCard tool={activeTool} />}
        <RunActivityPanel
          run={run}
          events={events}
          title={t('agents.chat.messageSections.processOverview')}
          className={activeTool ? 'mt-2' : 'mt-0'}
        />
      </AgentChatMessage>
    </div>
  )
}

function AgentBubbleStatusText({ label }: { label?: string }) {
  if (!label) return null
  return (
    <div className="flex justify-start pl-8">
      <div className="inline-flex max-w-[80%] items-center gap-1.5 type-tiny leading-4 text-muted-foreground">
        <Loader2 size={10} className="animate-spin" />
        <span className="truncate">{label}</span>
      </div>
    </div>
  )
}

interface ActiveToolStatus {
  name: string
  status: string
  detail?: string
}

function ActiveToolStatusCard({ tool }: { tool: ActiveToolStatus }) {
  const { t } = useTranslation()
  return (
    <div data-testid="agent-active-tool-status" className="rounded-md border border-border/80 bg-background/70 p-2 shadow-sm">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Loader2 size={12} className="shrink-0 animate-spin text-muted-foreground" />
          <span className="truncate type-caption font-medium text-foreground">正在执行工具</span>
        </div>
        <Badge variant="secondary" className="type-micro leading-4 px-1.5 py-0">
          {tool.status}
        </Badge>
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-1.5 type-tiny text-muted-foreground">
        <Wrench size={12} className="shrink-0" />
        <span className="truncate font-mono" title={tool.name}>{agentToolNameLabel(tool.name, t)}</span>
      </div>
      {tool.detail && (
        <p className="mt-1 line-clamp-2 type-tiny leading-relaxed text-muted-foreground">{tool.detail}</p>
      )}
    </div>
  )
}

function activeToolStatus(run: AgentRun | null, events: ChatRunActivityEvent[]): ActiveToolStatus | null {
  const activeStep = [...(run?.steps ?? [])].reverse().find((step) => step.type === 'tool_call' && step.status === 'in_progress')
  if (activeStep?.toolName) {
    return {
      name: activeStep.toolName,
      status: agentStepStatusLabel(activeStep.status),
      ...(activeStep.title ? { detail: activeStep.title } : {}),
    }
  }
  const latestToolEvent = [...events].reverse().find((event) => event.kind === 'tool_call')
  if (latestToolEvent && (latestToolEvent.status === 'started' || latestToolEvent.status === 'info')) {
    const streamTool = formatToolCallStreamDetail(latestToolEvent)
    const detail = latestToolEvent.summary ?? streamTool?.parseStatus
    return {
      name: latestToolEvent.toolName ?? streamTool?.label ?? 'tool',
      status: latestToolEvent.status === 'started' ? '执行中' : '等待结果',
      ...(detail ? { detail } : {}),
    }
  }
  return null
}

function latestAgentStatusLabel(run: AgentRun | null, events: ChatRunActivityEvent[]): string | undefined {
  const latest = [...events].reverse().find((event) => event.status === 'started' || event.status === 'info' || event.status === 'completed' || event.status === 'failed' || event.status === 'blocked')
  if (latest && latest.status !== 'started' && latest.status !== 'info') return undefined
  if (latest?.title === 'Model HTTP request sent') return '正在请求模型'
  if (latest?.title === 'Prompt composed') return '正在整理上下文'
  if (latest?.title === 'Model stream delta') return '正在接收模型回复'
  if (latest?.title === 'Model tool call delta') return '正在准备工具调用'
  if (latest?.kind === 'tool_call') return latest.toolName ? `正在调用工具：${latest.toolName}` : '正在调用工具'
  if (run?.status === 'queued') return '等待 agent 开始'
  if (run?.status === 'in_progress') return 'agent 正在运行'
  return undefined
}

function latestModelRetryStatus(events: ChatRunActivityEvent[]): string | undefined {
  const latest = [...events].reverse().find((event) => event.title === 'Model HTTP retry scheduled')
  if (!latest || latest.status !== 'info') return undefined
  const data = latest.data && typeof latest.data === 'object' ? latest.data as Record<string, unknown> : {}
  const attempt = typeof data.attempt === 'number' ? data.attempt : undefined
  const max = typeof data.maxAttempts === 'number' ? data.maxAttempts : undefined
  const delayMs = typeof data.delayMs === 'number' ? data.delayMs : undefined
  const attemptLabel = attempt && max ? ` ${attempt}/${max}` : attempt ? ` ${attempt}` : ''
  const delayLabel = delayMs !== undefined ? `，等待 ${formatDurationLabel(delayMs)}` : ''
  return `模型请求重试中${attemptLabel}${delayLabel}`
}

function workflowRunStatusLabel(status: AgentRun['status'], t: ReturnType<typeof useTranslation>['t']): string {
  switch (status) {
    case 'queued':
      return t('agents.chat.workflow.runQueued')
    case 'in_progress':
      return t('agents.chat.workflow.runInProgress')
    case 'requires_action':
      return t('agents.chat.workflow.runRequiresAction')
    case 'completed':
      return t('agents.chat.workflow.runCompleted')
    case 'completed_with_warnings':
      return t('agents.chat.workflow.runCompletedWithWarnings')
    case 'failed':
      return t('agents.chat.workflow.runFailed')
    case 'cancelled':
      return t('agents.chat.workflow.cancelled')
    default:
      return runStatusLabel(status)
  }
}

function safeJSONStringify(value: unknown) {
  return JSON.stringify(value, null, 2)
}
