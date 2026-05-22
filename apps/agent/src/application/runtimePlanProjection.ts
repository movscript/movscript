import type { AgentStore } from '../state/store.js'
import type { AgentTaskGraph, AgentRun, AgentTask } from '../state/types.js'
import { projectTasksOntoTaskGraph, type PlanTaskProjectionResult } from '../state/planProjection.js'
import {
  applyRuntimePlanCompletionTrace,
  type RuntimePlanCompletionTraceInput,
} from './runtimePlanCompletionTrace.js'

export interface RuntimeTaskGraphProjectionResult {
  taskGraph: AgentTaskGraph
  tasks: AgentTask[]
  projection: PlanTaskProjectionResult
}

export function recomputeRuntimeTaskGraphStatus(input: {
  store: Pick<AgentStore, 'getTaskGraph' | 'listTasks' | 'updateTaskGraph'>
  taskGraphId: string
  now: string
}): RuntimeTaskGraphProjectionResult | undefined {
  const { store, taskGraphId, now } = input
  const taskGraph = store.getTaskGraph(taskGraphId)
  if (!taskGraph) return undefined
  const tasks = store.listTasks(taskGraphId)
  const projection = projectTasksOntoTaskGraph(taskGraph, tasks, now)
  store.updateTaskGraph(taskGraph)
  return { taskGraph, tasks, projection }
}

export function applyRuntimeTaskGraphStatusRecomputeRequest(input: {
  store: Pick<AgentStore, 'getTaskGraph' | 'listTasks' | 'updateTaskGraph' | 'getRun' | 'listRuns'>
  taskGraphId: string
  now: string
  recordTrace: (run: AgentRun, trace: RuntimePlanCompletionTraceInput) => void
}): RuntimeTaskGraphProjectionResult | undefined {
  const result = recomputeRuntimeTaskGraphStatus({
    store: input.store,
    taskGraphId: input.taskGraphId,
    now: input.now,
  })
  if (result?.projection.completedNow) {
    applyRuntimePlanCompletionTrace({
      store: input.store,
      taskGraph: result.taskGraph,
      tasks: result.tasks,
      recordTrace: input.recordTrace,
    })
  }
  return result
}
