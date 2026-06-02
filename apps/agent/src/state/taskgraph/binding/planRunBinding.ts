import type { AgentTaskGraph, AgentRun } from '../../shared/types.js'

export function requirePlannerRunState(run: AgentRun): AgentRun {
  if (run.role !== 'planner') throw new Error(`run ${run.id} is not a planner run`)
  return run
}

export function findThreadTaskGraph(plans: AgentTaskGraph[], threadId: string): AgentTaskGraph | undefined {
  return plans.find((taskGraph) => taskGraph.threadId === threadId)
}

export function selectPlannerRunPlanId(input: {
  plannerRun: AgentRun
  inputPlanId?: unknown
  threadTaskGraph?: AgentTaskGraph
  source: string
}): string {
  const taskGraphId = normalizeNonEmptyString(input.inputPlanId)
    ?? input.plannerRun.taskGraphId
    ?? input.threadTaskGraph?.id
  if (!taskGraphId) throw new Error(`${input.source} requires taskGraphId or a planner run taskGraph`)
  return taskGraphId
}

export function assertPlannerRunCanUseTaskGraph(input: {
  plannerRun: AgentRun
  taskGraph: AgentTaskGraph
  action: string
}): void {
  if (input.plannerRun.taskGraphId && input.plannerRun.taskGraphId !== input.taskGraph.id) {
    throw new Error(`planner run ${input.plannerRun.id} cannot ${input.action} taskGraph ${input.taskGraph.id}`)
  }
  if (input.taskGraph.threadId !== input.plannerRun.threadId) {
    throw new Error(`planner run ${input.plannerRun.id} cannot ${input.action} taskGraph ${input.taskGraph.id}`)
  }
}

export function selectReplanPlannerRunId(input: {
  run: AgentRun
  taskGraph: AgentTaskGraph
  inputPlannerRunId?: unknown
}): string {
  const plannerRunId = normalizeNonEmptyString(input.inputPlannerRunId)
    ?? (input.run.role === 'planner' ? input.run.id : input.run.parentRunId)
    ?? input.taskGraph.rootRunId
  if (!plannerRunId) throw new Error(`taskGraph ${input.taskGraph.id} has no plannerRunId`)
  return plannerRunId
}

export function attachPlannerRunToPlanState(input: {
  run: AgentRun
  taskGraph: AgentTaskGraph
  rootRun?: AgentRun
  source: string
  now: string
}): { planUpdated: boolean } {
  const { run, taskGraph, rootRun, source, now } = input
  requirePlannerRunState(run)
  if (run.threadId !== taskGraph.threadId) throw new Error(`planner run ${run.id} cannot attach to taskGraph ${taskGraph.id}`)
  if (run.taskGraphId && run.taskGraphId !== taskGraph.id) throw new Error(`planner run ${run.id} is already attached to taskGraph ${run.taskGraphId}`)

  run.taskGraphId = taskGraph.id
  run.progress = 0
  run.updatedAt = now
  run.metadata = {
    ...(run.metadata ?? {}),
    attachedPlanByTool: source,
  }

  if (!taskGraph.rootRunId || (taskGraph.rootRunId !== run.id && (!rootRun || rootRun.threadId !== run.threadId))) {
    taskGraph.rootRunId = run.id
    taskGraph.updatedAt = now
    return { planUpdated: true }
  }
  return { planUpdated: false }
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
