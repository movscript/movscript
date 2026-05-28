import { useState } from 'react'
import { Bot, ChevronRight, Route, Workflow } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  AgentChatMessage,
  AgentRunActivityBubble,
  AgentRunActivityBubbleButton,
  AgentRunActivityBubbleFrame,
  AgentRunActivityChatBadge,
  AgentRunActivityCodeDisclosure,
  AgentRunActivityDetailButton,
  AgentRunActivityDisclosure,
  AgentRunActivityEmpty,
  AgentRunActivityItem,
  AgentRunActivityItemBody,
  AgentRunActivityItemHeader,
  AgentRunActivityItemMeta,
  AgentRunActivityItemRow,
  AgentRunActivityItemSummary,
  AgentRunActivityItemTitle,
  AgentRunActivityMeta,
  AgentRunActivityNotice,
  AgentRunActivityStatusBadge,
  AgentRunActivityStatusDot,
  AgentRunActivitySummaryText,
  AgentRunActivityTitle,
} from '@movscript/ui'
import { agentTimelineSummary, buildAgentRunTimeline } from '@/features/agent/domain/agentTimeline'
import { formatAgentDividerTime } from '@/features/agent/domain/agentMessageDivider'
import { runStatusLabel } from '@/features/agent/domain/agentRunUi'
import { formatAgentCompactTimestamp, formatAgentDuration, formatAgentDurationMs } from '@/features/agent/domain/agentTimeFormat'
import { agentRunStatusRecipe, agentWorkflowStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import { agentRunPath } from '@/routes/projectRoutes'
import { AgentActivityDividerMenu, AgentActivityFeedView, AgentActivityStatusText } from '@/features/agent/components/AgentActivityFeed'
import { buildAgentActivityFeed } from '@/features/agent/domain/agentActivityFeed'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { AgentInputAnswer } from '@/features/agent/domain/agentWorkflowInteraction'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

function formatActivityTime(value: string | undefined, locale: string) {
  return formatAgentCompactTimestamp(value, locale)
}

function durationLabel(start: string | undefined, end: string | undefined) {
  return formatAgentDuration(start, end)
}

function formatDurationLabel(ms: number) {
  return ms > 0 ? formatAgentDurationMs(ms) : ''
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

function ActivityJSONBlock({ label, value }: { label: string; value: unknown }) {
  const text = safeJSONStringify(value)
  return (
    <AgentRunActivityCodeDisclosure title={label}>
      {text}
    </AgentRunActivityCodeDisclosure>
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
  const timelineStatusRecipe = agentRunStatusRecipe(timeline.status)

  return (
    <AgentRunActivityDisclosure
      open={defaultOpen}
      className={className}
      title={title}
      icon={<Workflow size={12} />}
      action={runId && (
        <AgentRunActivityDetailButton
          type="button"
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
        </AgentRunActivityDetailButton>
      )}
      status={(
        <AgentRunActivityStatusBadge intent={timelineStatusRecipe.intent} emphasis={timelineStatusRecipe.emphasis}>
          {genericRunStatusLabel(timeline.status)}
        </AgentRunActivityStatusBadge>
      )}
      summary={agentTimelineSummary(timeline)}
    >
      {timeline.items.length === 0 ? (
        <AgentRunActivityEmpty>
          这次运行没有记录工具调用或交互。
        </AgentRunActivityEmpty>
      ) : timeline.items.map((item) => {
        const itemStatusRecipe = agentWorkflowStatusRecipe(item.status)
        return (
          <AgentRunActivityItem key={item.id}>
            <AgentRunActivityItemRow>
              <AgentRunActivityStatusDot intent={itemStatusRecipe.intent} />
              <AgentRunActivityItemBody>
                <AgentRunActivityItemHeader>
                  <AgentRunActivityItemTitle>{item.title}</AgentRunActivityItemTitle>
                  <AgentRunActivityStatusBadge intent={itemStatusRecipe.intent} emphasis={itemStatusRecipe.emphasis}>
                    {item.statusLabel ?? agentStepStatusLabel(item.status)}
                  </AgentRunActivityStatusBadge>
                </AgentRunActivityItemHeader>
                <AgentRunActivityItemMeta>
                  <span>{item.kind}</span>
                  <span>{formatActivityTime(item.createdAt, locale)}</span>
                  {durationLabel(item.createdAt, item.completedAt) && <span>{durationLabel(item.createdAt, item.completedAt)}</span>}
                </AgentRunActivityItemMeta>
                {item.summary && (
                  <AgentRunActivityItemSummary error={Boolean(item.error)}>
                    {item.summary}
                  </AgentRunActivityItemSummary>
                )}
                {item.args !== undefined && <ActivityJSONBlock label="参数" value={item.args} />}
                {item.result !== undefined && <ActivityJSONBlock label={item.error ? '错误数据' : '结果'} value={item.result} />}
              </AgentRunActivityItemBody>
            </AgentRunActivityItemRow>
          </AgentRunActivityItem>
        )
      })}
      {timeline.warnings?.length ? (
        <AgentRunActivityNotice tone="warning">
          {timeline.warnings.map((warning) => <div key={warning}>{warning}</div>)}
        </AgentRunActivityNotice>
      ) : null}
      {timeline.error && (
        <AgentRunActivityNotice tone="danger">
          {timeline.error}
        </AgentRunActivityNotice>
      )}
    </AgentRunActivityDisclosure>
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
  const timelineStatusRecipe = agentRunStatusRecipe(timeline.status)

  const openCard = () => setOpen(true)
  if (open) {
    return (
      <RunActivityPanel
        activity={activity}
        run={run}
        events={events}
        title={title}
        defaultOpen
        className={className}
      />
    )
  }

  return (
    <AgentRunActivityBubble className={className}>
      <AgentRunActivityBubbleFrame>
        <AgentRunActivityBubbleButton
          type="button"
          onClick={openCard}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') openCard()
          }}
          title="展开运行过程"
          aria-expanded={open}
        >
          <AgentRunActivityTitle icon={<ChevronRight size={12} />}>{title}</AgentRunActivityTitle>
          <AgentRunActivityMeta>
            <AgentRunActivityStatusBadge intent={timelineStatusRecipe.intent} emphasis={timelineStatusRecipe.emphasis}>
              {genericRunStatusLabel(timeline.status)}
            </AgentRunActivityStatusBadge>
            <AgentRunActivitySummaryText>{agentTimelineSummary(timeline)}</AgentRunActivitySummaryText>
          </AgentRunActivityMeta>
        </AgentRunActivityBubbleButton>
        {runId && (
          <AgentRunActivityDetailButton
            type="button"
            title="打开完整运行详情"
            aria-label="打开完整运行详情"
            onClick={() => navigate(agentRunPath(runId))}
          >
            <Route size={10} />
            详情
          </AgentRunActivityDetailButton>
        )}
      </AgentRunActivityBubbleFrame>
    </AgentRunActivityBubble>
  )
}

export function LiveRunActivityBubble({
  run,
  events,
  approving = false,
  onApprove,
  onReject,
  onAnswerInput,
}: {
  run: AgentRun | null
  events: ChatRunActivityEvent[]
  approving?: boolean
  onApprove?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
  onAnswerInput?: (requestId: string, answer: AgentInputAnswer) => void
}) {
  const { t } = useTranslation()
  if (!run && events.length === 0) return null
  const statusLabel = latestModelRetryStatus(events) ?? latestAgentStatusLabel(run, events)
  const runStatusText = workflowRunStatusLabel(run?.status ?? 'in_progress', t)
  const feed = buildAgentActivityFeed({ run, events })
  return (
    <div className="space-y-1">
      <AgentActivityStatusText run={run} events={events} fallback={statusLabel ?? runStatusText} />
      {feed && (feed.items.length > 0 || feed.rounds.length > 0) && (
        <AgentChatMessage
          role="assistant"
          avatar={<Bot size={14} />}
          head={<span className="ms-agent-message__head-label">{formatAgentDividerTime(run?.startedAt ?? events[0]?.createdAt)}</span>}
          actions={feed.activity ? <AgentActivityDividerMenu activity={feed.activity} /> : undefined}
          footer={(
            <AgentRunActivityChatBadge>
              {runStatusText}
            </AgentRunActivityChatBadge>
          )}
        >
          <AgentActivityFeedView
            run={run}
            events={events}
            className="mt-0"
            approving={approving}
            onApprove={onApprove}
            onReject={onReject}
            onAnswerInput={onAnswerInput}
          />
        </AgentChatMessage>
      )}
    </div>
  )
}

function latestAgentStatusLabel(run: AgentRun | null, events: ChatRunActivityEvent[]): string | undefined {
  if (run && isTerminalRunStatus(run.status)) return undefined
  const latest = [...events].reverse().find((event) => event.status === 'started' || event.status === 'info' || event.status === 'completed' || event.status === 'failed' || event.status === 'blocked')
  if (latest && latest.status !== 'started' && latest.status !== 'info') return undefined
  if (latest?.title === 'Model HTTP request sent') return '正在请求模型'
  if (latest?.title === 'Prompt composed') return '正在整理上下文'
  if (latest?.title === 'Assistant progress update') return '正在接收模型回复'
  if (latest?.title === 'Model tool call delta') return '正在准备工具调用'
  if (latest?.kind === 'tool_call') return latest.toolName ? `正在调用工具：${latest.toolName}` : '正在调用工具'
  if (run?.status === 'queued') return '等待 agent 开始'
  if (run?.status === 'in_progress') return 'agent 正在运行'
  return undefined
}

function isTerminalRunStatus(status: AgentRun['status']): boolean {
  return status === 'completed' || status === 'completed_with_warnings' || status === 'failed' || status === 'cancelled'
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
