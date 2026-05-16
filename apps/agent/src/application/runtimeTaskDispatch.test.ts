import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentTask } from '../state/types.js'
import {
  markRuntimeTaskDispatchBlocked,
  markRuntimeTaskDispatchedToWorker,
} from './runtimeTaskDispatch.js'

test('markRuntimeTaskDispatchBlocked persists changed blocked reasons', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_1', blockedReason: 'old reason' }))

  const task = markRuntimeTaskDispatchBlocked({
    store,
    taskId: 'task_1',
    blockedReason: 'Waiting for dependency.',
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.equal(task?.blockedReason, 'Waiting for dependency.')
  assert.equal(task?.updatedAt, '2026-01-01T00:00:01.000Z')
  assert.equal(store.getTask('task_1')?.blockedReason, 'Waiting for dependency.')
})

test('markRuntimeTaskDispatchBlocked ignores missing tasks and unchanged reasons', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_1', blockedReason: 'same' }))

  assert.equal(markRuntimeTaskDispatchBlocked({
    store,
    taskId: 'missing_task',
    blockedReason: 'same',
    now: '2026-01-01T00:00:01.000Z',
  }), undefined)
  assert.equal(markRuntimeTaskDispatchBlocked({
    store,
    taskId: 'task_1',
    blockedReason: 'same',
    now: '2026-01-01T00:00:01.000Z',
  }), undefined)
})

test('markRuntimeTaskDispatchedToWorker persists worker ownership and returns snapshot', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_1', status: 'pending', progress: 0 }))

  const result = markRuntimeTaskDispatchedToWorker({
    store,
    taskId: 'task_1',
    workerRunId: 'run_worker',
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.equal(result.previousTask.status, 'pending')
  assert.equal(result.task.status, 'running')
  assert.equal(result.task.ownerRunId, 'run_worker')
  assert.equal(result.task.startedAt, '2026-01-01T00:00:01.000Z')
  assert.equal(store.getTask('task_1')?.ownerRunId, 'run_worker')
})

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    planId: 'plan_1',
    title: 'Task',
    status: 'pending',
    progress: 0,
    deps: [],
    artifacts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
