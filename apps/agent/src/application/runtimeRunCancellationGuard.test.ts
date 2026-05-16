import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun } from '../state/types.js'
import { createRuntimeRunCancellationGuard } from './runtimeRunCancellationGuard.js'

test('createRuntimeRunCancellationGuard throws for persisted cancelled runs', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ status: 'cancelled' }))
  const guard = createRuntimeRunCancellationGuard({ store })

  assert.throws(() => guard.throwIfRunCancelled('run_1'), /Run was cancelled/)
})

test('createRuntimeRunCancellationGuard respects abort signals', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ status: 'in_progress' }))
  const controller = new AbortController()
  controller.abort(new Error('stop now'))
  const guard = createRuntimeRunCancellationGuard({ store })

  assert.throws(() => guard.throwIfRunCancelled('run_1', controller.signal), /stop now/)
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
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
