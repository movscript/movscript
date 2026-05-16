import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAgentStore } from '../state/store.js'
import { createRuntimeThreadOperationsBridge } from './runtimeThreadOperationsBridge.js'

test('createRuntimeThreadOperationsBridge wires thread ids, message ids, and timestamps', () => {
  let messageIndex = 0
  const store = new InMemoryAgentStore()
  const bridge = createRuntimeThreadOperationsBridge({
    store,
    threadId: () => 'thread_1',
    messageId: () => `msg_${++messageIndex}`,
    now: () => '2026-01-01T00:00:00.000Z',
  })

  const thread = bridge.createThread({ title: 'Thread', messages: [{ role: 'user', content: 'Hi' }] })
  const message = bridge.addMessage(thread.id, { role: 'assistant', content: 'Hello' })
  const updated = bridge.updateThread(thread.id, { title: 'Updated' })

  assert.equal(thread.id, 'thread_1')
  assert.equal(thread.messages[0]?.id, 'msg_1')
  assert.equal(message.id, 'msg_2')
  assert.equal(updated.title, 'Updated')
  assert.equal(updated.updatedAt, '2026-01-01T00:00:00.000Z')
  assert.equal(bridge.getThread(thread.id)?.messages.length, 2)
  assert.equal(bridge.listThreads().length, 1)
  assert.deepEqual(bridge.listThreadSummaries().map((summary) => summary.id), ['thread_1'])
})
