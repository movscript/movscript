import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentRun } from '../state/types.js'
import {
  applyRuntimePlanTreeCancellationRequest,
  resolveRuntimePlanTreeCancellationRoot,
} from './runtimePlanTreeCancellation.js'

test('resolveRuntimePlanTreeCancellationRoot accepts only the attached root planner run', () => {
  const store = new InMemoryAgentStore()
  store.createPlan(makePlan())
  store.createRun(makeRun({ id: 'run_root', role: 'planner', planId: 'plan_1' }))
  store.createRun(makeRun({ id: 'run_worker', role: 'worker', planId: 'plan_1' }))
  store.createRun(makeRun({ id: 'run_second_planner', role: 'planner', planId: 'plan_1' }))
  store.createRun(makeRun({ id: 'run_unattached', role: 'planner' }))

  assert.equal(resolveRuntimePlanTreeCancellationRoot({ store, runId: 'run_root' }), 'run_root')
  assert.throws(() => resolveRuntimePlanTreeCancellationRoot({ store, runId: 'run_worker' }), /is not a planner run/)
  assert.throws(() => resolveRuntimePlanTreeCancellationRoot({ store, runId: 'run_second_planner' }), /is not the root planner/)
  assert.throws(() => resolveRuntimePlanTreeCancellationRoot({ store, runId: 'run_unattached' }), /is not attached to a plan/)
})

test('applyRuntimePlanTreeCancellationRequest resolves the root and delegates subtree cancellation', () => {
  const store = new InMemoryAgentStore()
  store.createPlan(makePlan())
  store.createRun(makeRun({ id: 'run_root', role: 'planner', planId: 'plan_1' }))
  const calls: string[] = []

  const result = applyRuntimePlanTreeCancellationRequest({
    store,
    runId: 'run_root',
    cancelSubtree: (runId) => {
      calls.push(`subtree:${runId}`)
      return { cancelledRunIds: [runId] }
    },
  })

  assert.deepEqual(result.cancelledRunIds, ['run_root'])
  assert.deepEqual(calls, ['subtree:run_root'])
})

function makePlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    id: 'plan_1',
    threadId: 'thread_1',
    rootRunId: 'run_root',
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
    id: 'run_root',
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
    steps: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
