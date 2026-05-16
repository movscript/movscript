import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun } from '../state/types.js'
import {
  applyRuntimeSubtreeCancellation,
  planRuntimeSubtreeCancellation,
} from './runtimeRunCancellation.js'

test('planRuntimeSubtreeCancellation returns active subtree runs in leaf-first cancellation order', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_root', status: 'in_progress' }))
  store.createRun(makeRun({ id: 'run_child_a', parentRunId: 'run_root', status: 'queued' }))
  store.createRun(makeRun({ id: 'run_grandchild', parentRunId: 'run_child_a', status: 'completed' }))
  store.createRun(makeRun({ id: 'run_child_b', parentRunId: 'run_root', status: 'requires_action' }))

  const plan = planRuntimeSubtreeCancellation({
    store,
    runId: 'run_root',
    reason: ' stop now ',
  })

  assert.equal(plan.reason, 'stop now')
  assert.deepEqual(plan.runIds, ['run_child_b', 'run_child_a', 'run_root'])
})

test('planRuntimeSubtreeCancellation validates the root run and falls back to a default reason', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_root', status: 'cancelled' }))

  assert.deepEqual(planRuntimeSubtreeCancellation({ store, runId: 'run_root' }), {
    reason: 'Run subtree was cancelled.',
    runIds: [],
  })
  assert.throws(() => planRuntimeSubtreeCancellation({ store, runId: 'missing_run' }), /run not found: missing_run/)
})

test('applyRuntimeSubtreeCancellation cancels planned runs in order with the planned reason', () => {
  const calls: string[] = []
  const result = applyRuntimeSubtreeCancellation({
    plan: {
      reason: 'stop now',
      runIds: ['run_child', 'run_root'],
    },
    cancelRun: (runId, reason) => calls.push(`${runId}:${reason}`),
  })

  assert.deepEqual(result.cancelledRunIds, ['run_child', 'run_root'])
  assert.deepEqual(calls, ['run_child:stop now', 'run_root:stop now'])
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'queued',
    role: 'planner',
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
