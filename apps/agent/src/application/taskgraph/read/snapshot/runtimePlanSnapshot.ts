import type { AgentStore } from '../../../../state/store/core/store.js'
import type { AgentTaskGraphSnapshot } from '../../../../state/shared/types.js'
import { buildAgentTaskGraphSnapshot } from '../../../../state/taskgraph/projection/plan/snapshot/planSnapshot.js'
import { toProductRun } from '../../../../state/run/projection/stream/runStreamView.js'
import { requireRuntimeTaskGraph } from '../../../shared/store/runtimeStoreLookup.js'

export function getRuntimeTaskGraphSnapshot(input: {
  store: Pick<AgentStore, 'getTaskGraph' | 'listTasks' | 'listRuns'>
  taskGraphId: string
}): AgentTaskGraphSnapshot {
  const taskGraph = requireRuntimeTaskGraph(input.store, input.taskGraphId)
  return buildAgentTaskGraphSnapshot({
    taskGraph,
    tasks: input.store.listTasks(input.taskGraphId),
    runs: input.store.listRuns({ taskGraphId: input.taskGraphId }).map(toProductRun),
  })
}
