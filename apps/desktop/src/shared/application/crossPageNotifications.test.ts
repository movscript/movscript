import assert from 'node:assert/strict'
import test from 'node:test'

import {
  attachCrossPageNotificationBroadcastBridge,
  agentChatNotificationFromCrossPageEvent,
  crossPageEventFromAgentChatNotification,
  publishCrossPageNotification,
  publishCrossPageNotificationFromUnknown,
  resetCrossPageNotificationDedupeForTests,
  subscribeCrossPageNotifications,
} from './crossPageNotifications'

test('cross-page notifications wrap agent chat notifications with thread scope', () => {
  resetCrossPageNotificationDedupeForTests()
  const event = crossPageEventFromAgentChatNotification({
    notification: {
      method: 'thread/name/updated',
      params: { threadId: 'thread_1', name: 'Thread one' },
    },
    transport: 'sdk-runtime-ipc',
    source: 'Mova',
  })

  assert.equal(event.topic, 'agent-chat')
  assert.deepEqual(event.scope, { kind: 'thread', id: 'thread_1' })
  assert.equal(agentChatNotificationFromCrossPageEvent(event)?.method, 'thread/name/updated')
})

test('cross-page notifications classify MCP status as global capability state', () => {
  resetCrossPageNotificationDedupeForTests()
  const event = crossPageEventFromAgentChatNotification({
    notification: {
      method: 'mcpServer/startupStatus/updated',
      params: { name: 'filesystem', status: 'ready' },
      event: {
        type: 'mcpStatus',
        server: 'filesystem',
        status: 'ready',
      },
    },
    transport: 'sdk-runtime-ipc',
    source: 'Mova',
  })

  assert.equal(event.topic, 'mcp-status')
  assert.deepEqual(event.scope, { kind: 'global' })
  assert.equal(agentChatNotificationFromCrossPageEvent(event)?.event?.type, 'mcpStatus')
})

test('cross-page notification bus publishes once per stable envelope id', () => {
  resetCrossPageNotificationDedupeForTests()
  const received: string[] = []
  const unsubscribe = subscribeCrossPageNotifications((event) => {
    received.push(event.id)
  })
  const event = crossPageEventFromAgentChatNotification({
    notification: {
      method: 'serverRequest/resolved',
      params: { threadId: 'thread_1', requestId: 'request_1' },
    },
    transport: 'sdk-runtime-ipc',
    source: 'Mova',
  })

  assert.equal(publishCrossPageNotification(event), true)
  assert.equal(publishCrossPageNotification(event), false)
  unsubscribe()

  assert.deepEqual(received, [event.id])
})

test('cross-page BroadcastChannel bridge forwards local events and accepts remote events once', () => {
  resetCrossPageNotificationDedupeForTests()
  const postedMessages: unknown[] = []
  const channel = {
    onmessage: null as ((message: MessageEvent<unknown>) => void) | null,
    postMessage(message: unknown) {
      postedMessages.push(message)
    },
    close() {},
  }
  const received: string[] = []
  const unsubscribe = subscribeCrossPageNotifications((event) => {
    received.push(event.id)
  })
  const detach = attachCrossPageNotificationBroadcastBridge({
    createChannel: () => channel,
  })
  const localEvent = crossPageEventFromAgentChatNotification({
    notification: {
      method: 'thread/name/updated',
      params: { threadId: 'thread_1', name: 'Thread one' },
    },
    transport: 'sdk-runtime-ipc',
    source: 'Mova',
  })
  const remoteEvent = crossPageEventFromAgentChatNotification({
    notification: {
      method: 'mcpServer/startupStatus/updated',
      params: { name: 'filesystem', status: 'ready' },
    },
    transport: 'sdk-runtime-ipc',
    source: 'Remote Mova',
  })

  publishCrossPageNotification(localEvent)
  channel.onmessage?.({ data: { senderId: 'remote-window', event: remoteEvent } } as MessageEvent<unknown>)
  channel.onmessage?.({ data: { senderId: 'remote-window', event: remoteEvent } } as MessageEvent<unknown>)
  detach()
  unsubscribe()

  assert.equal(postedMessages.length, 1)
  assert.deepEqual(received, [localEvent.id, remoteEvent.id])
})

test('cross-page notification unknown publisher rejects invalid payloads', () => {
  resetCrossPageNotificationDedupeForTests()
  const received: string[] = []
  const unsubscribe = subscribeCrossPageNotifications((event) => {
    received.push(event.id)
  })
  const event = crossPageEventFromAgentChatNotification({
    notification: {
      method: 'thread/name/updated',
      params: { threadId: 'thread_1', name: 'Thread one' },
    },
    transport: 'electron-ipc',
    source: 'main-process',
  })

  assert.equal(publishCrossPageNotificationFromUnknown({ method: 'thread/name/updated' }), false)
  assert.equal(publishCrossPageNotificationFromUnknown(event), true)
  unsubscribe()

  assert.deepEqual(received, [event.id])
})
