import type { AgentStore } from '../state/store.js'
import type { AgentRun, AgentTask } from '../state/types.js'
import { projectRunOntoTask } from '../state/taskProjection.js'
import { snapshotTaskForProtocolEvent } from '../state/taskProtocolEvent.js'
import {
  applyRuntimeTaskProtocolEvents,
  type RuntimeTaskProtocolTraceInput,
} from './runtimeTaskProtocolEvents.js'

export interface RuntimeTaskRunSyncResult {
  run: AgentRun
  task: AgentTask
  previousTask: AgentTask
  planId: string
}

export function syncRuntimeTaskFromRun(input: {
  store: Pick<AgentStore, 'getRun' | 'getTask' | 'updateTask'>
  runId: string
  now: string
}): RuntimeTaskRunSyncResult | undefined {
  const run = input.store.getRun(input.runId)
  if (!run?.planId || !run.taskId) return undefined

  const task = input.store.getTask(run.taskId)
  if (!task) return undefined

  const previousTask = snapshotTaskForProtocolEvent(task)
  if (!projectRunOntoTask(task, run, input.now)) return undefined

  input.store.updateTask(task)
  return { run, task, previousTask, planId: run.planId }
}

export function applyRuntimeTaskRunSync(input: {
  store: Pick<AgentStore, 'getRun' | 'getTask' | 'updateTask'>
  runId: string
  now: string
  onPlanSynced?: (planId: string) => void
  onTaskSynced?: (task: AgentTask, previousTask: AgentTask, planId: string) => void
}): RuntimeTaskRunSyncResult | undefined {
  const result = syncRuntimeTaskFromRun(input)
  if (!result) return undefined
  input.onPlanSynced?.(result.planId)
  input.onTaskSynced?.(result.task, result.previousTask, result.planId)
  return result
}

export function applyRuntimeTaskRunSyncRequest(input: {
  store: Pick<AgentStore, 'getRun' | 'getTask' | 'updateTask' | 'getPlan'>
  runId: string
  now: string
  recomputePlanStatus: (planId: string) => void
  recordTrace: (run: AgentRun, trace: RuntimeTaskProtocolTraceInput) => void
  emitPlanTaskEvent: (planId: string, task: AgentTask) => void
}): RuntimeTaskRunSyncResult | undefined {
  return applyRuntimeTaskRunSync({
    store: input.store,
    runId: input.runId,
    now: input.now,
    onPlanSynced: input.recomputePlanStatus,
    onTaskSynced: (task, previousTask, planId) => {
      applyRuntimeTaskProtocolEvents({
        store: input.store,
        task,
        previous: previousTask,
        recordTrace: input.recordTrace,
      })
      input.emitPlanTaskEvent(planId, task)
    },
  })
}
