import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun, AgentTask } from '../state/types.js'
import { syncRuntimeTaskFromRun } from './runtimeTaskRunSync.js'

test('syncRuntimeTaskFromRun projects terminal worker run state onto its task', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({
    id: 'run_worker',
    status: 'completed',
    completedAt: '2026-01-01T00:00:02.000Z',
    taskId: 'task_1',
  }))
  store.createTask(makeTask({ id: 'task_1', status: 'running', progress: 0.4 }))

  const result = syncRuntimeTaskFromRun({
    store,
    runId: 'run_worker',
    now: '2026-01-01T00:00:03.000Z',
  })

  assert.equal(result?.previousTask.status, 'running')
  assert.equal(result?.task.status, 'done')
  assert.equal(result?.task.progress, 1)
  assert.equal(store.getTask('task_1')?.status, 'done')
  assert.equal(store.getTask('task_1')?.artifacts[0]?.uri, 'agent-run:run_worker')
})

test('syncRuntimeTaskFromRun returns undefined for non-projectable runs', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_worker', status: 'in_progress', taskId: 'task_1' }))
  store.createTask(makeTask({ id: 'task_1', status: 'running', progress: 0.4 }))

  assert.equal(syncRuntimeTaskFromRun({
    store,
    runId: 'run_worker',
    now: '2026-01-01T00:00:03.000Z',
  }), undefined)
  assert.equal(store.getTask('task_1')?.status, 'running')
})

test('syncRuntimeTaskFromRun ignores runs without plan task ownership', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_chat', planId: undefined, taskId: undefined }))

  assert.equal(syncRuntimeTaskFromRun({
    store,
    runId: 'run_chat',
    now: '2026-01-01T00:00:03.000Z',
  }), undefined)
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    planId: 'plan_1',
    status: 'queued',
    role: 'worker',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}

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
