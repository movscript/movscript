import type { AgentStore } from '../state/store.js'
import type { AgentPlan, AgentPlanSnapshot, AgentRun, AgentTask } from '../state/types.js'
import {
  getRuntimePlan,
  getRuntimeTaskTree,
  listRuntimePlans,
} from './runtimePlanRead.js'
import { getRuntimePlanSnapshot } from './runtimePlanSnapshot.js'
import {
  getRuntimeChildRuns,
  getRuntimeRun,
  listRuntimeRuns,
  listRuntimeRunsByParent,
  listRuntimeRunsByThread,
} from './runtimeRunProjection.js'

export interface RuntimeEntityReadBridge {
  listRuns: () => AgentRun[]
  listRunsByParent: (parentRunId: string) => AgentRun[]
  listRunsByThread: (threadId: string) => AgentRun[]
  getRun: (id: string) => AgentRun | undefined
  getChildRuns: (parentRunId: string) => AgentRun[]
  listPlans: () => AgentPlan[]
  getPlan: (id: string) => AgentPlan | undefined
  getPlanSnapshot: (planId: string) => AgentPlanSnapshot
  getTaskTree: (planId: string) => AgentTask[]
}

export function createRuntimeEntityReadBridge(input: {
  store: AgentStore
}): RuntimeEntityReadBridge {
  return {
    listRuns: () => listRuntimeRuns({ store: input.store }),
    listRunsByParent: (parentRunId) => listRuntimeRunsByParent({ store: input.store, parentRunId }),
    listRunsByThread: (threadId) => listRuntimeRunsByThread({ store: input.store, threadId }),
    getRun: (runId) => getRuntimeRun({ store: input.store, runId }),
    getChildRuns: (parentRunId) => getRuntimeChildRuns({ store: input.store, parentRunId }),
    listPlans: () => listRuntimePlans({ store: input.store }),
    getPlan: (planId) => getRuntimePlan({ store: input.store, planId }),
    getPlanSnapshot: (planId) => getRuntimePlanSnapshot({ store: input.store, planId }),
    getTaskTree: (planId) => getRuntimeTaskTree({ store: input.store, planId }),
  }
}
