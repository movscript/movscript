import assert from 'node:assert/strict'
import test from 'node:test'
import { projectTasksOntoPlan, resolvePlanStatusFromTasks } from './planProjection.js'
import type { AgentPlan, AgentTask } from './types.js'

test('resolvePlanStatusFromTasks prioritizes terminal and blocked task states', () => {
  assert.equal(resolvePlanStatusFromTasks('running', [task({ status: 'failed' })]), 'failed')
  assert.equal(resolvePlanStatusFromTasks('running', [task({ status: 'cancelled' }), task({ status: 'cancelled', id: 'task_2' })]), 'cancelled')
  assert.equal(resolvePlanStatusFromTasks('running', [task({ status: 'cancelled' }), task({ status: 'pending', id: 'task_2' })]), 'running')
  assert.equal(resolvePlanStatusFromTasks('running', [task({ status: 'blocked' })]), 'blocked')
  assert.equal(resolvePlanStatusFromTasks('running', [task({ status: 'needs_review' })]), 'needs_review')
})

test('resolvePlanStatusFromTasks handles done, running, pending, mixed, and empty plans', () => {
  assert.equal(resolvePlanStatusFromTasks('running', [task({ status: 'done' })]), 'done')
  assert.equal(resolvePlanStatusFromTasks('pending', [task({ status: 'running' })]), 'running')
  assert.equal(resolvePlanStatusFromTasks('running', [task({ status: 'pending' })]), 'pending')
  assert.equal(resolvePlanStatusFromTasks('pending', [task({ status: 'pending' }), task({ status: 'done', id: 'task_2' })]), 'running')
  assert.equal(resolvePlanStatusFromTasks('blocked', []), 'blocked')
})

test('projectTasksOntoPlan updates progress timestamps and completion markers', () => {
  const plan = planFixture({ status: 'running', progress: 0.2 })
  const result = projectTasksOntoPlan(plan, [
    task({ status: 'done', progress: 1 }),
    task({ id: 'task_2', status: 'done', progress: 0.5 }),
  ], '2026-05-16T01:00:00.000Z')
  assert.equal(result.previousStatus, 'running')
  assert.equal(result.nextStatus, 'done')
  assert.equal(result.completedNow, true)
  assert.equal(plan.status, 'done')
  assert.equal(plan.progress, 0.75)
  assert.equal(plan.completedAt, '2026-05-16T01:00:00.000Z')
  assert.equal(plan.updatedAt, '2026-05-16T01:00:00.000Z')
})

test('projectTasksOntoPlan preserves empty plan progress and manages blocked reason', () => {
  const emptyPlan = planFixture({ status: 'blocked', progress: 0.4, blockedReason: 'old' })
  projectTasksOntoPlan(emptyPlan, [], '2026-05-16T01:00:00.000Z')
  assert.equal(emptyPlan.status, 'blocked')
  assert.equal(emptyPlan.progress, 0.4)
  assert.equal(emptyPlan.blockedReason, undefined)

  const blockedPlan = planFixture()
  projectTasksOntoPlan(blockedPlan, [
    task({ status: 'blocked', blockedReason: 'Need input' }),
    task({ id: 'task_2', status: 'blocked', blockedReason: 'Later blocker' }),
  ], '2026-05-16T01:00:00.000Z')
  assert.equal(blockedPlan.status, 'blocked')
  assert.equal(blockedPlan.blockedReason, 'Need input')
})

test('projectTasksOntoPlan sets failed and cancelled timestamps once', () => {
  const failedPlan = planFixture({ failedAt: 'old' })
  projectTasksOntoPlan(failedPlan, [task({ status: 'failed' })], 'new')
  assert.equal(failedPlan.failedAt, 'old')

  const cancelledPlan = planFixture()
  projectTasksOntoPlan(cancelledPlan, [task({ status: 'cancelled' })], 'new')
  assert.equal(cancelledPlan.cancelledAt, 'new')
})

function planFixture(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    id: 'plan_1',
    threadId: 'thread_1',
    title: 'Plan',
    status: 'running',
    progress: 0,
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    ...overrides,
  }
}

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    planId: 'plan_1',
    deps: [],
    title: 'Task',
    status: 'pending',
    progress: 0,
    artifacts: [],
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    ...overrides,
  }
}
