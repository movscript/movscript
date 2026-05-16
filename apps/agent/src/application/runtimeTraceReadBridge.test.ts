import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun, AgentTraceEvent } from '../state/types.js'
import { createRuntimeTraceReadBridge } from './runtimeTraceReadBridge.js'

function testRun(id = 'run_1'): AgentRun {
  return {
    id,
    threadId: 'thread_1',
    status: 'completed',
    role: 'planner',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
    policy: {},
  }
}

function trace(id: string, kind: AgentTraceEvent['kind']): AgentTraceEvent {
  return {
    id,
    runId: 'run_1',
    kind,
    title: id,
    status: 'completed',
    createdAt: `2026-01-01T00:00:0${id.at(-1)}.000Z`,
  }
}

test('createRuntimeTraceReadBridge reads trace events, pages, and summaries', () => {
  const store = new InMemoryAgentStore()
  const run = testRun()
  store.saveRun(run)
  store.appendTraceEvent(run.id, trace('trace_1', 'context'))
  store.appendTraceEvent(run.id, trace('trace_2', 'tool_call'))
  store.appendTraceEvent(run.id, trace('trace_3', 'tool_call'))

  const bridge = createRuntimeTraceReadBridge({ store })

  assert.deepEqual(bridge.getRunTraceEvents(run.id, { kind: 'tool_call' }).map((event) => event.id), ['trace_2', 'trace_3'])

  const page = bridge.getRunTracePage(run.id, { limit: 2 })
  assert.deepEqual(page.events.map((event) => event.id), ['trace_1', 'trace_2'])
  assert.equal(page.total, 3)
  assert.equal(page.hasMore, true)
  assert.equal(page.nextCursor, 'trace_2')

  const summary = bridge.getRunTraceSummary(run.id)
  assert.equal(summary.total, 3)
  assert.equal(summary.byKind.context, 1)
  assert.equal(summary.byKind.tool_call, 2)
  assert.equal(summary.latestEvent?.id, 'trace_3')
})

test('createRuntimeTraceReadBridge validates run existence before reading traces', () => {
  const bridge = createRuntimeTraceReadBridge({ store: new InMemoryAgentStore() })

  assert.throws(() => bridge.getRunTraceEvents('missing'), /run not found: missing/)
  assert.throws(() => bridge.getRunTracePage('missing'), /run not found: missing/)
  assert.throws(() => bridge.getRunTraceSummary('missing'), /run not found: missing/)
})
