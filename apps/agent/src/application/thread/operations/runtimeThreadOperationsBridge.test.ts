import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAgentStore } from '../../../state/store/core/store.js'
import type { AgentRun } from '../../../state/shared/types.js'
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

test('createRuntimeThreadOperationsBridge rejects deleting threads with active runs', () => {
  const store = new InMemoryAgentStore()
  const bridge = createRuntimeThreadOperationsBridge({
    store,
    threadId: () => 'thread_active',
    now: () => '2026-01-01T00:00:00.000Z',
  })
  const thread = bridge.createThread()
  store.createRun(baseRun({ id: 'run_active', threadId: thread.id, status: 'in_progress' }))

  assert.throws(() => bridge.deleteThread(thread.id), /thread has active run: run_active/)
  assert.throws(() => bridge.deleteAllThreads(), /thread has active run: run_active/)
})

function baseRun(input: {
  id: string
  threadId: string
  status: AgentRun['status']
}): AgentRun {
  return {
    id: input.id,
    threadId: input.threadId,
    status: input.status,
    runtimeLimits: { approvalMode: 'auto',
      maxToolCalls: 10,
      maxIterations: 10,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
  }
}
