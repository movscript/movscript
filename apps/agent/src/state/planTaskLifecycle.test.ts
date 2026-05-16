import assert from 'node:assert/strict'
import test from 'node:test'
import {
  markTaskAssignedToPlannerRun,
  markTaskDispatchBlocked,
  markTaskDispatchedToWorker,
  markTaskReplanPending,
  markTaskRetryPending,
  markTimedOutWorkerTask,
} from './planTaskLifecycle.js'
import type { AgentTask } from './types.js'

test('markTaskAssignedToPlannerRun marks planner inline ownership', () => {
  const task = taskFixture({ blockedReason: 'old', metadata: { keep: true } })
  markTaskAssignedToPlannerRun(task, 'run_planner', 'now')
  assert.equal(task.status, 'running')
  assert.equal(task.progress, 0)
  assert.equal(task.ownerRunId, 'run_planner')
  assert.equal(task.startedAt, 'now')
  assert.equal(task.updatedAt, 'now')
  assert.deepEqual(task.metadata, { keep: true, executionMode: 'planner_inline' })
  assert.equal(task.blockedReason, undefined)
})

test('markTaskDispatchedToWorker marks worker ownership', () => {
  const task = taskFixture({ blockedReason: 'old' })
  markTaskDispatchedToWorker(task, 'run_worker', 'now')
  assert.equal(task.status, 'running')
  assert.equal(task.ownerRunId, 'run_worker')
  assert.equal(task.startedAt, 'now')
  assert.equal(task.blockedReason, undefined)
})

test('markTaskDispatchBlocked records dispatch blockers without changing execution state', () => {
  const task = taskFixture({ status: 'pending', progress: 0.5 })
  markTaskDispatchBlocked(task, 'Waiting for dependency.', 'now')
  assert.equal(task.status, 'pending')
  assert.equal(task.progress, 0.5)
  assert.equal(task.blockedReason, 'Waiting for dependency.')
  assert.equal(task.updatedAt, 'now')
})

test('markTaskRetryPending preserves retry metadata and clears owner/blocker', () => {
  const task = taskFixture({
    status: 'failed',
    ownerRunId: 'run_old',
    blockedReason: 'failed',
    metadata: { keep: true },
  })
  markTaskRetryPending(task, { attempts: 1, maxTaskAttempts: 3, now: 'now' })
  assert.equal(task.status, 'pending')
  assert.equal(task.progress, 0)
  assert.equal(task.ownerRunId, undefined)
  assert.equal(task.blockedReason, undefined)
  assert.deepEqual(task.metadata, {
    keep: true,
    retryAttempt: 2,
    maxTaskAttempts: 3,
    previousOwnerRunId: 'run_old',
  })
})

test('markTaskReplanPending resets terminal fields and records provenance', () => {
  const task = taskFixture({
    status: 'needs_review',
    ownerRunId: 'run_old',
    blockedReason: 'review',
    startedAt: 'started',
    completedAt: 'completed',
    failedAt: 'failed',
    cancelledAt: 'cancelled',
  })
  markTaskReplanPending(task, 'now')
  assert.equal(task.status, 'pending')
  assert.equal(task.ownerRunId, undefined)
  assert.equal(task.blockedReason, undefined)
  assert.equal(task.startedAt, undefined)
  assert.equal(task.completedAt, undefined)
  assert.equal(task.failedAt, undefined)
  assert.equal(task.cancelledAt, undefined)
  assert.deepEqual(task.metadata, {
    replannedAt: 'now',
    previousOwnerRunId: 'run_old',
    previousStatus: 'needs_review',
  })
})

test('markTimedOutWorkerTask records timeout metadata', () => {
  const task = taskFixture({ metadata: { keep: true } })
  markTimedOutWorkerTask(task, { runId: 'run_timeout', timeoutMs: 1000, now: 'now' })
  assert.deepEqual(task.metadata, {
    keep: true,
    timedOutRunId: 'run_timeout',
    workerTimeoutMs: 1000,
    previousOwnerRunId: 'run_timeout',
    previousStatus: 'running',
  })
  assert.equal(task.updatedAt, 'now')
})

function taskFixture(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    planId: 'plan_1',
    deps: [],
    title: 'Task',
    status: 'pending',
    progress: 0,
    artifacts: [],
    createdAt: 'created',
    updatedAt: 'created',
    ...overrides,
  }
}
