import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentThread } from '../state/types.js'
import { updateRuntimeThreadRunStatus } from './runtimeThreadProjection.js'

test('updateRuntimeThreadRunStatus projects run status through the store boundary', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread({ activeRunId: 'run_1' }))

  const updated = updateRuntimeThreadRunStatus({
    store,
    threadId: 'thread_1',
    status: 'completed',
    runId: 'run_1',
    now: '2026-01-01T00:00:01.000Z',
  })

  const thread = store.getThread('thread_1')
  assert.equal(updated, true)
  assert.equal(thread?.lastRunId, 'run_1')
  assert.equal(thread?.lastRunStatus, 'completed')
  assert.equal(thread?.status, 'completed')
  assert.equal(thread?.activeRunId, undefined)
  assert.equal(thread?.updatedAt, '2026-01-01T00:00:01.000Z')
})

test('updateRuntimeThreadRunStatus ignores missing threads', () => {
  const store = new InMemoryAgentStore()
  assert.equal(updateRuntimeThreadRunStatus({
    store,
    threadId: 'missing_thread',
    status: 'failed',
    now: '2026-01-01T00:00:01.000Z',
  }), false)
})

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    status: 'running',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
