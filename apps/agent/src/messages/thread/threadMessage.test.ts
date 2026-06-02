import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendThreadMessage,
  buildAgentMessage,
  buildThreadMessage,
  isMessageRole,
  recordThreadClientInput,
  validInitialThreadMessageInputs,
} from './threadMessage.js'
import type { AgentThread } from '../../state/shared/types.js'

test('isMessageRole accepts only thread-visible message roles', () => {
  assert.equal(isMessageRole('system'), true)
  assert.equal(isMessageRole('user'), true)
  assert.equal(isMessageRole('assistant'), true)
  assert.equal(isMessageRole('tool'), false)
})

test('validInitialThreadMessageInputs keeps only explicit visible messages', () => {
  assert.deepEqual(validInitialThreadMessageInputs({
    messages: [
      { role: 'user', content: 'hello' },
      { role: 'tool', content: 'hidden' },
      { role: 'assistant', content: 123 },
      { role: 'assistant', content: 'world' },
    ],
  }), [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'world' },
  ])
})

test('buildAgentMessage renders client input messages and rejects empty content', () => {
  const built = buildAgentMessage({
    id: 'msg_1',
    threadId: 'thread_1',
    now: '2026-01-01T00:00:01.000Z',
    messageInput: {
      role: 'user',
      content: 'ignored',
      clientInput: { message: 'from client input' },
    },
  })

  assert.equal(built.message.id, 'msg_1')
  assert.match(built.message.content, /from client input/)
  assert.deepEqual(built.message.clientInput, { visibleMessage: 'from client input', attachments: [] })
  assert.ok(built.clientInput)
  assert.throws(() => buildAgentMessage({
    id: 'msg_2',
    threadId: 'thread_1',
    now: '2026-01-01T00:00:01.000Z',
    messageInput: { role: 'assistant', content: '   ' },
  }), /message content is required/)
})

test('buildThreadMessage creates runtime messages without changing content', () => {
  assert.deepEqual(buildThreadMessage({
    id: 'msg_1',
    threadId: 'thread_1',
    role: 'assistant',
    content: '  kept as-is  ',
    runId: 'run_1',
    now: '2026-01-01T00:00:01.000Z',
  }), {
    id: 'msg_1',
    threadId: 'thread_1',
    role: 'assistant',
    content: '  kept as-is  ',
    runId: 'run_1',
    createdAt: '2026-01-01T00:00:01.000Z',
  })
})

test('appendThreadMessage appends message and records last client input when provided', () => {
  const thread = makeThread()
  const clientInput = { visibleMessage: 'hello', attachments: [{ id: 'att_1', name: 'Original' }] }
  appendThreadMessage({
    thread,
    message: {
      id: 'msg_1',
      threadId: thread.id,
      role: 'user',
      content: 'hello',
      createdAt: '2026-01-01T00:00:01.000Z',
    },
    clientInput,
  })

  clientInput.attachments[0]!.name = 'Changed'

  assert.equal(thread.messages.length, 1)
  assert.equal(thread.updatedAt, '2026-01-01T00:00:01.000Z')
  assert.deepEqual(thread.metadata, {
    a: 1,
    lastClientInput: { visibleMessage: 'hello', attachments: [{ id: 'att_1', name: 'Original' }] },
  })
})

test('recordThreadClientInput merges last client input into existing metadata', () => {
  const thread = makeThread()
  const clientInput = { visibleMessage: 'latest', attachments: [{ id: 'att_1', name: 'Original' }] }
  recordThreadClientInput(thread, clientInput)

  clientInput.attachments[0]!.name = 'Changed'

  assert.deepEqual(thread.metadata, {
    a: 1,
    lastClientInput: { visibleMessage: 'latest', attachments: [{ id: 'att_1', name: 'Original' }] },
  })
  assert.equal(thread.updatedAt, '2026-01-01T00:00:00.000Z')
})

function makeThread(): AgentThread {
  return {
    id: 'thread_1',
    title: 'Existing',
    metadata: { a: 1 },
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [],
  }
}
