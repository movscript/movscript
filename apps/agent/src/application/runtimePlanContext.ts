import type { AgentStore } from '../state/store.js'
import type { AgentDebugContextPanel, AgentRun } from '../state/types.js'
import { buildRunPlanDebugContext } from '../state/planContextView.js'

export function attachRuntimePlanDebugContext(input: {
  store: Pick<AgentStore, 'getPlan' | 'listTasks' | 'listRuns'>
  context: AgentDebugContextPanel
  run: AgentRun
}): AgentDebugContextPanel {
  const { store, context, run } = input
  if (!run.planId) return context
  const plan = store.getPlan(run.planId)
  if (!plan) return context
  return buildRunPlanDebugContext({
    context,
    run,
    plan,
    tasks: store.listTasks(plan.id),
    runs: store.listRuns({ planId: plan.id }),
  })
}
