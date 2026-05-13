import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTraceEventLink, canCancelWorkerRun, traceDeepLinkMissing, traceEventIdFromHash } from './agentRunUi'
import type { AgentTraceEvent } from './localAgentClient'

function traceEvent(id: string): AgentTraceEvent {
  return {
    id,
    runId: 'run_1',
    kind: 'tool_call',
    title: 'Tool call',
    status: 'completed',
    createdAt: '2026-05-12T00:00:00.000Z',
  }
}

test('traceEventIdFromHash parses encoded trace event deep links', () => {
  assert.equal(traceEventIdFromHash('#event-event_1'), 'event_1')
  assert.equal(traceEventIdFromHash('#event-event%2Fwith%20space'), 'event/with space')
  assert.equal(traceEventIdFromHash('#other-event_1'), undefined)
  assert.equal(traceEventIdFromHash('#event-'), undefined)
  assert.equal(traceEventIdFromHash(undefined), undefined)
})

test('traceDeepLinkMissing only reports missing after loaded events are exhausted', () => {
  assert.equal(traceDeepLinkMissing({ eventId: 'event_2', events: [], hasMore: false }), false)
  assert.equal(traceDeepLinkMissing({ eventId: 'event_2', events: [traceEvent('event_1')], hasMore: true }), false)
  assert.equal(traceDeepLinkMissing({ eventId: 'event_1', events: [traceEvent('event_1')], hasMore: false }), false)
  assert.equal(traceDeepLinkMissing({ eventId: 'event_2', events: [traceEvent('event_1')], hasMore: false }), true)
  assert.equal(traceDeepLinkMissing({ events: [traceEvent('event_1')], hasMore: false }), false)
})

test('buildTraceEventLink preserves route and encodes event id', () => {
  assert.equal(
    buildTraceEventLink({
      origin: 'http://localhost:5173',
      pathname: '/agent/runs/run_1',
      search: '?tab=trace',
      eventId: 'event/with space',
    }),
    'http://localhost:5173/agent/runs/run_1?tab=trace#event-event%2Fwith%20space',
  )
})

test('canCancelWorkerRun only allows active worker runs', () => {
  assert.equal(canCancelWorkerRun({ role: 'worker', status: 'in_progress' }), true)
  assert.equal(canCancelWorkerRun({ role: 'worker', status: 'requires_action' }), true)
  assert.equal(canCancelWorkerRun({ role: 'planner', status: 'in_progress' }), false)
  assert.equal(canCancelWorkerRun({ role: 'worker', status: 'completed' }), false)
  assert.equal(canCancelWorkerRun({ role: 'worker', status: 'completed_with_warnings' }), false)
  assert.equal(canCancelWorkerRun({ role: 'worker', status: 'failed' }), false)
  assert.equal(canCancelWorkerRun({ role: 'worker', status: 'cancelled' }), false)
  assert.equal(canCancelWorkerRun(undefined), false)
})
