import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentPlanSnapshot, AgentRun } from '../state/types.js'
import {
  applyRuntimeAgentPlanCreationToolFlow,
  applyRuntimeAgentReplanToolFlow,
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

test('applyRuntimeAgentPlanCreationToolFlow returns existing plans without creating another plan', async () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_planner', planId: 'plan_existing' }))
  store.createPlan(makePlan({ id: 'plan_existing' }))

  const result = await applyRuntimeAgentPlanCreationToolFlow({
    store,
    plannerRunId: 'run_planner',
    now: () => '2026-01-01T00:00:00.000Z',
    createPlan: async () => {
      throw new Error('createPlan should not be called')
    },
    getPlanSnapshot: makeSnapshot,
  }) as { status?: string; planId?: string; plannerRunId?: string }

  assert.equal(result.status, 'exists')
  assert.equal(result.planId, 'plan_existing')
  assert.equal(result.plannerRunId, 'run_planner')
})

test('applyRuntimeAgentPlanCreationToolFlow creates and finalizes a new session plan', async () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_planner', threadId: 'thread_1' }))
  const calls: string[] = []

  const result = await applyRuntimeAgentPlanCreationToolFlow({
    store,
    plannerRunId: 'run_planner',
    request: { goal: 'Draft a launch plan', title: 'Ignored by test' },
    now: () => '2026-01-01T00:00:00.000Z',
    createPlan: async (planInput) => {
      calls.push(`create:${String(planInput.threadId)}:${String(planInput.createPlannerRun)}:${String(planInput.goal)}`)
      store.createPlan(makePlan({ id: 'plan_created', threadId: String(planInput.threadId), status: 'pending' }))
      return makeSnapshotWithTasks('plan_created', 1)
    },
    getPlanSnapshot: (planId) => {
      calls.push(`snapshot:${planId}`)
      return makeSnapshotWithTasks(planId, 1)
    },
  }) as { status?: string; planId?: string; plannerRunId?: string }

  assert.deepEqual(calls, [
    'create:thread_1:false:Draft a launch plan',
    'snapshot:plan_created',
  ])
  assert.equal(result.status, 'created')
  assert.equal(result.planId, 'plan_created')
  assert.equal(result.plannerRunId, 'run_planner')
  assert.equal(store.getRun('run_planner')?.planId, 'plan_created')
  assert.equal(store.getPlan('plan_created')?.status, 'running')
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

test('applyRuntimeAgentReplanToolFlow prepares, replans, and projects the updated snapshot', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_planner' }))
  store.createPlan(makePlan({ id: 'plan_1' }))
  const calls: string[] = []

  const result = applyRuntimeAgentReplanToolFlow({
    store,
    plannerRunId: 'run_planner',
    request: { dispatch: false },
    now: () => '2026-01-01T00:00:00.000Z',
    replanRun: (runId, replanInput) => {
      calls.push(`replan:${runId}:${String(replanInput.planId)}:${String(replanInput.plannerRunId)}:${String(replanInput.dispatch)}`)
      return {
        plan: makePlan({ id: String(replanInput.planId) }),
        createdTaskIds: ['task_new'],
        updatedTaskIds: ['task_existing'],
        resetTaskIds: [],
      }
    },
    getPlanSnapshot: (planId) => {
      calls.push(`snapshot:${planId}`)
      return makeSnapshot(planId)
    },
  }) as { status?: string; createdTaskIds?: string[]; updatedTaskIds?: string[] }

  assert.deepEqual(calls, [
    'replan:run_planner:plan_1:run_planner:false',
    'snapshot:plan_1',
  ])
  assert.equal(result.status, 'updated')
  assert.deepEqual(result.createdTaskIds, ['task_new'])
  assert.deepEqual(result.updatedTaskIds, ['task_existing'])
  assert.equal(store.getRun('run_planner')?.planId, 'plan_1')
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

function makeSnapshotWithTasks(planId: string, taskCount: number): AgentPlanSnapshot {
  return {
    ...makeSnapshot(planId),
    tasks: Array.from({ length: taskCount }, (_, index) => ({
      id: `task_${index + 1}`,
      planId,
      title: `Task ${index + 1}`,
      status: 'pending',
      progress: 0,
      deps: [],
      artifacts: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
  }
}
