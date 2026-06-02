import type { AgentTaskGraph, AgentRun, AgentTask, AgentThread, CreateRunInput, DispatchTaskGraphInput } from '../../../shared/types.js'
import { normalizePositiveInteger, normalizeStringList } from '../task/planTaskInput.js'
import { buildAgentRunTaskInputSnapshot } from '../../../run/input/snapshot/runInput.js'
import { formatWorkerTaskMessage } from '../../projection/prompt/workerTaskPrompt.js'

export interface NormalizedTaskGraphDispatchControls {
  plannerRunId: string
  maxTaskAttempts: number
  retryFailed: boolean
  requestedTaskIds: string[]
  maxWorkers?: number
  workerTimeoutMs?: number
}

export function normalizeDispatchTaskGraphId(value: unknown): string {
  const taskGraphId = normalizeNonEmptyString(value)
  if (!taskGraphId) throw new Error('taskGraphId is required')
  return taskGraphId
}

export function normalizeDispatchTaskGraphControls(input: DispatchTaskGraphInput, taskGraph: AgentTaskGraph): NormalizedTaskGraphDispatchControls {
  const plannerRunId = normalizeNonEmptyString(input.plannerRunId) ?? taskGraph.rootRunId
  if (!plannerRunId) throw new Error(`taskGraph ${taskGraph.id} has no plannerRunId`)
  return {
    plannerRunId,
    maxTaskAttempts: normalizePositiveInteger(input.maxTaskAttempts) ?? 1,
    retryFailed: input.retryFailed === true,
    requestedTaskIds: uniqueStrings(normalizeStringList(input.taskIds)),
    ...(normalizePositiveInteger(input.maxWorkers) !== undefined ? { maxWorkers: normalizePositiveInteger(input.maxWorkers) } : {}),
    ...(normalizePositiveInteger(input.workerTimeoutMs) !== undefined ? { workerTimeoutMs: normalizePositiveInteger(input.workerTimeoutMs) } : {}),
  }
}

export function assertDispatchTaskGraphnerRunForTaskGraph(plannerRun: AgentRun, taskGraph: AgentTaskGraph): void {
  if (plannerRun.taskGraphId && plannerRun.taskGraphId !== taskGraph.id) {
    throw new Error(`planner run ${plannerRun.id} does not belong to taskGraph ${taskGraph.id}`)
  }
}

export function assertDispatchRequestedTasks(input: {
  taskGraphId: string
  taskIds: string[]
  getTask: (taskId: string) => AgentTask | undefined
}): void {
  for (const taskId of input.taskIds) {
    const task = input.getTask(taskId)
    if (!task) throw new Error(`task not found: ${taskId}`)
    if (task.taskGraphId !== input.taskGraphId) throw new Error(`task ${taskId} does not belong to taskGraph ${input.taskGraphId}`)
  }
}

export function buildDispatchWorkerRunInput(input: {
  taskGraph: AgentTaskGraph
  plannerRun: AgentRun
  task: AgentTask
  workerThread?: AgentThread
  subagentName: string
  dispatchInput: DispatchTaskGraphInput
}): CreateRunInput {
  return {
    threadId: input.workerThread?.id ?? input.taskGraph.threadId,
    userMessage: formatWorkerTaskMessage(input.taskGraph, input.task),
    task: buildAgentRunTaskInputSnapshot(input.task),
    role: 'worker',
    parentRunId: input.plannerRun.id,
    taskGraphId: input.taskGraph.id,
    taskId: input.task.id,
    progress: 0,
    metadata: {
      subagentName: input.subagentName,
      ...(input.workerThread?.id ? { childThreadId: input.workerThread.id } : {}),
    },
    agentManifest: input.dispatchInput.agentManifest ?? input.plannerRun.agentManifest,
    approvedToolNames: input.dispatchInput.approvedToolNames,
    runtimeLimits: input.dispatchInput.runtimeLimits ?? input.plannerRun.runtimeLimits,
    backendAuthToken: input.dispatchInput.backendAuthToken,
    backendAPIBaseURL: input.dispatchInput.backendAPIBaseURL,
    sandboxMode: input.dispatchInput.sandboxMode,
  }
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values))
}
