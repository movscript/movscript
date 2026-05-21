import { useState } from 'react'
import { Bot, CircleStop, ClipboardCheck, FileText, History, ListChecks, Loader2, PlayIcon, RefreshCw, Route } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@movscript/ui'
import {
  agentTaskStatusLabel,
  buildPlanArtifactSummary,
  buildPlanNameConflictViews,
  buildPlanOverviewStats,
  buildPlanStatusExplanation,
  buildPlanTaskViews,
} from '@/lib/agentPlanUi'
import { isTerminalAgentRun } from '@/lib/agentRunControl'
import { agentToolNameLabel } from '@/lib/agentToolDisplay'
import { agentPlanStatusLabel, agentTraceView, inputTypeLabel, runStatusLabel, traceEventStatusLabel, traceKindLabel } from '@/lib/agentRunUi'
import { localAgentApprovalImpactText, localAgentApprovalPermissionText, localAgentApprovalRiskText } from '@/components/agent/localRuntime'
import { localAgentClient, type AgentPlanSnapshot, type AgentRunTraceSummary, type AgentTraceEvent } from '@/lib/localAgentClient'
import { cn } from '@/lib/utils'
import { agentRunPath } from '@/routes/projectRoutes'
import type { PlanDispatchSettings } from '@/lib/agentPlanActions'

const DEFAULT_PLAN_DISPATCH_SETTINGS: PlanDispatchSettings = {
  maxWorkers: 2,
  maxTaskAttempts: 2,
  workerTimeoutMs: 15 * 60_000,
}

const PLAN_MAX_WORKER_OPTIONS = [1, 2, 3, 4]
const PLAN_MAX_TASK_ATTEMPT_OPTIONS = [1, 2, 3]
const PLAN_WORKER_TIMEOUT_OPTIONS = [
  { label: '5m', value: 5 * 60_000 },
  { label: '15m', value: 15 * 60_000 },
  { label: '30m', value: 30 * 60_000 },
  { label: '1h', value: 60 * 60_000 },
]

