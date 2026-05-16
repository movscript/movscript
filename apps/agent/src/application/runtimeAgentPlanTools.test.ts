import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentPlanSnapshot, AgentRun } from '../state/types.js'
import {
  buildRuntimeAgentReplanResult,
  finalizeRuntimeAgentPlanCreation,
  getRuntimeAgentPlan,
  prepareRuntimeAgentPlanCreation,
  prepareRuntimeAgentReplan,
} from './runtimeAgentPlanTools.js'

test('prepareRuntimeAgentPlanCreation returns existing planner plans and attaches thread plans', () => {
  const existingStore = new InMemoryAgentStore()
  existingStore.createRun(makeRun({ id: 'run_planner', planId: 'plan_existing' }))
  existingStore.createPlan(makePlan({ id: 'plan_existing' }))

  const existing = prepareRuntimeAgentPlanCreation({
    store: existingStore,
    plannerRunId: 'run_planner',
    now: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(existing.status, 'exists')
  assert.equal('planId' in existing ? existing.planId : undefined, 'plan_existing')

  const attachStore = new InMemoryAgentStore()
  attachStore.createRun(makeRun({ id: 'run_planner' }))
  attachStore.createPlan(makePlan({ id: 'plan_thread' }))

  const attached = prepareRuntimeAgentPlanCreation({
    store: attachStore,
    plannerRunId: 'run_planner',
    now: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(attached.status, 'attached')
  assert.equal('planId' in attached ? attached.planId : undefined, 'plan_thread')
  assert.equal(attachStore.getRun('run_planner')?.planId, 'plan_thread')
})

test('finalizeRuntimeAgentPlanCreation attaches planner and starts or blocks the plan', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_planner' }))
  store.createPlan(makePlan({ id: 'plan_1', status: 'pending' }))

  const finalized = finalizeRuntimeAgentPlanCreation({
    store,
    plannerRunId: 'run_planner',
    planId: 'plan_1',
    taskCount: 1,
    now: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(finalized.planId, 'plan_1')
  assert.equal(store.getRun('run_planner')?.planId, 'plan_1')
  assert.equal(store.getPlan('plan_1')?.status, 'running')

  store.createRun(makeRun({ id: 'run_empty', threadId: 'thread_2' }))
  store.createPlan(makePlan({ id: 'plan_empty', threadId: 'thread_2', status: 'pending' }))
  finalizeRuntimeAgentPlanCreation({
    store,
    plannerRunId: 'run_empty',
    planId: 'plan_empty',
    taskCount: 0,
    now: '2026-01-01T00:00:00.000Z',
  })
  assert.equal(store.getPlan('plan_empty')?.status, 'blocked')
})

test('getRuntimeAgentPlan resolves plan ids and enforces thread boundaries', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_planner', planId: 'plan_1' }))
  store.createPlan(makePlan({ id: 'plan_1' }))
  store.createPlan(makePlan({ id: 'plan_other', threadId: 'thread_other' }))

  const result = getRuntimeAgentPlan({
    store,
    plannerRunId: 'run_planner',
    getPlanSnapshot: makeSnapshot,
  }) as { status?: string; planId?: string }

  assert.equal(result.status, 'ok')
  assert.equal(result.planId, 'plan_1')
  assert.throws(() => getRuntimeAgentPlan({
    store,
    plannerRunId: 'run_planner',
    request: { planId: 'plan_other' },
    getPlanSnapshot: makeSnapshot,
  }), /cannot inspect plan/)
})

test('prepareRuntimeAgentReplan attaches implicit thread plans and builds stable replan results', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_planner' }))
  store.createPlan(makePlan({ id: 'plan_1' }))

  const prepared = prepareRuntimeAgentReplan({
    store,
    plannerRunId: 'run_planner',
    request: { dispatch: false },
    now: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(prepared.planId, 'plan_1')
  assert.equal(prepared.replanInput.plannerRunId, 'run_planner')
  assert.equal(store.getRun('run_planner')?.planId, 'plan_1')

  const response = buildRuntimeAgentReplanResult({
    planId: 'plan_1',
    plannerRunId: 'run_planner',
    result: {
      plan: makePlan({ id: 'plan_1' }),
      createdTaskIds: ['task_new'],
      updatedTaskIds: [],
      resetTaskIds: [],
    },
    snapshot: makeSnapshot('plan_1'),
  }) as { status?: string; createdTaskIds?: string[] }

  assert.equal(response.status, 'updated')
  assert.deepEqual(response.createdTaskIds, ['task_new'])
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_planner',
    threadId: 'thread_1',
    role: 'planner',
    status: 'in_progress',
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

function makeSnapshot(planId = 'plan_1'): AgentPlanSnapshot {
  return {
    plan: makePlan({ id: planId }),
    tasks: [],
    runs: [],
    summary: {
      taskCount: 0,
      taskStatusCounts: {
        pending: 0,
        running: 0,
        blocked: 0,
        needs_review: 0,
        done: 0,
        failed: 0,
        cancelled: 0,
      },
      workerCount: 0,
      activeWorkerCount: 0,
      artifactCount: 0,
      nameConflictCount: 0,
      blockedTaskIds: [],
      needsReviewTaskIds: [],
      failedTaskIds: [],
    },
  }
}
