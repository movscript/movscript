import type { AgentStore } from '../../../../state/store/core/store.js'
import { requireRuntimePlannerRun } from '../../binding/runtimePlanBinding.js'
import { requireRuntimeTaskGraph } from '../../../shared/store/runtimeStoreLookup.js'

export function resolveRuntimeTaskGraphTreeCancellationRoot(input: {
  store: Pick<AgentStore, 'getRun' | 'getTaskGraph'>
  runId: string
}): string {
  const run = requireRuntimePlannerRun(input.store, input.runId)
  if (!run.taskGraphId) throw new Error(`planner run ${input.runId} is not attached to a task graph`)
  const taskGraph = requireRuntimeTaskGraph(input.store, run.taskGraphId)
  if (taskGraph.rootRunId && taskGraph.rootRunId !== run.id) {
    throw new Error(`planner run ${run.id} is not the root planner for taskGraph ${taskGraph.id}`)
  }
  return run.id
}

export function applyRuntimeTaskGraphTreeCancellationRequest(input: {
  store: Pick<AgentStore, 'getRun' | 'getTaskGraph'>
  runId: string
  cancelSubtree: (runId: string) => { cancelledRunIds: string[] }
}): { cancelledRunIds: string[] } {
  const rootRunId = resolveRuntimeTaskGraphTreeCancellationRoot({
    store: input.store,
    runId: input.runId,
  })
  return input.cancelSubtree(rootRunId)
}
