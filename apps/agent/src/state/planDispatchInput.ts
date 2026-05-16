import type { AgentPlan, AgentRun, AgentTask, CreateRunInput, DispatchPlanInput } from './types.js'
import { normalizePositiveInteger, normalizeStringList } from './planTaskInput.js'
import { buildAgentRunTaskInputSnapshot } from './runInput.js'
import { formatWorkerTaskMessage } from './workerTaskPrompt.js'

export interface NormalizedDispatchPlanControls {
  plannerRunId: string
  maxTaskAttempts: number
  retryFailed: boolean
  requestedTaskIds: string[]
  maxWorkers?: number
  workerTimeoutMs?: number
}

export function normalizeDispatchPlanId(value: unknown): string {
  const planId = normalizeNonEmptyString(value)
  if (!planId) throw new Error('planId is required')
  return planId
}

export function normalizeDispatchPlanControls(input: DispatchPlanInput, plan: AgentPlan): NormalizedDispatchPlanControls {
  const plannerRunId = normalizeNonEmptyString(input.plannerRunId) ?? plan.rootRunId
  if (!plannerRunId) throw new Error(`plan ${plan.id} has no plannerRunId`)
  return {
    plannerRunId,
    maxTaskAttempts: normalizePositiveInteger(input.maxTaskAttempts) ?? 1,
    retryFailed: input.retryFailed === true,
    requestedTaskIds: uniqueStrings(normalizeStringList(input.taskIds)),
    ...(normalizePositiveInteger(input.maxWorkers) !== undefined ? { maxWorkers: normalizePositiveInteger(input.maxWorkers) } : {}),
    ...(normalizePositiveInteger(input.workerTimeoutMs) !== undefined ? { workerTimeoutMs: normalizePositiveInteger(input.workerTimeoutMs) } : {}),
  }
}

export function assertDispatchPlannerRunForPlan(plannerRun: AgentRun, plan: AgentPlan): void {
  if (plannerRun.planId && plannerRun.planId !== plan.id) {
    throw new Error(`planner run ${plannerRun.id} does not belong to plan ${plan.id}`)
  }
}

export function assertDispatchRequestedTasks(input: {
  planId: string
  taskIds: string[]
  getTask: (taskId: string) => AgentTask | undefined
}): void {
  for (const taskId of input.taskIds) {
    const task = input.getTask(taskId)
    if (!task) throw new Error(`task not found: ${taskId}`)
    if (task.planId !== input.planId) throw new Error(`task ${taskId} does not belong to plan ${input.planId}`)
  }
}

export function buildDispatchWorkerRunInput(input: {
  plan: AgentPlan
  plannerRun: AgentRun
  task: AgentTask
  subagentName: string
  dispatchInput: DispatchPlanInput
}): CreateRunInput {
  return {
    threadId: input.plan.threadId,
    userMessage: formatWorkerTaskMessage(input.plan, input.task),
    task: buildAgentRunTaskInputSnapshot(input.task),
    role: 'worker',
    parentRunId: input.plannerRun.id,
    planId: input.plan.id,
    taskId: input.task.id,
    progress: 0,
    metadata: { subagentName: input.subagentName },
    agentManifest: input.dispatchInput.agentManifest ?? input.plannerRun.agentManifest,
    approvedToolNames: input.dispatchInput.approvedToolNames,
    policy: input.dispatchInput.policy ?? input.plannerRun.policy,
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
