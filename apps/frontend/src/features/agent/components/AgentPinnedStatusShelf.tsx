import { useState } from 'react'
import {
  AgentPinnedStatusActiveCount,
  AgentPinnedStatusBadge,
  AgentPinnedStatusBody,
  AgentPinnedStatusCollapseIcon,
  AgentPinnedStatusDividerRow,
  AgentPinnedStatusEmpty,
  AgentPinnedStatusGenerationLine,
  AgentPinnedStatusHeader,
  AgentPinnedStatusHeaderActions,
  AgentPinnedStatusHeaderCopy,
  AgentPinnedStatusInlineAction,
  AgentPinnedStatusList,
  AgentPinnedStatusPlanBlock,
  AgentPinnedStatusPlanHeader,
  AgentPinnedStatusPlanMetaRow,
  AgentPinnedStatusPlanStep,
  AgentPinnedStatusPlanSteps,
  AgentPinnedStatusProgress,
  AgentPinnedStatusRoot,
  AgentPinnedStatusSummaryRow,
  AgentPinnedStatusSurface,
  AgentPinnedStatusTabButton,
  AgentPinnedStatusTabGroup,
  AgentPinnedStatusTitleRow,
  AgentPinnedStatusTruncatedText,
  AgentPinnedStatusWorkerRow,
  AgentPlanOverviewTaskStatusIcon,
} from '@movscript/ui'
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Dot } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { generationJobBadge, generationProgressTitle, generationStatusText } from '@/features/agent/domain/agentGenerationDisplay'
import type { GenerationProgressState } from '@/features/agent/domain/agentGenerationMedia'
import { buildPlanOverviewStats, buildPlanTaskViews } from '@/features/agent/domain/agentPlanUi'
import { agentPlanStatusLabel, runStatusLabel } from '@/features/agent/domain/agentRunUi'
import type { AgentPlan, AgentPlanTaskStatus, AgentRun, AgentTaskGraphSnapshot } from '@/shared/infrastructure/localAgentClient'

export interface AgentPinnedStatusShelfProps {
  plan?: AgentPlan
  generationProgressStates?: GenerationProgressState[]
  planSnapshot?: AgentTaskGraphSnapshot
  expanded?: boolean
  defaultExpanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
}

const ACTIVE_RUN_STATUSES = new Set<AgentRun['status']>(['queued', 'in_progress', 'requires_action'])
type PinnedStatusView = 'generation' | 'subagent' | 'plan'