export function AgentPlanOverviewPanel({
  snapshot,
  busy,
  onDispatch,
  onReplan,
  onCancelTree,
  onAcceptReview,
  onReworkReview,
  onRejectReview,
  dispatchSettings,
  onDispatchSettingsChange,
}: {
  snapshot?: AgentPlanSnapshot
  busy?: boolean
  onDispatch?: () => void
  onReplan?: () => void
  onCancelTree?: () => void
  onAcceptReview?: (taskId: string) => void
  onReworkReview?: (taskId: string) => void
  onRejectReview?: (taskId: string) => void
  dispatchSettings?: PlanDispatchSettings
  onDispatchSettingsChange?: (settings: PlanDispatchSettings) => void
}) {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const [artifactTypeFilter, setArtifactTypeFilter] = useState<'all' | string>('all')
  const [traceSummaries, setTraceSummaries] = useState<Record<string, AgentRunTraceSummary>>({})
  const [loadingTraceSummaryRunId, setLoadingTraceSummaryRunId] = useState<string | null>(null)
  const [traceSummaryErrors, setTraceSummaryErrors] = useState<Record<string, string>>({})
  const [traceEventsByRunId, setTraceEventsByRunId] = useState<Record<string, AgentTraceEvent[]>>({})
  const [traceEventHasMoreByRunId, setTraceEventHasMoreByRunId] = useState<Record<string, boolean>>({})
  const [loadingTraceEventsRunId, setLoadingTraceEventsRunId] = useState<string | null>(null)
  const [traceEventErrors, setTraceEventErrors] = useState<Record<string, string>>({})
  const [traceEventKindFilters, setTraceEventKindFilters] = useState<Record<string, 'all' | AgentTraceEvent['kind']>>({})
  if (!snapshot) return null
  const taskViews = buildPlanTaskViews(snapshot)
  const artifactSummary = buildPlanArtifactSummary(snapshot)
  const nameConflicts = buildPlanNameConflictViews(snapshot)
  const overviewStats = buildPlanOverviewStats(snapshot)
  const planStatusExplanation = buildPlanStatusExplanation(snapshot)
  const availableArtifactTypes = new Set(artifactSummary.byType.map((item) => item.type))
  const activeArtifactTypeFilter = artifactTypeFilter === 'all' || availableArtifactTypes.has(artifactTypeFilter)
    ? artifactTypeFilter
    : 'all'
  const visiblePlanArtifacts = activeArtifactTypeFilter === 'all'
    ? artifactSummary.artifacts
    : artifactSummary.artifacts.filter((artifact) => artifact.type === activeArtifactTypeFilter)
  const tasks = taskViews.map((view) => view.task)
  const activeRuns = snapshot.runs.filter((run) => run.status === 'queued' || run.status === 'in_progress' || run.status === 'requires_action').length
  const rootRun = snapshot.runs.find((run) => run.id === snapshot.plan.rootRunId)
  const canDispatch = activeRuns === 0 && tasks.some((task) => task.status === 'pending')
  const canReplan = tasks.some((task) => task.status === 'blocked' || task.status === 'failed' || task.status === 'cancelled')
  const canCancel = activeRuns > 0 || (rootRun && !isTerminalAgentRun(rootRun))
  const settings = dispatchSettings ?? DEFAULT_PLAN_DISPATCH_SETTINGS
  const updateSettings = (patch: Partial<PlanDispatchSettings>) => {
    onDispatchSettingsChange?.({ ...settings, ...patch })
  }
  const scrollToTask = (taskId: string | undefined) => {
    if (!taskId || typeof document === 'undefined') return
    document.getElementById(`agent-plan-task-${taskId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const openRun = (runId: string | undefined) => {
    if (!runId) return
    navigate(agentRunPath(runId))
  }
  const loadTraceSummary = async (runId: string) => {
    if (traceSummaries[runId] || loadingTraceSummaryRunId === runId) return
    setLoadingTraceSummaryRunId(runId)
    setTraceSummaryErrors((current) => {
      const next = { ...current }
      delete next[runId]
      return next
    })
    try {
      const summary = await localAgentClient.getRunTraceSummary(runId)
      setTraceSummaries((current) => ({ ...current, [runId]: summary }))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setTraceSummaryErrors((current) => ({ ...current, [runId]: message }))
    } finally {
      setLoadingTraceSummaryRunId(null)
    }
  }
  const loadTraceEvents = async (runId: string, mode: 'initial' | 'more' = 'initial') => {
    if ((mode === 'initial' && traceEventsByRunId[runId]) || loadingTraceEventsRunId === runId) return
    setLoadingTraceEventsRunId(runId)
    setTraceEventErrors((current) => {
      const next = { ...current }
      delete next[runId]
      return next
    })
    try {
      const currentEvents = traceEventsByRunId[runId] ?? []
      const cursor = mode === 'more' ? currentEvents.at(-1)?.id : undefined
      const response = await localAgentClient.getRunTraceEvents(runId, { limit: 8, ...(cursor ? { cursor } : {}) })
      setTraceEventsByRunId((current) => ({
        ...current,
        [runId]: mode === 'more' ? [...(current[runId] ?? []), ...response.events] : response.events,
      }))
      setTraceEventHasMoreByRunId((current) => ({ ...current, [runId]: typeof response.hasMore === 'boolean' ? response.hasMore : response.events.length >= 8 }))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setTraceEventErrors((current) => ({ ...current, [runId]: message }))
    } finally {
      setLoadingTraceEventsRunId(null)
    }
  }
  return (
    <div data-testid="agent-plan-overview" className="mt-2 rounded-md border border-border bg-background/70 px-2.5 py-2 type-label">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
            <Route size={12} />
            <span className="truncate">{snapshot.plan.title}</span>
          </div>
          <div data-testid="agent-plan-overview-stats" className="mt-0.5 type-micro text-muted-foreground">
            {overviewStats.completedTaskCount}/{overviewStats.taskCount} 个任务 · {overviewStats.activeWorkerCount} 个执行器运行中
            {overviewStats.artifactCount > 0 && <> · {overviewStats.artifactCount} 个产物</>}
            {overviewStats.nameConflictCount > 0 && <> · {overviewStats.nameConflictCount} 个重名冲突</>}
          </div>
          <p data-testid="agent-plan-status-explanation" className="mt-0.5 type-micro leading-relaxed text-muted-foreground">{planStatusExplanation}</p>
        </div>
        <Badge variant={runStatusVariant(snapshot.plan.status)} className="shrink-0 type-micro leading-4 px-1.5 py-0">
          {agentPlanStatusLabel(snapshot.plan.status)}
        </Badge>
      </div>
      {nameConflicts.length > 0 && (
        <div data-testid="agent-plan-name-conflicts" className="mt-2 space-y-1 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 type-micro leading-relaxed text-destructive">
          {nameConflicts.map((conflict) => (
            <div key={conflict.subagentName} className="min-w-0">
              <div className="truncate font-medium">子代理重名 · {conflict.subagentName}</div>
              <div className="mt-1 space-y-0.5">
                {conflict.entries.map((entry) => (
                  <div key={entry.taskId} className="flex min-w-0 items-center justify-between gap-2 rounded bg-background/70 px-1.5 py-0.5 text-muted-foreground">
                    <div className="min-w-0">
                      <div className="truncate text-foreground">{entry.taskTitle}</div>
                      <div className="flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5">
                        <span className="truncate">任务 {entry.taskId}</span>
                        {entry.taskStatus && <span>{agentTaskStatusLabel(entry.taskStatus)}</span>}
                        {entry.ownerRunId && <span className="truncate">run {entry.ownerRunId}</span>}
                        {entry.ownerRunStatus && <span>{runStatusLabel(entry.ownerRunStatus)}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" size="xs" variant="ghost" className="px-1 type-min" onClick={() => scrollToTask(entry.taskId)}>
                        任务
                      </Button>
                      {entry.ownerRunId && (
                        <Button type="button" size="xs" variant="ghost" className="px-1 type-min" onClick={() => openRun(entry.ownerRunId)}>
                          <Route size={8} />
                          运行
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {(onDispatch || onReplan || onCancelTree) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {onDispatch && (
            <Button type="button" size="xs" variant="outline" className="px-1.5 type-micro" disabled={busy || !canDispatch} onClick={onDispatch}>
              {busy ? <Loader2 size={10} className="animate-spin" /> : <PlayIcon size={10} />}
              分派
            </Button>
          )}
          {onReplan && (
            <Button type="button" size="xs" variant="outline" className="px-1.5 type-micro" disabled={busy || !canReplan} onClick={onReplan}>
              {busy ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
              重新规划
            </Button>
          )}
          {onCancelTree && (
            <Button type="button" size="xs" variant="ghost" className="px-1.5 type-micro text-destructive hover:text-destructive" disabled={busy || !canCancel} onClick={onCancelTree}>
              {busy ? <Loader2 size={10} className="animate-spin" /> : <CircleStop size={10} />}
              取消树
            </Button>
          )}
        </div>
      )}
      {onDispatchSettingsChange && (
        <div className="mt-2 grid grid-cols-3 gap-1">
          <Select value={String(settings.maxWorkers)} onValueChange={(next) => updateSettings({ maxWorkers: Number(next) })}>
            <SelectTrigger size="sm" className="h-6 min-w-0 type-micro" disabled={busy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_MAX_WORKER_OPTIONS.map((value) => (
                <SelectItem key={value} value={String(value)}>{value} 个 worker</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(settings.maxTaskAttempts)} onValueChange={(next) => updateSettings({ maxTaskAttempts: Number(next) })}>
            <SelectTrigger size="sm" className="h-6 min-w-0 type-micro" disabled={busy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_MAX_TASK_ATTEMPT_OPTIONS.map((value) => (
                <SelectItem key={value} value={String(value)}>{value} attempt{value === 1 ? '' : 's'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(settings.workerTimeoutMs)} onValueChange={(next) => updateSettings({ workerTimeoutMs: Number(next) })}>
            <SelectTrigger size="sm" className="h-6 min-w-0 type-micro" disabled={busy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_WORKER_TIMEOUT_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={String(item.value)}>{item.label} timeout</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.round(Math.max(0, Math.min(1, snapshot.plan.progress)) * 100)}%` }}
        />
      </div>
      {artifactSummary.totalCount > 0 && (
        <details data-testid="agent-plan-artifact-summary" className="mt-2 rounded border border-border/70 bg-muted/10">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-1 px-2 py-1.5 type-micro font-medium text-foreground">
            <FileText size={10} />
            <span>{artifactSummary.totalCount} 个计划产物</span>
            {artifactSummary.byType.slice(0, 3).map((item) => (
              <Badge key={item.type} variant="outline" className="type-min leading-3 px-1 py-0">
                {item.type} {item.count}
              </Badge>
            ))}
          </summary>
          <div className="space-y-1 border-t border-border/60 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="type-micro text-muted-foreground">
                显示 {Math.min(visiblePlanArtifacts.length, 6)}/{visiblePlanArtifacts.length}
              </span>
              <Select value={activeArtifactTypeFilter} onValueChange={(next) => setArtifactTypeFilter(next)}>
                <SelectTrigger size="sm" className="h-6 w-32 max-w-full type-micro">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {artifactSummary.byType.map((item) => (
                    <SelectItem key={item.type} value={item.type}>{item.type} ({item.count})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {visiblePlanArtifacts.slice(0, 6).map((artifact) => (
              <div key={artifact.id} className="rounded bg-background/80 px-1.5 py-1 type-micro leading-relaxed text-muted-foreground">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">{artifact.label}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    {artifact.taskId && (
                      <Button type="button" size="xs" variant="ghost" className="px-1 type-min" onClick={() => scrollToTask(artifact.taskId)}>
                        定位
                      </Button>
                    )}
                    {artifact.sourceRunId && (
                      <Button type="button" size="xs" variant="ghost" className="px-1 type-min" onClick={() => openRun(artifact.sourceRunId)}>
                        <Route size={8} />
                        运行
                      </Button>
                    )}
                    {artifact.sourceTaskOwnerRunId && artifact.sourceTaskOwnerRunId !== artifact.sourceRunId && (
                      <Button type="button" size="xs" variant="ghost" className="px-1 type-min" onClick={() => openRun(artifact.sourceTaskOwnerRunId)}>
                        来源
                      </Button>
                    )}
                    <span>{artifact.type}</span>
                  </div>
                </div>
                <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5">
                  {artifact.uri && <span className="truncate">URI {artifact.uri}</span>}
                  {artifact.taskTitle && <span className="truncate">任务 {artifact.taskTitle}</span>}
                  {artifact.sourceRunId && <span className="truncate">运行 {artifact.sourceRunId}</span>}
                  {artifact.sourceTaskId && <span className="truncate">来源任务 {artifact.sourceTaskTitle ?? artifact.sourceTaskId}</span>}
                  {artifact.sourceTaskStatus && <span>{agentTaskStatusLabel(artifact.sourceTaskStatus)}</span>}
                  {artifact.subagentName && <span className="truncate">子代理 {artifact.subagentName}</span>}
                  {artifact.toolName && <span className="truncate">工具 {artifact.toolName}</span>}
                  {artifact.policy && <span className="truncate">策略 {artifact.policy}</span>}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
      {tasks.length > 0 && (
        <div className="mt-2 space-y-1">
          {taskViews.map((view) => {
            const task = view.task
            return (
              <div id={`agent-plan-task-${task.id}`} key={task.id} className="flex min-w-0 scroll-mt-4 items-start gap-1.5 rounded border border-border/70 bg-background px-2 py-1.5">
                <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', workflowDotClass(task.status === 'done' ? 'completed' : task.status === 'failed' ? 'failed' : 'in_progress'))} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate type-tiny font-medium text-foreground">{task.title}</span>
                    <span className={cn('shrink-0 rounded px-1.5 py-0.5 type-micro', workflowStatusClass(task.status === 'done' ? 'completed' : task.status === 'failed' ? 'failed' : task.status === 'cancelled' ? 'failed' : 'in_progress'))}>
                      {agentPlanStatusLabel(task.status)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 type-micro text-muted-foreground">
                    <span>{Math.round(Math.max(0, Math.min(1, task.progress)) * 100)}%</span>
                    {view.ownerLabel ? (
                      <span className={cn('truncate', view.subagentName ? 'font-medium text-foreground' : '')}>{view.ownerLabel}</span>
                    ) : null}
                    {view.waitingInputCount > 0 && <span>{view.waitingInputCount} 个输入</span>}
                    {view.waitingApprovalCount > 0 && <span>{view.waitingApprovalCount} 个审批</span>}
                    {view.retryAttempt && <span>第 {view.retryAttempt}{view.maxTaskAttempts ? `/${view.maxTaskAttempts}` : ''} 次尝试</span>}
                    {!view.retryAttempt && view.maxTaskAttempts && <span>最多 {view.maxTaskAttempts} 次尝试</span>}
                    {view.previousStatus && <span>来自 {agentPlanStatusLabel(view.previousStatus)}</span>}
                    {view.workerTimeoutMs && <span>超时 {formatDurationLabel(view.workerTimeoutMs)}</span>}
                    {view.timedOutRunId && <span className="truncate">超时运行 {view.timedOutRunId}</span>}
                    {view.previousOwnerRunId && <span className="truncate">上次运行 {view.previousOwnerRunId}</span>}
                    {view.artifactCount > 0 && <span>{view.artifactCount} 个产物</span>}
                  </div>
                  <p className="mt-0.5 type-micro leading-relaxed text-muted-foreground">{view.statusExplanation}</p>
                  {view.blocker && (
                    <p className="mt-1 type-tiny leading-relaxed text-amber-700 dark:text-amber-300">{view.blocker}</p>
                  )}
                  {view.worker && (
                    <details className="mt-1 rounded border border-border/60 bg-muted/10">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-1 px-1.5 py-1 type-micro font-medium text-foreground">
                        <Bot size={10} />
                        <span className="truncate">执行器 {view.subagentName ?? view.worker.subagentName ?? view.worker.id}</span>
                        <Badge variant={runStatusVariant(view.worker.status)} className="type-min leading-3 px-1 py-0">
                          {runStatusLabel(view.worker.status)}
                        </Badge>
                      </summary>
                      <div className="space-y-1 border-t border-border/60 px-1.5 py-1 type-micro leading-relaxed text-muted-foreground">
                        <div className="flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5">
                          <span className="truncate">运行 {view.worker.id}</span>
                          {view.worker.parentRunId && <span className="truncate">上级 {view.worker.parentRunId}</span>}
                          {view.worker.taskId && <span className="truncate">任务 {view.worker.taskId}</span>}
                          {typeof view.worker.progress === 'number' && <span>{Math.round(Math.max(0, Math.min(1, view.worker.progress)) * 100)}%</span>}
                          <span>{view.worker.stepCount} 个步骤</span>
                        </div>
                        <div className="flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5">
                          {view.worker.startedAt && <span className="truncate" title={view.worker.startedAt}>开始 {formatAgentDate(view.worker.startedAt, locale)}</span>}
                          {view.worker.completedAt && <span className="truncate" title={view.worker.completedAt}>完成 {formatAgentDate(view.worker.completedAt, locale)}</span>}
                          {view.worker.failedAt && <span className="truncate" title={view.worker.failedAt}>失败 {formatAgentDate(view.worker.failedAt, locale)}</span>}
                          {view.worker.cancelledAt && <span className="truncate" title={view.worker.cancelledAt}>取消 {formatAgentDate(view.worker.cancelledAt, locale)}</span>}
                          <span className="truncate" title={view.worker.updatedAt}>更新 {formatAgentDate(view.worker.updatedAt, locale)}</span>
                          {durationLabel(view.worker.startedAt, view.worker.completedAt ?? view.worker.failedAt ?? view.worker.cancelledAt) && (
                            <span>耗时 {durationLabel(view.worker.startedAt, view.worker.completedAt ?? view.worker.failedAt ?? view.worker.cancelledAt)}</span>
                          )}
                        </div>
                        {view.worker.error && (
                          <p className="text-destructive">{view.worker.error}</p>
                        )}
                        {view.worker.warnings.length > 0 && (
                          <div className="space-y-0.5 text-amber-700 dark:text-amber-300">
                            {view.worker.warnings.slice(0, 3).map((warning) => <div key={warning}>{warning}</div>)}
                          </div>
                        )}
                        {view.worker.recentSteps.length > 0 && (
                          <div className="space-y-1">
                            {view.worker.recentSteps.map((step) => (
                              <div key={step.id} className="rounded bg-background/80 px-1.5 py-1">
                                <div className="flex min-w-0 items-center justify-between gap-2">
                                  <span className="truncate font-medium text-foreground">{step.title}</span>
                                  <span className="shrink-0">{agentStepStatusLabel(step.status)}</span>
                                </div>
                                <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5">
                                  <span>{agentStepTypeLabel(step.type)}</span>
                                  {step.toolName && <span className="truncate">工具 {step.toolName}</span>}
                                  {step.sandboxed && <span>沙盒</span>}
                                  <span className="truncate" title={step.createdAt}>创建 {formatAgentDate(step.createdAt, locale)}</span>
                                  {step.completedAt && <span className="truncate" title={step.completedAt}>完成 {formatAgentDate(step.completedAt, locale)}</span>}
                                  {durationLabel(step.createdAt, step.completedAt) && <span>耗时 {durationLabel(step.createdAt, step.completedAt)}</span>}
                                </div>
                                {step.error && <p className="mt-0.5 text-destructive">{step.error}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            className="px-1.5 type-micro"
                            onClick={() => navigate(agentRunPath(view.worker!.id))}
                          >
                            <Route size={9} />
                            详情
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            className="px-1.5 type-micro"
                            disabled={loadingTraceSummaryRunId === view.worker.id}
                            onClick={() => loadTraceSummary(view.worker!.id)}
                          >
                            {loadingTraceSummaryRunId === view.worker.id ? <Loader2 size={9} className="animate-spin" /> : <ListChecks size={9} />}
                            轨迹统计
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            className="px-1.5 type-micro"
                            disabled={loadingTraceEventsRunId === view.worker.id}
                            onClick={() => loadTraceEvents(view.worker!.id)}
                          >
                            {loadingTraceEventsRunId === view.worker.id ? <Loader2 size={9} className="animate-spin" /> : <History size={9} />}
                            运行事件
                          </Button>
                        </div>
                        {traceSummaries[view.worker.id] && (
                          <div className="rounded bg-background/80 px-1.5 py-1">
                            <div className="flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5">
                              <span>{traceSummaries[view.worker.id].total} 个事件</span>
                              {Object.entries(traceSummaries[view.worker.id].byKind).slice(0, 6).map(([kind, count]) => (
                                <Badge key={kind} variant="outline" className="type-min leading-3 px-1 py-0">
                                  {traceKindLabel(kind as AgentTraceEvent['kind'])} {count}
                                </Badge>
                              ))}
                            </div>
                            {traceSummaries[view.worker.id].latestEvent && (() => {
                              const latestView = agentTraceView(traceSummaries[view.worker.id].latestEvent!)
                              return (
                                <div className="mt-0.5 text-muted-foreground">
                                  最新 {latestView.title}
                                </div>
                              )
                            })()}
                          </div>
                        )}
                        {traceSummaryErrors[view.worker.id] && (
                          <p className="text-destructive">{traceSummaryErrors[view.worker.id]}</p>
                        )}
                        {traceEventsByRunId[view.worker.id]?.length > 0 && (
                          <div className="space-y-1">
                            {(() => {
                              const events = traceEventsByRunId[view.worker!.id] ?? []
                              const kinds = Array.from(new Set(events.map((event) => event.kind))).sort()
                              const requestedKind = traceEventKindFilters[view.worker!.id] ?? 'all'
                              const activeKind = requestedKind === 'all' || kinds.includes(requestedKind) ? requestedKind : 'all'
                              const visibleEvents = activeKind === 'all' ? events : events.filter((event) => event.kind === activeKind)
                              return (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="type-micro text-muted-foreground">
                                    显示 {visibleEvents.length}/{events.length}
                                  </span>
                                  <Select
                                    value={activeKind}
                                    onValueChange={(next) => {
                                      const filter = next === 'all' || kinds.includes(next as AgentTraceEvent['kind'])
                                        ? next as 'all' | AgentTraceEvent['kind']
                                        : 'all'
                                      setTraceEventKindFilters((current) => ({ ...current, [view.worker!.id]: filter }))
                                    }}
                                  >
                                    <SelectTrigger size="sm" className="h-6 w-32 max-w-full type-micro">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="all">全部事件</SelectItem>
                                      {kinds.map((kind) => (
                                        <SelectItem key={kind} value={kind}>{traceKindLabel(kind)}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )
                            })()}
                            {(() => {
                              const events = traceEventsByRunId[view.worker!.id] ?? []
                              const kinds = Array.from(new Set(events.map((event) => event.kind)))
                              const requestedKind = traceEventKindFilters[view.worker!.id] ?? 'all'
                              const activeKind = requestedKind === 'all' || kinds.includes(requestedKind) ? requestedKind : 'all'
                              return (activeKind === 'all' ? events : events.filter((event) => event.kind === activeKind)).map((event) => {
                                const eventView = agentTraceView(event)
                                return (
                                  <div key={event.id} className="rounded bg-background/80 px-1.5 py-1">
                                    <div className="flex min-w-0 items-center justify-between gap-2">
                                      <span className="truncate font-medium text-foreground">{eventView.title}</span>
                                      <span className="shrink-0">{traceEventStatusLabel(event.status)}</span>
                                    </div>
                                    <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5">
                                      <span>{eventView.categoryLabel}</span>
                                      <span>{traceKindLabel(event.kind)}</span>
                                      {event.toolName && <span className="truncate">工具 {event.toolName}</span>}
                                      {event.stepId && <span className="truncate">步骤 {event.stepId}</span>}
                                      <span className="truncate" title={event.createdAt}>创建 {formatAgentDate(event.createdAt, locale)}</span>
                                      {event.completedAt && <span className="truncate" title={event.completedAt}>完成 {formatAgentDate(event.completedAt, locale)}</span>}
                                      {durationLabel(event.createdAt, event.completedAt) && <span>耗时 {durationLabel(event.createdAt, event.completedAt)}</span>}
                                    </div>
                                    {eventView.behavior && <p className="mt-0.5 text-muted-foreground">行为：{eventView.behavior}</p>}
                                    {eventView.impact && <p className="mt-0.5 text-muted-foreground">影响：{eventView.impact}</p>}
                                    {eventView.summary && <p className="mt-0.5 text-muted-foreground">摘要：{eventView.summary}</p>}
                                  </div>
                                )
                              })
                            })()}
                            {traceEventHasMoreByRunId[view.worker.id] && (
                              <Button
                                type="button"
                                size="xs"
                                variant="ghost"
                                className="px-1.5 type-micro"
                                disabled={loadingTraceEventsRunId === view.worker.id}
                                onClick={() => loadTraceEvents(view.worker!.id, 'more')}
                              >
                                {loadingTraceEventsRunId === view.worker.id ? <Loader2 size={9} className="animate-spin" /> : <History size={9} />}
                                加载更多
                              </Button>
                            )}
                          </div>
                        )}
                        {traceEventErrors[view.worker.id] && (
                          <p className="text-destructive">{traceEventErrors[view.worker.id]}</p>
                        )}
                      </div>
                    </details>
                  )}
                  {(view.pendingInputs.length > 0 || view.pendingApprovals.length > 0) && (
                    <details className="mt-1 rounded border border-border bg-muted/20">
                      <summary className="flex cursor-pointer list-none items-center gap-1 px-1.5 py-1 type-micro font-medium text-foreground">
                        <ClipboardCheck size={10} />
                        <span>{t('agents.chat.workflow.pendingActionCount', { count: view.pendingInputs.length + view.pendingApprovals.length })}</span>
                      </summary>
                      <div className="space-y-1 border-t border-border/70 px-1.5 py-1">
                        {view.pendingInputs.map((input) => (
                          <div key={input.id} className="rounded bg-background/80 px-1.5 py-1 type-micro leading-relaxed">
                            <div className="flex min-w-0 items-center justify-between gap-2">
                              <span className="truncate font-medium text-foreground">{input.title}</span>
                              <span className="shrink-0 text-muted-foreground">{workflowInputTypeLabel(input.inputType, t)}</span>
                            </div>
                            <p className="mt-0.5 text-muted-foreground">{input.question}</p>
                            {input.choiceLabels.length > 0 && (
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {input.choiceLabels.slice(0, 3).map((label) => (
                                  <Badge key={label} variant="outline" className="max-w-full truncate type-min leading-3 px-1 py-0">{label}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        {view.pendingApprovals.map((approval) => (
                          <div key={approval.id} className="rounded bg-background/80 px-1.5 py-1 type-micro leading-relaxed">
                            <div className="flex min-w-0 items-center justify-between gap-2">
                              <span className="truncate font-medium text-foreground" title={approval.toolName}>{agentToolNameLabel(approval.toolName, t)}</span>
                              {approval.risk && <span className="shrink-0 text-muted-foreground">{t('agents.chat.panel.runtime.risk')}: {localAgentApprovalRiskText(approval.risk, t)}</span>}
                            </div>
                            <p className="mt-0.5 text-muted-foreground">{approval.reason}</p>
                            {approval.permission && <div className="mt-0.5 text-muted-foreground">{t('agents.chat.panel.runtime.permission')}: {localAgentApprovalPermissionText(approval.permission, t)}</div>}
                            <div className="mt-0.5 text-muted-foreground">
                              {t('agents.chat.workflow.approvalImpact.label')}: {localAgentApprovalImpactText(approval, t)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {task.status === 'needs_review' && (onAcceptReview || onReworkReview || onRejectReview) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {onAcceptReview && (
                        <Button type="button" size="xs" variant="outline" className="px-1.5 type-micro" disabled={busy} onClick={() => onAcceptReview(task.id)}>
                          通过
                        </Button>
                      )}
                      {onReworkReview && (
                        <Button type="button" size="xs" variant="ghost" className="px-1.5 type-micro" disabled={busy} onClick={() => onReworkReview(task.id)}>
                          返工
                        </Button>
                      )}
                      {onRejectReview && (
                        <Button type="button" size="xs" variant="ghost" className="px-1.5 type-micro text-destructive hover:text-destructive" disabled={busy} onClick={() => onRejectReview(task.id)}>
                          拒绝
                        </Button>
                      )}
                    </div>
                  )}
                  {view.artifactDetails.length > 0 && (
                    <details className="mt-1 rounded border border-border/60 bg-muted/10">
                      <summary className="flex cursor-pointer list-none flex-wrap gap-1 px-1.5 py-1">
                        {view.artifactDetails.slice(0, 2).map((artifact) => (
                          <Badge key={artifact.id} variant="outline" className="max-w-full truncate type-min leading-3 px-1 py-0">
                            {artifact.label}
                          </Badge>
                        ))}
                      </summary>
                      <div className="space-y-1 border-t border-border/60 px-1.5 py-1">
                        {view.artifactDetails.map((artifact) => (
                          <div key={artifact.id} className="rounded bg-background/80 px-1.5 py-1 type-micro leading-relaxed text-muted-foreground">
                            <div className="flex min-w-0 items-center justify-between gap-2">
                              <span className="truncate font-medium text-foreground">{artifact.label}</span>
                              <div className="flex shrink-0 items-center gap-1">
                                {artifact.sourceTaskId && (
                                  <Button type="button" size="xs" variant="ghost" className="px-1 type-min" onClick={() => scrollToTask(artifact.sourceTaskId)}>
                                    任务
                                  </Button>
                                )}
                                {artifact.sourceRunId && (
                                  <Button type="button" size="xs" variant="ghost" className="px-1 type-min" onClick={() => openRun(artifact.sourceRunId)}>
                                    <Route size={8} />
                                    运行
                                  </Button>
                                )}
                                {artifact.sourceTaskOwnerRunId && artifact.sourceTaskOwnerRunId !== artifact.sourceRunId && (
                                  <Button type="button" size="xs" variant="ghost" className="px-1 type-min" onClick={() => openRun(artifact.sourceTaskOwnerRunId)}>
                                    来源运行
                                  </Button>
                                )}
                                <span>{artifact.type}</span>
                              </div>
                            </div>
                            <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5">
                              {artifact.uri && <span className="truncate">URI {artifact.uri}</span>}
                              {artifact.sourceRunId && <span className="truncate">运行 {artifact.sourceRunId}</span>}
                              {artifact.sourceTaskId && <span className="truncate">来源任务 {artifact.sourceTaskTitle ?? artifact.sourceTaskId}</span>}
                              {artifact.sourceTaskStatus && <span>{agentTaskStatusLabel(artifact.sourceTaskStatus)}</span>}
                              {artifact.toolName && <span className="truncate">工具 {artifact.toolName}</span>}
                              {artifact.policy && <span className="truncate">策略 {artifact.policy}</span>}
                            </div>
                            {artifact.metadata && <ActivityJSONBlock label="元数据" value={artifact.metadata} />}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function workflowInputTypeLabel(type: string, t: ReturnType<typeof useTranslation>['t']): string {
  switch (type) {
    case 'choice':
      return t('agents.chat.workflow.inputTypeChoice')
    case 'text':
      return t('agents.chat.workflow.inputTypeText')
    case 'confirmation':
      return t('agents.chat.workflow.inputTypeConfirmation')
    default:
      return inputTypeLabel(type)
  }
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

function agentStepTypeLabel(type: string): string {
  if (type === 'tool_call') return '工具调用'
  if (type === 'message') return '消息'
  return `未知步骤 (${type})`
}

function workflowStatusClass(status: string) {
  if (status === 'completed' || status === 'approved' || status === 'answered') return 'bg-green-500/10 text-green-700'
  if (status === 'failed' || status === 'rejected' || status === 'cancelled') return 'bg-destructive/10 text-destructive'
  if (status === 'skipped' || status === 'pending') return 'bg-amber-500/10 text-amber-700'
  if (status === 'in_progress') return 'bg-blue-500/10 text-blue-700'
  return 'bg-muted text-muted-foreground'
}

function workflowDotClass(status: string) {
  if (status === 'completed' || status === 'approved' || status === 'answered') return 'border-green-500/30 bg-green-500/10 text-green-700'
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

function formatAgentDate(value: string | number, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
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

function safeJSONStringify(value: unknown) {
  return JSON.stringify(value, null, 2)
}
