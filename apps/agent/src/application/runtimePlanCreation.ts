import type { AgentStore } from '../state/store.js'
import type {
  AgentPlan,
  AgentTask,
  AgentThread,
  CreatePlanInput,
  CreatePlanTaskInput,
} from '../state/types.js'
import { buildAgentPlan } from '../state/planFactory.js'
import { buildAndValidatePlanTasksToCreate } from '../state/planTaskCreation.js'

export interface RuntimePlanCreationResult {
  plan: AgentPlan
  tasks: AgentTask[]
}

export function createRuntimePlanWithTasks(input: {
  store: Pick<AgentStore, 'getTask' | 'createPlan' | 'createTask'>
  planId: string
  thread: AgentThread
  planInput: CreatePlanInput
  taskInputs: CreatePlanTaskInput[]
  now: string
  goal?: string
  plannerSource?: string
  plannerWarnings?: string[]
}): RuntimePlanCreationResult {
  const plan = buildAgentPlan({
    id: input.planId,
    thread: input.thread,
    planInput: input.planInput,
    taskCount: input.taskInputs.length,
    now: input.now,
    ...(input.goal ? { goal: input.goal } : {}),
    ...(input.plannerSource ? { plannerSource: input.plannerSource } : {}),
    ...(input.plannerWarnings && input.plannerWarnings.length > 0 ? { plannerWarnings: input.plannerWarnings } : {}),
  })
  const tasks = buildAndValidatePlanTasksToCreate({
    planId: plan.id,
    inputs: input.taskInputs,
    now: input.now,
    getTask: (taskId) => input.store.getTask(taskId),
  })

  input.store.createPlan(plan)
  for (const task of tasks) input.store.createTask(task)

  return { plan, tasks }
}
