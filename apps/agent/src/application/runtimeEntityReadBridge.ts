import type { AgentStore } from '../state/store.js'
import type { AgentTaskGraph, AgentTaskGraphSnapshot, AgentRun, AgentTask } from '../state/types.js'
import {
  getRuntimeTaskGraph,
  getRuntimeTaskTree,
  listRuntimePlans,
} from './runtimePlanRead.js'
import { getRuntimeTaskGraphSnapshot } from './runtimePlanSnapshot.js'
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
  listTaskGraphs: () => AgentTaskGraph[]
  getTaskGraph: (id: string) => AgentTaskGraph | undefined
  getTaskGraphSnapshot: (taskGraphId: string) => AgentTaskGraphSnapshot
  getTaskTree: (taskGraphId: string) => AgentTask[]
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
    listTaskGraphs: () => listRuntimePlans({ store: input.store }),
    getTaskGraph: (taskGraphId) => getRuntimeTaskGraph({ store: input.store, taskGraphId }),
    getTaskGraphSnapshot: (taskGraphId) => getRuntimeTaskGraphSnapshot({ store: input.store, taskGraphId }),
    getTaskTree: (taskGraphId) => getRuntimeTaskTree({ store: input.store, taskGraphId }),
  }
}
