import assert from 'node:assert/strict'
import test from 'node:test'
import { snapshotTaskForProtocolEvent, taskStatusProtocolEvent } from './taskProtocolEvent.js'
import type { AgentTask } from './types.js'

test('taskStatusProtocolEvent maps task lifecycle statuses to protocol events', () => {
  assert.deepEqual(taskStatusProtocolEvent(task({ status: 'running' })), { eventType: 'task_started', title: 'Task started', status: 'started' })
  assert.deepEqual(taskStatusProtocolEvent(task({ status: 'needs_review' })), { eventType: 'needs_review', title: 'Task needs review', status: 'blocked' })
  assert.deepEqual(taskStatusProtocolEvent(task({ status: 'done' })), { eventType: 'task_completed', title: 'Task completed', status: 'completed' })
  assert.deepEqual(taskStatusProtocolEvent(task({ status: 'failed' })), { eventType: 'task_failed', title: 'Task failed', status: 'failed' })
  assert.deepEqual(taskStatusProtocolEvent(task({ status: 'cancelled' })), { eventType: 'task_cancelled', title: 'Task cancelled', status: 'failed' })
  assert.deepEqual(taskStatusProtocolEvent(task({ status: 'pending' })), { eventType: 'task_pending', title: 'Task pending', status: 'info' })
})

test('taskStatusProtocolEvent distinguishes regular blocked tasks from input-blocked tasks', () => {
  assert.deepEqual(taskStatusProtocolEvent(task({ status: 'blocked' })), {
    eventType: 'blocked',
    title: 'Task blocked',
    status: 'blocked',
  })
  assert.deepEqual(taskStatusProtocolEvent(task({ status: 'blocked', metadata: { blockedKind: 'needs_input' } })), {
    eventType: 'needs_input',
    title: 'Task needs input',
    status: 'blocked',
  })
})

test('snapshotTaskForProtocolEvent clones mutable task collections for before/after comparisons', () => {
  const original = task({
    deps: ['task_a'],
    artifacts: [{ id: 'artifact_1', type: 'run', createdAt: 'created' }],
  })
  const snapshot = snapshotTaskForProtocolEvent(original)

  original.deps.push('task_b')
  original.artifacts.push({ id: 'artifact_2', type: 'run', createdAt: 'created' })

  assert.deepEqual(snapshot.deps, ['task_a'])
  assert.deepEqual(snapshot.artifacts.map((artifact) => artifact.id), ['artifact_1'])
})

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    planId: 'plan_1',
    deps: [],
    title: 'Task',
    status: 'pending',
    progress: 0,
    artifacts: [],
    createdAt: 'created',
    updatedAt: 'updated',
    ...overrides,
  }
}
