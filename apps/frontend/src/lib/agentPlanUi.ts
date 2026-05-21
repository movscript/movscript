import type { AgentPlanSnapshot, AgentPlanStatus, AgentRun, AgentTask } from './localAgentClient'
import { agentPlanStatusLabel, runStatusLabel } from './agentRunUi'
import { runHasWorkflowInteraction } from './agentWorkflowInteraction'

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

export function activeWorkerRunCount(snapshot: AgentPlanSnapshot): number {
  return snapshot.runs.filter((run) => run.role === 'worker' && STOPPABLE_AGENT_RUN_STATUSES.has(run.status)).length
}

export interface AgentPlanTaskView {
  task: AgentTask
  subagentName?: string
  ownerLabel?: string
  ownerRun?: AgentRun
  worker?: AgentPlanWorkerView
  waitingInputCount: number
  waitingApprovalCount: number
  pendingInputs: AgentPlanInputView[]
  pendingApprovals: AgentPlanApprovalView[]
  artifactCount: number
  artifactLabels: string[]
  artifactDetails: AgentPlanArtifactView[]
  retryAttempt?: number
  maxTaskAttempts?: number
  previousOwnerRunId?: string
  previousStatus?: AgentTask['status']
  timedOutRunId?: string
  workerTimeoutMs?: number
  blocker?: string
  statusExplanation: string
}

export interface AgentPlanWorkerView {
  id: string
  subagentName?: string
  status: AgentRun['status']
  role?: AgentRun['role']
  parentRunId?: string
  taskId?: string
  progress?: number
  startedAt?: string
  completedAt?: string
  failedAt?: string
  cancelledAt?: string
  updatedAt: string
  error?: string
  warnings: string[]
  stepCount: number
  recentSteps: AgentPlanWorkerStepView[]
}

