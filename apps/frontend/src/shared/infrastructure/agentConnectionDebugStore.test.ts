import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AGENT_CONNECTION_DEBUG_EVENT_LIMIT,
  clearAgentConnectionDebugEvents,
  extractAgentConnectionDebugThreadId,
  getAgentConnectionDebugSnapshot,
  getAgentConnectionDebugThreadEvents,
  recordAgentConnectionDebugEvent,
} from './agentConnectionDebugStore'

test('agent connection debug store keeps the latest 500 events per thread', () => {
  clearAgentConnectionDebugEvents()
  for (let index = 0; index < AGENT_CONNECTION_DEBUG_EVENT_LIMIT + 1; index += 1) {
    recordAgentConnectionDebugEvent({
      direction: index % 2 === 0 ? 'request' : 'response',
      source: 'test',
      threadId: 'thread-1',
      method: 'turn/start',
      raw: { index },
    })
  }

  const events = getAgentConnectionDebugThreadEvents('thread-1')
  const snapshot = getAgentConnectionDebugSnapshot()

  assert.equal(events.length, AGENT_CONNECTION_DEBUG_EVENT_LIMIT)
  assert.deepEqual(events[0]?.raw, { index: 1 })
  assert.equal(snapshot.threads[0]?.threadId, 'thread-1')
  assert.equal(snapshot.threads[0]?.eventCount, AGENT_CONNECTION_DEBUG_EVENT_LIMIT)
})

test('agent connection debug store extracts nested thread ids from raw protocol payloads', () => {
  assert.equal(
    extractAgentConnectionDebugThreadId({
      result: {
        turn: {
          threadId: 'thread-from-turn',
        },
      },
    }),
    'thread-from-turn',
  )
})
