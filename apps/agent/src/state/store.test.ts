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

  const summary = store.summarizeRunTraceEvents(run.id)
  assert.equal(summary.total, 3)
  assert.equal(summary.byKind.context, 1)
  assert.equal(summary.byKind.tool_call, 2)
  assert.equal(summary.latestEvent?.id, 'trace_3')
})

test('summarizeRunTraceEvents treats same-timestamp later appends as latest', () => {
  const store = new InMemoryAgentStore()
  const run = buildRun()
  store.createRun(run)
  store.appendTraceEvent(buildTraceEvent('trace_1', '2026-05-06T00:00:01.000Z', 'context'))
  store.appendTraceEvent(buildTraceEvent('trace_2', '2026-05-06T00:00:01.000Z', 'tool_call'))

  const page = store.listRunTraceEvents(run.id)
  const summary = store.summarizeRunTraceEvents(run.id)

  assert.deepEqual(page.map((event) => event.id), ['trace_1', 'trace_2'])
  assert.equal(summary.latestEvent?.id, 'trace_2')
})

test('trace storage normalizes invalid persisted event durations', () => {
  const store = new InMemoryAgentStore()
  const run = {
    ...buildRun(),
    traceEvents: [
      buildTraceEvent('trace_1', '2026-05-06T00:00:01.000Z', 'context', -1),
      buildTraceEvent('trace_2', '2026-05-06T00:00:02.000Z', 'tool_call', 0),
    ],
  }
  store.createRun(run)
  store.appendTraceEvent(buildTraceEvent('trace_3', '2026-05-06T00:00:03.000Z', 'tool_call', Number.NaN))

  const events = store.listRunTraceEvents(run.id)

  assert.equal(events[0].durationMs, undefined)
  assert.equal(events[1].durationMs, 0)
  assert.equal(events[2].durationMs, undefined)
})

test('trace storage drops invalid JSON data instead of coercing non-finite numbers to null', () => {
  const store = new InMemoryAgentStore()
  const run = buildRun()
  store.createRun(run)
  store.appendTraceEvent({
    ...buildTraceEvent('trace_1', '2026-05-06T00:00:01.000Z', 'context'),
    data: { score: Number.POSITIVE_INFINITY } as never,
  })

  const event = store.listRunTraceEvents(run.id)[0]

  assert.equal(event.data, undefined)
})

test('trace storage maintains a bounded debug ledger projection per run', () => {
  const store = new InMemoryAgentStore()
  const run = buildRun()
  store.createRun(run)
  store.appendTraceEvent({
    ...buildTraceEvent('trace_1', '2026-05-06T00:00:01.000Z', 'prompt'),
    data: {
      eventType: 'prompt.composed',
      charCount: 900,
      messageCount: 3,
      skillIds: ['policy.core'],
      availableToolNames: ['movscript_read_project'],
    },
  })
  store.appendTraceEvent({
    ...buildTraceEvent('trace_2', '2026-05-06T00:00:02.000Z', 'model_call'),
    data: {
      phase: 'request',
      request: { body: { model: 'gpt-test', messages: [{ role: 'user', content: 'hello' }] } },
    },
  })

  const ledger = store.getRunDebugLedger(run.id)

  assert.equal(ledger?.schema, 'movscript.agent.run-debug-ledger.v1')
  assert.equal(ledger?.context.promptChars, 900)
  assert.deepEqual(ledger?.context.activeSkillIds, ['policy.core'])
  assert.equal(ledger?.modelCalls[0]?.model, 'gpt-test')
  assert.ok((ledger?.budget.estimatedChars ?? Number.POSITIVE_INFINITY) <= 32_000)
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

function buildTraceEvent(id: string, createdAt: string, kind: AgentTraceEvent['kind'], durationMs?: number): AgentTraceEvent {
  return {
    id,
    runId: 'run_1',
    kind,
    title: id,
    status: 'completed',
    createdAt,
    ...(durationMs !== undefined ? { durationMs } : {}),
  }
}
