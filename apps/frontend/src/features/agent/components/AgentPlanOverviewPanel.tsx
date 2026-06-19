import { useState } from 'react'
import { ClipboardCheck, Route } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  AgentPlanOverviewActionButton,
  AgentPlanOverviewBadge,
  AgentPlanOverviewDescription,
  AgentPlanOverviewDisclosure,
  AgentPlanOverviewDisclosureBody,
  AgentPlanOverviewDisclosureSummary,
  AgentPlanOverviewErrorText,
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
  AgentPlanOverviewProgress,
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
  AgentPlanOverviewWarningText
} from '@movscript/ui/business/agent'
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
import { agentPlanStatusLabel } from '@/features/agent/domain/agentRunUi'
import { agentRunStatusRecipe, agentRunInteractionStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import {
  formatAgentPlanDurationLabel,
  runInteractionInputTypeLabel,
} from '@/features/agent/presentation/AgentPlanOverviewPanelModel'
import { providerSessionApprovalImpactText, providerSessionApprovalPermissionText, providerSessionApprovalRiskText } from '@/features/agent/components/providerSessionInteractions'
import {
  AgentPlanActivityJSONBlock,
  AgentPlanArtifactSummarySection,
  AgentPlanDispatchSettingsGrid,
  AgentPlanGraphActions,
  AgentPlanNameConflictsNotice,
  DEFAULT_TASK_GRAPH_DISPATCH_SETTINGS,
} from '@/features/agent/components/AgentPlanOverviewPanelSections'
import { AgentPlanOverviewWorkerSection } from '@/features/agent/components/AgentPlanOverviewWorkerSection'
import {
  getAgentRunTraceSummary,
  listAgentRunTraceEvents,
} from '@/features/agent/application/agentRunTraceService'
import type { AgentTaskGraphSnapshot, AgentRunTraceSummary, AgentTraceEvent } from '@movscript/core/agent/protocol'
import { ROUTES } from '@/routes/projectRoutes'
import type { PlanDispatchSettings } from '@/features/agent/application/agentPlanActions'

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
  const snapshotProviderSessionTreeId = snapshot?.taskGraph.providerSessionTreeId?.trim() || snapshot?.taskGraph.sessionId?.trim()
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
  const scrollToTask = (taskId: string | undefined) => {
    if (!taskId || typeof document === 'undefined') return
    document.getElementById(`agent-taskGraph-task-${taskId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const openRun = (runId: string | undefined) => {
    if (!runId) return
    navigate(ROUTES.agentConsole)
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
      const summary = await getAgentRunTraceSummary({
        providerSessionTreeId: snapshotProviderSessionTreeId,
        runId,
      })
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
      const response = await listAgentRunTraceEvents({
        providerSessionTreeId: snapshotProviderSessionTreeId,
        runId,
        limit: 8,
        ...(cursor ? { cursor } : {}),
      })
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
      <AgentPlanNameConflictsNotice
        nameConflicts={nameConflicts}
        onOpenRun={openRun}
        onScrollToTask={scrollToTask}
      />
      <AgentPlanGraphActions
        busy={busy}
        canCancel={Boolean(canCancel)}
        canDispatch={canDispatch}
        canRetaskGraph={canRetaskGraph}
        onCancelTree={onCancelTree}
        onDispatch={onDispatch}
        onRetaskGraph={onRetaskGraph}
      />
      <AgentPlanDispatchSettingsGrid
        busy={busy}
        onSettingsChange={onDispatchSettingsChange}
        settings={settings}
      />
      <AgentPlanOverviewProgress value={snapshot.taskGraph.progress} />
      <AgentPlanArtifactSummarySection
        activeArtifactTypeFilter={activeArtifactTypeFilter}
        artifactSummary={artifactSummary}
        onArtifactTypeFilterChange={setArtifactTypeFilter}
        onOpenRun={openRun}
        onScrollToTask={scrollToTask}
        visiblePlanArtifacts={visiblePlanArtifacts}
      />
      {tasks.length > 0 && (
        <AgentPlanOverviewList>
          {taskViews.map((view) => {
            const task = view.task
            const taskRunInteractionStatus = task.status === 'done' ? 'completed' : task.status === 'failed' || task.status === 'cancelled' ? 'failed' : 'in_progress'
            const taskStatusRecipe = agentRunInteractionStatusRecipe(taskRunInteractionStatus)
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
                    {view.workerTimeoutMs && <AgentPlanOverviewMetaText>超时 {formatAgentPlanDurationLabel(view.workerTimeoutMs)}</AgentPlanOverviewMetaText>}
                    {view.timedOutRunId && <AgentPlanOverviewMetaText data-truncate="true">超时运行 {view.timedOutRunId}</AgentPlanOverviewMetaText>}
                    {view.previousOwnerRunId && <AgentPlanOverviewMetaText data-truncate="true">上次运行 {view.previousOwnerRunId}</AgentPlanOverviewMetaText>}
                    {view.artifactCount > 0 && <AgentPlanOverviewMetaText>{view.artifactCount} 个产物</AgentPlanOverviewMetaText>}
                  </AgentPlanOverviewTaskMeta>
                  <AgentPlanOverviewText>{view.statusExplanation}</AgentPlanOverviewText>
                  {view.blocker && (
                    <AgentPlanOverviewWarningText>{view.blocker}</AgentPlanOverviewWarningText>
                  )}
                  <AgentPlanOverviewWorkerSection
                    view={view}
                    locale={locale}
                    traceSummaries={traceSummaries}
                    loadingTraceSummaryRunId={loadingTraceSummaryRunId}
                    traceSummaryErrors={traceSummaryErrors}
                    traceEventsByRunId={traceEventsByRunId}
                    traceEventHasMoreByRunId={traceEventHasMoreByRunId}
                    loadingTraceEventsRunId={loadingTraceEventsRunId}
                    traceEventErrors={traceEventErrors}
                    traceEventKindFilters={traceEventKindFilters}
                    onTraceEventKindFiltersChange={setTraceEventKindFilters}
                    onLoadTraceSummary={loadTraceSummary}
                    onLoadTraceEvents={loadTraceEvents}
                    onOpenConsole={() => navigate(ROUTES.agentConsole)}
                  />
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
                              {approval.risk && <AgentPlanOverviewMetaText>{t('agents.chat.panel.providerSession.risk')}: {providerSessionApprovalRiskText(approval.risk, t)}</AgentPlanOverviewMetaText>}
                            </AgentPlanOverviewItemHeader>
                            <AgentPlanOverviewText>{approval.reason}</AgentPlanOverviewText>
                            {approval.permission && <AgentPlanOverviewText>{t('agents.chat.panel.providerSession.permission')}: {providerSessionApprovalPermissionText(approval.permission, t)}</AgentPlanOverviewText>}
                            <AgentPlanOverviewText>
                              {t('agents.chat.task.approvalImpact.label')}: {providerSessionApprovalImpactText(approval, t)}
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
                            {artifact.metadata && <AgentPlanActivityJSONBlock label="元数据" value={artifact.metadata} />}
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
