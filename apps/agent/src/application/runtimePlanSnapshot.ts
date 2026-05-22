import type { AgentStore } from '../state/store.js'
import type { AgentTaskGraphSnapshot } from '../state/types.js'
import { buildAgentTaskGraphSnapshot } from '../state/planSnapshot.js'
import { toProductRun } from '../state/runStreamView.js'
import { requireRuntimeTaskGraph } from './runtimeStoreLookup.js'

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