export function AgentPinnedStatusShelf({
  defaultExpanded = true,
  expanded,
  plan,
  generationProgressStates = [],
  planSnapshot,
  onExpandedChange,
}: AgentPinnedStatusShelfProps) {
  const { t } = useTranslation()
  const liveGenerationStates = generationProgressStates.filter((state) => !state.terminal)
  const taskViews = planSnapshot ? buildPlanTaskViews(planSnapshot) : []
  const workerViews = taskViews
    .filter((view) => view.worker)
    .sort((left, right) => {
      const leftActive = left.worker && ACTIVE_RUN_STATUSES.has(left.worker.status) ? 1 : 0
      const rightActive = right.worker && ACTIVE_RUN_STATUSES.has(right.worker.status) ? 1 : 0
      if (leftActive !== rightActive) return rightActive - leftActive
      return timestamp(right.worker?.updatedAt) - timestamp(left.worker?.updatedAt)
    })
  const activeWorkerViews = workerViews.filter((view) => view.worker && ACTIVE_RUN_STATUSES.has(view.worker.status))
  const hasThreadPlan = !!plan && plan.items.length > 0
  const hasPlan = hasThreadPlan || !!planSnapshot
  const hasGeneration = generationProgressStates.length > 0
  const hasSubagents = workerViews.length > 0

  const planStats = planSnapshot ? buildPlanOverviewStats(planSnapshot) : undefined
  const views = [
    { id: 'generation' as const, label: t('agents.chat.pinnedStatus.tabs.generation'), count: generationProgressStates.length },
    { id: 'subagent' as const, label: t('agents.chat.pinnedStatus.tabs.worker'), count: workerViews.length },
    { id: 'plan' as const, label: t('agents.chat.pinnedStatus.tabs.plan'), count: plan?.totalCount ?? planStats?.taskCount ?? 0 },
  ]
  const [activeView, setActiveView] = useState<PinnedStatusView>(hasGeneration ? 'generation' : hasSubagents ? 'subagent' : hasPlan ? 'plan' : 'generation')
  const [collapsed, setCollapsed] = useState(!defaultExpanded)
  const isExpanded = expanded ?? !collapsed
  const setExpanded = (nextExpanded: boolean) => {
    if (expanded === undefined) setCollapsed(!nextExpanded)
    onExpandedChange?.(nextExpanded)
  }
  const activeCount = [
    liveGenerationStates.length > 0 ? liveGenerationStates.length : 0,
    activeWorkerViews.length,
    planStats?.activeWorkerCount ?? 0,
  ].reduce((total, count) => Math.max(total, count), 0)
  if (!hasThreadPlan && !hasPlan && !hasGeneration && !hasSubagents) return null

  return (
    <AgentPinnedStatusRoot
      data-testid="agent-pinned-status-shelf"
    >
      <AgentPinnedStatusSurface>
        <div>
          <AgentPinnedStatusHeader
            role="button"
            tabIndex={0}
            aria-expanded={isExpanded}
            aria-controls="agent-pinned-status-shelf-body"
            expanded={isExpanded}
            onClick={() => setExpanded(!isExpanded)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              setExpanded(!isExpanded)
            }}
            title={isExpanded ? t('agents.chat.pinnedStatus.collapse') : t('agents.chat.pinnedStatus.expand')}
          >
            <AgentPinnedStatusHeaderCopy>
              <AgentPinnedStatusTitleRow>
                <span>{t('agents.chat.pinnedStatus.title')}</span>
                {isExpanded && activeCount > 0 && <AgentPinnedStatusActiveCount>{t('agents.chat.pinnedStatus.activeRunsCount', { count: activeCount })}</AgentPinnedStatusActiveCount>}
              </AgentPinnedStatusTitleRow>
              {isExpanded && (
                <AgentPinnedStatusSummaryRow>
                  {hasGeneration && <span>{t('agents.chat.pinnedStatus.generationTasksCount', { count: liveGenerationStates.length || generationProgressStates.length })}</span>}
                  {planStats && <span>{t('agents.chat.pinnedStatus.planProgress', { completed: planStats.completedTaskCount, total: planStats.taskCount })}</span>}
                  {workerViews.length > 0 && <span>{t('agents.chat.pinnedStatus.workersCount', { count: workerViews.length })}</span>}
                  {hasThreadPlan && <span>{t('agents.chat.pinnedStatus.threadPlanSteps', { completed: plan.completedCount, total: plan.totalCount })}</span>}
                </AgentPinnedStatusSummaryRow>
              )}
            </AgentPinnedStatusHeaderCopy>
            <AgentPinnedStatusHeaderActions>
              {isExpanded && (
                <AgentPinnedStatusTabGroup>
                  {views.map((view) => (
                    <AgentPinnedStatusTabButton
                      key={view.id}
                      active={activeView === view.id}
                      count={view.count}
                      onClick={(event) => {
                        event.stopPropagation()
                        setActiveView(view.id)
                      }}
                    >
                      {view.label}
                    </AgentPinnedStatusTabButton>
                  ))}
                </AgentPinnedStatusTabGroup>
              )}
              <AgentPinnedStatusCollapseIcon>
                {isExpanded
                  ? <ChevronUp size={14} aria-hidden="true" />
                  : <ChevronDown size={14} aria-hidden="true" />}
              </AgentPinnedStatusCollapseIcon>
            </AgentPinnedStatusHeaderActions>
          </AgentPinnedStatusHeader>
        {isExpanded && (
          <AgentPinnedStatusBody id="agent-pinned-status-shelf-body">
            {activeView === 'generation' && (
              hasGeneration ? (
                <AgentPinnedStatusList>
                  {generationProgressStates.map((state, index) => (
                    <GenerationStatusLine key={generationStatusKey(state, index)} state={state} />
                  ))}
                </AgentPinnedStatusList>
              ) : <AgentPinnedStatusEmpty>{t('agents.chat.pinnedStatus.empty.generation')}</AgentPinnedStatusEmpty>
            )}
            {activeView === 'subagent' && (
              hasSubagents ? (
                <AgentPinnedStatusList>
                  {workerViews.map((view) => view.worker && (
                    <AgentPinnedStatusWorkerRow
                      key={view.worker.id}
                      title={view.subagentName ?? view.worker.subagentName ?? view.task.title}
                      detail={view.task.title}
                      progress={typeof view.worker.progress === 'number' ? `${Math.round(Math.max(0, Math.min(1, view.worker.progress)) * 100)}%` : undefined}
                      status={runStatusLabel(view.worker.status)}
                    />
                  ))}
                </AgentPinnedStatusList>
              ) : <AgentPinnedStatusEmpty>{t('agents.chat.pinnedStatus.empty.worker')}</AgentPinnedStatusEmpty>
            )}
            {activeView === 'plan' && (
              plan
                ? <ThreadPlanStatusView plan={plan} planSnapshot={planSnapshot} planStats={planStats} />
                : planSnapshot && planStats
                  ? <TaskGraphPlanStatusView planSnapshot={planSnapshot} planStats={planStats} />
                  : <AgentPinnedStatusEmpty>{t('agents.chat.pinnedStatus.empty.plan')}</AgentPinnedStatusEmpty>
            )}
          </AgentPinnedStatusBody>
        )}
        </div>
      </AgentPinnedStatusSurface>
    </AgentPinnedStatusRoot>
  )
}

