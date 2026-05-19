import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun } from '../state/types.js'
import {
  getRuntimeChildRuns,
  getRuntimeRun,
  listRuntimeRuns,
  listRuntimeRunsByParent,
  listRuntimeRunsByThread,
} from './runtimeRunProjection.js'

test('runtime run projection returns product-safe runs without trace events', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_parent', traceEvents: [{ id: 'trace_1' } as any] }))
  store.createRun(makeRun({ id: 'run_child', parentRunId: 'run_parent', traceEvents: [{ id: 'trace_2' } as any] }))

  assert.deepEqual(listRuntimeRuns({ store }).map((run) => run.id), ['run_parent', 'run_child'])
  assert.equal(listRuntimeRuns({ store })[0]?.traceEvents?.length, 0)
  assert.deepEqual(listRuntimeRunsByParent({ store, parentRunId: 'run_parent' }).map((run) => run.id), ['run_child'])
  assert.deepEqual(listRuntimeRunsByThread({ store, threadId: 'thread_1' }).map((run) => run.id), ['run_parent', 'run_child'])
  assert.deepEqual(listRuntimeRunsByThread({ store, threadId: 'thread_other' }).map((run) => run.id), [])
  assert.equal(getRuntimeRun({ store, runId: 'run_parent' })?.traceEvents?.length, 0)
  assert.deepEqual(getRuntimeChildRuns({ store, parentRunId: 'run_parent' }).map((run) => run.id), ['run_child'])
})

test('getRuntimeChildRuns validates the parent run exists', () => {
  const store = new InMemoryAgentStore()

  assert.throws(() => getRuntimeChildRuns({
    store,
    parentRunId: 'missing_run',
  }), /run not found: missing_run/)
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
