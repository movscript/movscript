import { useState } from 'react'
import { Badge, Button } from '@movscript/ui'
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Dot } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { generationJobBadge, generationProgressTitle, generationStatusText } from '@/lib/agentGenerationDisplay'
import type { GenerationProgressState } from '@/lib/agentGenerationMedia'
import { buildPlanOverviewStats, buildPlanTaskViews } from '@/lib/agentPlanUi'
import { agentPlanStatusLabel, runStatusLabel } from '@/lib/agentRunUi'
import type { AgentPlan, AgentPlanTaskStatus, AgentRun, AgentTaskGraphSnapshot } from '@/lib/localAgentClient'
import { cn } from '@/lib/utils'

interface AgentPinnedStatusShelfProps {
  plan?: AgentPlan
  generationProgressStates?: GenerationProgressState[]
  planSnapshot?: AgentTaskGraphSnapshot
}

const ACTIVE_RUN_STATUSES = new Set<AgentRun['status']>(['queued', 'in_progress', 'requires_action'])
type PinnedStatusView = 'generation' | 'subagent' | 'plan'

export function AgentPinnedStatusShelf({
  plan,
  generationProgressStates = [],
  planSnapshot,
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
  const [collapsed, setCollapsed] = useState(false)
  const activeCount = [
    liveGenerationStates.length > 0 ? liveGenerationStates.length : 0,
    activeWorkerViews.length,
    planStats?.activeWorkerCount ?? 0,
  ].reduce((total, count) => Math.max(total, count), 0)
  if (!hasThreadPlan && !hasPlan && !hasGeneration && !hasSubagents) return null

  return (
    <header
      data-testid="agent-pinned-status-shelf"
      className="z-20 shrink-0 border-b border-border/70 bg-background px-2 py-2"
    >
      <div className="rounded-md border border-border bg-background shadow-sm">
        <div
          role="button"
          tabIndex={0}
          aria-expanded={!collapsed}
          aria-controls="agent-pinned-status-shelf-body"
          className={cn(
            'flex min-h-10 cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
            !collapsed && 'border-b border-border/60',
          )}
          onClick={() => setCollapsed((value) => !value)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            setCollapsed((value) => !value)
          }}
          title={collapsed ? t('agents.chat.pinnedStatus.expand') : t('agents.chat.pinnedStatus.collapse')}
        >
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 type-tiny font-medium text-foreground">
              <span>{t('agents.chat.pinnedStatus.title')}</span>
              {!collapsed && activeCount > 0 && <span className="type-micro font-normal text-muted-foreground">{t('agents.chat.pinnedStatus.activeRunsCount', { count: activeCount })}</span>}
            </div>
            {!collapsed && (
              <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 type-micro text-muted-foreground">
                {hasGeneration && <span>{t('agents.chat.pinnedStatus.generationTasksCount', { count: liveGenerationStates.length || generationProgressStates.length })}</span>}
                {planStats && <span>{t('agents.chat.pinnedStatus.planProgress', { completed: planStats.completedTaskCount, total: planStats.taskCount })}</span>}
                {workerViews.length > 0 && <span>{t('agents.chat.pinnedStatus.workersCount', { count: workerViews.length })}</span>}
                {hasThreadPlan && <span>{t('agents.chat.pinnedStatus.threadPlanSteps', { completed: plan.completedCount, total: plan.totalCount })}</span>}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {!collapsed && (
              <div className="flex items-center rounded-md bg-muted/60 p-0.5">
                {views.map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    className={cn(
                      'rounded px-2 py-1 type-micro transition-colors',
                      activeView === view.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={(event) => {
                      event.stopPropagation()
                      setActiveView(view.id)
                    }}
                  >
                    {view.label}
                    <span className="ml-1 text-muted-foreground">{view.count}</span>
                  </button>
                ))}
              </div>
            )}
            {collapsed
              ? <ChevronDown size={14} className="text-muted-foreground" aria-hidden="true" />
              : <ChevronUp size={14} className="text-muted-foreground" aria-hidden="true" />}
          </div>
        </div>
        {!collapsed && (
          <div id="agent-pinned-status-shelf-body" className="h-28 overflow-y-auto overscroll-contain px-2.5 py-2">
            {activeView === 'generation' && (
              hasGeneration ? (
                <div className="space-y-1.5">
                  {generationProgressStates.map((state, index) => (
                    <GenerationStatusLine key={generationStatusKey(state, index)} state={state} />
                  ))}
                </div>
              ) : <PinnedEmptyState label={t('agents.chat.pinnedStatus.empty.generation')} />
            )}
            {activeView === 'subagent' && (
              hasSubagents ? (
                <div className="space-y-1.5">
                  {workerViews.map((view) => view.worker && (
                    <div key={view.worker.id} className="flex min-w-0 items-center justify-between gap-2 type-micro">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{view.subagentName ?? view.worker.subagentName ?? view.task.title}</div>
                        <div className="truncate text-muted-foreground">{view.task.title}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
                        {typeof view.worker.progress === 'number' && <span>{Math.round(Math.max(0, Math.min(1, view.worker.progress)) * 100)}%</span>}
                        <Badge variant="outline" className="type-min leading-3 px-1 py-0">{runStatusLabel(view.worker.status)}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <PinnedEmptyState label={t('agents.chat.pinnedStatus.empty.worker')} />
            )}
            {activeView === 'plan' && (
              plan
                ? <ThreadPlanStatusView plan={plan} planSnapshot={planSnapshot} planStats={planStats} />
                : planSnapshot && planStats
                  ? <TaskGraphPlanStatusView planSnapshot={planSnapshot} planStats={planStats} />
                  : <PinnedEmptyState label={t('agents.chat.pinnedStatus.empty.plan')} />
            )}
          </div>
        )}
      </div>
    </header>
  )
}

function PinnedEmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-12 items-center justify-center rounded border border-dashed border-border/70 bg-muted/20 type-micro text-muted-foreground">
      {label}
    </div>
  )
}

function GenerationStatusLine({ state }: { state: GenerationProgressState }) {
  const badge = generationJobBadge(state)
  const progress = typeof state.progress === 'number' ? Math.round(Math.max(0, Math.min(100, state.progress))) : undefined
  const model = state.modelDisplay ?? state.modelIdentifier
  return (
    <div className="space-y-1 type-micro">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{generationProgressTitle(state)}</div>
          <div className="truncate text-muted-foreground">
            {[generationStatusText(state.status, state.stage), model, state.jobType].filter(Boolean).join(' · ')}
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 type-min leading-3 px-1 py-0">{badge.label}</Badge>
      </div>
      <div className="h-0.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', badge.tone === 'failed' || badge.tone === 'warning' ? 'bg-amber-500' : state.terminal ? 'bg-emerald-600' : 'bg-primary')}
          style={{ width: `${state.terminal ? (progress ?? 100) : progress ?? 30}%` }}
        />
      </div>
    </div>
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
    <div className="space-y-1.5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate type-tiny font-medium text-foreground">{t('agents.chat.pinnedStatus.planUpdated')}</div>
          <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 type-micro text-muted-foreground">
            <span>{t('agents.chat.pinnedStatus.stepsCount', { completed: plan.completedCount, total: plan.totalCount })}</span>
            <span>{percent}%</span>
            {plan.explanation && <span className="truncate">{plan.explanation}</span>}
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 type-min leading-3 px-1 py-0">
          {t('agents.chat.pinnedStatus.tabs.plan')}
        </Badge>
      </div>
      <div className="h-0.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <div className="space-y-1">
        {plan.items.map((item, index) => (
          <ThreadPlanStepLine key={`${index}-${item.step}`} step={item.step} status={item.status} />
        ))}
      </div>
      {planSnapshot && planStats && (
        <div className="flex min-w-0 items-center justify-between gap-2 border-t border-border/60 pt-1.5 type-micro text-muted-foreground">
          <span className="min-w-0 truncate">{t('agents.chat.pinnedStatus.executionPlanProgress', { completed: planStats.completedTaskCount, total: planStats.taskCount })}</span>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="h-5 shrink-0 px-1.5 type-micro"
            onClick={() => scrollToElement('agent-taskGraph-overview')}
          >
            {t('agents.chat.pinnedStatus.viewDetails')}
          </Button>
        </div>
      )}
    </div>
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
    <div className="space-y-1.5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate type-tiny font-medium text-foreground">{planSnapshot.taskGraph.title}</div>
          <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 type-micro text-muted-foreground">
            <span>{t('agents.chat.pinnedStatus.tasksCount', { completed: planStats.completedTaskCount, total: planStats.taskCount })}</span>
            <span>{Math.round(Math.max(0, Math.min(1, planSnapshot.taskGraph.progress)) * 100)}%</span>
            <span>{t('agents.chat.pinnedStatus.workersRunningCount', { count: planStats.activeWorkerCount })}</span>
            {planStats.artifactCount > 0 && <span>{t('agents.chat.pinnedStatus.artifactsCount', { count: planStats.artifactCount })}</span>}
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 type-min leading-3 px-1 py-0">
          {agentPlanStatusLabel(planSnapshot.taskGraph.status)}
        </Badge>
      </div>
      <div className="h-0.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(Math.max(0, Math.min(1, planSnapshot.taskGraph.progress)) * 100)}%` }} />
      </div>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="h-5 px-1.5 type-micro"
        onClick={() => scrollToElement('agent-taskGraph-overview')}
      >
        {t('agents.chat.pinnedStatus.viewPlanDetails')}
      </Button>
    </div>
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
    <div className="flex min-w-0 items-start gap-1.5 type-micro">
      <ThreadPlanStatusIcon status={status} />
      <span className={cn(
        'min-w-0 flex-1 truncate',
        status === 'completed' ? 'text-muted-foreground line-through decoration-muted-foreground/50' : 'text-foreground',
      )}>
        {step}
      </span>
    </div>
  )
}

function ThreadPlanStatusIcon({ status }: { status: AgentPlanTaskStatus }) {
  if (status === 'completed') return <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-600" />
  if (status === 'in_progress') return <Dot size={14} className="shrink-0 text-primary" />
  return <Circle size={10} className="mt-1 shrink-0 text-muted-foreground" />
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
