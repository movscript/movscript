import type { AgentPlan, AgentRun, AgentTask, JSONValue } from './types.js'
import { subagentNameFromTask } from './subagentIdentity.js'
import {
  isTerminalPlanStatus,
  isTerminalRunStatus,
  toSubagentRunSummary,
  waitStatusFromPlanStatus,
  waitStatusFromRunStatus,
  waitStatusFromTaskStatus,
  type SubagentWaitStatus,
} from './subagentRunView.js'

export interface SubagentWaitTargetResult {
  done: boolean
  status: SubagentWaitStatus
  target: Record<string, JSONValue>
}

export function resolveSubagentWaitTarget(input: {
  planId: string
  runId?: unknown
  taskId?: unknown
  getRun: (runId: string) => AgentRun | undefined
  getTask: (taskId: string) => AgentTask | undefined
  getPlan: (planId: string) => AgentPlan | undefined
}): SubagentWaitTargetResult {
  const runId = normalizeNonEmptyString(input.runId)
  const taskId = normalizeNonEmptyString(input.taskId)
  if (runId) {
    const run = requireRun(input.getRun, runId)
    if (run.planId !== input.planId) throw new Error(`run ${runId} does not belong to plan ${input.planId}`)
    return {
      done: isTerminalRunStatus(run.status),
      status: waitStatusFromRunStatus(run.status),
      target: {
        kind: 'run',
        run: toSubagentRunSummary(run, run.taskId ? input.getTask(run.taskId) : undefined) as unknown as JSONValue,
      },
    }
  }
  if (taskId) {
    const task = requireTask(input.getTask, taskId)
    if (task.planId !== input.planId) throw new Error(`task ${taskId} does not belong to plan ${input.planId}`)
    return {
      done: task.status === 'done' || task.status === 'failed' || task.status === 'cancelled' || task.status === 'blocked',
      status: waitStatusFromTaskStatus(task.status),
      target: {
        kind: 'task',
        task: {
          ...task,
          ...(subagentNameFromTask(task) ? { subagentName: subagentNameFromTask(task) } : {}),
        } as unknown as JSONValue,
      },
    }
  }
  const plan = requirePlan(input.getPlan, input.planId)
  return {
    done: isTerminalPlanStatus(plan.status),
    status: waitStatusFromPlanStatus(plan.status),
    target: { kind: 'plan', plan: plan as unknown as JSONValue },
  }
}

function requireRun(getRun: (runId: string) => AgentRun | undefined, runId: string): AgentRun {
  const run = getRun(runId)
  if (!run) throw new Error(`run not found: ${runId}`)
  return run
}

function requireTask(getTask: (taskId: string) => AgentTask | undefined, taskId: string): AgentTask {
  const task = getTask(taskId)
  if (!task) throw new Error(`task not found: ${taskId}`)
  return task
}

function requirePlan(getPlan: (planId: string) => AgentPlan | undefined, planId: string): AgentPlan {
  const plan = getPlan(planId)
  if (!plan) throw new Error(`plan not found: ${planId}`)
  return plan
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
