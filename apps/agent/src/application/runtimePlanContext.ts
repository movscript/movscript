import type { AgentStore } from '../state/store.js'
import type { AgentDebugContextPanel, AgentRun } from '../state/types.js'
import { buildRunPlanDebugContext } from '../state/planContextView.js'

export function attachRuntimePlanDebugContext(input: {
  store: Pick<AgentStore, 'getTaskGraph' | 'listTasks' | 'listRuns'>
  context: AgentDebugContextPanel
  run: AgentRun
}): AgentDebugContextPanel {
  const { store, context, run } = input
  if (!run.taskGraphId) return context
  const taskGraph = store.getTaskGraph(run.taskGraphId)
  if (!taskGraph) return context
  return buildRunPlanDebugContext({
    context,
    run,
    taskGraph,
    tasks: store.listTasks(taskGraph.id),
    runs: store.listRuns({ taskGraphId: taskGraph.id }),
  })
}
