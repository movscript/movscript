import assert from 'node:assert/strict'
import test from 'node:test'
import { assertRunCanOwnTask, resolveTaskOwnerRunId } from './planTaskOwner.js'
import type { AgentRun, AgentTask } from './types.js'

test('assertRunCanOwnTask accepts runs in the same plan with matching or unset task id', () => {
  assert.doesNotThrow(() => assertRunCanOwnTask(makeRun({ taskId: 'task_1' }), makeTask()))
  assert.doesNotThrow(() => assertRunCanOwnTask(makeRun(), makeTask()))
})

test('assertRunCanOwnTask rejects foreign plan runs and runs attached to another task', () => {
  assert.throws(() => assertRunCanOwnTask(makeRun({ planId: 'plan_2' }), makeTask()), /does not belong to plan plan_1/)
  assert.throws(() => assertRunCanOwnTask(makeRun({ taskId: 'task_2' }), makeTask()), /attached to task task_2/)
})

test('resolveTaskOwnerRunId resolves optional task owner ids within a plan', () => {
  assert.equal(resolveTaskOwnerRunId({
    planId: 'plan_1',
    taskIdInput: ' ',
    getTask: () => makeTask({ ownerRunId: 'run_1' }),
  }), undefined)
  assert.equal(resolveTaskOwnerRunId({
    planId: 'plan_1',
    taskIdInput: ' task_1 ',
    getTask: () => makeTask({ ownerRunId: 'run_1' }),
  }), 'run_1')
  assert.equal(resolveTaskOwnerRunId({
    planId: 'plan_1',
    taskIdInput: 'task_1',
    getTask: () => makeTask(),
  }), undefined)
})

test('resolveTaskOwnerRunId rejects missing or foreign tasks', () => {
  assert.throws(() => resolveTaskOwnerRunId({
    planId: 'plan_1',
    taskIdInput: 'task_missing',
    getTask: () => undefined,
  }), /task not found: task_missing/)
  assert.throws(() => resolveTaskOwnerRunId({
    planId: 'plan_1',
    taskIdInput: 'task_1',
    getTask: () => makeTask({ planId: 'plan_2' }),
  }), /does not belong to plan plan_1/)
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'queued',
    role: 'worker',
    planId: 'plan_1',
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
    deps: [],
    title: 'Task',
    status: 'pending',
    progress: 0,
    artifacts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
