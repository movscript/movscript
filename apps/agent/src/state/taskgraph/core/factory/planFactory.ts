import { cloneJSONValue, isJSONRecord } from '../../../../shared/json/jsonValue.js'
import type { AgentTaskGraph, AgentTask, AgentThread, CreateTaskGraphInput, CreateRunInput, JSONValue } from '../../../shared/types.js'

export function normalizeCreatePlanThreadId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function createTaskGraphGoal(input: Pick<CreateTaskGraphInput, 'goal' | 'message'>): string | undefined {
  return normalizeNonEmptyString(input.goal) ?? normalizeNonEmptyString(input.message)
}

export function buildAgentTaskGraph(input: {
  id: string
  thread: AgentThread
  planInput: CreateTaskGraphInput
  taskCount: number
  now: string
  goal?: string
  plannerSource?: string
  plannerWarnings?: string[]
  plannerAssessment?: Record<string, JSONValue>
}): AgentTaskGraph {
  const warnings = input.plannerWarnings ?? []
  return {
    id: input.id,
    sessionId: input.thread.sessionId,
    threadId: input.thread.id,
    title: normalizeNonEmptyString(input.planInput.title) ?? input.thread.title ?? 'Agent task graph',
    status: input.taskCount > 0 ? 'pending' : 'blocked',
    progress: 0,
    metadata: {
      ...(isJSONRecord(input.planInput.metadata) ? cloneJSONValue(input.planInput.metadata) : {}),
      ...(input.goal ? { goal: input.goal } : {}),
      ...(input.plannerSource ? { plannerSource: input.plannerSource } : {}),
      ...(warnings.length > 0 ? { plannerWarnings: [...warnings] } : {}),
      ...(input.plannerAssessment ? { plannerAssessment: cloneJSONValue(input.plannerAssessment) } : {}),
    },
    createdAt: input.now,
    updatedAt: input.now,
  }
}

export function buildCreatePlanPlannerRunInput(input: {
  taskGraph: AgentTaskGraph
  thread: AgentThread
  planInput: CreateTaskGraphInput
  inlinePlannerTask?: AgentTask
}): CreateRunInput {
  return {
    threadId: input.thread.id,
    role: 'planner',
    taskGraphId: input.taskGraph.id,
    ...(input.inlinePlannerTask ? { taskId: input.inlinePlannerTask.id } : {}),
    progress: 0,
    agentManifest: input.planInput.agentManifest,
    clientInput: input.planInput.clientInput,
    runtimeLimits: input.planInput.runtimeLimits,
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
