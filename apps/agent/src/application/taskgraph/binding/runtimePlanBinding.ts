import type { AgentStore } from '../../../state/store/core/store.js'
import type { AgentTaskGraph, AgentRun } from '../../../state/shared/types.js'
import {
  assertPlannerRunCanUseTaskGraph,
  attachPlannerRunToPlanState,
  findThreadTaskGraph,
  requirePlannerRunState,
  selectPlannerRunPlanId,
} from '../../../state/taskgraph/binding/planRunBinding.js'
import { requireRuntimeTaskGraph, requireRuntimeRun } from '../../shared/store/runtimeStoreLookup.js'

export function requireRuntimePlannerRun(store: Pick<AgentStore, 'getRun'>, id: string): AgentRun {
  return requirePlannerRunState(requireRuntimeRun(store, id))
}

export function findRuntimeThreadTaskGraph(store: Pick<AgentStore, 'listTaskGraphs'>, threadId: string): AgentTaskGraph | undefined {
  return findThreadTaskGraph(store.listTaskGraphs(), threadId)
}

export function attachPlannerRunToRuntimeTaskGraph(input: {
  store: Pick<AgentStore, 'getRun' | 'getTaskGraph' | 'updateRun' | 'updateTaskGraph'>
  runId: string
  taskGraphId: string
  source: string
  now: string
}): AgentRun {
  const { store, runId, taskGraphId, source, now } = input
  const run = requireRuntimePlannerRun(store, runId)
  const taskGraph = requireRuntimeTaskGraph(store, taskGraphId)
  const rootRun = taskGraph.rootRunId ? store.getRun(taskGraph.rootRunId) : undefined
  const attached = attachPlannerRunToPlanState({ run, taskGraph, rootRun, source, now })
  store.updateRun(run)
  if (attached.planUpdated) store.updateTaskGraph(taskGraph)
  return run
}

export function resolveRuntimePlannerRunPlanId(input: {
  store: Pick<AgentStore, 'getRun' | 'getTaskGraph' | 'listTaskGraphs' | 'updateRun' | 'updateTaskGraph'>
  plannerRun: AgentRun
  inputPlanId?: unknown
  source: string
  action: string
  now: string
}): string {
  const { store, plannerRun, inputPlanId, source, action, now } = input
  const taskGraphId = selectPlannerRunPlanId({
    plannerRun,
    inputPlanId,
    threadTaskGraph: findRuntimeThreadTaskGraph(store, plannerRun.threadId),
    source,
  })
  const taskGraph = requireRuntimeTaskGraph(store, taskGraphId)
  assertPlannerRunCanUseTaskGraph({ plannerRun, taskGraph, action })
  if (!plannerRun.taskGraphId) {
    attachPlannerRunToRuntimeTaskGraph({ store, runId: plannerRun.id, taskGraphId, source, now })
  }
  return taskGraphId
}
