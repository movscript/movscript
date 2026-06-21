import type { AgentTaskGraphSnapshot, AgentTaskGraphStatus, AgentRun, AgentTask } from '@movscript/core/agent/protocol'
import { agentPlanStatusLabel, runStatusLabel } from '@/features/agent/domain/agentRunUi'
import { runHasRunInteraction } from '@/features/agent/domain/agentRunInteraction'
import { isAgentRunStoppableStatus, isAgentRunTerminalStatus } from '@movscript/core/agent/protocol'
import { formatPlanArtifactView, type AgentPlanArtifactView } from '@/features/agent/domain/agentPlanArtifactUi'

export {
  buildPlanArtifactSummary,
  buildTaskArtifactViews,
  type AgentPlanArtifactSummary,
  type AgentPlanArtifactView,
} from '@/features/agent/domain/agentPlanArtifactUi'

const TERMINAL_AGENT_TASK_GRAPH_STATUSES = new Set<AgentTaskGraphStatus>(['done', 'failed', 'cancelled'])

export function shouldPollPlanSnapshot(snapshot: AgentTaskGraphSnapshot | undefined, activeRun: AgentRun | null | undefined): boolean {
  if (snapshot) {
    if (!TERMINAL_AGENT_TASK_GRAPH_STATUSES.has(snapshot.taskGraph.status)) return true
    return snapshot.runs.some((run) => isAgentRunStoppableStatus(run.status))
  }
  return !!activeRun?.taskGraphId && !isAgentRunTerminalStatus(activeRun.status)
}

export function plannerRunIdForPlanAction(snapshot: AgentTaskGraphSnapshot | undefined, activeRun: AgentRun | null | undefined): string | undefined {
  return snapshot?.taskGraph.rootRunId
    ?? (activeRun?.role === 'planner' ? activeRun.id : activeRun?.parentRunId)
}

export function activeWorkerRunCount(snapshot: AgentTaskGraphSnapshot): number {
  return snapshot.runs.filter((run) => run.role === 'worker' && isAgentRunStoppableStatus(run.status)).length
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
  providerSessionTreeId?: string
  /** @deprecated Prefer providerSessionTreeId for related-thread provider-session trees. */
  sessionId?: string // deprecated providerSessionTreeId compatibility mirror
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

export function buildPlanOverviewStats(snapshot: AgentTaskGraphSnapshot): AgentPlanOverviewStats {
  const summary = snapshot.summary
  return {
    taskCount: summary?.taskCount ?? snapshot.tasks.length,
    completedTaskCount: summary?.taskStatusCounts.done ?? snapshot.tasks.filter((task) => task.status === 'done').length,
    activeWorkerCount: summary?.activeWorkerCount ?? activeWorkerRunCount(snapshot),
    artifactCount: summary?.artifactCount ?? snapshot.tasks.reduce((count, task) => count + task.artifacts.length, 0),
    nameConflictCount: summary?.nameConflictCount ?? buildPlanNameConflictViews(snapshot).length,
  }
}

export function buildPlanNameConflictViews(snapshot: AgentTaskGraphSnapshot): AgentPlanNameConflictView[] {
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

export function buildPlanStatusExplanation(snapshot: AgentTaskGraphSnapshot): string {
  const nameConflicts = buildPlanNameConflictViews(snapshot)
  const counts = snapshot.summary?.taskStatusCounts ?? snapshot.tasks.reduce<Record<AgentTask['status'], number>>((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1
    return acc
  }, { pending: 0, running: 0, blocked: 0, needs_review: 0, done: 0, failed: 0, cancelled: 0 })
  const activeRuns = snapshot.summary?.activeWorkerCount ?? activeWorkerRunCount(snapshot)
  const nameConflictCount = snapshot.summary?.nameConflictCount ?? nameConflicts.length
  const parts: string[] = []
  if (nameConflictCount > 0) parts.push(`${nameConflictCount} 个子 agent 重名`)
  if (activeRuns > 0) parts.push(`${activeRuns} 个执行器运行中`)
  if (counts.blocked > 0) parts.push(`${counts.blocked} 个被阻塞`)
  if (counts.needs_review > 0) parts.push(`${counts.needs_review} 个待复核`)
  if (counts.failed > 0) parts.push(`${counts.failed} 个失败`)
  if (counts.cancelled > 0) parts.push(`${counts.cancelled} 个已取消`)
  if (counts.pending > 0) parts.push(`${counts.pending} 个待开始`)
  if (parts.length > 0) return parts.join(' · ')
  if (snapshot.tasks.length > 0 && counts.done === snapshot.tasks.length) return '所有任务已完成。'
  if (snapshot.tasks.length === 0) return '还没有计划任务。'
  return agentPlanStatusLabel(snapshot.taskGraph.status)
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

export function buildPlanTaskViews(snapshot: AgentTaskGraphSnapshot): AgentPlanTaskView[] {
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
      const artifactDetails = task.artifacts.map((artifact) => formatPlanArtifactView(artifact, task, tasksById)).filter((artifact): artifact is AgentPlanArtifactView => !!artifact)
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
  const providerSessionTreeId = run.providerSessionTreeId?.trim() || run.sessionId?.trim()
  return {
    id: run.id,
    ...(providerSessionTreeId ? { providerSessionTreeId, sessionId: providerSessionTreeId } : {}),
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

export function actionableRunForTaskGraph(snapshot: AgentTaskGraphSnapshot | undefined, activeRun: AgentRun | null | undefined): AgentRun | null {
  return actionableRunsForTaskGraph(snapshot, activeRun)[0] ?? null
}

export function actionableRunsForTaskGraph(snapshot: AgentTaskGraphSnapshot | undefined, activeRun: AgentRun | null | undefined): AgentRun[] {
  return collectPlanRuns(snapshot, activeRun, runNeedsUserAction)
}

export function interactionRunsForTaskGraph(snapshot: AgentTaskGraphSnapshot | undefined, activeRun: AgentRun | null | undefined): AgentRun[] {
  return collectPlanRuns(snapshot, activeRun, runHasRunInteraction)
}

function collectPlanRuns(snapshot: AgentTaskGraphSnapshot | undefined, activeRun: AgentRun | null | undefined, predicate: (run: AgentRun) => boolean): AgentRun[] {
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
