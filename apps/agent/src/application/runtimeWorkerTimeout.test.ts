import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun, AgentTask } from '../state/types.js'
import {
  applyRuntimeTimedOutPlanWorkers,
  markRuntimeTimedOutWorkerTask,
} from './runtimeWorkerTimeout.js'

test('markRuntimeTimedOutWorkerTask persists timeout metadata', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_1' }))

  const task = markRuntimeTimedOutWorkerTask({
    store,
    taskId: 'task_1',
    workerRunId: 'run_worker',
    timeoutMs: 5000,
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.equal(task?.metadata?.timedOutRunId, 'run_worker')
  assert.equal(task?.metadata?.workerTimeoutMs, 5000)
  assert.equal(task?.metadata?.previousOwnerRunId, 'run_worker')
  assert.equal(task?.updatedAt, '2026-01-01T00:00:01.000Z')
  assert.equal(store.getTask('task_1')?.metadata?.timedOutRunId, 'run_worker')
})

test('markRuntimeTimedOutWorkerTask ignores missing tasks', () => {
  const store = new InMemoryAgentStore()

  assert.equal(markRuntimeTimedOutWorkerTask({
    store,
    taskId: 'missing_task',
    workerRunId: 'run_worker',
    timeoutMs: 5000,
    now: '2026-01-01T00:00:01.000Z',
  }), undefined)
})

test('applyRuntimeTimedOutPlanWorkers cancels timed-out workers and records task timeout metadata', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_1' }))
  store.createRun(makeRun({
    id: 'run_worker_old',
    taskId: 'task_1',
    createdAt: '2026-01-01T00:00:00.000Z',
    startedAt: '2026-01-01T00:00:00.000Z',
  }))
  store.createRun(makeRun({
    id: 'run_worker_recent',
    taskId: 'task_recent',
    createdAt: '2026-01-01T00:00:04.500Z',
    startedAt: '2026-01-01T00:00:04.500Z',
  }))

  const cancelled: Array<{ runId: string; reason: string }> = []
  const syncedRunIds: string[] = []
  const taskEvents: string[] = []

  const result = applyRuntimeTimedOutPlanWorkers({
    store,
    planId: 'plan_1',
    defaultTimeoutMs: 5000,
    nowMs: new Date('2026-01-01T00:00:06.000Z').getTime(),
    now: '2026-01-01T00:00:06.000Z',
    cancelRun: (runId, reason) => cancelled.push({ runId, reason }),
    syncTaskFromRun: (runId) => syncedRunIds.push(runId),
    onTaskTimedOut: (task) => taskEvents.push(task.id),
  })

  assert.deepEqual(result.timedOutRunIds, ['run_worker_old'])
  assert.deepEqual(cancelled, [{
    runId: 'run_worker_old',
    reason: 'Worker run timed out after 5000ms.',
  }])
  assert.deepEqual(syncedRunIds, ['run_worker_old'])
  assert.deepEqual(taskEvents, ['task_1'])
  assert.equal(store.getTask('task_1')?.metadata?.timedOutRunId, 'run_worker_old')
})

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    planId: 'plan_1',
    title: 'Task',
    status: 'running',
    progress: 0.5,
    deps: [],
    artifacts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_worker',
    threadId: 'thread_1',
    role: 'worker',
    planId: 'plan_1',
    status: 'in_progress',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    steps: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
