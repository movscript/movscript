import type { AgentStore } from '../state/store.js'
import type {
  AgentTaskGraphSnapshot,
  AgentRun,
  AgentTask,
  CancelRunInput,
  CreateRunInput,
  DispatchTaskGraphInput,
  DispatchTaskGraphResult,
  UpdateTaskGraphTaskInput,
} from '../state/types.js'
import type { JSONValue } from '../types.js'
import { isoNow } from './runtimeIdentity.js'
import {
  listRuntimeSubagents,
  waitRuntimeSubagent,
} from './runtimeSubagentRead.js'
import {
  applyRuntimeDirectSubagentSpawnFlow,
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
  updateTask: (taskId: string, update: UpdateTaskGraphTaskInput) => AgentTask
  dispatchTaskGraph: (input: DispatchTaskGraphInput) => DispatchTaskGraphResult
  createRun: (input: CreateRunInput) => AgentRun
  cancelSubtree: (runId: string, input?: CancelRunInput) => { cancelledRunIds: string[] }
  getTaskGraphSnapshot: (taskGraphId: string) => AgentTaskGraphSnapshot
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
      const wantsTaskGraphDispatch = !!run.taskGraphId
        && (typeof request.taskId === 'string'
          || (Array.isArray(request.taskIds) && request.taskIds.length > 0))
      if (!wantsTaskGraphDispatch) {
        const result = applyRuntimeDirectSubagentSpawnFlow({
          store: input.store,
          plannerRunId: run.id,
          request,
          createRun: input.createRun,
        })
        return {
          status: result.status,
          plannerRunId: result.plannerRunId,
          spawnedRuns: result.spawnedRuns.map((childRun) => ({
            id: childRun.id,
            status: childRun.status,
            role: childRun.role,
            parentRunId: childRun.parentRunId,
            subagentName: typeof childRun.metadata?.subagentName === 'string' ? childRun.metadata.subagentName : undefined,
            taskId: childRun.taskId,
            taskGraphId: childRun.taskGraphId,
          })),
        } as unknown as JSONValue
      }
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
        dispatchTaskGraph: input.dispatchTaskGraph,
        getTaskGraphSnapshot: input.getTaskGraphSnapshot,
        onTaskCreated: input.taskEvents.recordTaskProtocolAndPlanEvent,
      })
    },
    listSubagents: (run, request = {}) => listFlow({
      store: input.store,
      plannerRunId: run.id,
      request,
      now: now(),
      getTaskGraphSnapshot: input.getTaskGraphSnapshot,
    }) as unknown as JSONValue,
    waitSubagent: async (run, request = {}) => await waitFlow({
      store: input.store,
      plannerRunId: run.id,
      request,
      now: now(),
      getTaskGraphSnapshot: input.getTaskGraphSnapshot,
    }) as unknown as JSONValue,
    cancelSubagent: (run, request = {}) => cancelFlow({
      store: input.store,
      plannerRunId: run.id,
      request,
      updateTask: input.updateTask,
      cancelSubtree: input.cancelSubtree,
      getTaskGraphSnapshot: input.getTaskGraphSnapshot,
    }),
  }
}
