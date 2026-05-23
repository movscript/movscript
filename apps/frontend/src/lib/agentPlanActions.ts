import { plannerRunIdForPlanAction } from '@/lib/agentPlanUi'
import type { AssistantConversationMessageAppender } from '@movscript/conversation'
import type { AgentTaskGraphSnapshot, AgentRun, AgentTask, DispatchTaskGraphResult, UpdateTaskGraphResult } from '@/lib/localAgentClient'
import type { ChatMessage } from '@/store/agentStore'

export type PlanDispatchSettings = {
  maxWorkers: number
  maxTaskAttempts: number
  workerTimeoutMs: number
}

export type PlanConversationRuntimePatch = {
  loading?: boolean
  stopping?: boolean
}

export interface AgentPlanActionDeps {
  setBusy: (busy: boolean) => void
  setConversationRun: (run: AgentRun, patch: PlanConversationRuntimePatch) => void
  addAssistantMessage: AssistantConversationMessageAppender<ChatMessage['meta']>
  dispatchTaskGraph: (taskGraphId: string, input: {
    plannerRunId?: string
    maxWorkers?: number
    maxTaskAttempts?: number
    workerTimeoutMs?: number
  }) => Promise<DispatchTaskGraphResult>
  replanRun: (runId: string, input: {
    resetBlocked?: boolean
    resetNeedsReview?: boolean
    resetFailed?: boolean
    resetCancelled?: boolean
    resetTaskIds?: string[]
    retryFailed?: boolean
    maxWorkers?: number
    maxTaskAttempts?: number
    workerTimeoutMs?: number
  }) => Promise<UpdateTaskGraphResult>
  updateTask: (taskId: string, input: Partial<AgentTask>) => Promise<AgentTask>
  cancelRunTree: (runId: string, input: { reason?: string }) => Promise<unknown>
  getRun: (runId: string) => Promise<AgentRun>
  refetchPlanSnapshot: () => Promise<unknown>
}

export async function dispatchTaskGraphAction(input: {
  run: AgentRun | null
  snapshot?: AgentTaskGraphSnapshot | null
  settings: PlanDispatchSettings
  deps: AgentPlanActionDeps
}): Promise<boolean> {
  const { run, snapshot, settings, deps } = input
  const taskGraphId = snapshot?.taskGraph.id ?? run?.taskGraphId
  const plannerRunId = plannerRunIdForPlanAction(snapshot ?? undefined, run)
  if (!run || !taskGraphId || !plannerRunId) return false

  deps.setBusy(true)
  try {
    const result = await deps.dispatchTaskGraph(taskGraphId, {
      plannerRunId,
      maxWorkers: settings.maxWorkers,
      maxTaskAttempts: settings.maxTaskAttempts,
      workerTimeoutMs: settings.workerTimeoutMs,
    })
    const plannerRun = await deps.getRun(plannerRunId).catch(() => run)
    deps.setConversationRun(plannerRun, { loading: result.spawnedRuns.length > 0 })
    await deps.refetchPlanSnapshot()
    return true
  } catch (error) {
    deps.addAssistantMessage(`计划调度失败：${errorMessage(error)}`)
    return false
  } finally {
    deps.setBusy(false)
  }
}

export async function replanPlanAction(input: {
  run: AgentRun | null
  snapshot?: AgentTaskGraphSnapshot | null
  settings: PlanDispatchSettings
  deps: AgentPlanActionDeps
}): Promise<boolean> {
  const { run, snapshot, settings, deps } = input
  const plannerRunId = plannerRunIdForPlanAction(snapshot ?? undefined, run)
  if (!run?.taskGraphId || !plannerRunId) return false

  deps.setBusy(true)
  try {
    const result = await deps.replanRun(plannerRunId, {
      resetBlocked: true,
      resetNeedsReview: true,
      resetFailed: true,
      resetCancelled: true,
      retryFailed: true,
      maxTaskAttempts: settings.maxTaskAttempts,
      maxWorkers: settings.maxWorkers,
      workerTimeoutMs: settings.workerTimeoutMs,
    })
    const plannerRun = await deps.getRun(plannerRunId).catch(() => run)
    deps.setConversationRun(plannerRun, { loading: (result.dispatch?.spawnedRuns.length ?? 0) > 0 })
    await deps.refetchPlanSnapshot()
    return true
  } catch (error) {
    deps.addAssistantMessage(`计划重规划失败：${errorMessage(error)}`)
    return false
  } finally {
    deps.setBusy(false)
  }
}

