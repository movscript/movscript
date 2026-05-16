import test from 'node:test'
import assert from 'node:assert/strict'
import type { AgentPlan, AgentPlanSnapshot, AgentRun, AgentTask } from '../state/types.js'
import { createRuntimeSubagentToolsBridge } from './runtimeSubagentToolsBridge.js'

test('createRuntimeSubagentToolsBridge wires subagent tool dependencies', async () => {
  const calls: string[] = []
  const run = { id: 'run_planner' } as AgentRun
  const plan = { id: 'plan_1' } as AgentPlan
  const task = { id: 'task_1', planId: 'plan_1' } as AgentTask
  const snapshot = { plan, tasks: [task], runs: [] } as unknown as AgentPlanSnapshot
  const bridge = createRuntimeSubagentToolsBridge({
    store: { label: 'store' } as never,
    now: () => '2026-01-01T00:00:00.000Z',
    updateTask: (taskId, update) => {
      calls.push(`update:${taskId}:${update.status ?? 'none'}`)
      return { ...task, id: taskId }
    },
    dispatchPlan: (input) => {
      calls.push(`dispatch:${input.planId}:${input.plannerRunId}`)
      return { plan, spawnedRuns: [], blockedTaskIds: [], retriedTaskIds: [], timedOutRunIds: [] }
    },
    cancelSubtree: (runId, input) => {
      calls.push(`cancelSubtree:${runId}:${input?.reason ?? 'none'}`)
      return { cancelledRunIds: [runId] }
    },
    getPlanSnapshot: (planId) => {
      calls.push(`snapshot:${planId}`)
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
        planId: 'plan_1',
        plannerRunId: input.plannerRunId,
        tasksToCreate: [],
        requestedTaskIds: ['task_1'],
        subagentNameByTaskId: new Map(),
      }
    },
    spawnFlow: (input) => {
      calls.push(`spawnFlow:${input.spawn.planId}:${input.request?.taskId}`)
      input.onTaskCreated?.(task)
      input.updateTask('task_1', { status: 'pending' })
      input.dispatchPlan({ planId: input.spawn.planId, plannerRunId: input.spawn.plannerRunId })
      input.getPlanSnapshot(input.spawn.planId)
      return { status: 'spawned' }
    },
    listFlow: (input) => {
      calls.push(`list:${input.plannerRunId}:${input.now}`)
      input.getPlanSnapshot('plan_1')
      return { status: 'ok', planId: 'plan_1', plannerRunId: input.plannerRunId, snapshot: {} }
    },
    waitFlow: async (input) => {
      calls.push(`wait:${input.plannerRunId}:${input.now}`)
      input.getPlanSnapshot('plan_1')
      return { status: 'done', done: true, target: {}, planId: 'plan_1', plannerRunId: input.plannerRunId, snapshot: {} }
    },
    cancelFlow: (input) => {
      calls.push(`cancel:${input.plannerRunId}:${input.request?.reason}`)
      input.cancelSubtree('run_worker', { reason: input.request?.reason })
      input.getPlanSnapshot('plan_1')
      return { status: 'cancelled' }
    },
  })

  assert.deepEqual(bridge.spawnSubagent(run, { taskId: 'task_1' }), { status: 'spawned' })
  assert.deepEqual(bridge.listSubagents(run), { status: 'ok', planId: 'plan_1', plannerRunId: 'run_planner', snapshot: {} })
  assert.deepEqual(await bridge.waitSubagent(run), { status: 'done', done: true, target: {}, planId: 'plan_1', plannerRunId: 'run_planner', snapshot: {} })
  assert.deepEqual(bridge.cancelSubagent(run, { reason: 'user' }), { status: 'cancelled' })
  assert.deepEqual(calls, [
    'prepare:run_planner:2026-01-01T00:00:00.000Z:task_1',
    'spawnFlow:plan_1:task_1',
    'taskEvent:task_1',
    'update:task_1:pending',
    'dispatch:plan_1:run_planner',
    'snapshot:plan_1',
    'list:run_planner:2026-01-01T00:00:00.000Z',
    'snapshot:plan_1',
    'wait:run_planner:2026-01-01T00:00:00.000Z',
    'snapshot:plan_1',
    'cancel:run_planner:user',
    'cancelSubtree:run_worker:user',
    'snapshot:plan_1',
  ])
})
