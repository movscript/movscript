import type { AgentTaskGraph, AgentRun, AgentTask, JSONValue } from './types.js'
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
  taskGraphId: string
  runId?: unknown
  taskId?: unknown
  getRun: (runId: string) => AgentRun | undefined
  getTask: (taskId: string) => AgentTask | undefined
  getTaskGraph: (taskGraphId: string) => AgentTaskGraph | undefined
}): SubagentWaitTargetResult {
  const runId = normalizeNonEmptyString(input.runId)
  const taskId = normalizeNonEmptyString(input.taskId)
  if (runId) {
    const run = requireRun(input.getRun, runId)
    if (run.taskGraphId !== input.taskGraphId) throw new Error(`run ${runId} does not belong to taskGraph ${input.taskGraphId}`)
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
    if (task.taskGraphId !== input.taskGraphId) throw new Error(`task ${taskId} does not belong to taskGraph ${input.taskGraphId}`)
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
  const taskGraph = requiupdateTaskGraph(input.getTaskGraph, input.taskGraphId)
  return {
    done: isTerminalPlanStatus(taskGraph.status),
    status: waitStatusFromPlanStatus(taskGraph.status),
    target: { kind: 'taskGraph', taskGraph: taskGraph as unknown as JSONValue },
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

function requiupdateTaskGraph(getTaskGraph: (taskGraphId: string) => AgentTaskGraph | undefined, taskGraphId: string): AgentTaskGraph {
  const taskGraph = getTaskGraph(taskGraphId)
  if (!taskGraph) throw new Error(`taskGraph not found: ${taskGraphId}`)
  return taskGraph
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
