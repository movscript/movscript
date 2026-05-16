import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { InMemoryAgentStore } from './store.js'
import type { AgentRun, AgentTraceEvent } from './types.js'

test('listRunTraceEvents paginates stably and returns an empty page for stale cursors', () => {
  const store = new InMemoryAgentStore()
  const run = buildRun()
  store.createRun(run)
  store.appendTraceEvent(buildTraceEvent('trace_2', '2026-05-06T00:00:02.000Z', 'tool_call'))
  store.appendTraceEvent(buildTraceEvent('trace_1', '2026-05-06T00:00:01.000Z', 'context'))
  store.appendTraceEvent(buildTraceEvent('trace_3', '2026-05-06T00:00:03.000Z', 'tool_call'))

  assert.deepEqual(store.listRunTraceEvents(run.id, { limit: 2 }).map((event) => event.id), ['trace_1', 'trace_2'])
  assert.deepEqual(store.listRunTraceEvents(run.id, { cursor: 'trace_2', limit: 2 }).map((event) => event.id), ['trace_3'])
  assert.deepEqual(store.listRunTraceEvents(run.id, { cursor: 'missing_trace', limit: 2 }), [])
  assert.deepEqual(store.listRunTraceEvents(run.id, { kind: 'tool_call' }).map((event) => event.id), ['trace_2', 'trace_3'])
  assert.equal(store.countRunTraceEvents(run.id), 3)
  assert.equal(store.countRunTraceEvents(run.id, { kind: 'tool_call' }), 2)
})

function buildRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    role: 'worker',
    status: 'in_progress',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z',
    steps: [],
    traceEvents: [],
  }
}

function buildTraceEvent(id: string, createdAt: string, kind: AgentTraceEvent['kind']): AgentTraceEvent {
  return {
    id,
    runId: 'run_1',
    kind,
    title: id,
    status: 'completed',
    createdAt,
  }
}