export async function acceptPlanTaskReviewAction(input: {
  taskId: string
  deps: AgentPlanActionDeps
  now?: () => Date
}): Promise<boolean> {
  const { taskId, deps, now = () => new Date() } = input
  deps.setBusy(true)
  try {
    await deps.updateTask(taskId, {
      status: 'done',
      progress: 1,
      blockedReason: '',
      metadata: {
        reviewOutcome: 'accepted',
        reviewedAt: now().toISOString(),
      },
    })
    await deps.refetchPlanSnapshot()
    return true
  } catch (error) {
    deps.addAssistantMessage(`验收任务失败：${errorMessage(error)}`)
    return false
  } finally {
    deps.setBusy(false)
  }
}

export async function rejectPlanTaskReviewAction(input: {
  taskId: string
  deps: AgentPlanActionDeps
  now?: () => Date
}): Promise<boolean> {
  const { taskId, deps, now = () => new Date() } = input
  deps.setBusy(true)
  try {
    await deps.updateTask(taskId, {
      status: 'cancelled',
      progress: 1,
      blockedReason: 'User rejected review.',
      metadata: {
        reviewOutcome: 'rejected',
        reviewedAt: now().toISOString(),
      },
    })
    await deps.refetchPlanSnapshot()
    return true
  } catch (error) {
    deps.addAssistantMessage(`拒绝任务失败：${errorMessage(error)}`)
    return false
  } finally {
    deps.setBusy(false)
  }
}

export async function reworkPlanTaskReviewAction(input: {
  taskId: string
  run: AgentRun | null
  snapshot?: AgentTaskGraphSnapshot | null
  settings: PlanDispatchSettings
  deps: AgentPlanActionDeps
}): Promise<boolean> {
  const { taskId, run, snapshot, settings, deps } = input
  const plannerRunId = plannerRunIdForPlanAction(snapshot ?? undefined, run)
  if (!run?.taskGraphId || !plannerRunId) return false

  deps.setBusy(true)
  try {
    const result = await deps.replanRun(plannerRunId, {
      resetTaskIds: [taskId],
      maxWorkers: 1,
      retryFailed: true,
      maxTaskAttempts: settings.maxTaskAttempts,
      workerTimeoutMs: settings.workerTimeoutMs,
    })
    const plannerRun = await deps.getRun(plannerRunId).catch(() => run)
    deps.setConversationRun(plannerRun, { loading: (result.dispatch?.spawnedRuns.length ?? 0) > 0 })
    await deps.refetchPlanSnapshot()
    return true
  } catch (error) {
    deps.addAssistantMessage(`返工任务失败：${errorMessage(error)}`)
    return false
  } finally {
    deps.setBusy(false)
  }
}

export async function cancelPlanTreeAction(input: {
  run: AgentRun | null
  snapshot?: AgentTaskGraphSnapshot | null
  deps: AgentPlanActionDeps
}): Promise<boolean> {
  const { run, snapshot, deps } = input
  const rootRunId = plannerRunIdForPlanAction(snapshot ?? undefined, run)
  if (!run || !rootRunId) return false

  deps.setBusy(true)
  try {
    await deps.cancelRunTree(rootRunId, { reason: '用户停止了当前计划树。' })
    const latestRun = await deps.getRun(rootRunId).catch(() => run)
    deps.setConversationRun(latestRun, { loading: false, stopping: false })
    await deps.refetchPlanSnapshot()
    return true
  } catch (error) {
    deps.addAssistantMessage(`取消计划树失败：${errorMessage(error)}`)
    return false
  } finally {
    deps.setBusy(false)
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
