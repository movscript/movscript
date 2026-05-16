import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentTask } from '../state/types.js'
import {
  getRuntimePlan,
  getRuntimeTaskTree,
  listRuntimePlans,
} from './runtimePlanRead.js'

test('runtime plan read helpers return plans and task trees from the store', () => {
  const store = new InMemoryAgentStore()
  store.createPlan(makePlan({ id: 'plan_1' }))
  store.createTask(makeTask({ id: 'task_1', planId: 'plan_1' }))

  assert.deepEqual(listRuntimePlans({ store }).map((plan) => plan.id), ['plan_1'])
  assert.equal(getRuntimePlan({ store, planId: 'plan_1' })?.id, 'plan_1')
  assert.deepEqual(getRuntimeTaskTree({ store, planId: 'plan_1' }).map((task) => task.id), ['task_1'])
})

test('getRuntimeTaskTree validates plan existence', () => {
  const store = new InMemoryAgentStore()

  assert.throws(() => getRuntimeTaskTree({
    store,
    planId: 'missing_plan',
  }), /plan not found: missing_plan/)
})

function makePlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    id: 'plan_1',
    threadId: 'thread_1',
    title: 'Plan',
    status: 'pending',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
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
