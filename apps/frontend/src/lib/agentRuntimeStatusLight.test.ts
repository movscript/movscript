import assert from 'node:assert/strict'
import test from 'node:test'

import {
  runtimeStatusLightFromActiveRun,
  runtimeStatusLightFromThreadRuntimeSnapshot,
} from './agentRuntimeStatusLight'
import type { AgentRun, AgentRuntimeSnapshotV2 } from './localAgentClient'

test('runtimeStatusLightFromThreadRuntimeSnapshot derives stopped when no automatic run can continue', () => {
  assert.equal(runtimeStatusLightFromThreadRuntimeSnapshot(snapshot()).state, 'stopped')
})

test('runtimeStatusLightFromThreadRuntimeSnapshot derives waiting for async work and pending continuation inputs', () => {
  assert.equal(runtimeStatusLightFromThreadRuntimeSnapshot(snapshot({ runningWorkIds: ['work_1'] })).state, 'waiting')
  assert.equal(runtimeStatusLightFromThreadRuntimeSnapshot(snapshot({ pendingInteractionIds: ['interaction_1'] })).state, 'waiting')
  assert.equal(runtimeStatusLightFromThreadRuntimeSnapshot(snapshot({ readyContinuationIds: ['continuation_1'] })).state, 'waiting')
})

test('runtimeStatusLightFromThreadRuntimeSnapshot derives active while a run loop is active', () => {
  assert.equal(runtimeStatusLightFromThreadRuntimeSnapshot(snapshot({ activeRunIds: ['run_1'], runningWorkIds: ['work_1'] })).state, 'active')
})

test('runtimeStatusLightFromActiveRun can override a stale projection fallback', () => {
  assert.equal(runtimeStatusLightFromActiveRun(run({ status: 'in_progress' })).state, 'active')
  assert.equal(runtimeStatusLightFromActiveRun(run({ status: 'requires_action' })).state, 'waiting')
  assert.equal(runtimeStatusLightFromActiveRun(run({ status: 'completed' })).state, 'stopped')
})

function snapshot(current: {
  activeRunIds?: string[]
  waitingRunIds?: string[]
  runningWorkIds?: string[]
  pendingInteractionIds?: string[]
  readyContinuationIds?: string[]
} = {}): Pick<AgentRuntimeSnapshotV2, 'entities' | 'scope'> {
  return {
    scope: { type: 'thread', id: 'thread_1' },
    entities: {
      runs: [
        ...(current.activeRunIds ?? []).map((id) => run({ id, status: 'in_progress' })),
        ...(current.waitingRunIds ?? []).map((id) => run({ id, status: 'requires_action' })),
      ],
      works: (current.runningWorkIds ?? []).map((id) => ({
        id,
        threadId: 'thread_1',
        runId: 'run_1',
        kind: 'generation_job' as const,
        mode: 'async' as const,
        status: 'running' as const,
        request: {},
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
      })),
      interactions: (current.pendingInteractionIds ?? []).map((id) => ({
        id,
        threadId: 'thread_1',
        runId: 'run_1',
        kind: 'input' as const,
        status: 'pending' as const,
        payload: {},
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
      })),
      continuations: (current.readyContinuationIds ?? []).map((id) => ({
        id,
        threadId: 'thread_1',
        runId: 'run_1',
        status: 'ready' as const,
        trigger: { type: 'manual' as const },
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
      })),
    },
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}
