import test from 'node:test'
import assert from 'node:assert/strict'
import type { AgentTaskGraph, AgentRun, AgentTask, DispatchTaskGraphResult } from '../../../../state/shared/types.js'
import { createRuntimeTaskGraphDispatchBridge } from './runtimePlanDispatchBridge.js'

test('createRuntimeTaskGraphDispatchBridge wires dispatch dependencies and task events', () => {
  const calls: string[] = []
  const taskGraph = {
    id: 'task_graph_1',
    threadId: 'thread_1',
    title: 'TaskGraph',
    status: 'running',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as AgentTaskGraph
  const result = { taskGraph, spawnedRuns: [], blockedTaskIds: [], retriedTaskIds: [], timedOutRunIds: [] } as DispatchTaskGraphResult
  const task = { id: 'task_1', taskGraphId: 'task_graph_1' } as AgentTask
  const previous = { id: 'task_1', taskGraphId: 'task_graph_1' } as AgentTask
  const bridge = createRuntimeTaskGraphDispatchBridge({
    store: { label: 'store' } as never,
    taskUpdate: { updateTask: (taskId) => {
      calls.push(`update:${taskId}`)
      return task
    } },
    runCreation: { createRun: () => {
      calls.push('createRun')
      return { id: 'run_worker' } as AgentRun
    }, createToolRun: () => {
      throw new Error('unused')
    } },
    runControl: { cancelRun: (runId) => {
      calls.push(`cancel:${runId}`)
      return { id: runId } as AgentRun
    }, approveRun: () => {
      throw new Error('unused')
    }, rejectRun: () => {
      throw new Error('unused')
    }, answerRunInputRequest: () => {
      throw new Error('unused')
    } },
    taskRunSync: { syncTaskFromRun: (runId: string) => calls.push(`sync:${runId}`) } as never,
    planStatus: { recomputePlanStatus: (taskGraphId: string) => calls.push(`recompute:${taskGraphId}`) } as never,
    streams: { emitPlanTaskEvent: (taskGraphId: string, targetTask: AgentTask) => calls.push(`event:${taskGraphId}:${targetTask.id}`) } as never,
    taskEvents: { recordTaskProtocolAndPlanEvent: (targetTask: AgentTask, previousTask?: AgentTask) => {
      calls.push(`protocol:${targetTask.id}:${previousTask?.id ?? 'none'}`)
      return undefined
    }, recordTaskProtocolEvents: () => undefined },
    dispatchRequest: (input) => {
      input.updateTask('task_1', { status: 'running' })
      input.createRun({ threadId: 'thread_1' })
      input.cancelRun('run_old', 'timeout')
      input.syncTaskFromRun('run_worker')
      input.recomputeTaskGraph('task_graph_1')
      input.onTaskTimedOut?.(task)
      input.onTaskRetryReset?.(task, previous)
      input.onTaskBlocked?.(task)
      input.onTaskDispatched?.(task, previous)
      calls.push(`dispatch:${typeof input.now}:${typeof input.nowMs}`)
      return result
    },
  })

  assert.equal(bridge.dispatchTaskGraph({ taskGraphId: 'task_graph_1', plannerRunId: 'run_root' }), result)
  assert.deepEqual(calls, [
    'update:task_1',
    'createRun',
    'cancel:run_old',
    'sync:run_worker',
    'recompute:task_graph_1',
    'event:task_graph_1:task_1',
    'protocol:task_1:task_1',
    'event:task_graph_1:task_1',
    'protocol:task_1:task_1',
    'dispatch:string:number',
  ])
})
