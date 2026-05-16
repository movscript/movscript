import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentThread } from '../state/types.js'
import { createRuntimePlanWithTasks } from './runtimePlanCreation.js'

test('createRuntimePlanWithTasks persists a plan and validated tasks', () => {
  const store = new InMemoryAgentStore()
  const result = createRuntimePlanWithTasks({
    store,
    planId: 'plan_1',
    thread: makeThread(),
    planInput: { title: 'Launch plan', metadata: { source: 'test' } },
    taskInputs: [{ id: 'task_1', title: 'Draft' }],
    now: '2026-01-01T00:00:00.000Z',
    goal: 'Launch',
    plannerSource: 'fallback',
    plannerWarnings: ['limited context'],
  })

  assert.equal(result.plan.id, 'plan_1')
  assert.equal(result.plan.status, 'pending')
  assert.equal(result.plan.metadata?.goal, 'Launch')
  assert.equal(result.plan.metadata?.plannerSource, 'fallback')
  assert.deepEqual(result.plan.metadata?.plannerWarnings, ['limited context'])
  assert.equal(result.tasks.length, 1)
  assert.equal(result.tasks[0]?.id, 'task_1')
  assert.equal(store.getPlan('plan_1')?.title, 'Launch plan')
  assert.equal(store.getTask('task_1')?.planId, 'plan_1')
})

test('createRuntimePlanWithTasks validates tasks before writing plan state', () => {
  const store = new InMemoryAgentStore()

  assert.throws(() => createRuntimePlanWithTasks({
    store,
    planId: 'plan_1',
    thread: makeThread(),
    planInput: { title: 'Invalid plan' },
    taskInputs: [
      { id: 'task_1', title: 'Depends on missing', deps: ['missing_task'] },
    ],
    now: '2026-01-01T00:00:00.000Z',
  }), /task not found: missing_task/)
  assert.equal(store.getPlan('plan_1'), undefined)
})

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