export interface AgentPlanWorkerStepView {
  id: string
  type: string
  status: string
  title: string
  toolName?: string
  error?: string
  sandboxed?: boolean
  createdAt: string
  completedAt?: string
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
  taskId?: string
  taskTitle?: string
  uri?: string
  sourceRunId?: string
  sourceTaskId?: string
  sourceTaskTitle?: string
  sourceTaskStatus?: AgentTask['status']
  sourceTaskOwnerRunId?: string
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

export interface AgentPlanNameConflictView {
  subagentName: string
  taskIds: string[]
  taskTitles: string[]
  entries: AgentPlanNameConflictEntry[]
  label: string
}

export interface AgentPlanNameConflictEntry {
  taskId: string
  taskTitle: string
  taskStatus?: AgentTask['status']
  ownerRunId?: string
  ownerRunStatus?: AgentRun['status']
}

export interface AgentPlanOverviewStats {
  taskCount: number
  completedTaskCount: number
  activeWorkerCount: number
  artifactCount: number
  nameConflictCount: number
}

export function buildPlanOverviewStats(snapshot: AgentPlanSnapshot): AgentPlanOverviewStats {
  const summary = snapshot.summary
  return {
    taskCount: summary?.taskCount ?? snapshot.tasks.length,
    completedTaskCount: summary?.taskStatusCounts.done ?? snapshot.tasks.filter((task) => task.status === 'done').length,
    activeWorkerCount: summary?.activeWorkerCount ?? activeWorkerRunCount(snapshot),
    artifactCount: summary?.artifactCount ?? snapshot.tasks.reduce((count, task) => count + task.artifacts.length, 0),
    nameConflictCount: summary?.nameConflictCount ?? buildPlanNameConflictViews(snapshot).length,
  }
}

export function buildPlanNameConflictViews(snapshot: AgentPlanSnapshot): AgentPlanNameConflictView[] {
  const tasksById = new Map(snapshot.tasks.map((task) => [task.id, task]))
  const runsById = new Map(snapshot.runs.map((run) => [run.id, run]))
  return (snapshot.nameConflicts ?? [])
    .filter((conflict) => typeof conflict.subagentName === 'string' && Array.isArray(conflict.taskIds) && conflict.taskIds.length > 1)
    .map((conflict) => {
      const taskIds = conflict.taskIds.filter((taskId): taskId is string => typeof taskId === 'string' && taskId.trim().length > 0)
      const entries = taskIds.map((taskId) => {
        const task = tasksById.get(taskId)
        const ownerRun = task?.ownerRunId ? runsById.get(task.ownerRunId) : undefined
        return {
          taskId,
          taskTitle: task?.title ?? taskId,
          taskStatus: task?.status,
          ownerRunId: task?.ownerRunId,
          ownerRunStatus: ownerRun?.status,
        }
      })
      const taskTitles = entries.map((entry) => entry.taskTitle)
      return {
        subagentName: conflict.subagentName,
        taskIds,
        taskTitles,
        entries,
        label: `${conflict.subagentName}: ${taskTitles.join(', ')}`,
      }
    })
}

export function buildPlanStatusExplanation(snapshot: AgentPlanSnapshot): string {
  const nameConflicts = buildPlanNameConflictViews(snapshot)
  const counts = snapshot.summary?.taskStatusCounts ?? snapshot.tasks.reduce<Record<AgentTask['status'], number>>((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1
    return acc
  }, { pending: 0, running: 0, blocked: 0, needs_review: 0, done: 0, failed: 0, cancelled: 0 })
  const activeRuns = snapshot.summary?.activeWorkerCount ?? activeWorkerRunCount(snapshot)
  const nameConflictCount = snapshot.summary?.nameConflictCount ?? nameConflicts.length
  const parts: string[] = []
  if (nameConflictCount > 0) parts.push(`${nameConflictCount} 个子代理重名`)
  if (activeRuns > 0) parts.push(`${activeRuns} 个执行器运行中`)
  if (counts.blocked > 0) parts.push(`${counts.blocked} 个被阻塞`)
  if (counts.needs_review > 0) parts.push(`${counts.needs_review} 个待复核`)
  if (counts.failed > 0) parts.push(`${counts.failed} 个失败`)
  if (counts.cancelled > 0) parts.push(`${counts.cancelled} 个已取消`)
  if (counts.pending > 0) parts.push(`${counts.pending} 个待开始`)
  if (parts.length > 0) return parts.join(' · ')
  if (snapshot.tasks.length > 0 && counts.done === snapshot.tasks.length) return '所有任务已完成。'
  if (snapshot.tasks.length === 0) return '还没有计划任务。'
  return agentPlanStatusLabel(snapshot.plan.status)
}

export function agentTaskStatusLabel(status: AgentTask['status'] | undefined): string {
  switch (status) {
    case 'pending': return '待开始'
    case 'running': return '执行中'
    case 'blocked': return '被阻塞'
    case 'needs_review': return '待复核'
    case 'done': return '已完成'
    case 'failed': return '失败'
    case 'cancelled': return '已取消'
    default: return status ? `未知任务状态 (${status})` : '-'
  }
}

export function buildPlanTaskViews(snapshot: AgentPlanSnapshot): AgentPlanTaskView[] {
  const runsById = new Map(snapshot.runs.map((run) => [run.id, run]))
  const tasksById = new Map(snapshot.tasks.map((task) => [task.id, task]))
  return [...snapshot.tasks]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((task) => {
      const ownerRun = task.ownerRunId ? runsById.get(task.ownerRunId) : undefined
      const subagentName = typeof task.metadata?.subagentName === 'string' && task.metadata.subagentName.trim()
        ? task.metadata.subagentName.trim()
        : runSubagentName(ownerRun)
      const pendingInputs = ownerRun?.pendingInputRequests?.filter((request) => request.status === 'pending') ?? []
      const pendingApprovals = ownerRun?.pendingApprovals?.filter((approval) => approval.status === 'pending') ?? []
      const artifactDetails = task.artifacts.map((artifact) => formatArtifactView(artifact, task, tasksById)).filter((artifact): artifact is AgentPlanArtifactView => !!artifact)
      const artifactLabels = artifactDetails.map((artifact) => artifact.label).slice(0, 2)
      const retryAttempt = positiveInteger(task.metadata?.retryAttempt)
      const maxTaskAttempts = positiveInteger(task.metadata?.maxTaskAttempts)
      const previousOwnerRunId = nonEmptyString(task.metadata?.previousOwnerRunId)
      const previousStatus = taskStatus(task.metadata?.previousStatus)
      const timedOutRunId = nonEmptyString(task.metadata?.timedOutRunId)
      const workerTimeoutMs = positiveInteger(task.metadata?.workerTimeoutMs)
      const blocker = task.blockedReason ?? ownerRun?.blockedReason
      return {
        task,
        subagentName,
        ownerLabel: subagentName ?? task.ownerRunId,
        ownerRun,
        worker: ownerRun ? formatWorkerView(ownerRun) : undefined,
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
        maxTaskAttempts,
        previousOwnerRunId,
        previousStatus,
        timedOutRunId,
        workerTimeoutMs,
        blocker,
        statusExplanation: taskStatusExplanation({
          task,
          ownerRun,
          pendingInputCount: pendingInputs.length,
          pendingApprovalCount: pendingApprovals.length,
          blocker,
        }),
      }
    })
}

function taskStatusExplanation(input: {
  task: AgentTask
  ownerRun?: AgentRun
  pendingInputCount: number
  pendingApprovalCount: number
  blocker?: string
}): string {
  if (input.pendingInputCount > 0) return `等待 ${input.pendingInputCount} 个用户输入。`
  if (input.pendingApprovalCount > 0) return `等待 ${input.pendingApprovalCount} 个审批。`
  if (input.task.status === 'blocked') return input.blocker ? `被阻塞：${input.blocker}` : '等待规划器解决下一步。'
  if (input.task.status === 'needs_review') return '等待规划器或用户复核。'
  if (input.task.status === 'running') return input.ownerRun ? `执行器状态：${runStatusLabel(input.ownerRun.status)}。` : '执行器正在执行。'
  if (input.task.status === 'failed') return input.blocker ? `失败：${input.blocker}` : '执行器任务失败。'
  if (input.task.status === 'cancelled') return input.blocker ? `已取消：${input.blocker}` : '执行器任务已取消。'
  if (input.task.status === 'done') return '任务已完成。'
  return '依赖满足且执行器有容量后即可开始。'
}

function formatWorkerView(run: AgentRun): AgentPlanWorkerView {
  return {
    id: run.id,
    subagentName: runSubagentName(run),
    status: run.status,
    role: run.role,
    parentRunId: run.parentRunId,
    taskId: run.taskId,
    progress: run.progress,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    failedAt: run.failedAt,
    cancelledAt: run.cancelledAt,
    updatedAt: run.updatedAt,
    error: run.error,
    warnings: run.warnings ?? [],
    stepCount: run.steps.length,
    recentSteps: [...run.steps]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 3)
      .map((step) => ({
        id: step.id,
        type: step.type,
        status: step.status,
        title: step.title ?? step.toolName ?? step.type,
        toolName: step.toolName,
        error: step.error,
        sandboxed: step.sandboxed,
        createdAt: step.createdAt,
        completedAt: step.completedAt,
      })),
  }
}

