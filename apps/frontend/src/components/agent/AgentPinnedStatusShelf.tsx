import { useState } from 'react'
import { Badge, Button } from '@movscript/ui'
import { generationJobBadge, generationProgressTitle, generationStatusText } from '@/lib/agentGenerationDisplay'
import type { GenerationProgressState } from '@/lib/agentGenerationMedia'
import { buildPlanOverviewStats, buildPlanTaskViews } from '@/lib/agentPlanUi'
import { agentPlanStatusLabel, runStatusLabel } from '@/lib/agentRunUi'
import type { AgentProgressChecklist, AgentRun, AgentTaskGraphSnapshot } from '@/lib/localAgentClient'
import { cn } from '@/lib/utils'

interface AgentPinnedStatusShelfProps {
  checklist?: AgentProgressChecklist
  generationProgressStates?: GenerationProgressState[]
  planSnapshot?: AgentTaskGraphSnapshot
}

const ACTIVE_RUN_STATUSES = new Set<AgentRun['status']>(['queued', 'in_progress', 'requires_action'])
type PinnedStatusView = 'generation' | 'subagent' | 'plan'

export function AgentPinnedStatusShelf({
  checklist,
  generationProgressStates = [],
  planSnapshot,
}: AgentPinnedStatusShelfProps) {
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
  const hasChecklist = !!checklist && checklist.items.length > 0
  const hasPlan = !!planSnapshot
  const hasGeneration = generationProgressStates.length > 0
  const hasSubagents = workerViews.length > 0

  const planStats = planSnapshot ? buildPlanOverviewStats(planSnapshot) : undefined
  const views = [
    { id: 'generation' as const, label: '生成', count: generationProgressStates.length },
    { id: 'subagent' as const, label: '子 agent', count: workerViews.length },
    { id: 'plan' as const, label: 'Plan', count: planStats?.taskCount ?? 0 },
  ]
  const [activeView, setActiveView] = useState<PinnedStatusView>(hasGeneration ? 'generation' : hasSubagents ? 'subagent' : hasPlan ? 'plan' : 'generation')
  const activeCount = [
    liveGenerationStates.length > 0 ? liveGenerationStates.length : 0,
    activeWorkerViews.length,
    planStats?.activeWorkerCount ?? 0,
  ].reduce((total, count) => Math.max(total, count), 0)
  if (!hasChecklist && !hasPlan && !hasGeneration && !hasSubagents) return null

  return (
    <header
      data-testid="agent-pinned-status-shelf"
      className="z-20 shrink-0 border-b border-border/70 bg-background px-2 py-2"
    >
      <div className="rounded-md border border-border bg-background shadow-sm">
        <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border/60 px-2.5 py-1.5">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 type-tiny font-medium text-foreground">
              <span>当前状态</span>
              {activeCount > 0 && <span className="type-micro font-normal text-muted-foreground">{activeCount} 个运行中</span>}
            </div>
            <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 type-micro text-muted-foreground">
              {hasGeneration && <span>{liveGenerationStates.length || generationProgressStates.length} 个生成任务</span>}
              {planStats && <span>计划 {planStats.completedTaskCount}/{planStats.taskCount}</span>}
              {workerViews.length > 0 && <span>{workerViews.length} 个子 agent</span>}
              {hasChecklist && <span>步骤 {checklist.completedCount}/{checklist.totalCount}</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center rounded-md bg-muted/60 p-0.5">
            {views.map((view) => (
              <button
                key={view.id}
                type="button"
                className={cn(
                  'rounded px-2 py-1 type-micro transition-colors',
                  activeView === view.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setActiveView(view.id)}
              >
                {view.label}
                <span className="ml-1 text-muted-foreground">{view.count}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="px-2.5 py-2">
          {activeView === 'generation' && (
            hasGeneration ? (
              <div className="space-y-1.5">
                {generationProgressStates.slice(-3).map((state, index) => (
                  <GenerationStatusLine key={generationStatusKey(state, index)} state={state} />
                ))}
              </div>
            ) : <PinnedEmptyState label="暂无生成任务" />
          )}
          {activeView === 'subagent' && (
            hasSubagents ? (
              <div className="space-y-1.5">
                {workerViews.slice(0, 4).map((view) => view.worker && (
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
            ) : <PinnedEmptyState label="暂无子 agent" />
          )}
          {activeView === 'plan' && (
            planSnapshot && planStats ? (
              <div className="space-y-1.5">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate type-tiny font-medium text-foreground">{planSnapshot.taskGraph.title}</div>
                    <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 type-micro text-muted-foreground">
                      <span>{planStats.completedTaskCount}/{planStats.taskCount} 个任务</span>
                      <span>{Math.round(Math.max(0, Math.min(1, planSnapshot.taskGraph.progress)) * 100)}%</span>
                      <span>{planStats.activeWorkerCount} 个执行器运行中</span>
                      {planStats.artifactCount > 0 && <span>{planStats.artifactCount} 个产物</span>}
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
                  查看计划详情
                </Button>
              </div>
            ) : <PinnedEmptyState label="暂无 plan" />
          )}
        </div>
      </div>
    </header>
  )
}

function PinnedEmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-12 items-center justify-center rounded border border-dashed border-border/70 bg-muted/20 type-micro text-muted-foreground">
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
