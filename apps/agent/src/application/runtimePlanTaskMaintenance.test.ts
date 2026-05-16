import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun, AgentTask } from '../state/types.js'
import {
  applyRuntimeReplanTaskReset,
  applyRuntimeRetryablePlanTaskReset,
  resetRetryableRuntimePlanTasks,
  resetRuntimePlanTasksForReplan,
} from './runtimePlanTaskMaintenance.js'

test('resetRetryableRuntimePlanTasks persists retryable failed tasks and returns protocol snapshots', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_failed', status: 'failed', ownerRunId: 'run_old', metadata: { maxTaskAttempts: 3 } }))
  store.createTask(makeTask({ id: 'task_done', status: 'done' }))
  store.createRun(makeRun({ id: 'run_old', taskId: 'task_failed' }))

  const result = resetRetryableRuntimePlanTasks({
    store,
    planId: 'plan_1',
    maxTaskAttempts: 2,
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.deepEqual(result.retriedTaskIds, ['task_failed'])
  assert.equal(result.changes.length, 1)
  assert.equal(result.changes[0]?.previousTask.status, 'failed')
  assert.equal(result.changes[0]?.task.status, 'pending')
  assert.equal(result.changes[0]?.task.metadata?.retryAttempt, 2)
  assert.equal(result.changes[0]?.task.metadata?.previousOwnerRunId, 'run_old')
  assert.equal(store.getTask('task_failed')?.ownerRunId, undefined)
})

test('resetRetryableRuntimePlanTasks leaves exhausted tasks unchanged', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_failed', status: 'failed', metadata: { maxTaskAttempts: 1 } }))
  store.createRun(makeRun({ id: 'run_old', taskId: 'task_failed' }))

  const result = resetRetryableRuntimePlanTasks({
    store,
    planId: 'plan_1',
    maxTaskAttempts: 3,
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.deepEqual(result.retriedTaskIds, [])
  assert.equal(result.changes.length, 0)
  assert.equal(store.getTask('task_failed')?.status, 'failed')
})

test('applyRuntimeRetryablePlanTaskReset emits reset callbacks and aggregate callback', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_failed', status: 'failed', ownerRunId: 'run_old' }))
  store.createRun(makeRun({ id: 'run_old', taskId: 'task_failed' }))
  const taskEvents: string[] = []
  const aggregateEvents: string[][] = []

  const result = applyRuntimeRetryablePlanTaskReset({
    store,
    planId: 'plan_1',
    maxTaskAttempts: 3,
    now: '2026-01-01T00:00:01.000Z',
    onTaskReset: (task, previousTask) => taskEvents.push(`${previousTask.status}->${task.status}:${task.id}`),
    onTasksReset: (retriedTaskIds) => aggregateEvents.push(retriedTaskIds),
  })

  assert.deepEqual(result.retriedTaskIds, ['task_failed'])
  assert.deepEqual(taskEvents, ['failed->pending:task_failed'])
  assert.deepEqual(aggregateEvents, [['task_failed']])
})

test('resetRuntimePlanTasksForReplan persists selected task resets and returns snapshots', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_blocked', status: 'blocked', ownerRunId: 'run_blocked', blockedReason: 'waiting' }))
  store.createTask(makeTask({ id: 'task_running', status: 'running', ownerRunId: 'run_running' }))
  store.createTask(makeTask({ id: 'task_done', status: 'done' }))

  const result = resetRuntimePlanTasksForReplan({
    store,
    planId: 'plan_1',
    resetBlocked: true,
    resetTaskIds: ['task_running'],
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.deepEqual(result.resetTaskIds, ['task_blocked', 'task_running'])
  assert.equal(result.changes[0]?.previousTask.status, 'blocked')
  assert.equal(result.changes[0]?.task.status, 'pending')
  assert.equal(result.changes[0]?.task.blockedReason, undefined)
  assert.equal(result.changes[1]?.previousTask.ownerRunId, 'run_running')
  assert.equal(result.changes[1]?.task.metadata?.previousStatus, 'running')
  assert.equal(store.getTask('task_running')?.ownerRunId, undefined)
  assert.equal(store.getTask('task_done')?.status, 'done')
})

test('applyRuntimeReplanTaskReset emits per-task reset callbacks', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_blocked', status: 'blocked', ownerRunId: 'run_blocked' }))
  const taskEvents: string[] = []

  const result = applyRuntimeReplanTaskReset({
    store,
    planId: 'plan_1',
    resetBlocked: true,
    now: '2026-01-01T00:00:01.000Z',
    onTaskReset: (task, previousTask) => taskEvents.push(`${previousTask.status}->${task.status}:${task.id}`),
  })

  assert.deepEqual(result.resetTaskIds, ['task_blocked'])
  assert.deepEqual(taskEvents, ['blocked->pending:task_blocked'])
})

test('resetRuntimePlanTasksForReplan is inert without a reset policy', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_blocked', status: 'blocked' }))

  const result = resetRuntimePlanTasksForReplan({
    store,
    planId: 'plan_1',
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.deepEqual(result.resetTaskIds, [])
  assert.equal(result.changes.length, 0)
  assert.equal(store.getTask('task_blocked')?.status, 'blocked')
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    planId: 'plan_1',
    status: 'failed',
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
