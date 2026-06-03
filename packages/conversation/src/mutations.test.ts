import assert from 'node:assert/strict'
import test from 'node:test'

import {
  appendConversationTranscriptMessage,
  patchConversationTranscriptMessageMeta,
  removeConversationTranscriptMessage,
  replaceConversationTranscriptMessages,
  upsertConversationTranscriptMessage,
} from './index'
import type { AgentChatMessage } from '@movscript/protocol'

interface TestConversation {
  id: string
  transcriptMessages: AgentChatMessage[]
  updatedAt: number
}

test('appendConversationTranscriptMessage creates ids and timestamps through injected providers', () => {
  const initial = conversation([])
  const result = appendConversationTranscriptMessage(initial, {
    role: 'user',
    content: 'Hello',
  }, {
    createId: () => 'msg_1',
    now: () => 10,
  })

  assert.equal(result.messageId, 'msg_1')
  assert.deepEqual(result.conversation.transcriptMessages, [{ id: 'msg_1', role: 'user', content: 'Hello', timestamp: 10 }])
  assert.equal(result.conversation.updatedAt, 10)
  assert.deepEqual(initial.transcriptMessages, [])
})

test('upsertConversationTranscriptMessage preserves existing timestamps when patching', () => {
  const updated = upsertConversationTranscriptMessage(conversation([
    { id: 'msg_1', role: 'assistant', content: 'old', timestamp: 3 },
  ]), 'msg_1', {
    role: 'assistant',
    content: 'new',
  }, {
    now: () => 20,
  })

  assert.deepEqual(updated.transcriptMessages, [{ id: 'msg_1', role: 'assistant', content: 'new', timestamp: 3 }])
  assert.equal(updated.updatedAt, 20)
})

test('upsertConversationTranscriptMessage appends missing messages', () => {
  const updated = upsertConversationTranscriptMessage(conversation([]), 'msg_2', {
    role: 'assistant',
    content: 'created',
  }, {
    now: () => 30,
  })

  assert.deepEqual(updated.transcriptMessages, [{ id: 'msg_2', role: 'assistant', content: 'created', timestamp: 30 }])
})

test('patchConversationTranscriptMessageMeta shallow merges metadata', () => {
  const updated = patchConversationTranscriptMessageMeta(conversation([
    { id: 'msg_1', role: 'assistant', content: 'old', timestamp: 3, meta: { contextLabels: ['A'] } },
  ]), 'msg_1', {
    runtimeMessage: { threadId: 'thread_1', runId: 'run_1' },
  }, {
    now: () => 40,
  })

  assert.deepEqual(updated.transcriptMessages[0]?.meta, {
    contextLabels: ['A'],
    runtimeMessage: { threadId: 'thread_1', runId: 'run_1' },
  })
  assert.equal(updated.updatedAt, 40)
})

test('replaceConversationTranscriptMessages and removeConversationTranscriptMessage update transcript messages immutably', () => {
  const initial = conversation([
    { id: 'msg_1', role: 'user', content: 'one', timestamp: 1 },
    { id: 'msg_2', role: 'assistant', content: 'two', timestamp: 2 },
  ])
  const replaced = replaceConversationTranscriptMessages(initial, [initial.transcriptMessages[1] as AgentChatMessage], { now: () => 50 })
  const removed = removeConversationTranscriptMessage(initial, 'msg_1', { now: () => 60 })

  assert.deepEqual(replaced.transcriptMessages.map((message) => message.id), ['msg_2'])
  assert.equal(replaced.updatedAt, 50)
  assert.deepEqual(removed.transcriptMessages.map((message) => message.id), ['msg_2'])
  assert.equal(removed.updatedAt, 60)
  assert.deepEqual(initial.transcriptMessages.map((message) => message.id), ['msg_1', 'msg_2'])
})

function conversation(transcriptMessages: AgentChatMessage[]): TestConversation {
  return {
    id: 'conv_1',
    transcriptMessages,
    updatedAt: 1,
  }
}
