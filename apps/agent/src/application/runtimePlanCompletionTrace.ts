import type { AgentStore } from '../state/store.js'
import type {
  AgentTaskGraph,
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
  taskGraph: AgentTaskGraph
  tasks: AgentTask[]
  recordTrace: (run: AgentRun, trace: RuntimePlanCompletionTraceInput) => void
}): AgentRun | undefined {
  const run = resolveRuntimePlanCompletionRun({
    store: input.store,
    taskGraph: input.taskGraph,
  })
  if (!run) return undefined
  input.recordTrace(run, {
    kind: 'taskGraph',
    title: 'TaskGraph completed',
    summary: `${input.tasks.length} task(s) completed.`,
    status: 'completed',
    data: {
      eventType: 'task_graph_completed',
      taskGraphId: input.taskGraph.id,
      taskCount: input.tasks.length,
      artifactCount: input.tasks.reduce((sum, task) => sum + task.artifacts.length, 0),
      completedTaskIds: input.tasks.map((task) => task.id),
    },
  })
  return run
}

export function resolveRuntimePlanCompletionRun(input: {
  store: Pick<AgentStore, 'getRun' | 'listRuns'>
  taskGraph: AgentTaskGraph
}): AgentRun | undefined {
  if (input.taskGraph.rootRunId) return input.store.getRun(input.taskGraph.rootRunId)
  return input.store.listRuns({ taskGraphId: input.taskGraph.id, role: 'planner' })[0]
}
