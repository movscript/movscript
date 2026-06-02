import assert from 'node:assert/strict'
import test from 'node:test'

import {
  appendConversationMessage,
  patchConversationMessageMeta,
  removeConversationMessage,
  replaceConversationMessages,
  upsertConversationMessage,
} from './index'
import type { AgentChatMessage } from '@movscript/protocol'

interface TestConversation {
  id: string
  messages: AgentChatMessage[]
  updatedAt: number
}

test('appendConversationMessage creates ids and timestamps through injected providers', () => {
  const initial = conversation([])
  const result = appendConversationMessage(initial, {
    role: 'user',
    content: 'Hello',
  }, {
    createId: () => 'msg_1',
    now: () => 10,
  })

  assert.equal(result.messageId, 'msg_1')
  assert.deepEqual(result.conversation.messages, [{ id: 'msg_1', role: 'user', content: 'Hello', timestamp: 10 }])
  assert.equal(result.conversation.updatedAt, 10)
  assert.deepEqual(initial.messages, [])
})

test('upsertConversationMessage preserves existing timestamps when patching', () => {
  const updated = upsertConversationMessage(conversation([
    { id: 'msg_1', role: 'assistant', content: 'old', timestamp: 3 },
  ]), 'msg_1', {
    role: 'assistant',
    content: 'new',
  }, {
    now: () => 20,
  })

  assert.deepEqual(updated.messages, [{ id: 'msg_1', role: 'assistant', content: 'new', timestamp: 3 }])
  assert.equal(updated.updatedAt, 20)
})

test('upsertConversationMessage appends missing messages', () => {
  const updated = upsertConversationMessage(conversation([]), 'msg_2', {
    role: 'assistant',
    content: 'created',
  }, {
    now: () => 30,
  })

  assert.deepEqual(updated.messages, [{ id: 'msg_2', role: 'assistant', content: 'created', timestamp: 30 }])
})

test('patchConversationMessageMeta shallow merges metadata', () => {
  const updated = patchConversationMessageMeta(conversation([
    { id: 'msg_1', role: 'assistant', content: 'old', timestamp: 3, meta: { contextLabels: ['A'] } },
  ]), 'msg_1', {
    runtimeMessage: { threadId: 'thread_1', runId: 'run_1' },
  }, {
    now: () => 40,
  })

  assert.deepEqual(updated.messages[0]?.meta, {
    contextLabels: ['A'],
    runtimeMessage: { threadId: 'thread_1', runId: 'run_1' },
  })
  assert.equal(updated.updatedAt, 40)
})

test('replaceConversationMessages and removeConversationMessage update messages immutably', () => {
  const initial = conversation([
    { id: 'msg_1', role: 'user', content: 'one', timestamp: 1 },
    { id: 'msg_2', role: 'assistant', content: 'two', timestamp: 2 },
  ])
  const replaced = replaceConversationMessages(initial, [initial.messages[1] as AgentChatMessage], { now: () => 50 })
  const removed = removeConversationMessage(initial, 'msg_1', { now: () => 60 })

  assert.deepEqual(replaced.messages.map((message) => message.id), ['msg_2'])
  assert.equal(replaced.updatedAt, 50)
  assert.deepEqual(removed.messages.map((message) => message.id), ['msg_2'])
  assert.equal(removed.updatedAt, 60)
  assert.deepEqual(initial.messages.map((message) => message.id), ['msg_1', 'msg_2'])
})

function conversation(messages: AgentChatMessage[]): TestConversation {
  return {
    id: 'conv_1',
    messages,
    updatedAt: 1,
  }
}
