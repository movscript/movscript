import type { AgentStore } from '../state/store.js'
import type { AgentPlanSnapshot, AgentRun, CreatePlanInput, ReplanRunInput, ReplanRunResult } from '../state/types.js'
import type { JSONValue } from '../types.js'
import {
  applyRuntimeAgentPlanCreationToolFlow,
  applyRuntimeAgentReplanToolFlow,
  getRuntimeAgentPlan,
} from './runtimeAgentPlanTools.js'
import { isoNow } from './runtimeIdentity.js'

export interface RuntimeAgentPlanToolsBridge {
  createAgentPlan: (run: AgentRun, input?: Record<string, JSONValue>) => Promise<JSONValue>
  getAgentPlan: (run: AgentRun, input?: Record<string, JSONValue>) => JSONValue
  replanAgentPlan: (run: AgentRun, input?: Record<string, JSONValue>) => JSONValue
}

export function createRuntimeAgentPlanToolsBridge(input: {
  store: AgentStore
  createPlan: (planInput: CreatePlanInput) => Promise<AgentPlanSnapshot>
  replanRun: (runId: string, replanInput: ReplanRunInput) => ReplanRunResult
  getPlanSnapshot: (planId: string) => AgentPlanSnapshot
  now?: () => string
  createPlanFlow?: typeof applyRuntimeAgentPlanCreationToolFlow
  getPlanFlow?: typeof getRuntimeAgentPlan
  replanFlow?: typeof applyRuntimeAgentReplanToolFlow
}): RuntimeAgentPlanToolsBridge {
  const now = input.now ?? isoNow
  const createPlanFlow = input.createPlanFlow ?? applyRuntimeAgentPlanCreationToolFlow
  const getPlanFlow = input.getPlanFlow ?? getRuntimeAgentPlan
  const replanFlow = input.replanFlow ?? applyRuntimeAgentReplanToolFlow
  return {
    createAgentPlan: (run, request = {}) => createPlanFlow({
      store: input.store,
      plannerRunId: run.id,
      request,
      now,
      createPlan: input.createPlan,
      getPlanSnapshot: input.getPlanSnapshot,
    }),
    getAgentPlan: (run, request = {}) => getPlanFlow({
      store: input.store,
      plannerRunId: run.id,
      request,
      getPlanSnapshot: input.getPlanSnapshot,
    }),
    replanAgentPlan: (run, request = {}) => replanFlow({
      store: input.store,
      plannerRunId: run.id,
      request,
      now,
      replanRun: input.replanRun,
      getPlanSnapshot: input.getPlanSnapshot,
    }),
  }
}
