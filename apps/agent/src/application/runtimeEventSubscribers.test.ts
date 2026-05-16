import assert from 'node:assert/strict'
import test from 'node:test'
import { RuntimeEventSubscriberRegistry } from './runtimeEventSubscribers.js'

test('RuntimeEventSubscriberRegistry subscribes, replays, emits, and unsubscribes listeners', () => {
  const registry = new RuntimeEventSubscriberRegistry<string>()
  const events: string[] = []
  const unsubscribe = registry.subscribe('run_1', (event) => events.push(event), (listener) => listener('snapshot'))

  assert.equal(registry.has('run_1'), true)
  assert.deepEqual(events, ['snapshot'])

  assert.equal(registry.emit('run_1', 'update'), true)
  assert.deepEqual(events, ['snapshot', 'update'])

  unsubscribe()
  assert.equal(registry.has('run_1'), false)
  assert.equal(registry.emit('run_1', 'after-unsubscribe'), false)
  assert.deepEqual(events, ['snapshot', 'update'])
})

test('RuntimeEventSubscriberRegistry removes listeners that throw', () => {
  const registry = new RuntimeEventSubscriberRegistry<string>()
  const events: string[] = []

  registry.subscribe('run_1', () => {
    throw new Error('listener failed')
  })
  registry.subscribe('run_1', (event) => events.push(event))

  assert.equal(registry.emit('run_1', 'update'), true)
  assert.deepEqual(events, ['update'])
  assert.equal(registry.emit('run_1', 'next'), true)
  assert.deepEqual(events, ['update', 'next'])
})

test('RuntimeEventSubscriberRegistry closes a subscriber group', () => {
  const registry = new RuntimeEventSubscriberRegistry<string>()
  const events: string[] = []

  registry.subscribe('plan_1', (event) => events.push(event))
  registry.close('plan_1')

  assert.equal(registry.has('plan_1'), false)
  assert.equal(registry.emit('plan_1', 'done'), false)
  assert.deepEqual(events, [])
})
