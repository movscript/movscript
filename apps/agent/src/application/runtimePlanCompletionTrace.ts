import type { AgentStore } from '../state/store.js'
import type {
  AgentPlan,
  AgentRun,
  AgentTask,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../state/types.js'

export interface RuntimePlanCompletionTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  data?: unknown
}

export function applyRuntimePlanCompletionTrace(input: {
  store: Pick<AgentStore, 'getRun' | 'listRuns'>
  plan: AgentPlan
  tasks: AgentTask[]
  recordTrace: (run: AgentRun, trace: RuntimePlanCompletionTraceInput) => void
}): AgentRun | undefined {
  const run = resolveRuntimePlanCompletionRun({
    store: input.store,
    plan: input.plan,
  })
  if (!run) return undefined
  input.recordTrace(run, {
    kind: 'plan',
    title: 'Plan completed',
    summary: `${input.tasks.length} task(s) completed.`,
    status: 'completed',
    data: {
      eventType: 'plan_completed',
      planId: input.plan.id,
      taskCount: input.tasks.length,
      artifactCount: input.tasks.reduce((sum, task) => sum + task.artifacts.length, 0),
      completedTaskIds: input.tasks.map((task) => task.id),
    },
  })
  return run
}

export function resolveRuntimePlanCompletionRun(input: {
  store: Pick<AgentStore, 'getRun' | 'listRuns'>
  plan: AgentPlan
}): AgentRun | undefined {
  if (input.plan.rootRunId) return input.store.getRun(input.plan.rootRunId)
  return input.store.listRuns({ planId: input.plan.id, role: 'planner' })[0]
}
