import type { AgentPlanSnapshot, AgentPlanStatus, AgentRun, AgentTask } from './localAgentClient'

const STOPPABLE_AGENT_RUN_STATUSES = new Set<AgentRun['status']>(['queued', 'in_progress', 'requires_action'])
const TERMINAL_AGENT_RUN_STATUSES = new Set<AgentRun['status']>(['completed', 'completed_with_warnings', 'failed', 'cancelled'])
const TERMINAL_AGENT_PLAN_STATUSES = new Set<AgentPlanStatus>(['done', 'failed', 'cancelled'])

export function shouldPollPlanSnapshot(snapshot: AgentPlanSnapshot | undefined, activeRun: AgentRun | null | undefined): boolean {
  if (snapshot) {
    if (!TERMINAL_AGENT_PLAN_STATUSES.has(snapshot.plan.status)) return true
    return snapshot.runs.some((run) => STOPPABLE_AGENT_RUN_STATUSES.has(run.status))
  }
  return !!activeRun?.planId && !TERMINAL_AGENT_RUN_STATUSES.has(activeRun.status)
}

export function plannerRunIdForPlanAction(snapshot: AgentPlanSnapshot | undefined, activeRun: AgentRun | null | undefined): string | undefined {
  return snapshot?.plan.rootRunId
    ?? (activeRun?.role === 'planner' ? activeRun.id : activeRun?.parentRunId)
}

export interface AgentPlanTaskView {
  task: AgentTask
  subagentName?: string
  ownerLabel?: string
  ownerRun?: AgentRun
  waitingInputCount: number
  waitingApprovalCount: number
  pendingInputs: AgentPlanInputView[]
  pendingApprovals: AgentPlanApprovalView[]
  artifactCount: number
  artifactLabels: string[]
  artifactDetails: AgentPlanArtifactView[]
  retryAttempt?: number
  previousOwnerRunId?: string
  previousStatus?: AgentTask['status']
  timedOutRunId?: string
  workerTimeoutMs?: number
  blocker?: string
}

export interface AgentPlanInputView {
  id: string
  title: string
  question: string
  inputType: string
  choiceLabels: string[]
  allowCustomAnswer: boolean
}

export interface AgentPlanApprovalView {
  id: string
  toolName: string
  reason: string
  risk?: string
  permission?: string
}

export interface AgentPlanArtifactView {
  id: string
  label: string
  type: string
  uri?: string
  sourceRunId?: string
  sourceTaskId?: string
  subagentName?: string
  toolName?: string
  policy?: string
  metadata?: Record<string, unknown>
}

export interface AgentPlanArtifactSummary {
  totalCount: number
  byType: Array<{ type: string; count: number }>
  artifacts: AgentPlanArtifactView[]
}

export function buildPlanTaskViews(snapshot: AgentPlanSnapshot): AgentPlanTaskView[] {
  const runsById = new Map(snapshot.runs.map((run) => [run.id, run]))
  return [...snapshot.tasks]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((task) => {
      const subagentName = typeof task.metadata?.subagentName === 'string' && task.metadata.subagentName.trim()
        ? task.metadata.subagentName.trim()
        : undefined
      const ownerRun = task.ownerRunId ? runsById.get(task.ownerRunId) : undefined
      const pendingInputs = ownerRun?.pendingInputRequests?.filter((request) => request.status === 'pending') ?? []
      const pendingApprovals = ownerRun?.pendingApprovals?.filter((approval) => approval.status === 'pending') ?? []
      const artifactDetails = task.artifacts.map(formatArtifactView).filter((artifact): artifact is AgentPlanArtifactView => !!artifact)
      const artifactLabels = artifactDetails.map((artifact) => artifact.label).slice(0, 2)
      const retryAttempt = positiveInteger(task.metadata?.retryAttempt)
      const previousOwnerRunId = nonEmptyString(task.metadata?.previousOwnerRunId)
      const previousStatus = taskStatus(task.metadata?.previousStatus)
      const timedOutRunId = nonEmptyString(task.metadata?.timedOutRunId)
      const workerTimeoutMs = positiveInteger(task.metadata?.workerTimeoutMs)
      return {
        task,
        subagentName,
        ownerLabel: subagentName ?? task.ownerRunId,
        ownerRun,
        waitingInputCount: pendingInputs.length,
        waitingApprovalCount: pendingApprovals.length,
        pendingInputs: pendingInputs.map((request) => ({
          id: request.id,
          title: request.title,
          question: request.question,
          inputType: request.inputType,
          choiceLabels: request.choices.map((choice) => choice.label),
          allowCustomAnswer: request.allowCustomAnswer,
        })),
        pendingApprovals: pendingApprovals.map((approval) => ({
          id: approval.id,
          toolName: approval.toolName,
          reason: approval.reason,
          risk: approval.risk,
          permission: approval.permission,
        })),
        artifactCount: task.artifacts.length,
        artifactLabels,
        artifactDetails,
        retryAttempt,
        previousOwnerRunId,
        previousStatus,
        timedOutRunId,
        workerTimeoutMs,
        blocker: task.blockedReason ?? ownerRun?.blockedReason,
      }
    })
}

