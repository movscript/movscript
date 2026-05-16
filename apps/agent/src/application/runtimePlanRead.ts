import type { AgentStore } from '../state/store.js'
import type { AgentPlan, AgentTask } from '../state/types.js'
import { requireRuntimePlan } from './runtimeStoreLookup.js'

export function listRuntimePlans(input: {
  store: Pick<AgentStore, 'listPlans'>
}): AgentPlan[] {
  return input.store.listPlans()
}

export function getRuntimePlan(input: {
  store: Pick<AgentStore, 'getPlan'>
  planId: string
}): AgentPlan | undefined {
  return input.store.getPlan(input.planId)
}

export function getRuntimeTaskTree(input: {
  store: Pick<AgentStore, 'getPlan' | 'listTasks'>
  planId: string
}): AgentTask[] {
  requireRuntimePlan(input.store, input.planId)
  return input.store.listTasks(input.planId)
}
