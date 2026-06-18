import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import type { WebContents } from 'electron'
import { AppServerHub } from './appServerHub'

test('app-server hub reuses one upstream, coalesces initialize, and serves cached read responses', async () => {
  const socket = new FakeHubSocket()
  let openCount = 0
  const hub = new AppServerHub({
    openSocket: async () => {
      openCount += 1
      return socket
    },
    now: () => 1_000,
  })
  const firstRenderer = new FakeWebContents()
  const secondRenderer = new FakeWebContents()

  const first = await hub.connect({ url: 'managed:///mova-profile' }, firstRenderer as unknown as WebContents, 'hub:message')
  const second = await hub.connect({ url: 'managed:///mova-profile' }, secondRenderer as unknown as WebContents, 'hub:message')

  assert.equal(openCount, 1)
  assert.equal(first.upstreamKey, second.upstreamKey)

  hub.send(first.connectionId, JSON.stringify({ id: 1, method: 'initialize', params: { capabilities: {} } }))
  hub.send(second.connectionId, JSON.stringify({ id: 7, method: 'initialize', params: { capabilities: {} } }))

  assert.equal(socket.sent.length, 1)
  const initialize = JSON.parse(socket.sent[0]) as { id: number; method: string }
  assert.equal(initialize.method, 'initialize')
  socket.emitMessage(JSON.stringify({ id: initialize.id, result: { userAgent: 'test-app-server' } }))

  assert.deepEqual(firstRenderer.messagesFor('hub:message').map((message) => JSON.parse(message.data)), [
    { id: 1, result: { userAgent: 'test-app-server' } },
  ])
  assert.deepEqual(secondRenderer.messagesFor('hub:message').map((message) => JSON.parse(message.data)), [
    { id: 7, result: { userAgent: 'test-app-server' } },
  ])

  hub.send(first.connectionId, JSON.stringify({ id: 2, method: 'thread/list', params: { limit: 20 } }))
  assert.equal(socket.sent.length, 2)
  const threadList = JSON.parse(socket.sent[1]) as { id: number; method: string }
  assert.equal(threadList.method, 'thread/list')
  socket.emitMessage(JSON.stringify({ id: threadList.id, result: { data: [{ id: 'thread_1' }], nextCursor: null } }))

  assert.deepEqual(hub.snapshot(first.connectionId).cacheEntries.map((entry) => entry.method), ['thread/list'])

  hub.send(second.connectionId, JSON.stringify({ id: 8, method: 'thread/list', params: { limit: 20 } }))

  assert.equal(socket.sent.length, 2)
  assert.deepEqual(JSON.parse(secondRenderer.messagesFor('hub:message').at(-1)?.data ?? '{}'), {
    id: 8,
    result: { data: [{ id: 'thread_1' }], nextCursor: null },
  })

  hub.send(first.connectionId, JSON.stringify({ id: 3, method: 'thread/name/set', params: { threadId: 'thread_1', name: 'Renamed' } }))
  assert.equal(socket.sent.length, 3)
  const rename = JSON.parse(socket.sent[2]) as { id: number; method: string }
  assert.equal(rename.method, 'thread/name/set')
  socket.emitMessage(JSON.stringify({ id: rename.id, result: { thread: { id: 'thread_1', name: 'Renamed' } } }))

  assert.deepEqual(JSON.parse(secondRenderer.messagesFor('hub:message').at(-1)?.data ?? '{}'), {
    method: 'appServerHub/cacheInvalidated',
    params: { reason: 'request', method: 'thread/name/set' },
  })

  hub.send(second.connectionId, JSON.stringify({ id: 9, method: 'thread/list', params: { limit: 20 } }))
  assert.equal(socket.sent.length, 4)
})

test('app-server hub broadcasts notifications and forwards only first server request response', async () => {
  const socket = new FakeHubSocket()
  const hub = new AppServerHub({
    openSocket: async () => socket,
    now: () => 1_000,
  })
  const firstRenderer = new FakeWebContents()
  const secondRenderer = new FakeWebContents()
  const first = await hub.connect({ url: 'managed:///mova-profile' }, firstRenderer as unknown as WebContents, 'hub:message')
  const second = await hub.connect({ url: 'managed:///mova-profile' }, secondRenderer as unknown as WebContents, 'hub:message')

  socket.emitMessage(JSON.stringify({ method: 'thread/updated', params: { threadId: 'thread_1' } }))

  assert.deepEqual(JSON.parse(firstRenderer.messagesFor('hub:message')[0].data), {
    method: 'thread/updated',
    params: { threadId: 'thread_1' },
  })
  assert.deepEqual(JSON.parse(secondRenderer.messagesFor('hub:message')[0].data), {
    method: 'thread/updated',
    params: { threadId: 'thread_1' },
  })

  socket.emitMessage(JSON.stringify({ id: 41, method: 'item/permissions/requestApproval', params: { threadId: 'thread_1' } }))
  assert.equal(firstRenderer.messagesFor('hub:message').length, 2)
  assert.equal(secondRenderer.messagesFor('hub:message').length, 2)
  assert.deepEqual(hub.snapshot(first.connectionId).pendingServerRequests, [
    {
      id: 41,
      method: 'item/permissions/requestApproval',
      params: { threadId: 'thread_1' },
      receivedAt: 1_000,
    },
  ])

  hub.send(second.connectionId, JSON.stringify({ id: 41, result: { decision: 'approved' } }))
  hub.send(first.connectionId, JSON.stringify({ id: 41, result: { decision: 'denied' } }))

  assert.deepEqual(socket.sent.map((payload) => JSON.parse(payload)), [
    { id: 41, result: { decision: 'approved' } },
  ])
})

class FakeHubSocket {
  readonly sent: string[] = []
  private readonly messageHandlers = new Set<(data: string) => void>()
  private readonly errorHandlers = new Set<(error: Error) => void>()
  private readonly closeHandlers = new Set<() => void>()

  send(payload: string): void {
    this.sent.push(payload)
  }

  close(): void {
    for (const handler of Array.from(this.closeHandlers)) handler()
  }

  onMessage(handler: (data: string) => void): void {
    this.messageHandlers.add(handler)
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.add(handler)
  }

  onClose(handler: () => void): void {
    this.closeHandlers.add(handler)
  }

  emitMessage(data: string): void {
    for (const handler of Array.from(this.messageHandlers)) handler(data)
  }
}

class FakeWebContents extends EventEmitter {
  readonly sent: Array<{ channel: string; message: { data?: string } }> = []
  destroyed = false

  send(channel: string, message: { data?: string }): void {
    this.sent.push({ channel, message })
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  messagesFor(channel: string): Array<{ data: string }> {
    return this.sent
      .filter((item) => item.channel === channel)
      .map((item) => item.message)
      .filter((message): message is { data: string } => typeof message.data === 'string')
  }
}
