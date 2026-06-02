import assert from 'node:assert/strict'
import test from 'node:test'
import { createRuntimeMessage } from './runtimeMessageFactory.js'

test('createRuntimeMessage builds a persisted thread message shape', () => {
  const message = createRuntimeMessage({
    threadId: 'thread_1',
    role: 'assistant',
    content: 'Done.',
    runId: 'run_1',
  })

  assert.match(message.id, /^msg_/)
  assert.equal(message.threadId, 'thread_1')
  assert.equal(message.role, 'assistant')
  assert.equal(message.content, 'Done.')
  assert.equal(message.runId, 'run_1')
  assert.equal('updatedAt' in message, false)
  assert.doesNotThrow(() => new Date(message.createdAt).toISOString())
})