export function hasAgentPinnedStatus({
  plan,
  generationProgressStates = [],
  planSnapshot,
}: Pick<AgentPinnedStatusShelfProps, 'plan' | 'generationProgressStates' | 'planSnapshot'>) {
  return Boolean((plan && plan.items.length > 0) || planSnapshot || generationProgressStates.length > 0)
}

function pinnedGenerationProgressIntent(state: ReturnType<typeof generationJobBadge>['state'], terminal: boolean) {
  if (state === 'failed') return 'danger'
  if (state === 'cancelled' || state === 'timeout') return 'warning'
  if (terminal || state === 'completed') return 'success'
  return 'brand'
}

function GenerationStatusLine({ state }: { state: GenerationProgressState }) {
  const badge = generationJobBadge(state)
  const progress = typeof state.progress === 'number' ? Math.round(Math.max(0, Math.min(100, state.progress))) : undefined
  const model = state.modelDisplay ?? state.modelIdentifier
  return (
    <AgentPinnedStatusGenerationLine
      title={generationProgressTitle(state)}
      detail={[generationStatusText(state.status, state.stage), model, state.jobType].filter(Boolean).join(' · ')}
      badge={badge.label}
      progress={state.terminal ? (progress ?? 100) : progress ?? 30}
      tone={pinnedGenerationProgressIntent(badge.state, state.terminal)}
    />
  )
}

function ThreadPlanStatusView({
  plan,
  planSnapshot,
  planStats,
}: {
  plan: AgentPlan
  planSnapshot?: AgentTaskGraphSnapshot
  planStats?: ReturnType<typeof buildPlanOverviewStats>
}) {
  const { t } = useTranslation()
  const percent = plan.totalCount > 0 ? Math.round((plan.completedCount / plan.totalCount) * 100) : 0
  return (
    <AgentPinnedStatusPlanBlock>
      <AgentPinnedStatusPlanHeader
        title={t('agents.chat.pinnedStatus.planUpdated')}
        meta={(
          <AgentPinnedStatusPlanMetaRow>
            <span>{t('agents.chat.pinnedStatus.stepsCount', { completed: plan.completedCount, total: plan.totalCount })}</span>
            <span>{percent}%</span>
            {plan.explanation && <AgentPinnedStatusTruncatedText>{plan.explanation}</AgentPinnedStatusTruncatedText>}
          </AgentPinnedStatusPlanMetaRow>
        )}
        badge={t('agents.chat.pinnedStatus.tabs.plan')}
      />
      <AgentPinnedStatusProgress value={percent} />
      <AgentPinnedStatusPlanSteps>
        {plan.items.map((item, index) => (
          <ThreadPlanStepLine key={`${index}-${item.step}`} step={item.step} status={item.status} />
        ))}
      </AgentPinnedStatusPlanSteps>
      {planSnapshot && planStats && (
        <AgentPinnedStatusDividerRow>
          <AgentPinnedStatusTruncatedText>{t('agents.chat.pinnedStatus.executionPlanProgress', { completed: planStats.completedTaskCount, total: planStats.taskCount })}</AgentPinnedStatusTruncatedText>
          <AgentPinnedStatusInlineAction onClick={() => scrollToElement('agent-taskGraph-overview')}>
            {t('agents.chat.pinnedStatus.viewDetails')}
          </AgentPinnedStatusInlineAction>
        </AgentPinnedStatusDividerRow>
      )}
    </AgentPinnedStatusPlanBlock>
  )
}

