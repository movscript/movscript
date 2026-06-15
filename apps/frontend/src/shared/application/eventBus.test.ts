import assert from 'node:assert/strict'
import test from 'node:test'

import { createEventBus } from './eventBus'

type TestEventMap = {
  ready: { id: string }
  count: number
}

test('event bus publishes live events and unsubscribes handlers', () => {
  const bus = createEventBus<TestEventMap>()
  const received: string[] = []
  const unsubscribe = bus.subscribe('ready', (payload) => {
    received.push(payload.id)
  })

  bus.publish('ready', { id: 'first' })
  unsubscribe()
  bus.publish('ready', { id: 'second' })

  assert.deepEqual(received, ['first'])
})

test('event bus replays queued payloads through explicit consumption', () => {
  const bus = createEventBus<TestEventMap>()

  bus.publishReplay('ready', { id: 'queued-1' })
  bus.publishReplay('ready', { id: 'queued-2' })

  assert.deepEqual(bus.consume('ready'), { id: 'queued-1' })
  assert.deepEqual(bus.consume('ready'), { id: 'queued-2' })
  assert.equal(bus.consume('ready'), undefined)
})

test('event bus once handler is invoked only for the next payload', () => {
  const bus = createEventBus<TestEventMap>()
  const received: number[] = []

  bus.once('count', (payload) => {
    received.push(payload)
  })

  bus.publish('count', 1)
  bus.publish('count', 2)

  assert.deepEqual(received, [1])
})
