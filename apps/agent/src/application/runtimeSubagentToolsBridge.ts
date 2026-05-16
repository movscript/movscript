import type { AgentStore } from '../state/store.js'
import type {
  AgentPlanSnapshot,
  AgentRun,
  AgentTask,
  CancelRunInput,
  DispatchPlanInput,
  DispatchPlanResult,
  UpdatePlanTaskInput,
} from '../state/types.js'
import type { JSONValue } from '../types.js'
import { isoNow } from './runtimeIdentity.js'
import {
  listRuntimeSubagents,
  waitRuntimeSubagent,
} from './runtimeSubagentRead.js'
import {
  applyRuntimeSubagentSpawnFlow,
  prepareRuntimeSubagentSpawn,
} from './runtimeSubagentSpawn.js'
import { applyRuntimeSubagentCancellationFlow } from './runtimeSubagentTaskCancellation.js'
import type { RuntimeTaskEventBridge } from './runtimeTaskEventBridge.js'

export interface RuntimeSubagentToolsBridge {
  spawnSubagent: (run: AgentRun, input?: Record<string, JSONValue>) => JSONValue
  listSubagents: (run: AgentRun, input?: Record<string, JSONValue>) => JSONValue
  waitSubagent: (run: AgentRun, input?: Record<string, JSONValue>) => Promise<JSONValue>
  cancelSubagent: (run: AgentRun, input?: Record<string, JSONValue>) => JSONValue
}

export function createRuntimeSubagentToolsBridge(input: {
  store: AgentStore
  updateTask: (taskId: string, update: UpdatePlanTaskInput) => AgentTask
  dispatchPlan: (input: DispatchPlanInput) => DispatchPlanResult
  cancelSubtree: (runId: string, input?: CancelRunInput) => { cancelledRunIds: string[] }
  getPlanSnapshot: (planId: string) => AgentPlanSnapshot
  taskEvents: RuntimeTaskEventBridge
  now?: () => string
  prepareSpawn?: typeof prepareRuntimeSubagentSpawn
  spawnFlow?: typeof applyRuntimeSubagentSpawnFlow
  listFlow?: typeof listRuntimeSubagents
  waitFlow?: typeof waitRuntimeSubagent
  cancelFlow?: typeof applyRuntimeSubagentCancellationFlow
}): RuntimeSubagentToolsBridge {
  const now = input.now ?? isoNow
  const prepareSpawn = input.prepareSpawn ?? prepareRuntimeSubagentSpawn
  const spawnFlow = input.spawnFlow ?? applyRuntimeSubagentSpawnFlow
  const listFlow = input.listFlow ?? listRuntimeSubagents
  const waitFlow = input.waitFlow ?? waitRuntimeSubagent
  const cancelFlow = input.cancelFlow ?? applyRuntimeSubagentCancellationFlow
  return {
    spawnSubagent: (run, request = {}) => {
      const spawn = prepareSpawn({
        store: input.store,
        plannerRunId: run.id,
        request,
        now: now(),
      })
      return spawnFlow({
        store: input.store,
        spawn,
        request,
        updateTask: input.updateTask,
        dispatchPlan: input.dispatchPlan,
        getPlanSnapshot: input.getPlanSnapshot,
        onTaskCreated: input.taskEvents.recordTaskProtocolAndPlanEvent,
      })
    },
    listSubagents: (run, request = {}) => listFlow({
      store: input.store,
      plannerRunId: run.id,
      request,
      now: now(),
      getPlanSnapshot: input.getPlanSnapshot,
    }) as unknown as JSONValue,
    waitSubagent: async (run, request = {}) => await waitFlow({
      store: input.store,
      plannerRunId: run.id,
      request,
      now: now(),
      getPlanSnapshot: input.getPlanSnapshot,
    }) as unknown as JSONValue,
    cancelSubagent: (run, request = {}) => cancelFlow({
      store: input.store,
      plannerRunId: run.id,
      request,
      updateTask: input.updateTask,
      cancelSubtree: input.cancelSubtree,
      getPlanSnapshot: input.getPlanSnapshot,
    }),
  }
}
