import assert from 'node:assert/strict'
import test from 'node:test'
import { projectTasksOntoTaskGraph, resolvePlanStatusFromTasks } from './planProjection.js'
import type { AgentTaskGraph, AgentTask } from './types.js'

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

test('projectTasksOntoTaskGraph updates progress timestamps and completion markers', () => {
  const taskGraph = planFixture({ status: 'running', progress: 0.2 })
  const result = projectTasksOntoTaskGraph(taskGraph, [
    task({ status: 'done', progress: 1 }),
    task({ id: 'task_2', status: 'done', progress: 0.5 }),
  ], '2026-05-16T01:00:00.000Z')
  assert.equal(result.previousStatus, 'running')
  assert.equal(result.nextStatus, 'done')
  assert.equal(result.completedNow, true)
  assert.equal(taskGraph.status, 'done')
  assert.equal(taskGraph.progress, 0.75)
  assert.equal(taskGraph.completedAt, '2026-05-16T01:00:00.000Z')
  assert.equal(taskGraph.updatedAt, '2026-05-16T01:00:00.000Z')
})

test('projectTasksOntoTaskGraph preserves empty taskGraph progress and manages blocked reason', () => {
  const emptyTaskGraph = planFixture({ status: 'blocked', progress: 0.4, blockedReason: 'old' })
  projectTasksOntoTaskGraph(emptyTaskGraph, [], '2026-05-16T01:00:00.000Z')
  assert.equal(emptyTaskGraph.status, 'blocked')
  assert.equal(emptyTaskGraph.progress, 0.4)
  assert.equal(emptyTaskGraph.blockedReason, undefined)

  const blockedTaskGraph = planFixture()
  projectTasksOntoTaskGraph(blockedTaskGraph, [
    task({ status: 'blocked', blockedReason: 'Need input' }),
    task({ id: 'task_2', status: 'blocked', blockedReason: 'Later blocker' }),
  ], '2026-05-16T01:00:00.000Z')
  assert.equal(blockedTaskGraph.status, 'blocked')
  assert.equal(blockedTaskGraph.blockedReason, 'Need input')
})

test('projectTasksOntoTaskGraph sets failed and cancelled timestamps once', () => {
  const failedTaskGraph = planFixture({ failedAt: 'old' })
  projectTasksOntoTaskGraph(failedTaskGraph, [task({ status: 'failed' })], 'new')
  assert.equal(failedTaskGraph.failedAt, 'old')

  const cancelledTaskGraph = planFixture()
  projectTasksOntoTaskGraph(cancelledTaskGraph, [task({ status: 'cancelled' })], 'new')
  assert.equal(cancelledTaskGraph.cancelledAt, 'new')
})

function planFixture(overrides: Partial<AgentTaskGraph> = {}): AgentTaskGraph {
  return {
    id: 'task_graph_1',
    threadId: 'thread_1',
    title: 'TaskGraph',
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
    taskGraphId: 'task_graph_1',
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