export function buildPlanArtifactSummary(snapshot: AgentPlanSnapshot): AgentPlanArtifactSummary {
  const artifacts = [...snapshot.tasks]
    .flatMap((task) => task.artifacts
      .map((artifact) => ({
        artifact,
        createdAt: artifact.createdAt,
      })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ artifact }) => formatArtifactView(artifact))
    .filter((artifact): artifact is AgentPlanArtifactView => !!artifact)
  const counts = new Map<string, number>()
  for (const artifact of artifacts) counts.set(artifact.type, (counts.get(artifact.type) ?? 0) + 1)
  return {
    totalCount: artifacts.length,
    byType: [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    artifacts,
  }
}

export function actionableRunForPlan(snapshot: AgentPlanSnapshot | undefined, activeRun: AgentRun | null | undefined): AgentRun | null {
  if (activeRun && runNeedsUserAction(activeRun)) return activeRun
  if (!snapshot) return null
  const taskViews = buildPlanTaskViews(snapshot)
  const taskOwnerRuns = taskViews
    .map((view) => view.ownerRun)
    .filter((run): run is AgentRun => !!run && runNeedsUserAction(run))
  if (taskOwnerRuns.length > 0) return taskOwnerRuns[0]!
  return snapshot.runs.find(runNeedsUserAction) ?? null
}

export function runNeedsUserAction(run: AgentRun): boolean {
  return run.status === 'requires_action'
    && (
      (run.pendingApprovals ?? []).some((approval) => approval.status === 'pending')
      || (run.pendingInputRequests ?? []).some((request) => request.status === 'pending')
    )
}

function formatArtifactView(artifact: AgentTask['artifacts'][number]): AgentPlanArtifactView | undefined {
  const base = artifact.title || artifact.type || artifact.uri
  if (!base) return undefined
  const metadata = artifact.metadata
  const subagentName = nonEmptyString(metadata?.subagentName)
  const sourceRunId = nonEmptyString(metadata?.sourceRunId)
  const sourceTaskId = nonEmptyString(metadata?.sourceTaskId)
  const toolName = nonEmptyString(metadata?.toolName)
  const policy = nonEmptyString(metadata?.policy)
  const source = subagentName ?? sourceRunId
  return {
    id: artifact.id,
    label: source ? `${base} · ${source}` : base,
    type: artifact.type,
    uri: artifact.uri,
    sourceRunId,
    sourceTaskId,
    subagentName,
    toolName,
    policy,
    metadata,
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function taskStatus(value: unknown): AgentTask['status'] | undefined {
  return value === 'pending'
    || value === 'running'
    || value === 'blocked'
    || value === 'needs_review'
    || value === 'done'
    || value === 'failed'
    || value === 'cancelled'
    ? value
    : undefined
}
