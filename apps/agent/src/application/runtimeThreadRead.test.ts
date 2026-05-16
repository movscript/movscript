import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentThread } from '../state/types.js'
import {
  getRuntimeThread,
  listRuntimeThreads,
  listRuntimeThreadSummaries,
} from './runtimeThreadRead.js'

test('runtime thread read helpers return threads and summaries from the store', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread({ id: 'thread_1', title: 'Thread' }))

  assert.deepEqual(listRuntimeThreads({ store }).map((thread) => thread.id), ['thread_1'])
  assert.equal(getRuntimeThread({ store, threadId: 'thread_1' })?.title, 'Thread')
  assert.deepEqual(listRuntimeThreadSummaries({ store }).map((summary) => summary.id), ['thread_1'])
  assert.equal(listRuntimeThreadSummaries({ store })[0]?.messageCount, 0)
})

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    archived: false,
    status: 'idle',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
