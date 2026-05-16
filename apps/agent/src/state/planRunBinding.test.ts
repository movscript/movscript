import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertPlannerRunCanUsePlan,
  attachPlannerRunToPlanState,
  findThreadPlan,
  requirePlannerRunState,
  selectReplanPlannerRunId,
  selectPlannerRunPlanId,
} from './planRunBinding.js'
import type { AgentPlan, AgentRun } from './types.js'

test('requirePlannerRunState rejects worker runs', () => {
  assert.throws(() => requirePlannerRunState(makeRun({ role: 'worker' })), /is not a planner run/)
})

test('findThreadPlan returns the plan for the same thread', () => {
  const plan = makePlan({ id: 'plan_2', threadId: 'thread_2' })
  assert.equal(findThreadPlan([makePlan(), plan], 'thread_2'), plan)
})

test('selectPlannerRunPlanId prefers explicit input then attached run then thread plan', () => {
  const plannerRun = makeRun({ planId: 'plan_attached' })
  const threadPlan = makePlan({ id: 'plan_thread' })

  assert.equal(selectPlannerRunPlanId({ plannerRun, inputPlanId: ' plan_input ', threadPlan, source: 'tool' }), 'plan_input')
  assert.equal(selectPlannerRunPlanId({ plannerRun, threadPlan, source: 'tool' }), 'plan_attached')
  assert.equal(selectPlannerRunPlanId({ plannerRun: makeRun(), threadPlan, source: 'tool' }), 'plan_thread')
  assert.throws(() => selectPlannerRunPlanId({ plannerRun: makeRun(), source: 'tool' }), /requires planId/)
})

test('assertPlannerRunCanUsePlan protects thread and attached plan boundaries', () => {
  assert.doesNotThrow(() => assertPlannerRunCanUsePlan({
    plannerRun: makeRun({ planId: 'plan_1' }),
    plan: makePlan({ id: 'plan_1' }),
    action: 'inspect',
  }))
  assert.throws(() => assertPlannerRunCanUsePlan({
    plannerRun: makeRun({ planId: 'plan_2' }),
    plan: makePlan({ id: 'plan_1' }),
    action: 'inspect',
  }), /cannot inspect plan plan_1/)
  assert.throws(() => assertPlannerRunCanUsePlan({
    plannerRun: makeRun({ threadId: 'thread_2' }),
    plan: makePlan({ threadId: 'thread_1' }),
    action: 'inspect',
  }), /cannot inspect plan plan_1/)
})

test('selectReplanPlannerRunId prefers explicit input then planner run then parent then plan root', () => {
  assert.equal(selectReplanPlannerRunId({
    run: makeRun({ id: 'run_current' }),
    plan: makePlan({ rootRunId: 'run_root' }),
    inputPlannerRunId: ' run_input ',
  }), 'run_input')
  assert.equal(selectReplanPlannerRunId({
    run: makeRun({ id: 'run_current', role: 'planner' }),
    plan: makePlan({ rootRunId: 'run_root' }),
  }), 'run_current')
  assert.equal(selectReplanPlannerRunId({
    run: makeRun({ role: 'worker', parentRunId: 'run_parent' }),
    plan: makePlan({ rootRunId: 'run_root' }),
  }), 'run_parent')
  assert.equal(selectReplanPlannerRunId({
    run: makeRun({ role: 'worker' }),
    plan: makePlan({ rootRunId: 'run_root' }),
  }), 'run_root')
  assert.throws(() => selectReplanPlannerRunId({
    run: makeRun({ role: 'worker' }),
    plan: makePlan(),
  }), /has no plannerRunId/)
})

test('attachPlannerRunToPlanState updates run and repairs missing or stale plan root', () => {
  const run = makeRun()
  const plan = makePlan()
  const result = attachPlannerRunToPlanState({
    run,
    plan,
    source: 'tool',
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.equal(result.planUpdated, true)
  assert.equal(run.planId, plan.id)
  assert.equal(run.progress, 0)
  assert.equal(run.metadata?.attachedPlanByTool, 'tool')
  assert.equal(plan.rootRunId, run.id)
})

test('attachPlannerRunToPlanState keeps a valid existing root run', () => {
  const rootRun = makeRun({ id: 'run_root' })
  const run = makeRun({ id: 'run_child' })
  const plan = makePlan({ rootRunId: rootRun.id })
  const result = attachPlannerRunToPlanState({
    run,
    plan,
    rootRun,
    source: 'tool',
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.equal(result.planUpdated, false)
  assert.equal(plan.rootRunId, rootRun.id)
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    role: 'planner',
    status: 'queued',
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
