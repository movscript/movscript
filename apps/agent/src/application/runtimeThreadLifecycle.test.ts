import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import {
  addRuntimeThreadMessage,
  createRuntimeThread,
  updateRuntimeThread,
} from './runtimeThreadLifecycle.js'

test('createRuntimeThread persists a thread and valid initial messages', () => {
  const store = new InMemoryAgentStore()
  let index = 0

  const result = createRuntimeThread({
    store,
    threadId: 'thread_1',
    messageId: () => `msg_${++index}`,
    now: () => '2026-01-01T00:00:00.000Z',
    threadInput: {
      title: ' Thread title ',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'bad' as any, content: 'ignored' },
      ],
    },
  })

  assert.equal(result.thread.title, 'Thread title')
  assert.deepEqual(result.messages.map((message) => message.id), ['msg_1'])
  assert.equal(store.getThread('thread_1')?.messages.length, 1)
})

test('updateRuntimeThread persists thread updates', () => {
  const store = new InMemoryAgentStore()
  createRuntimeThread({
    store,
    threadId: 'thread_1',
    messageId: () => 'msg_1',
    now: () => '2026-01-01T00:00:00.000Z',
    threadInput: { title: 'Before' },
  })

  const thread = updateRuntimeThread({
    store,
    threadId: 'thread_1',
    update: { title: 'After', archived: true },
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.equal(thread.title, 'After')
  assert.equal(thread.archived, true)
  assert.equal(store.getThread('thread_1')?.updatedAt, '2026-01-01T00:00:01.000Z')
})

test('addRuntimeThreadMessage persists messages and client input metadata', () => {
  const store = new InMemoryAgentStore()
  createRuntimeThread({
    store,
    threadId: 'thread_1',
    messageId: () => 'msg_1',
    now: () => '2026-01-01T00:00:00.000Z',
  })

  const message = addRuntimeThreadMessage({
    store,
    threadId: 'thread_1',
    messageId: 'msg_2',
    now: '2026-01-01T00:00:01.000Z',
    messageInput: {
      role: 'user',
      content: 'plain content',
      clientInput: { message: 'from client input' },
    },
  })

  assert.equal(message.id, 'msg_2')
  assert.equal(store.getThread('thread_1')?.messages.length, 1)
  assert.ok(store.getThread('thread_1')?.metadata?.lastClientInput)
})