function runSubagentName(run: AgentRun | undefined): string | undefined {
  return nonEmptyString(run?.metadata?.subagentName)
}

export function buildPlanArtifactSummary(snapshot: AgentPlanSnapshot): AgentPlanArtifactSummary {
  const tasksById = new Map(snapshot.tasks.map((task) => [task.id, task]))
  const artifacts = [...snapshot.tasks]
    .flatMap((task) => task.artifacts
      .map((artifact) => ({
        artifact,
        task,
        createdAt: artifact.createdAt,
      })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ artifact, task }) => formatArtifactView(artifact, task, tasksById))
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

export function buildTaskArtifactViews(task: AgentTask, limit?: number, snapshot?: AgentPlanSnapshot): AgentPlanArtifactView[] {
  const tasksById = snapshot ? new Map(snapshot.tasks.map((item) => [item.id, item])) : undefined
  const artifacts = [...task.artifacts]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((artifact) => formatArtifactView(artifact, task, tasksById))
    .filter((artifact): artifact is AgentPlanArtifactView => !!artifact)
  return typeof limit === 'number' && limit >= 0 ? artifacts.slice(0, limit) : artifacts
}

export function actionableRunForPlan(snapshot: AgentPlanSnapshot | undefined, activeRun: AgentRun | null | undefined): AgentRun | null {
  return actionableRunsForPlan(snapshot, activeRun)[0] ?? null
}

export function actionableRunsForPlan(snapshot: AgentPlanSnapshot | undefined, activeRun: AgentRun | null | undefined): AgentRun[] {
  return collectPlanRuns(snapshot, activeRun, runNeedsUserAction)
}

export function interactionRunsForPlan(snapshot: AgentPlanSnapshot | undefined, activeRun: AgentRun | null | undefined): AgentRun[] {
  return collectPlanRuns(snapshot, activeRun, runHasWorkflowInteraction)
}

function collectPlanRuns(snapshot: AgentPlanSnapshot | undefined, activeRun: AgentRun | null | undefined, predicate: (run: AgentRun) => boolean): AgentRun[] {
  const runs: AgentRun[] = []
  const seen = new Set<string>()
  const add = (run: AgentRun | null | undefined) => {
    if (!run || !predicate(run) || seen.has(run.id)) return
    seen.add(run.id)
    runs.push(run)
  }

  add(activeRun)
  if (!snapshot) return runs
  const taskViews = buildPlanTaskViews(snapshot)
  for (const view of taskViews) add(view.ownerRun)
  for (const run of snapshot.runs) add(run)
  return runs
}

export function runNeedsUserAction(run: AgentRun): boolean {
  return run.status === 'requires_action'
    && (
      (run.pendingApprovals ?? []).some((approval) => approval.status === 'pending')
      || (run.pendingInputRequests ?? []).some((request) => request.status === 'pending')
    )
}

function formatArtifactView(
  artifact: AgentTask['artifacts'][number],
  task?: AgentTask,
  tasksById?: Map<string, AgentTask>,
): AgentPlanArtifactView | undefined {
  const base = artifact.title || artifact.type || artifact.uri
  if (!base) return undefined
  const metadata = artifact.metadata
  const subagentName = nonEmptyString(metadata?.subagentName)
  const sourceRunId = nonEmptyString(metadata?.sourceRunId)
  const sourceTaskId = nonEmptyString(metadata?.sourceTaskId)
  const sourceTask = sourceTaskId ? tasksById?.get(sourceTaskId) : undefined
  const sourceTaskTitle = sourceTask?.title
  const toolName = nonEmptyString(metadata?.toolName)
  const policy = nonEmptyString(metadata?.policy)
  const source = subagentName ?? sourceRunId
  return {
    id: artifact.id,
    label: source ? `${base} · ${source}` : base,
    type: artifact.type,
    taskId: task?.id,
    taskTitle: task?.title,
    uri: artifact.uri,
    sourceRunId,
    sourceTaskId,
    sourceTaskTitle,
    sourceTaskStatus: sourceTask?.status,
    sourceTaskOwnerRunId: sourceTask?.ownerRunId,
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
