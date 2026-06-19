import { Bot, History, ListChecks, Loader2, Route } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@movscript/ui/primitives'
import {
  AgentPlanOverviewActionButton,
  AgentPlanOverviewBadge,
  AgentPlanOverviewDisclosure,
  AgentPlanOverviewDisclosureBody,
  AgentPlanOverviewDisclosureSummary,
  AgentPlanOverviewErrorText,
  AgentPlanOverviewFilterRow,
  AgentPlanOverviewInlineActions,
  AgentPlanOverviewItemCard,
  AgentPlanOverviewItemHeader,
  AgentPlanOverviewItemTitle,
  AgentPlanOverviewList,
  AgentPlanOverviewMetaRow,
  AgentPlanOverviewMetaText,
  AgentPlanOverviewTaskBadge,
  AgentPlanOverviewText,
  AgentPlanOverviewWarningText,
} from '@movscript/ui/business/agent'
import type { buildPlanTaskViews } from '@/features/agent/domain/agentPlanUi'
import { agentTraceView, runStatusLabel, traceEventStatusLabel, traceKindLabel } from '@/features/agent/domain/agentRunUi'
import { agentRunStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import {
  agentPlanDurationLabel,
  agentStepStatusLabel,
  agentStepTypeLabel,
  formatAgentPlanDate,
} from '@/features/agent/presentation/AgentPlanOverviewPanelModel'
import type { AgentRunTraceSummary, AgentTraceEvent } from '@movscript/core/agent/protocol'

type AgentPlanTaskView = ReturnType<typeof buildPlanTaskViews>[number]
type TraceEventKindFilter = 'all' | AgentTraceEvent['kind']

export function AgentPlanOverviewWorkerSection({
  view,
  locale,
  traceSummaries,
  loadingTraceSummaryRunId,
  traceSummaryErrors,
  traceEventsByRunId,
  traceEventHasMoreByRunId,
  loadingTraceEventsRunId,
  traceEventErrors,
  traceEventKindFilters,
  onTraceEventKindFiltersChange,
  onLoadTraceSummary,
  onLoadTraceEvents,
  onOpenConsole,
}: {
  view: AgentPlanTaskView
  locale: string
  traceSummaries: Record<string, AgentRunTraceSummary>
  loadingTraceSummaryRunId: string | null
  traceSummaryErrors: Record<string, string>
  traceEventsByRunId: Record<string, AgentTraceEvent[]>
  traceEventHasMoreByRunId: Record<string, boolean>
  loadingTraceEventsRunId: string | null
  traceEventErrors: Record<string, string>
  traceEventKindFilters: Record<string, TraceEventKindFilter>
  onTraceEventKindFiltersChange: (updater: (current: Record<string, TraceEventKindFilter>) => Record<string, TraceEventKindFilter>) => void
  onLoadTraceSummary: (runId: string) => void
  onLoadTraceEvents: (runId: string, mode?: 'initial' | 'more') => void
  onOpenConsole: () => void
}) {
  const worker = view.worker
  if (!worker) return null
  const workerStatusRecipe = agentRunStatusRecipe(worker.status)
  return (
    <AgentPlanOverviewDisclosure>
      <AgentPlanOverviewDisclosureSummary>
        <Bot size={10} />
        <AgentPlanOverviewMetaText data-truncate="true">执行器 {view.subagentName ?? worker.subagentName ?? worker.id}</AgentPlanOverviewMetaText>
        <AgentPlanOverviewTaskBadge intent={workerStatusRecipe.intent} emphasis={workerStatusRecipe.emphasis}>
          {runStatusLabel(worker.status)}
        </AgentPlanOverviewTaskBadge>
      </AgentPlanOverviewDisclosureSummary>
      <AgentPlanOverviewDisclosureBody>
        <AgentPlanOverviewMetaRow>
          <AgentPlanOverviewMetaText data-truncate="true">运行 {worker.id}</AgentPlanOverviewMetaText>
          {worker.parentRunId && <AgentPlanOverviewMetaText data-truncate="true">上级 {worker.parentRunId}</AgentPlanOverviewMetaText>}
          {worker.taskId && <AgentPlanOverviewMetaText data-truncate="true">任务 {worker.taskId}</AgentPlanOverviewMetaText>}
          {typeof worker.progress === 'number' && <AgentPlanOverviewMetaText>{Math.round(Math.max(0, Math.min(1, worker.progress)) * 100)}%</AgentPlanOverviewMetaText>}
          <AgentPlanOverviewMetaText>{worker.stepCount} 个步骤</AgentPlanOverviewMetaText>
        </AgentPlanOverviewMetaRow>
        <AgentPlanOverviewMetaRow>
          {worker.startedAt && <AgentPlanOverviewMetaText data-truncate="true" title={worker.startedAt}>开始 {formatAgentPlanDate(worker.startedAt, locale)}</AgentPlanOverviewMetaText>}
          {worker.completedAt && <AgentPlanOverviewMetaText data-truncate="true" title={worker.completedAt}>完成 {formatAgentPlanDate(worker.completedAt, locale)}</AgentPlanOverviewMetaText>}
          {worker.failedAt && <AgentPlanOverviewMetaText data-truncate="true" title={worker.failedAt}>失败 {formatAgentPlanDate(worker.failedAt, locale)}</AgentPlanOverviewMetaText>}
          {worker.cancelledAt && <AgentPlanOverviewMetaText data-truncate="true" title={worker.cancelledAt}>取消 {formatAgentPlanDate(worker.cancelledAt, locale)}</AgentPlanOverviewMetaText>}
          <AgentPlanOverviewMetaText data-truncate="true" title={worker.updatedAt}>更新 {formatAgentPlanDate(worker.updatedAt, locale)}</AgentPlanOverviewMetaText>
          {agentPlanDurationLabel(worker.startedAt, worker.completedAt ?? worker.failedAt ?? worker.cancelledAt) && (
            <AgentPlanOverviewMetaText>耗时 {agentPlanDurationLabel(worker.startedAt, worker.completedAt ?? worker.failedAt ?? worker.cancelledAt)}</AgentPlanOverviewMetaText>
          )}
        </AgentPlanOverviewMetaRow>
        {worker.error && (
          <AgentPlanOverviewErrorText>{worker.error}</AgentPlanOverviewErrorText>
        )}
        {worker.warnings.length > 0 && (
          <>
            {worker.warnings.slice(0, 3).map((warning) => <AgentPlanOverviewWarningText key={warning}>{warning}</AgentPlanOverviewWarningText>)}
          </>
        )}
        {worker.recentSteps.length > 0 && (
          <AgentPlanOverviewList>
            {worker.recentSteps.map((step) => (
              <AgentPlanOverviewItemCard key={step.id}>
                <AgentPlanOverviewItemHeader>
                  <AgentPlanOverviewItemTitle>{step.title}</AgentPlanOverviewItemTitle>
                  <AgentPlanOverviewMetaText>{agentStepStatusLabel(step.status)}</AgentPlanOverviewMetaText>
                </AgentPlanOverviewItemHeader>
                <AgentPlanOverviewMetaRow>
                  <AgentPlanOverviewMetaText>{agentStepTypeLabel(step.type)}</AgentPlanOverviewMetaText>
                  {step.toolName && <AgentPlanOverviewMetaText data-truncate="true">工具 {step.toolName}</AgentPlanOverviewMetaText>}
                  {step.sandboxed && <AgentPlanOverviewMetaText>沙盒</AgentPlanOverviewMetaText>}
                  <AgentPlanOverviewMetaText data-truncate="true" title={step.createdAt}>创建 {formatAgentPlanDate(step.createdAt, locale)}</AgentPlanOverviewMetaText>
                  {step.completedAt && <AgentPlanOverviewMetaText data-truncate="true" title={step.completedAt}>完成 {formatAgentPlanDate(step.completedAt, locale)}</AgentPlanOverviewMetaText>}
                  {agentPlanDurationLabel(step.createdAt, step.completedAt) && <AgentPlanOverviewMetaText>耗时 {agentPlanDurationLabel(step.createdAt, step.completedAt)}</AgentPlanOverviewMetaText>}
                </AgentPlanOverviewMetaRow>
                {step.error && <AgentPlanOverviewErrorText>{step.error}</AgentPlanOverviewErrorText>}
              </AgentPlanOverviewItemCard>
            ))}
          </AgentPlanOverviewList>
        )}
        <AgentPlanOverviewInlineActions>
          <AgentPlanOverviewActionButton
            type="button"
            variant="ghost"
            onClick={onOpenConsole}
          >
            <Route size={10} />
            Agent 控制台
          </AgentPlanOverviewActionButton>
          <AgentPlanOverviewActionButton
            type="button"
            variant="ghost"
            disabled={loadingTraceSummaryRunId === worker.id}
            onClick={() => onLoadTraceSummary(worker.id)}
          >
            {loadingTraceSummaryRunId === worker.id ? <Loader2 size={10} className="animate-spin" /> : <ListChecks size={10} />}
            轨迹统计
          </AgentPlanOverviewActionButton>
          <AgentPlanOverviewActionButton
            type="button"
            variant="ghost"
            disabled={loadingTraceEventsRunId === worker.id}
            onClick={() => onLoadTraceEvents(worker.id)}
          >
            {loadingTraceEventsRunId === worker.id ? <Loader2 size={10} className="animate-spin" /> : <History size={10} />}
            运行事件
          </AgentPlanOverviewActionButton>
        </AgentPlanOverviewInlineActions>
        {traceSummaries[worker.id] && (
          <AgentPlanOverviewItemCard>
            <AgentPlanOverviewMetaRow>
              <AgentPlanOverviewMetaText>{traceSummaries[worker.id].total} 个事件</AgentPlanOverviewMetaText>
              {Object.entries(traceSummaries[worker.id].byKind).slice(0, 6).map(([kind, count]) => (
                <AgentPlanOverviewBadge key={kind}>
                  {traceKindLabel(kind as AgentTraceEvent['kind'])} {count}
                </AgentPlanOverviewBadge>
              ))}
            </AgentPlanOverviewMetaRow>
            {traceSummaries[worker.id].latestEvent && (() => {
              const latestView = agentTraceView(traceSummaries[worker.id].latestEvent!)
              return (
                <AgentPlanOverviewText>
                  最新 {latestView.title}
                </AgentPlanOverviewText>
              )
            })()}
          </AgentPlanOverviewItemCard>
        )}
        {traceSummaryErrors[worker.id] && (
          <AgentPlanOverviewErrorText>{traceSummaryErrors[worker.id]}</AgentPlanOverviewErrorText>
        )}
        {traceEventsByRunId[worker.id]?.length > 0 && (
          <AgentPlanOverviewList>
            <AgentPlanTraceEventFilter
              runId={worker.id}
              events={traceEventsByRunId[worker.id] ?? []}
              traceEventKindFilters={traceEventKindFilters}
              onTraceEventKindFiltersChange={onTraceEventKindFiltersChange}
            />
            <AgentPlanTraceEventRows
              events={traceEventsByRunId[worker.id] ?? []}
              locale={locale}
              traceEventKindFilters={traceEventKindFilters}
              runId={worker.id}
            />
            {traceEventHasMoreByRunId[worker.id] && (
              <AgentPlanOverviewActionButton
                type="button"
                variant="ghost"
                disabled={loadingTraceEventsRunId === worker.id}
                onClick={() => onLoadTraceEvents(worker.id, 'more')}
              >
                {loadingTraceEventsRunId === worker.id ? <Loader2 size={10} className="animate-spin" /> : <History size={10} />}
                加载更多
              </AgentPlanOverviewActionButton>
            )}
          </AgentPlanOverviewList>
        )}
        {traceEventErrors[worker.id] && (
          <AgentPlanOverviewErrorText>{traceEventErrors[worker.id]}</AgentPlanOverviewErrorText>
        )}
      </AgentPlanOverviewDisclosureBody>
    </AgentPlanOverviewDisclosure>
  )
}

function AgentPlanTraceEventFilter({
  runId,
  events,
  traceEventKindFilters,
  onTraceEventKindFiltersChange,
}: {
  runId: string
  events: AgentTraceEvent[]
  traceEventKindFilters: Record<string, TraceEventKindFilter>
  onTraceEventKindFiltersChange: (updater: (current: Record<string, TraceEventKindFilter>) => Record<string, TraceEventKindFilter>) => void
}) {
  const kinds = Array.from(new Set(events.map((event) => event.kind))).sort()
  const requestedKind = traceEventKindFilters[runId] ?? 'all'
  const activeKind = requestedKind === 'all' || kinds.includes(requestedKind) ? requestedKind : 'all'
  const visibleEvents = activeKind === 'all' ? events : events.filter((event) => event.kind === activeKind)
  return (
    <AgentPlanOverviewFilterRow>
      <AgentPlanOverviewMetaText>
        显示 {visibleEvents.length}/{events.length}
      </AgentPlanOverviewMetaText>
      <Select
        value={activeKind}
        onValueChange={(next) => {
          const filter = next === 'all' || kinds.includes(next as AgentTraceEvent['kind'])
            ? next as TraceEventKindFilter
            : 'all'
          onTraceEventKindFiltersChange((current) => ({ ...current, [runId]: filter }))
        }}
      >
        <SelectTrigger size="sm" className="h-6 w-32 max-w-full type-tiny">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部事件</SelectItem>
          {kinds.map((kind) => (
            <SelectItem key={kind} value={kind}>{traceKindLabel(kind)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </AgentPlanOverviewFilterRow>
  )
}

function AgentPlanTraceEventRows({
  runId,
  events,
  locale,
  traceEventKindFilters,
}: {
  runId: string
  events: AgentTraceEvent[]
  locale: string
  traceEventKindFilters: Record<string, TraceEventKindFilter>
}) {
  const kinds = Array.from(new Set(events.map((event) => event.kind)))
  const requestedKind = traceEventKindFilters[runId] ?? 'all'
  const activeKind = requestedKind === 'all' || kinds.includes(requestedKind) ? requestedKind : 'all'
  return (
    <>
      {(activeKind === 'all' ? events : events.filter((event) => event.kind === activeKind)).map((event) => {
        const eventView = agentTraceView(event)
        return (
          <AgentPlanOverviewItemCard key={event.id}>
            <AgentPlanOverviewItemHeader>
              <AgentPlanOverviewItemTitle>{eventView.title}</AgentPlanOverviewItemTitle>
              <AgentPlanOverviewMetaText>{traceEventStatusLabel(event.status)}</AgentPlanOverviewMetaText>
            </AgentPlanOverviewItemHeader>
            <AgentPlanOverviewMetaRow>
              <AgentPlanOverviewMetaText>{eventView.categoryLabel}</AgentPlanOverviewMetaText>
              <AgentPlanOverviewMetaText>{traceKindLabel(event.kind)}</AgentPlanOverviewMetaText>
              {event.toolName && <AgentPlanOverviewMetaText data-truncate="true">工具 {event.toolName}</AgentPlanOverviewMetaText>}
              {event.stepId && <AgentPlanOverviewMetaText data-truncate="true">步骤 {event.stepId}</AgentPlanOverviewMetaText>}
              <AgentPlanOverviewMetaText data-truncate="true" title={event.createdAt}>创建 {formatAgentPlanDate(event.createdAt, locale)}</AgentPlanOverviewMetaText>
              {event.completedAt && <AgentPlanOverviewMetaText data-truncate="true" title={event.completedAt}>完成 {formatAgentPlanDate(event.completedAt, locale)}</AgentPlanOverviewMetaText>}
              {agentPlanDurationLabel(event.createdAt, event.completedAt) && <AgentPlanOverviewMetaText>耗时 {agentPlanDurationLabel(event.createdAt, event.completedAt)}</AgentPlanOverviewMetaText>}
            </AgentPlanOverviewMetaRow>
            {eventView.behavior && <AgentPlanOverviewText>行为：{eventView.behavior}</AgentPlanOverviewText>}
            {eventView.impact && <AgentPlanOverviewText>影响：{eventView.impact}</AgentPlanOverviewText>}
            {eventView.summary && <AgentPlanOverviewText>摘要：{eventView.summary}</AgentPlanOverviewText>}
          </AgentPlanOverviewItemCard>
        )
      })}
    </>
  )
}
