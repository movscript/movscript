import test from 'node:test'
import assert from 'node:assert/strict'
import type { AgentTaskGraph, AgentTaskGraphSnapshot, AgentRun, AgentTask } from '../state/types.js'
import { createRuntimeSubagentToolsBridge } from './runtimeSubagentToolsBridge.js'

test('createRuntimeSubagentToolsBridge wires subagent tool dependencies', async () => {
  const calls: string[] = []
  const run = { id: 'run_planner', taskGraphId: 'task_graph_1' } as AgentRun
  const taskGraph = { id: 'task_graph_1' } as AgentTaskGraph
  const task = { id: 'task_1', taskGraphId: 'task_graph_1' } as AgentTask
  const snapshot = { taskGraph, tasks: [task], runs: [] } as unknown as AgentTaskGraphSnapshot
  const bridge = createRuntimeSubagentToolsBridge({
    store: { label: 'store' } as never,
    now: () => '2026-01-01T00:00:00.000Z',
    updateTask: (taskId, update) => {
      calls.push(`update:${taskId}:${update.status ?? 'none'}`)
      return { ...task, id: taskId }
    },
    dispatchTaskGraph: (input) => {
      calls.push(`dispatch:${input.taskGraphId}:${input.plannerRunId}`)
      return { taskGraph, spawnedRuns: [], blockedTaskIds: [], retriedTaskIds: [], timedOutRunIds: [] }
    },
    createRun: (input) => {
      calls.push(`createRun:${input.parentRunId ?? 'none'}`)
      return { ...input, id: 'run_child' } as AgentRun
    },
    cancelSubtree: (runId, input) => {
      calls.push(`cancelSubtree:${runId}:${input?.reason ?? 'none'}`)
      return { cancelledRunIds: [runId] }
    },
    getTaskGraphSnapshot: (taskGraphId) => {
      calls.push(`snapshot:${taskGraphId}`)
      return snapshot
    },
    taskEvents: {
      recordTaskProtocolEvents: () => undefined,
      recordTaskProtocolAndPlanEvent: (targetTask) => {
        calls.push(`taskEvent:${targetTask.id}`)
        return undefined
      },
    },
    prepareSpawn: (input) => {
      calls.push(`prepare:${input.plannerRunId}:${input.now}:${input.request?.taskId}`)
      return {
        taskGraphId: 'task_graph_1',
        plannerRunId: input.plannerRunId,
        tasksToCreate: [],
        requestedTaskIds: ['task_1'],
        subagentNameByTaskId: new Map(),
      }
    },
    spawnFlow: (input) => {
      calls.push(`spawnFlow:${input.spawn.taskGraphId}:${input.request?.taskId}`)
      input.onTaskCreated?.(task)
      input.updateTask('task_1', { status: 'pending' })
      input.dispatchTaskGraph({ taskGraphId: input.spawn.taskGraphId, plannerRunId: input.spawn.plannerRunId })
      input.getTaskGraphSnapshot(input.spawn.taskGraphId)
      return { status: 'spawned' }
    },
    listFlow: (input) => {
      calls.push(`list:${input.plannerRunId}:${input.now}`)
      input.getTaskGraphSnapshot('task_graph_1')
      return { status: 'ok', taskGraphId: 'task_graph_1', plannerRunId: input.plannerRunId, snapshot: {} }
    },
    waitFlow: async (input) => {
      calls.push(`wait:${input.plannerRunId}:${input.now}`)
      input.getTaskGraphSnapshot('task_graph_1')
      return { status: 'done', done: true, target: {}, taskGraphId: 'task_graph_1', plannerRunId: input.plannerRunId, snapshot: {} }
    },
    cancelFlow: (input) => {
      calls.push(`cancel:${input.plannerRunId}:${input.request?.reason}`)
      input.cancelSubtree('run_worker', { reason: input.request?.reason })
      input.getTaskGraphSnapshot('task_graph_1')
      return { status: 'cancelled' }
    },
  })

  assert.deepEqual(bridge.spawnSubagent(run, { taskId: 'task_1' }), { status: 'spawned' })
  assert.deepEqual(bridge.listSubagents(run), { status: 'ok', taskGraphId: 'task_graph_1', plannerRunId: 'run_planner', snapshot: {} })
  assert.deepEqual(await bridge.waitSubagent(run), { status: 'done', done: true, target: {}, taskGraphId: 'task_graph_1', plannerRunId: 'run_planner', snapshot: {} })
  assert.deepEqual(bridge.cancelSubagent(run, { reason: 'user' }), { status: 'cancelled' })
  assert.deepEqual(calls, [
    'prepare:run_planner:2026-01-01T00:00:00.000Z:task_1',
    'spawnFlow:task_graph_1:task_1',
    'taskEvent:task_1',
    'update:task_1:pending',
    'dispatch:task_graph_1:run_planner',
    'snapshot:task_graph_1',
    'list:run_planner:2026-01-01T00:00:00.000Z',
    'snapshot:task_graph_1',
    'wait:run_planner:2026-01-01T00:00:00.000Z',
    'snapshot:task_graph_1',
    'cancel:run_planner:user',
    'cancelSubtree:run_worker:user',
    'snapshot:task_graph_1',
  ])
})
