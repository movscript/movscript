import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun, AgentTask } from '../state/types.js'
import { updateRuntimeTask } from './runtimeTaskUpdate.js'

test('updateRuntimeTask validates, persists, and returns the previous task snapshot', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_worker', taskId: 'task_1' }))
  store.createTask(makeTask({ id: 'task_1', status: 'pending', progress: 0 }))

  const result = updateRuntimeTask({
    store,
    taskId: 'task_1',
    update: { status: 'running', progress: 0.5, ownerRunId: 'run_worker' },
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.equal(result.previousTask.status, 'pending')
  assert.equal(result.task.status, 'running')
  assert.equal(result.task.ownerRunId, 'run_worker')
  assert.equal(result.task.progress, 0.5)
  assert.equal(store.getTask('task_1')?.ownerRunId, 'run_worker')
})

test('updateRuntimeTask enforces owner run plan boundaries', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_other_plan', planId: 'plan_other', taskId: 'task_other' }))
  store.createTask(makeTask({ id: 'task_1' }))

  assert.throws(() => updateRuntimeTask({
    store,
    taskId: 'task_1',
    update: { ownerRunId: 'run_other_plan' },
    now: '2026-01-01T00:00:01.000Z',
  }), /owner run run_other_plan does not belong to plan plan_1/)
})

test('updateRuntimeTask enforces unique subagent task names', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_a', metadata: { subagentName: 'Writer' } }))
  store.createTask(makeTask({ id: 'task_b' }))

  assert.throws(() => updateRuntimeTask({
    store,
    taskId: 'task_b',
    update: { metadata: { subagentName: 'Writer' } },
    now: '2026-01-01T00:00:01.000Z',
  }), /subagent name already exists in plan plan_1: Writer/)
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