function TaskGraphPlanStatusView({
  planSnapshot,
  planStats,
}: {
  planSnapshot: AgentTaskGraphSnapshot
  planStats: ReturnType<typeof buildPlanOverviewStats>
}) {
  const { t } = useTranslation()
  return (
    <AgentPinnedStatusPlanBlock>
      <AgentPinnedStatusPlanHeader
        title={planSnapshot.taskGraph.title}
        meta={(
          <AgentPinnedStatusPlanMetaRow>
            <span>{t('agents.chat.pinnedStatus.tasksCount', { completed: planStats.completedTaskCount, total: planStats.taskCount })}</span>
            <span>{Math.round(Math.max(0, Math.min(1, planSnapshot.taskGraph.progress)) * 100)}%</span>
            <span>{t('agents.chat.pinnedStatus.workersRunningCount', { count: planStats.activeWorkerCount })}</span>
            {planStats.artifactCount > 0 && <span>{t('agents.chat.pinnedStatus.artifactsCount', { count: planStats.artifactCount })}</span>}
          </AgentPinnedStatusPlanMetaRow>
        )}
        badge={agentPlanStatusLabel(planSnapshot.taskGraph.status)}
      />
      <AgentPinnedStatusProgress value={Math.round(Math.max(0, Math.min(1, planSnapshot.taskGraph.progress)) * 100)} />
      <AgentPinnedStatusInlineAction onClick={() => scrollToElement('agent-taskGraph-overview')}>
        {t('agents.chat.pinnedStatus.viewPlanDetails')}
      </AgentPinnedStatusInlineAction>
    </AgentPinnedStatusPlanBlock>
  )
}

function ThreadPlanStepLine({
  step,
  status,
}: {
  step: string
  status: AgentPlanTaskStatus
}) {
  return (
    <AgentPinnedStatusPlanStep completed={status === 'completed'} icon={<ThreadPlanStatusIcon status={status} />}>
      {step}
    </AgentPinnedStatusPlanStep>
  )
}

function ThreadPlanStatusIcon({ status }: { status: AgentPlanTaskStatus }) {
  if (status === 'completed') {
    return (
      <AgentPlanOverviewTaskStatusIcon intent="success">
        <CheckCircle2 size={12} />
      </AgentPlanOverviewTaskStatusIcon>
    )
  }
  if (status === 'in_progress') {
    return (
      <AgentPlanOverviewTaskStatusIcon intent="info">
        <Dot size={14} />
      </AgentPlanOverviewTaskStatusIcon>
    )
  }
  return (
    <AgentPlanOverviewTaskStatusIcon intent="neutral">
      <Circle size={10} />
    </AgentPlanOverviewTaskStatusIcon>
  )
}

function generationStatusKey(state: GenerationProgressState, index: number) {
  if (state.jobId !== undefined) return `job-${state.jobId}`
  if (state.outputResourceId !== undefined) return `resource-${state.outputResourceId}`
  return `generation-${index}-${state.status}-${state.stage ?? 'unknown'}`
}

function scrollToElement(id: string) {
  if (typeof document === 'undefined') return
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function timestamp(value: string | undefined) {
  if (!value) return 0
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : 0
}
