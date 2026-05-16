import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentRun, AgentTask } from '../state/types.js'
import { getRuntimePlanSnapshot } from './runtimePlanSnapshot.js'

test('getRuntimePlanSnapshot builds a product-safe plan snapshot from store state', () => {
  const store = new InMemoryAgentStore()
  store.createPlan(makePlan())
  store.createTask(makeTask({ id: 'task_1', status: 'done', progress: 1 }))
  store.createRun(makeRun({
    id: 'run_worker',
    planId: 'plan_1',
    taskId: 'task_1',
    role: 'worker',
    status: 'completed',
  }))

  const snapshot = getRuntimePlanSnapshot({ store, planId: 'plan_1' })

  assert.equal(snapshot.plan.id, 'plan_1')
  assert.equal(snapshot.tasks.length, 1)
  assert.equal(snapshot.runs.length, 1)
  assert.equal(snapshot.runs[0]?.id, 'run_worker')
  assert.ok(snapshot.summary)
  assert.equal(snapshot.summary.taskCount, 1)
  assert.equal(snapshot.summary.workerCount, 1)
})

test('getRuntimePlanSnapshot uses stable not-found errors', () => {
  const store = new InMemoryAgentStore()

  assert.throws(() => getRuntimePlanSnapshot({
    store,
    planId: 'missing_plan',
  }), /plan not found: missing_plan/)
})

function makePlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    id: 'plan_1',
    threadId: 'thread_1',
    title: 'Plan',
    status: 'running',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
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
