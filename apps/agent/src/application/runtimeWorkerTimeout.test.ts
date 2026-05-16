import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentTask } from '../state/types.js'
import { markRuntimeTimedOutWorkerTask } from './runtimeWorkerTimeout.js'

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
