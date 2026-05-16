import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildReplanTaskResetPolicy,
  hasReplanTaskResetPolicy,
  retryablePlanTask,
  shouldResetTaskForReplan,
  timedOutWorkerRun,
} from './planWorkerMaintenance.js'
import type { AgentRun, AgentTask } from './types.js'

test('timedOutWorkerRun detects active workers beyond timeout', () => {
  const run = makeRun({ createdAt: '2026-01-01T00:00:00.000Z' })

  assert.deepEqual(timedOutWorkerRun({
    run,
    defaultTimeoutMs: 1000,
    nowMs: new Date('2026-01-01T00:00:02.000Z').getTime(),
  }), { timeoutMs: 1000 })
  assert.equal(timedOutWorkerRun({
    run: makeRun({ status: 'completed' }),
    defaultTimeoutMs: 1000,
    nowMs: new Date('2026-01-01T00:00:02.000Z').getTime(),
  }), undefined)
})

test('timedOutWorkerRun uses task timeout overrides', () => {
  assert.deepEqual(timedOutWorkerRun({
    run: makeRun({ createdAt: '2026-01-01T00:00:00.000Z' }),
    task: makeTask({ metadata: { workerTimeoutMs: 500 } }),
    defaultTimeoutMs: 1000,
    nowMs: new Date('2026-01-01T00:00:00.600Z').getTime(),
  }), { timeoutMs: 500 })
})

test('retryablePlanTask allows failed and cancelled tasks below attempt limit', () => {
  assert.deepEqual(retryablePlanTask({
    task: makeTask({ status: 'failed', metadata: { maxTaskAttempts: 3 } }),
    attempts: 2,
    defaultMaxTaskAttempts: 1,
  }), { maxTaskAttempts: 3 })
  assert.equal(retryablePlanTask({
    task: makeTask({ status: 'failed' }),
    attempts: 1,
    defaultMaxTaskAttempts: 1,
  }), undefined)
  assert.equal(retryablePlanTask({
    task: makeTask({ status: 'running' }),
    attempts: 0,
    defaultMaxTaskAttempts: 3,
  }), undefined)
})

test('replan reset policy selects explicit and status-matched tasks', () => {
  const policy = buildReplanTaskResetPolicy({
    resetTaskIds: ['task_running'],
    resetBlocked: true,
    resetCancelled: true,
  })

  assert.equal(hasReplanTaskResetPolicy(policy), true)
  assert.equal(shouldResetTaskForReplan(makeTask({ id: 'task_running', status: 'running' }), policy), true)
  assert.equal(shouldResetTaskForReplan(makeTask({ id: 'task_blocked', status: 'blocked' }), policy), true)
  assert.equal(shouldResetTaskForReplan(makeTask({ id: 'task_failed', status: 'failed' }), policy), false)
})

test('empty replan reset policy is inert', () => {
  const policy = buildReplanTaskResetPolicy({})

  assert.equal(hasReplanTaskResetPolicy(policy), false)
  assert.equal(shouldResetTaskForReplan(makeTask({ status: 'blocked' }), policy), false)
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
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
