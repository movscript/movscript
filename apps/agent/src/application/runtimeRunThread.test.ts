import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentThread } from '../state/types.js'
import { prepareRuntimeRunThread } from './runtimeRunThread.js'

test('prepareRuntimeRunThread requires a thread id', () => {
  const store = new InMemoryAgentStore()

  assert.throws(() => prepareRuntimeRunThread({
    store,
    runInput: {},
  }), /threadId is required/)
})

test('prepareRuntimeRunThread loads the thread and records normalized client input', () => {
  const store = new InMemoryAgentStore()
  const thread = makeThread()
  store.createThread(thread)

  const result = prepareRuntimeRunThread({
    store,
    runInput: {
      threadId: thread.id,
      clientInput: {
        message: 'Client request',
        attachments: [{ name: 'brief.pdf', type: 'file', resourceId: 42 }],
      },
    },
  })

  assert.equal(result.thread.id, thread.id)
  assert.equal(result.clientInput?.visibleMessage, 'Client request')
  assert.equal(result.clientInput?.attachments[0]?.resourceId, 42)
  assert.equal(store.getThread(thread.id)?.metadata?.lastClientInput !== undefined, true)
})

function makeThread(): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    messages: [{
      id: 'msg_user',
      threadId: 'thread_1',
      role: 'user',
      content: 'Hello',
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
