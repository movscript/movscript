import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSystemMessagesWebSocketURL,
  crossPageEventFromSystemMessage,
} from './systemMessagesWebSocket'

test('system messages websocket URL carries browser auth query params', () => {
  const url = buildSystemMessagesWebSocketURL({
    apiV1BaseURL: 'https://example.test/api/v1/',
    token: 'token.abc',
    orgId: 7,
  })

  assert.equal(url, 'wss://example.test/api/v1/system/messages/ws?access_token=token.abc&org_id=7')
})

test('system generation-job message adapts to cross-page notification event', () => {
  const event = crossPageEventFromSystemMessage({
    id: 'sys-1',
    topic: 'generation-job',
    source: 'backend',
    emittedAt: '2026-06-16T10:00:00.000Z',
    payload: {
      jobId: 42,
      status: 'running',
      projectId: 9,
      jobType: 'video',
      updatedAt: '2026-06-16T10:00:01.000Z',
      source: 'backend-job-runner',
    },
  })

  assert.equal(event?.id, 'sys-1')
  assert.equal(event?.topic, 'generation-job')
  assert.equal(event?.transport, 'backend-ws')
  assert.deepEqual(event?.scope, { kind: 'project', id: '9' })
  assert.deepEqual(event?.payload, {
    jobId: 42,
    status: 'running',
    projectId: 9,
    jobType: 'video',
    updatedAt: '2026-06-16T10:00:01.000Z',
    source: 'backend-job-runner',
  })
})
