import type { AgentStore } from '../../../../../state/store/core/store.js'
import type { AgentRun, AgentTask } from '../../../../../state/shared/types.js'
import { projectRunOntoTask } from '../../../../../state/taskgraph/projection/task/run/taskProjection.js'
import { snapshotTaskForProtocolEvent } from '../../../../../state/taskgraph/projection/task/protocol/taskProtocolEvent.js'
import {
  applyRuntimeTaskProtocolEvents,
  type RuntimeTaskProtocolTraceInput,
} from '../../events/protocol/runtimeTaskProtocolEvents.js'

export interface RuntimeTaskRunSyncResult {
  run: AgentRun
  task: AgentTask
  previousTask: AgentTask
  taskGraphId: string
}

export function syncRuntimeTaskFromRun(input: {
  store: Pick<AgentStore, 'getRun' | 'getTask' | 'updateTask'>
  runId: string
  now: string
}): RuntimeTaskRunSyncResult | undefined {
  const run = input.store.getRun(input.runId)
  if (!run?.taskGraphId || !run.taskId) return undefined

  const task = input.store.getTask(run.taskId)
  if (!task) return undefined

  const previousTask = snapshotTaskForProtocolEvent(task)
  if (!projectRunOntoTask(task, run, input.now)) return undefined

  input.store.updateTask(task)
  return { run, task, previousTask, taskGraphId: run.taskGraphId }
}

export function applyRuntimeTaskRunSync(input: {
  store: Pick<AgentStore, 'getRun' | 'getTask' | 'updateTask'>
  runId: string
  now: string
  onPlanSynced?: (taskGraphId: string) => void
  onTaskSynced?: (task: AgentTask, previousTask: AgentTask, taskGraphId: string) => void
}): RuntimeTaskRunSyncResult | undefined {
  const result = syncRuntimeTaskFromRun(input)
  if (!result) return undefined
  input.onPlanSynced?.(result.taskGraphId)
  input.onTaskSynced?.(result.task, result.previousTask, result.taskGraphId)
  return result
}

export function applyRuntimeTaskRunSyncRequest(input: {
  store: Pick<AgentStore, 'getRun' | 'getTask' | 'updateTask' | 'getTaskGraph'>
  runId: string
  now: string
  recomputePlanStatus: (taskGraphId: string) => void
  recordTrace: (run: AgentRun, trace: RuntimeTaskProtocolTraceInput) => void
  emitPlanTaskEvent: (taskGraphId: string, task: AgentTask) => void
}): RuntimeTaskRunSyncResult | undefined {
  return applyRuntimeTaskRunSync({
    store: input.store,
    runId: input.runId,
    now: input.now,
    onPlanSynced: input.recomputePlanStatus,
    onTaskSynced: (task, previousTask, taskGraphId) => {
      applyRuntimeTaskProtocolEvents({
        store: input.store,
        task,
        previous: previousTask,
        recordTrace: input.recordTrace,
      })
      input.emitPlanTaskEvent(taskGraphId, task)
    },
  })
}
