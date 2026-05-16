import { isJSONRecord } from '../jsonValue.js'
import type { AgentPlan, AgentTask, AgentThread, CreatePlanInput, CreateRunInput } from './types.js'

export function normalizeCreatePlanThreadId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function createPlanGoal(input: Pick<CreatePlanInput, 'goal' | 'message'>): string | undefined {
  return normalizeNonEmptyString(input.goal) ?? normalizeNonEmptyString(input.message)
}

export function buildAgentPlan(input: {
  id: string
  thread: AgentThread
  planInput: CreatePlanInput
  taskCount: number
  now: string
  goal?: string
  plannerSource?: string
  plannerWarnings?: string[]
}): AgentPlan {
  const warnings = input.plannerWarnings ?? []
  return {
    id: input.id,
    threadId: input.thread.id,
    title: normalizeNonEmptyString(input.planInput.title) ?? input.thread.title ?? 'Agent plan',
    status: input.taskCount > 0 ? 'pending' : 'blocked',
    progress: 0,
    metadata: {
      ...(isJSONRecord(input.planInput.metadata) ? input.planInput.metadata : {}),
      ...(input.goal ? { goal: input.goal } : {}),
      ...(input.plannerSource ? { plannerSource: input.plannerSource } : {}),
      ...(warnings.length > 0 ? { plannerWarnings: warnings } : {}),
    },
    createdAt: input.now,
    updatedAt: input.now,
  }
}

export function buildCreatePlanPlannerRunInput(input: {
  plan: AgentPlan
  thread: AgentThread
  planInput: CreatePlanInput
  inlinePlannerTask?: AgentTask
}): CreateRunInput {
  return {
    threadId: input.thread.id,
    role: 'planner',
    planId: input.plan.id,
    ...(input.inlinePlannerTask ? { taskId: input.inlinePlannerTask.id } : {}),
    progress: 0,
    agentManifest: input.planInput.agentManifest,
    clientInput: input.planInput.clientInput,
    policy: input.planInput.policy,
    approvedToolNames: input.planInput.approvedToolNames,
    backendAuthToken: input.planInput.backendAuthToken,
    backendAPIBaseURL: input.planInput.backendAPIBaseURL,
    sandboxMode: input.planInput.sandboxMode,
    metadata: input.planInput.metadata,
  }
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
