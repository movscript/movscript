import test from 'node:test'
import assert from 'node:assert/strict'
import type { AgentTaskGraph, AgentTask, DispatchTaskGraphResult, UpdateTaskGraphResult } from '../state/types.js'
import { createRuntimeReplanBridge } from './runtimeReplanBridge.js'

test('createRuntimeReplanBridge wires updateTaskGraph dependencies and task events', () => {
  const calls: string[] = []
  const taskGraph = makeTaskGraph()
  const result = { taskGraph, createdTaskIds: [], updatedTaskIds: [], resetTaskIds: [] } as UpdateTaskGraphResult
  const dispatchResult = { taskGraph, spawnedRuns: [], blockedTaskIds: [], retriedTaskIds: [], timedOutRunIds: [] } as DispatchTaskGraphResult
  const task = { id: 'task_1', taskGraphId: 'task_graph_1' } as AgentTask
  const previous = { id: 'task_1', taskGraphId: 'task_graph_1' } as AgentTask
  const bridge = createRuntimeReplanBridge({
    store: { label: 'store' } as never,
    taskUpdate: { updateTask: (taskId) => {
      calls.push(`update:${taskId}`)
      return task
    } },
    planStatus: { recomputePlanStatus: (taskGraphId: string) => calls.push(`recompute:${taskGraphId}`) } as never,
    planDispatch: { dispatchTaskGraph: (dispatchInput) => {
      calls.push(`dispatch:${dispatchInput.taskGraphId}`)
      return dispatchResult
    } },
    taskEvents: {
      recordTaskProtocolAndPlanEvent: (targetTask: AgentTask, previousTask?: AgentTask) => {
        calls.push(`event:${targetTask.id}:${previousTask?.id ?? 'none'}`)
        return undefined
      },
      recordTaskProtocolEvents: () => undefined,
    },
    replanRequest: (input) => {
      input.updateTask('task_1', { status: 'running' })
      input.recomputeTaskGraph('task_graph_1')
      input.dispatchTaskGraph({ taskGraphId: 'task_graph_1', plannerRunId: 'run_root' })
      input.onTaskCreated?.(task)
      input.onTaskReset?.(task, previous)
      calls.push(`updateTaskGraph:${input.runId}:${typeof input.now}:${typeof input.resetNow}`)
      return result
    },
  })

  assert.equal(bridge.replanRun('run_1', { dispatch: true }), result)
  assert.deepEqual(calls, [
    'update:task_1',
    'recompute:task_graph_1',
    'dispatch:task_graph_1',
    'event:task_1:none',
    'event:task_1:task_1',
    'updateTaskGraph:run_1:string:string',
  ])
})

function makeTaskGraph(): AgentTaskGraph {
  return {
    id: 'task_graph_1',
    threadId: 'thread_1',
    title: 'TaskGraph',
    status: 'running',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
