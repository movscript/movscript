import type { AgentPlan, AgentRun, AgentTask } from '../state/types.js'

export interface SupervisorDispatchInput {
  plan: AgentPlan
  tasks: AgentTask[]
  runs: AgentRun[]
  maxWorkers?: number
}

export interface SupervisorDispatchDecision {
  runnableTasks: AgentTask[]
  blockedTasks: Array<{ task: AgentTask; blockedReason: string }>
}

export function planSupervisorDispatch(input: SupervisorDispatchInput): SupervisorDispatchDecision {
  const maxWorkers = normalizePositiveInteger(input.maxWorkers) ?? 1
  const tasksById = new Map(input.tasks.map((task) => [task.id, task]))
  const activeWorkerTaskIds = new Set(input.runs
    .filter((run) => run.role === 'worker' && (run.status === 'queued' || run.status === 'in_progress' || run.status === 'requires_action'))
    .flatMap((run) => run.taskId ? [run.taskId] : []))
  const activeWorkerCount = activeWorkerTaskIds.size
  const availableSlots = Math.max(0, maxWorkers - activeWorkerCount)
  const runnableTasks: AgentTask[] = []
  const blockedTasks: Array<{ task: AgentTask; blockedReason: string }> = []

  for (const task of input.tasks) {
    if (runnableTasks.length >= availableSlots) break
    if (task.status !== 'pending') continue
    if (activeWorkerTaskIds.has(task.id) || task.ownerRunId) continue

    const unresolvedDeps = task.deps.filter((depId) => tasksById.get(depId)?.status !== 'done')
    if (unresolvedDeps.length > 0) {
      blockedTasks.push({ task, blockedReason: `Waiting for dependency task(s): ${unresolvedDeps.join(', ')}` })
      continue
    }
    runnableTasks.push(task)
  }

  return { runnableTasks, blockedTasks }
}

function normalizePositiveInteger(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return undefined
  return Math.max(1, Math.floor(number))
}
