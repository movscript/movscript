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
  assert.equal(store.getSession('session_thread_1')?.rootThreadId, 'thread_1')
  assert.equal(store.getSession('session_thread_1')?.interactiveThreadId, 'thread_1')
  assert.equal(store.getSession('session_thread_1')?.activeThreadId, 'thread_1')
})

test('createRuntimeThread keeps the session interactive thread stable when adding worker threads', () => {
  const store = new InMemoryAgentStore()

  createRuntimeThread({
    store,
    threadId: 'thread_root',
    messageId: () => 'msg_root',
    now: () => '2026-01-01T00:00:00.000Z',
    threadInput: { agentRole: 'root' },
  })
  createRuntimeThread({
    store,
    threadId: 'thread_worker',
    messageId: () => 'msg_worker',
    now: () => '2026-01-01T00:00:01.000Z',
    threadInput: {
      sessionId: 'session_thread_root',
      agentRole: 'worker',
      parentThreadId: 'thread_root',
      parentRunId: 'run_root',
    },
  })

  const session = store.getSession('session_thread_root')
  assert.equal(session?.rootThreadId, 'thread_root')
  assert.equal(session?.interactiveThreadId, 'thread_root')
  assert.equal(session?.activeThreadId, 'thread_worker')
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
