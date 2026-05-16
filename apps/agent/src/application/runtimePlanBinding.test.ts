import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentRun } from '../state/types.js'
import {
  attachPlannerRunToRuntimePlan,
  findRuntimeThreadPlan,
  requireRuntimePlannerRun,
  resolveRuntimePlannerRunPlanId,
} from './runtimePlanBinding.js'
import { requireRuntimePlan } from './runtimeStoreLookup.js'

test('requireRuntimePlannerRun resolves planner runs and rejects workers', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_planner', role: 'planner' }))
  store.createRun(makeRun({ id: 'run_worker', role: 'worker' }))

  assert.equal(requireRuntimePlannerRun(store, 'run_planner').id, 'run_planner')
  assert.throws(() => requireRuntimePlannerRun(store, 'run_worker'), /is not a planner run/)
  assert.throws(() => requireRuntimePlannerRun(store, 'missing'), /run not found: missing/)
})

test('requireRuntimePlan and findRuntimeThreadPlan read plans through the store boundary', () => {
  const store = new InMemoryAgentStore()
  store.createPlan(makePlan({ id: 'plan_1', threadId: 'thread_1' }))
  store.createPlan(makePlan({ id: 'plan_2', threadId: 'thread_2' }))

  assert.equal(requireRuntimePlan(store, 'plan_1').id, 'plan_1')
  assert.equal(findRuntimeThreadPlan(store, 'thread_2')?.id, 'plan_2')
  assert.equal(findRuntimeThreadPlan(store, 'thread_missing'), undefined)
  assert.throws(() => requireRuntimePlan(store, 'missing'), /plan not found: missing/)
})

test('attachPlannerRunToRuntimePlan persists run binding and repairs stale plan root', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_1' }))
  store.createPlan(makePlan({ id: 'plan_1', rootRunId: 'stale_run' }))

  const attached = attachPlannerRunToRuntimePlan({
    store,
    runId: 'run_1',
    planId: 'plan_1',
    source: 'tool',
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.equal(attached.planId, 'plan_1')
  assert.equal(store.getRun('run_1')?.planId, 'plan_1')
  assert.equal(store.getRun('run_1')?.metadata?.attachedPlanByTool, 'tool')
  assert.equal(store.getPlan('plan_1')?.rootRunId, 'run_1')
})

test('resolveRuntimePlannerRunPlanId selects and attaches plan within planner boundaries', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_1' }))
  store.createPlan(makePlan({ id: 'plan_1' }))

  const planId = resolveRuntimePlannerRunPlanId({
    store,
    plannerRun: requireRuntimePlannerRun(store, 'run_1'),
    source: 'tool',
    action: 'inspect',
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.equal(planId, 'plan_1')
  assert.equal(store.getRun('run_1')?.planId, 'plan_1')
})

test('resolveRuntimePlannerRunPlanId rejects plans outside the planner thread', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_1', threadId: 'thread_1' }))
  store.createPlan(makePlan({ id: 'plan_2', threadId: 'thread_2' }))

  assert.throws(() => resolveRuntimePlannerRunPlanId({
    store,
    plannerRun: requireRuntimePlannerRun(store, 'run_1'),
    inputPlanId: 'plan_2',
    source: 'tool',
    action: 'inspect',
    now: '2026-01-01T00:00:01.000Z',
  }), /cannot inspect plan plan_2/)
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
