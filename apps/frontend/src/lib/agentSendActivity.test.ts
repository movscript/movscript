import assert from 'node:assert/strict'
import test from 'node:test'

import { debugHttpRequestEvents, setActivityEventStatus, threadResolutionActivityEvent, upsertActivityEvent } from './agentSendActivity'
import type { ChatRunActivityEvent } from '@/store/agentStore'

test('debugHttpRequestEvents maps debug requests into visible activity events', () => {
  const events = debugHttpRequestEvents([{
    id: 'local-create-thread',
    label: 'Create thread',
    method: 'POST',
    url: 'http://agent.local/threads',
    headers: { 'Content-Type': 'application/json' },
    body: { title: 'Thread' },
    note: 'Fallback note',
  }], '2026-05-19T00:00:00.000Z')

  assert.equal(events[0]?.id, 'http-request-local-create-thread')
  assert.equal(events[0]?.kind, 'model_call')
  assert.equal(events[0]?.title, 'POST Create thread')
  assert.deepEqual(events[0]?.data, {
    httpRequest: {
      method: 'POST',
      url: 'http://agent.local/threads',
      headers: { 'Content-Type': 'application/json' },
      body: { title: 'Thread' },
      note: 'Fallback note',
    },
  })
})

test('setActivityEventStatus only updates the targeted event', () => {
  const events = [
    event({ id: 'a', status: 'started' }),
    event({ id: 'b', status: 'info' }),
  ]
  const next = setActivityEventStatus(events, 'a', 'completed', '2026-05-19T00:00:01.000Z')

  assert.equal(next[0]?.status, 'completed')
  assert.equal(next[0]?.completedAt, '2026-05-19T00:00:01.000Z')
  assert.equal(next[1], events[1])
})

test('upsertActivityEvent keeps setup events before http events and runtime events last', () => {
  const events = [
    event({ id: 'http-request-local-create-thread' }),
    event({ id: 'agent-step-1' }),
  ]
  const next = upsertActivityEvent(events, event({ id: 'local-runtime-ensure-running' }))

  assert.deepEqual(next.map((item) => item.id), [
    'local-runtime-ensure-running',
    'http-request-local-create-thread',
    'agent-step-1',
  ])
})

test('upsertActivityEvent preserves existing data when replacement omits data', () => {
  const next = upsertActivityEvent([
    event({ id: 'event_1', data: { existing: true } }),
  ], event({ id: 'event_1', title: 'Updated' }))

  assert.equal(next[0]?.title, 'Updated')
  assert.deepEqual(next[0]?.data, { existing: true })
})

test('threadResolutionActivityEvent describes missing and reused thread outcomes', () => {
  const missing = threadResolutionActivityEvent({
    requestedThreadId: 'old_thread',
    threadId: 'new_thread',
    reusedExistingThread: false,
    missingRequestedThread: true,
    createdNewThread: true,
  }, '2026-05-19T00:00:00.000Z')
  const reused = threadResolutionActivityEvent({
    requestedThreadId: 'thread_1',
    threadId: 'thread_1',
    reusedExistingThread: true,
    createdNewThread: false,
    missingRequestedThread: false,
  }, '2026-05-19T00:00:00.000Z')

  assert.equal(missing?.status, 'info')
  assert.equal(missing?.summary, 'old_thread -> new_thread')
  assert.equal(reused?.status, 'completed')
  assert.equal(reused?.summary, 'thread_1')
})

function event(overrides: Partial<ChatRunActivityEvent> = {}): ChatRunActivityEvent {
  return {
    id: 'event_1',
    kind: 'runtime',
    title: 'Event',
    status: 'info',
    createdAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  }
}
