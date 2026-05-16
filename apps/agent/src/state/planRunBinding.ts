import type { AgentPlan, AgentRun } from './types.js'

export function requirePlannerRunState(run: AgentRun): AgentRun {
  if (run.role !== 'planner') throw new Error(`run ${run.id} is not a planner run`)
  return run
}

export function findThreadPlan(plans: AgentPlan[], threadId: string): AgentPlan | undefined {
  return plans.find((plan) => plan.threadId === threadId)
}

export function selectPlannerRunPlanId(input: {
  plannerRun: AgentRun
  inputPlanId?: unknown
  threadPlan?: AgentPlan
  source: string
}): string {
  const planId = normalizeNonEmptyString(input.inputPlanId)
    ?? input.plannerRun.planId
    ?? input.threadPlan?.id
  if (!planId) throw new Error(`${input.source} requires planId or a planner run plan`)
  return planId
}

export function assertPlannerRunCanUsePlan(input: {
  plannerRun: AgentRun
  plan: AgentPlan
  action: string
}): void {
  if (input.plannerRun.planId && input.plannerRun.planId !== input.plan.id) {
    throw new Error(`planner run ${input.plannerRun.id} cannot ${input.action} plan ${input.plan.id}`)
  }
  if (input.plan.threadId !== input.plannerRun.threadId) {
    throw new Error(`planner run ${input.plannerRun.id} cannot ${input.action} plan ${input.plan.id}`)
  }
}

export function selectReplanPlannerRunId(input: {
  run: AgentRun
  plan: AgentPlan
  inputPlannerRunId?: unknown
}): string {
  const plannerRunId = normalizeNonEmptyString(input.inputPlannerRunId)
    ?? (input.run.role === 'planner' ? input.run.id : input.run.parentRunId)
    ?? input.plan.rootRunId
  if (!plannerRunId) throw new Error(`plan ${input.plan.id} has no plannerRunId`)
  return plannerRunId
}

export function attachPlannerRunToPlanState(input: {
  run: AgentRun
  plan: AgentPlan
  rootRun?: AgentRun
  source: string
  now: string
}): { planUpdated: boolean } {
  const { run, plan, rootRun, source, now } = input
  requirePlannerRunState(run)
  if (run.threadId !== plan.threadId) throw new Error(`planner run ${run.id} cannot attach to plan ${plan.id}`)
  if (run.planId && run.planId !== plan.id) throw new Error(`planner run ${run.id} is already attached to plan ${run.planId}`)

  run.planId = plan.id
  run.progress = 0
  run.updatedAt = now
  run.metadata = {
    ...(run.metadata ?? {}),
    attachedPlanByTool: source,
  }

  if (!plan.rootRunId || (plan.rootRunId !== run.id && (!rootRun || rootRun.threadId !== run.threadId))) {
    plan.rootRunId = run.id
    plan.updatedAt = now
    return { planUpdated: true }
  }
  return { planUpdated: false }
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
