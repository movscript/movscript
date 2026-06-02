import { useState } from 'react'
import { Bot, CircleStop, ClipboardCheck, FileText, History, ListChecks, Loader2, PlayIcon, RefreshCw, Route } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  AgentPlanOverviewActionBar,
  AgentPlanOverviewActionButton,
  AgentPlanOverviewBadge,
  AgentPlanOverviewCodeDisclosure,
  AgentPlanOverviewDescription,
  AgentPlanOverviewDisclosure,
  AgentPlanOverviewDisclosureBody,
  AgentPlanOverviewDisclosureSummary,
  AgentPlanOverviewErrorText,
  AgentPlanOverviewFilterRow,
  AgentPlanOverviewHeader,
  AgentPlanOverviewHeaderBody,
  AgentPlanOverviewInlineActions,
  AgentPlanOverviewItemActions,
  AgentPlanOverviewItemCard,
  AgentPlanOverviewItemHeader,
  AgentPlanOverviewItemTitle,
  AgentPlanOverviewList,
  AgentPlanOverviewMetaRow,
  AgentPlanOverviewMetaText,
  AgentPlanOverviewNotice,
  AgentPlanOverviewNoticeTitle,
  AgentPlanOverviewProgress,
  AgentPlanOverviewSettingsGrid,
  AgentPlanOverviewShell,
  AgentPlanOverviewStats,
  AgentPlanOverviewStatusBadge,
  AgentPlanOverviewTaskBadge,
  AgentPlanOverviewTaskBody,
  AgentPlanOverviewTaskCard,
  AgentPlanOverviewTaskHeader,
  AgentPlanOverviewTaskMeta,
  AgentPlanOverviewTaskStatusDot,
  AgentPlanOverviewTaskTitle,
  AgentPlanOverviewText,
  AgentPlanOverviewTitle,
  AgentPlanOverviewWarningText,
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
} from '@/features/agent/domain/agentPlanUi'
import { isTerminalAgentRun } from '@/features/agent/domain/agentRunControl'
import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import { agentPlanStatusLabel, agentTraceView, inputTypeLabel, runStatusLabel, traceEventStatusLabel, traceKindLabel } from '@/features/agent/domain/agentRunUi'
import { formatAgentCompactTimestamp, formatAgentDuration, formatAgentDurationMs } from '@/features/agent/domain/agentTimeFormat'
import { agentRunStatusRecipe, agentRunInteractionStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import { localAgentApprovalImpactText, localAgentApprovalPermissionText, localAgentApprovalRiskText } from '@/features/agent/components/localRuntime'
import { localAgentClient, type AgentTaskGraphSnapshot, type AgentRunTraceSummary, type AgentTraceEvent } from '@/shared/infrastructure/localAgentClient'
import { agentRunPath } from '@/routes/projectRoutes'
import type { PlanDispatchSettings } from '@/features/agent/application/agentPlanActions'

const DEFAULT_TASK_GRAPH_DISPATCH_SETTINGS: PlanDispatchSettings = {
  maxWorkers: 2,
  maxTaskAttempts: 2,
  workerTimeoutMs: 15 * 60_000,
}

const TASK_GRAPH_MAX_WORKER_OPTIONS = [1, 2, 3, 4]
const TASK_GRAPH_MAX_TASK_ATTEMPT_OPTIONS = [1, 2, 3]
const TASK_GRAPH_WORKER_TIMEOUT_OPTIONS = [
  { label: '5m', value: 5 * 60_000 },
  { label: '15m', value: 15 * 60_000 },
  { label: '30m', value: 30 * 60_000 },
  { label: '1h', value: 60 * 60_000 },
]

export function AgentPlanOverviewPanel({
  id,
  snapshot,
  busy,
  onDispatch,
  onRetaskGraph,
  onCancelTree,
  onAcceptReview,
  onReworkReview,
  onRejectReview,
  dispatchSettings,
  onDispatchSettingsChange,
}: {
  id?: string
  snapshot?: AgentTaskGraphSnapshot
  busy?: boolean
  onDispatch?: () => void
  onRetaskGraph?: () => void
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
  const graphStatusRecipe = agentRunStatusRecipe(snapshot.taskGraph.status)
  const activeArtifactTypeFilter = artifactTypeFilter === 'all' || availableArtifactTypes.has(artifactTypeFilter)
    ? artifactTypeFilter
    : 'all'
  const visiblePlanArtifacts = activeArtifactTypeFilter === 'all'
    ? artifactSummary.artifacts
    : artifactSummary.artifacts.filter((artifact) => artifact.type === activeArtifactTypeFilter)
  const tasks = taskViews.map((view) => view.task)
  const activeRuns = snapshot.runs.filter((run) => run.status === 'queued' || run.status === 'in_progress' || run.status === 'requires_action').length
  const rootRun = snapshot.runs.find((run) => run.id === snapshot.taskGraph.rootRunId)
  const canDispatch = activeRuns === 0 && tasks.some((task) => task.status === 'pending')
  const canRetaskGraph = tasks.some((task) => task.status === 'blocked' || task.status === 'failed' || task.status === 'cancelled')
  const canCancel = activeRuns > 0 || (rootRun && !isTerminalAgentRun(rootRun))
  const settings = dispatchSettings ?? DEFAULT_TASK_GRAPH_DISPATCH_SETTINGS
  const updateSettings = (patch: Partial<PlanDispatchSettings>) => {
    onDispatchSettingsChange?.({ ...settings, ...patch })
  }
  const scrollToTask = (taskId: string | undefined) => {
    if (!taskId || typeof document === 'undefined') return
    document.getElementById(`agent-taskGraph-task-${taskId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
    <AgentPlanOverviewShell id={id} data-testid="agent-taskGraph-overview">
      <AgentPlanOverviewHeader>
        <AgentPlanOverviewHeaderBody>
          <AgentPlanOverviewTitle icon={<Route size={12} />}>
            {snapshot.taskGraph.title}
          </AgentPlanOverviewTitle>
          <AgentPlanOverviewStats data-testid="agent-taskGraph-overview-stats">
            {overviewStats.completedTaskCount}/{overviewStats.taskCount} 个任务 · {overviewStats.activeWorkerCount} 个执行器运行中
            {overviewStats.artifactCount > 0 && <> · {overviewStats.artifactCount} 个产物</>}
            {overviewStats.nameConflictCount > 0 && <> · {overviewStats.nameConflictCount} 个重名冲突</>}
          </AgentPlanOverviewStats>
          <AgentPlanOverviewDescription data-testid="agent-taskGraph-status-explanation">{planStatusExplanation}</AgentPlanOverviewDescription>
        </AgentPlanOverviewHeaderBody>
        <AgentPlanOverviewStatusBadge intent={graphStatusRecipe.intent} emphasis={graphStatusRecipe.emphasis}>
          {agentPlanStatusLabel(snapshot.taskGraph.status)}
        </AgentPlanOverviewStatusBadge>
      </AgentPlanOverviewHeader>
      {nameConflicts.length > 0 && (
        <AgentPlanOverviewNotice data-testid="agent-taskGraph-name-conflicts">
          {nameConflicts.map((conflict) => (
            <div key={conflict.subagentName} className="min-w-0">
              <AgentPlanOverviewNoticeTitle>子 agent 重名 · {conflict.subagentName}</AgentPlanOverviewNoticeTitle>
              <div className="mt-1 space-y-0.5">
                {conflict.entries.map((entry) => (
                  <AgentPlanOverviewItemCard key={entry.taskId}>
                    <AgentPlanOverviewItemHeader>
                    <div className="min-w-0">
                      <AgentPlanOverviewItemTitle>{entry.taskTitle}</AgentPlanOverviewItemTitle>
                      <AgentPlanOverviewMetaRow>
                        <AgentPlanOverviewMetaText data-truncate="true">任务 {entry.taskId}</AgentPlanOverviewMetaText>
                        {entry.taskStatus && <AgentPlanOverviewMetaText>{agentTaskStatusLabel(entry.taskStatus)}</AgentPlanOverviewMetaText>}
                        {entry.ownerRunId && <AgentPlanOverviewMetaText data-truncate="true">run {entry.ownerRunId}</AgentPlanOverviewMetaText>}
                        {entry.ownerRunStatus && <AgentPlanOverviewMetaText>{runStatusLabel(entry.ownerRunStatus)}</AgentPlanOverviewMetaText>}
                      </AgentPlanOverviewMetaRow>
                    </div>
                    <AgentPlanOverviewItemActions>
                      <AgentPlanOverviewActionButton type="button" variant="ghost" onClick={() => scrollToTask(entry.taskId)}>
                        任务
                      </AgentPlanOverviewActionButton>
                      {entry.ownerRunId && (
                        <AgentPlanOverviewActionButton type="button" variant="ghost" onClick={() => openRun(entry.ownerRunId)}>
                          <Route size={10} />
                          运行
                        </AgentPlanOverviewActionButton>
                      )}
                    </AgentPlanOverviewItemActions>
                    </AgentPlanOverviewItemHeader>
                  </AgentPlanOverviewItemCard>
                ))}
              </div>
            </div>
          ))}
        </AgentPlanOverviewNotice>
      )}
      {(onDispatch || onRetaskGraph || onCancelTree) && (
        <AgentPlanOverviewActionBar>
          {onDispatch && (
            <AgentPlanOverviewActionButton type="button" variant="outline" disabled={busy || !canDispatch} onClick={onDispatch}>
              {busy ? <Loader2 size={10} className="animate-spin" /> : <PlayIcon size={10} />}
              分派
            </AgentPlanOverviewActionButton>
          )}
          {onRetaskGraph && (
            <AgentPlanOverviewActionButton type="button" variant="outline" disabled={busy || !canRetaskGraph} onClick={onRetaskGraph}>
              {busy ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
              重新规划
            </AgentPlanOverviewActionButton>
          )}
          {onCancelTree && (
            <AgentPlanOverviewActionButton type="button" variant="ghost" tone="danger" disabled={busy || !canCancel} onClick={onCancelTree}>
              {busy ? <Loader2 size={10} className="animate-spin" /> : <CircleStop size={10} />}
              取消树
            </AgentPlanOverviewActionButton>
          )}
        </AgentPlanOverviewActionBar>
      )}
      {onDispatchSettingsChange && (
        <AgentPlanOverviewSettingsGrid>
          <Select value={String(settings.maxWorkers)} onValueChange={(next) => updateSettings({ maxWorkers: Number(next) })}>
            <SelectTrigger size="sm" className="h-6 min-w-0 type-tiny" disabled={busy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_GRAPH_MAX_WORKER_OPTIONS.map((value) => (
                <SelectItem key={value} value={String(value)}>{value} 个 worker</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(settings.maxTaskAttempts)} onValueChange={(next) => updateSettings({ maxTaskAttempts: Number(next) })}>
            <SelectTrigger size="sm" className="h-6 min-w-0 type-tiny" disabled={busy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_GRAPH_MAX_TASK_ATTEMPT_OPTIONS.map((value) => (
                <SelectItem key={value} value={String(value)}>{value} attempt{value === 1 ? '' : 's'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(settings.workerTimeoutMs)} onValueChange={(next) => updateSettings({ workerTimeoutMs: Number(next) })}>
            <SelectTrigger size="sm" className="h-6 min-w-0 type-tiny" disabled={busy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_GRAPH_WORKER_TIMEOUT_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={String(item.value)}>{item.label} timeout</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </AgentPlanOverviewSettingsGrid>
      )}
      <AgentPlanOverviewProgress value={snapshot.taskGraph.progress} />
      {artifactSummary.totalCount > 0 && (
        <AgentPlanOverviewDisclosure data-testid="agent-taskGraph-artifact-summary">
          <AgentPlanOverviewDisclosureSummary>
            <FileText size={10} />
            <span>{artifactSummary.totalCount} 个计划产物</span>
            {artifactSummary.byType.slice(0, 3).map((item) => (
              <AgentPlanOverviewBadge key={item.type}>
                {item.type} {item.count}
              </AgentPlanOverviewBadge>
            ))}
          </AgentPlanOverviewDisclosureSummary>
          <AgentPlanOverviewDisclosureBody>
            <AgentPlanOverviewFilterRow>
              <AgentPlanOverviewMetaText>
                显示 {Math.min(visiblePlanArtifacts.length, 6)}/{visiblePlanArtifacts.length}
              </AgentPlanOverviewMetaText>
              <Select value={activeArtifactTypeFilter} onValueChange={(next) => setArtifactTypeFilter(next)}>
                <SelectTrigger size="sm" className="h-6 w-32 max-w-full type-tiny">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {artifactSummary.byType.map((item) => (
                    <SelectItem key={item.type} value={item.type}>{item.type} ({item.count})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AgentPlanOverviewFilterRow>
            {visiblePlanArtifacts.slice(0, 6).map((artifact) => (
              <AgentPlanOverviewItemCard key={artifact.id}>
                <AgentPlanOverviewItemHeader>
                  <AgentPlanOverviewItemTitle>{artifact.label}</AgentPlanOverviewItemTitle>
                  <AgentPlanOverviewItemActions>
                    {artifact.taskId && (
                      <AgentPlanOverviewActionButton type="button" variant="ghost" onClick={() => scrollToTask(artifact.taskId)}>
                        定位
                      </AgentPlanOverviewActionButton>
                    )}
                    {artifact.sourceRunId && (
                      <AgentPlanOverviewActionButton type="button" variant="ghost" onClick={() => openRun(artifact.sourceRunId)}>
                        <Route size={10} />
                        运行
                      </AgentPlanOverviewActionButton>
                    )}
                    {artifact.sourceTaskOwnerRunId && artifact.sourceTaskOwnerRunId !== artifact.sourceRunId && (
                      <AgentPlanOverviewActionButton type="button" variant="ghost" onClick={() => openRun(artifact.sourceTaskOwnerRunId)}>
                        来源
                      </AgentPlanOverviewActionButton>
                    )}
                    <AgentPlanOverviewMetaText>{artifact.type}</AgentPlanOverviewMetaText>
                  </AgentPlanOverviewItemActions>
                </AgentPlanOverviewItemHeader>
                <AgentPlanOverviewMetaRow>
                  {artifact.uri && <AgentPlanOverviewMetaText data-truncate="true">URI {artifact.uri}</AgentPlanOverviewMetaText>}
                  {artifact.taskTitle && <AgentPlanOverviewMetaText data-truncate="true">任务 {artifact.taskTitle}</AgentPlanOverviewMetaText>}
                  {artifact.sourceRunId && <AgentPlanOverviewMetaText data-truncate="true">运行 {artifact.sourceRunId}</AgentPlanOverviewMetaText>}
                  {artifact.sourceTaskId && <AgentPlanOverviewMetaText data-truncate="true">来源任务 {artifact.sourceTaskTitle ?? artifact.sourceTaskId}</AgentPlanOverviewMetaText>}
                  {artifact.sourceTaskStatus && <AgentPlanOverviewMetaText>{agentTaskStatusLabel(artifact.sourceTaskStatus)}</AgentPlanOverviewMetaText>}
                  {artifact.subagentName && <AgentPlanOverviewMetaText data-truncate="true">子 agent {artifact.subagentName}</AgentPlanOverviewMetaText>}
                  {artifact.toolName && <AgentPlanOverviewMetaText data-truncate="true">工具 {artifact.toolName}</AgentPlanOverviewMetaText>}
                  {artifact.policy && <AgentPlanOverviewMetaText data-truncate="true">回滚规则 {artifact.policy}</AgentPlanOverviewMetaText>}
                </AgentPlanOverviewMetaRow>
              </AgentPlanOverviewItemCard>
            ))}
          </AgentPlanOverviewDisclosureBody>
        </AgentPlanOverviewDisclosure>
      )}
      {tasks.length > 0 && (
        <AgentPlanOverviewList>
          {taskViews.map((view) => {
            const task = view.task
            const taskRunInteractionStatus = task.status === 'done' ? 'completed' : task.status === 'failed' || task.status === 'cancelled' ? 'failed' : 'in_progress'
            const taskStatusRecipe = agentRunInteractionStatusRecipe(taskRunInteractionStatus)
            const workerStatusRecipe = view.worker ? agentRunStatusRecipe(view.worker.status) : undefined
            return (
              <AgentPlanOverviewTaskCard id={`agent-taskGraph-task-${task.id}`} key={task.id}>
                <AgentPlanOverviewTaskStatusDot intent={taskStatusRecipe.intent} />
                <AgentPlanOverviewTaskBody>
                  <AgentPlanOverviewTaskHeader>
                    <AgentPlanOverviewTaskTitle>{task.title}</AgentPlanOverviewTaskTitle>
                    <AgentPlanOverviewTaskBadge intent={taskStatusRecipe.intent} emphasis={taskStatusRecipe.emphasis}>
                      {agentPlanStatusLabel(task.status)}
                    </AgentPlanOverviewTaskBadge>
                  </AgentPlanOverviewTaskHeader>
                  <AgentPlanOverviewTaskMeta>
                    <AgentPlanOverviewMetaText>{Math.round(Math.max(0, Math.min(1, task.progress)) * 100)}%</AgentPlanOverviewMetaText>
                    {view.ownerLabel ? (
                      <AgentPlanOverviewMetaText data-truncate="true" className={view.subagentName ? 'font-medium text-foreground' : undefined}>{view.ownerLabel}</AgentPlanOverviewMetaText>
                    ) : null}
                    {view.waitingInputCount > 0 && <AgentPlanOverviewMetaText>{view.waitingInputCount} 个输入</AgentPlanOverviewMetaText>}
                    {view.waitingApprovalCount > 0 && <AgentPlanOverviewMetaText>{view.waitingApprovalCount} 个审批</AgentPlanOverviewMetaText>}
                    {view.retryAttempt && <AgentPlanOverviewMetaText>第 {view.retryAttempt}{view.maxTaskAttempts ? `/${view.maxTaskAttempts}` : ''} 次尝试</AgentPlanOverviewMetaText>}
                    {!view.retryAttempt && view.maxTaskAttempts && <AgentPlanOverviewMetaText>最多 {view.maxTaskAttempts} 次尝试</AgentPlanOverviewMetaText>}
                    {view.previousStatus && <AgentPlanOverviewMetaText>来自 {agentPlanStatusLabel(view.previousStatus)}</AgentPlanOverviewMetaText>}
                    {view.workerTimeoutMs && <AgentPlanOverviewMetaText>超时 {formatDurationLabel(view.workerTimeoutMs)}</AgentPlanOverviewMetaText>}
                    {view.timedOutRunId && <AgentPlanOverviewMetaText data-truncate="true">超时运行 {view.timedOutRunId}</AgentPlanOverviewMetaText>}
                    {view.previousOwnerRunId && <AgentPlanOverviewMetaText data-truncate="true">上次运行 {view.previousOwnerRunId}</AgentPlanOverviewMetaText>}
                    {view.artifactCount > 0 && <AgentPlanOverviewMetaText>{view.artifactCount} 个产物</AgentPlanOverviewMetaText>}
                  </AgentPlanOverviewTaskMeta>
                  <AgentPlanOverviewText>{view.statusExplanation}</AgentPlanOverviewText>
                  {view.blocker && (
                    <AgentPlanOverviewWarningText>{view.blocker}</AgentPlanOverviewWarningText>
                  )}
                  {view.worker && (
                    <AgentPlanOverviewDisclosure>
                      <AgentPlanOverviewDisclosureSummary>
                        <Bot size={10} />
                        <AgentPlanOverviewMetaText data-truncate="true">执行器 {view.subagentName ?? view.worker.subagentName ?? view.worker.id}</AgentPlanOverviewMetaText>
                        <AgentPlanOverviewTaskBadge intent={workerStatusRecipe?.intent} emphasis={workerStatusRecipe?.emphasis}>
                          {runStatusLabel(view.worker.status)}
                        </AgentPlanOverviewTaskBadge>
                      </AgentPlanOverviewDisclosureSummary>
                      <AgentPlanOverviewDisclosureBody>
                        <AgentPlanOverviewMetaRow>
                          <AgentPlanOverviewMetaText data-truncate="true">运行 {view.worker.id}</AgentPlanOverviewMetaText>
                          {view.worker.parentRunId && <AgentPlanOverviewMetaText data-truncate="true">上级 {view.worker.parentRunId}</AgentPlanOverviewMetaText>}
                          {view.worker.taskId && <AgentPlanOverviewMetaText data-truncate="true">任务 {view.worker.taskId}</AgentPlanOverviewMetaText>}
                          {typeof view.worker.progress === 'number' && <AgentPlanOverviewMetaText>{Math.round(Math.max(0, Math.min(1, view.worker.progress)) * 100)}%</AgentPlanOverviewMetaText>}
                          <AgentPlanOverviewMetaText>{view.worker.stepCount} 个步骤</AgentPlanOverviewMetaText>
                        </AgentPlanOverviewMetaRow>
                        <AgentPlanOverviewMetaRow>
                          {view.worker.startedAt && <AgentPlanOverviewMetaText data-truncate="true" title={view.worker.startedAt}>开始 {formatAgentDate(view.worker.startedAt, locale)}</AgentPlanOverviewMetaText>}
                          {view.worker.completedAt && <AgentPlanOverviewMetaText data-truncate="true" title={view.worker.completedAt}>完成 {formatAgentDate(view.worker.completedAt, locale)}</AgentPlanOverviewMetaText>}
                          {view.worker.failedAt && <AgentPlanOverviewMetaText data-truncate="true" title={view.worker.failedAt}>失败 {formatAgentDate(view.worker.failedAt, locale)}</AgentPlanOverviewMetaText>}
                          {view.worker.cancelledAt && <AgentPlanOverviewMetaText data-truncate="true" title={view.worker.cancelledAt}>取消 {formatAgentDate(view.worker.cancelledAt, locale)}</AgentPlanOverviewMetaText>}
                          <AgentPlanOverviewMetaText data-truncate="true" title={view.worker.updatedAt}>更新 {formatAgentDate(view.worker.updatedAt, locale)}</AgentPlanOverviewMetaText>
                          {durationLabel(view.worker.startedAt, view.worker.completedAt ?? view.worker.failedAt ?? view.worker.cancelledAt) && (
                            <AgentPlanOverviewMetaText>耗时 {durationLabel(view.worker.startedAt, view.worker.completedAt ?? view.worker.failedAt ?? view.worker.cancelledAt)}</AgentPlanOverviewMetaText>
                          )}
                        </AgentPlanOverviewMetaRow>
                        {view.worker.error && (
                          <AgentPlanOverviewErrorText>{view.worker.error}</AgentPlanOverviewErrorText>
                        )}
                        {view.worker.warnings.length > 0 && (
                          <>
                            {view.worker.warnings.slice(0, 3).map((warning) => <AgentPlanOverviewWarningText key={warning}>{warning}</AgentPlanOverviewWarningText>)}
                          </>
                        )}
                        {view.worker.recentSteps.length > 0 && (
                          <AgentPlanOverviewList>
                            {view.worker.recentSteps.map((step) => (
                              <AgentPlanOverviewItemCard key={step.id}>
                                <AgentPlanOverviewItemHeader>
                                  <AgentPlanOverviewItemTitle>{step.title}</AgentPlanOverviewItemTitle>
                                  <AgentPlanOverviewMetaText>{agentStepStatusLabel(step.status)}</AgentPlanOverviewMetaText>
                                </AgentPlanOverviewItemHeader>
                                <AgentPlanOverviewMetaRow>
                                  <AgentPlanOverviewMetaText>{agentStepTypeLabel(step.type)}</AgentPlanOverviewMetaText>
                                  {step.toolName && <AgentPlanOverviewMetaText data-truncate="true">工具 {step.toolName}</AgentPlanOverviewMetaText>}
                                  {step.sandboxed && <AgentPlanOverviewMetaText>沙盒</AgentPlanOverviewMetaText>}
                                  <AgentPlanOverviewMetaText data-truncate="true" title={step.createdAt}>创建 {formatAgentDate(step.createdAt, locale)}</AgentPlanOverviewMetaText>
                                  {step.completedAt && <AgentPlanOverviewMetaText data-truncate="true" title={step.completedAt}>完成 {formatAgentDate(step.completedAt, locale)}</AgentPlanOverviewMetaText>}
                                  {durationLabel(step.createdAt, step.completedAt) && <AgentPlanOverviewMetaText>耗时 {durationLabel(step.createdAt, step.completedAt)}</AgentPlanOverviewMetaText>}
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
                            onClick={() => navigate(agentRunPath(view.worker!.id))}
                          >
                            <Route size={10} />
                            详情
                          </AgentPlanOverviewActionButton>
                          <AgentPlanOverviewActionButton
                            type="button"
                            variant="ghost"
                            disabled={loadingTraceSummaryRunId === view.worker.id}
                            onClick={() => loadTraceSummary(view.worker!.id)}
                          >
                            {loadingTraceSummaryRunId === view.worker.id ? <Loader2 size={10} className="animate-spin" /> : <ListChecks size={10} />}
                            轨迹统计
                          </AgentPlanOverviewActionButton>
                          <AgentPlanOverviewActionButton
                            type="button"
                            variant="ghost"
                            disabled={loadingTraceEventsRunId === view.worker.id}
                            onClick={() => loadTraceEvents(view.worker!.id)}
                          >
                            {loadingTraceEventsRunId === view.worker.id ? <Loader2 size={10} className="animate-spin" /> : <History size={10} />}
                            运行事件
                          </AgentPlanOverviewActionButton>
                        </AgentPlanOverviewInlineActions>
                        {traceSummaries[view.worker.id] && (
                          <AgentPlanOverviewItemCard>
                            <AgentPlanOverviewMetaRow>
                              <AgentPlanOverviewMetaText>{traceSummaries[view.worker.id].total} 个事件</AgentPlanOverviewMetaText>
                              {Object.entries(traceSummaries[view.worker.id].byKind).slice(0, 6).map(([kind, count]) => (
                                <AgentPlanOverviewBadge key={kind}>
                                  {traceKindLabel(kind as AgentTraceEvent['kind'])} {count}
                                </AgentPlanOverviewBadge>
                              ))}
                            </AgentPlanOverviewMetaRow>
                            {traceSummaries[view.worker.id].latestEvent && (() => {
                              const latestView = agentTraceView(traceSummaries[view.worker.id].latestEvent!)
                              return (
                                <AgentPlanOverviewText>
                                  最新 {latestView.title}
                                </AgentPlanOverviewText>
                              )
                            })()}
                          </AgentPlanOverviewItemCard>
                        )}
                        {traceSummaryErrors[view.worker.id] && (
                          <AgentPlanOverviewErrorText>{traceSummaryErrors[view.worker.id]}</AgentPlanOverviewErrorText>
                        )}
                        {traceEventsByRunId[view.worker.id]?.length > 0 && (
                          <AgentPlanOverviewList>
                            {(() => {
                              const events = traceEventsByRunId[view.worker!.id] ?? []
                              const kinds = Array.from(new Set(events.map((event) => event.kind))).sort()
                              const requestedKind = traceEventKindFilters[view.worker!.id] ?? 'all'
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
                                        ? next as 'all' | AgentTraceEvent['kind']
                                        : 'all'
                                      setTraceEventKindFilters((current) => ({ ...current, [view.worker!.id]: filter }))
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
                            })()}
                            {(() => {
                              const events = traceEventsByRunId[view.worker!.id] ?? []
                              const kinds = Array.from(new Set(events.map((event) => event.kind)))
                              const requestedKind = traceEventKindFilters[view.worker!.id] ?? 'all'
                              const activeKind = requestedKind === 'all' || kinds.includes(requestedKind) ? requestedKind : 'all'
                              return (activeKind === 'all' ? events : events.filter((event) => event.kind === activeKind)).map((event) => {
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
                                      <AgentPlanOverviewMetaText data-truncate="true" title={event.createdAt}>创建 {formatAgentDate(event.createdAt, locale)}</AgentPlanOverviewMetaText>
                                      {event.completedAt && <AgentPlanOverviewMetaText data-truncate="true" title={event.completedAt}>完成 {formatAgentDate(event.completedAt, locale)}</AgentPlanOverviewMetaText>}
                                      {durationLabel(event.createdAt, event.completedAt) && <AgentPlanOverviewMetaText>耗时 {durationLabel(event.createdAt, event.completedAt)}</AgentPlanOverviewMetaText>}
                                    </AgentPlanOverviewMetaRow>
                                    {eventView.behavior && <AgentPlanOverviewText>行为：{eventView.behavior}</AgentPlanOverviewText>}
                                    {eventView.impact && <AgentPlanOverviewText>影响：{eventView.impact}</AgentPlanOverviewText>}
                                    {eventView.summary && <AgentPlanOverviewText>摘要：{eventView.summary}</AgentPlanOverviewText>}
                                  </AgentPlanOverviewItemCard>
                                )
                              })
                            })()}
                            {traceEventHasMoreByRunId[view.worker.id] && (
                              <AgentPlanOverviewActionButton
                                type="button"
                                variant="ghost"
                                disabled={loadingTraceEventsRunId === view.worker.id}
                                onClick={() => loadTraceEvents(view.worker!.id, 'more')}
                              >
                                {loadingTraceEventsRunId === view.worker.id ? <Loader2 size={10} className="animate-spin" /> : <History size={10} />}
                                加载更多
                              </AgentPlanOverviewActionButton>
                            )}
                          </AgentPlanOverviewList>
                        )}
                        {traceEventErrors[view.worker.id] && (
                          <AgentPlanOverviewErrorText>{traceEventErrors[view.worker.id]}</AgentPlanOverviewErrorText>
                        )}
                      </AgentPlanOverviewDisclosureBody>
                    </AgentPlanOverviewDisclosure>
                  )}
                  {(view.pendingInputs.length > 0 || view.pendingApprovals.length > 0) && (
                    <AgentPlanOverviewDisclosure>
                      <AgentPlanOverviewDisclosureSummary>
                        <ClipboardCheck size={10} />
                        <span>{t('agents.chat.task.pendingActionCount', { count: view.pendingInputs.length + view.pendingApprovals.length })}</span>
                      </AgentPlanOverviewDisclosureSummary>
                      <AgentPlanOverviewDisclosureBody>
                        {view.pendingInputs.map((input) => (
                          <AgentPlanOverviewItemCard key={input.id}>
                            <AgentPlanOverviewItemHeader>
                              <AgentPlanOverviewItemTitle>{input.title}</AgentPlanOverviewItemTitle>
                              <AgentPlanOverviewMetaText>{runInteractionInputTypeLabel(input.inputType, t)}</AgentPlanOverviewMetaText>
                            </AgentPlanOverviewItemHeader>
                            <AgentPlanOverviewText>{input.question}</AgentPlanOverviewText>
                            {input.choiceLabels.length > 0 && (
                              <AgentPlanOverviewMetaRow>
                                {input.choiceLabels.slice(0, 3).map((label) => (
                                  <AgentPlanOverviewBadge key={label}>{label}</AgentPlanOverviewBadge>
                                ))}
                              </AgentPlanOverviewMetaRow>
                            )}
                          </AgentPlanOverviewItemCard>
                        ))}
                        {view.pendingApprovals.map((approval) => (
                          <AgentPlanOverviewItemCard key={approval.id}>
                            <AgentPlanOverviewItemHeader>
                              <AgentPlanOverviewItemTitle title={approval.toolName}>{agentToolNameLabel(approval.toolName, t)}</AgentPlanOverviewItemTitle>
                              {approval.risk && <AgentPlanOverviewMetaText>{t('agents.chat.panel.runtime.risk')}: {localAgentApprovalRiskText(approval.risk, t)}</AgentPlanOverviewMetaText>}
                            </AgentPlanOverviewItemHeader>
                            <AgentPlanOverviewText>{approval.reason}</AgentPlanOverviewText>
                            {approval.permission && <AgentPlanOverviewText>{t('agents.chat.panel.runtime.permission')}: {localAgentApprovalPermissionText(approval.permission, t)}</AgentPlanOverviewText>}
                            <AgentPlanOverviewText>
                              {t('agents.chat.task.approvalImpact.label')}: {localAgentApprovalImpactText(approval, t)}
                            </AgentPlanOverviewText>
                          </AgentPlanOverviewItemCard>
                        ))}
                      </AgentPlanOverviewDisclosureBody>
                    </AgentPlanOverviewDisclosure>
                  )}
                  {task.status === 'needs_review' && (onAcceptReview || onReworkReview || onRejectReview) && (
                    <AgentPlanOverviewInlineActions>
                      {onAcceptReview && (
                        <AgentPlanOverviewActionButton type="button" variant="outline" disabled={busy} onClick={() => onAcceptReview(task.id)}>
                          通过
                        </AgentPlanOverviewActionButton>
                      )}
                      {onReworkReview && (
                        <AgentPlanOverviewActionButton type="button" variant="ghost" disabled={busy} onClick={() => onReworkReview(task.id)}>
                          返工
                        </AgentPlanOverviewActionButton>
                      )}
                      {onRejectReview && (
                        <AgentPlanOverviewActionButton type="button" variant="ghost" tone="danger" disabled={busy} onClick={() => onRejectReview(task.id)}>
                          拒绝
                        </AgentPlanOverviewActionButton>
                      )}
                    </AgentPlanOverviewInlineActions>
                  )}
                  {view.artifactDetails.length > 0 && (
                    <AgentPlanOverviewDisclosure>
                      <AgentPlanOverviewDisclosureSummary>
                        {view.artifactDetails.slice(0, 2).map((artifact) => (
                          <AgentPlanOverviewBadge key={artifact.id}>
                            {artifact.label}
                          </AgentPlanOverviewBadge>
                        ))}
                      </AgentPlanOverviewDisclosureSummary>
                      <AgentPlanOverviewDisclosureBody>
                        {view.artifactDetails.map((artifact) => (
                          <AgentPlanOverviewItemCard key={artifact.id}>
                            <AgentPlanOverviewItemHeader>
                              <AgentPlanOverviewItemTitle>{artifact.label}</AgentPlanOverviewItemTitle>
                              <AgentPlanOverviewItemActions>
                                {artifact.sourceTaskId && (
                                  <AgentPlanOverviewActionButton type="button" variant="ghost" onClick={() => scrollToTask(artifact.sourceTaskId)}>
                                    任务
                                  </AgentPlanOverviewActionButton>
                                )}
                                {artifact.sourceRunId && (
                                  <AgentPlanOverviewActionButton type="button" variant="ghost" onClick={() => openRun(artifact.sourceRunId)}>
                                    <Route size={10} />
                                    运行
                                  </AgentPlanOverviewActionButton>
                                )}
                                {artifact.sourceTaskOwnerRunId && artifact.sourceTaskOwnerRunId !== artifact.sourceRunId && (
                                  <AgentPlanOverviewActionButton type="button" variant="ghost" onClick={() => openRun(artifact.sourceTaskOwnerRunId)}>
                                    来源运行
                                  </AgentPlanOverviewActionButton>
                                )}
                                <AgentPlanOverviewMetaText>{artifact.type}</AgentPlanOverviewMetaText>
                              </AgentPlanOverviewItemActions>
                            </AgentPlanOverviewItemHeader>
                            <AgentPlanOverviewMetaRow>
                              {artifact.uri && <AgentPlanOverviewMetaText data-truncate="true">URI {artifact.uri}</AgentPlanOverviewMetaText>}
                              {artifact.sourceRunId && <AgentPlanOverviewMetaText data-truncate="true">运行 {artifact.sourceRunId}</AgentPlanOverviewMetaText>}
                              {artifact.sourceTaskId && <AgentPlanOverviewMetaText data-truncate="true">来源任务 {artifact.sourceTaskTitle ?? artifact.sourceTaskId}</AgentPlanOverviewMetaText>}
                              {artifact.sourceTaskStatus && <AgentPlanOverviewMetaText>{agentTaskStatusLabel(artifact.sourceTaskStatus)}</AgentPlanOverviewMetaText>}
                              {artifact.toolName && <AgentPlanOverviewMetaText data-truncate="true">工具 {artifact.toolName}</AgentPlanOverviewMetaText>}
                              {artifact.policy && <AgentPlanOverviewMetaText data-truncate="true">回滚规则 {artifact.policy}</AgentPlanOverviewMetaText>}
                            </AgentPlanOverviewMetaRow>
                            {artifact.metadata && <ActivityJSONBlock label="元数据" value={artifact.metadata} />}
                          </AgentPlanOverviewItemCard>
                        ))}
                      </AgentPlanOverviewDisclosureBody>
                    </AgentPlanOverviewDisclosure>
                  )}
                </AgentPlanOverviewTaskBody>
              </AgentPlanOverviewTaskCard>
            )
          })}
        </AgentPlanOverviewList>
      )}
    </AgentPlanOverviewShell>
  )
}

function runInteractionInputTypeLabel(type: string, t: ReturnType<typeof useTranslation>['t']): string {
  switch (type) {
    case 'choice':
      return t('agents.chat.task.inputTypeChoice')
    case 'text':
      return t('agents.chat.task.inputTypeText')
    case 'confirmation':
      return t('agents.chat.task.inputTypeConfirmation')
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

function ActivityJSONBlock({ label, value }: { label: string; value: unknown }) {
  const text = safeJSONStringify(value)
  return (
    <AgentPlanOverviewCodeDisclosure title={label}>
      {text}
    </AgentPlanOverviewCodeDisclosure>
  )
}

function formatAgentDate(value: string | number, locale: string) {
  return formatAgentCompactTimestamp(value, locale)
}

function durationLabel(start: string | undefined, end: string | undefined) {
  return formatAgentDuration(start, end)
}

function formatDurationLabel(ms: number) {
  return ms > 0 ? formatAgentDurationMs(ms) : ''
}

function safeJSONStringify(value: unknown) {
  return JSON.stringify(value, null, 2)
}
