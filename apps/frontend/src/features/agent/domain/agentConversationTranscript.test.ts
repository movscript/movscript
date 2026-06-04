import assert from 'node:assert/strict'
import test from 'node:test'

import {
  conversationHasTranscriptMessages,
  conversationWithTimelineTranscript,
} from '@/features/agent/domain/agentConversationTranscript'
import type { ChatMessage, Conversation } from '@/features/agent/state/agentStore'

test('conversationWithTimelineTranscript uses timeline transcript as the active conversation transcript', () => {
  const conversation = baseConversation({
    transcriptMessageCount: 8,
    lastTranscriptAt: 10,
  })

  const next = conversationWithTimelineTranscript(conversation, [
    message({ id: 'user_1', role: 'user', timestamp: 20 }),
    message({ id: 'assistant_1', role: 'assistant', timestamp: 30 }),
  ])

  assert.deepEqual(next.transcriptMessages.map((item) => item.id), ['user_1', 'assistant_1'])
  assert.equal(next.transcriptMessageCount, 2)
  assert.equal(next.lastTranscriptAt, 30)
})

test('conversationWithTimelineTranscript preserves the prior transcript time when timeline transcript is empty', () => {
  const conversation = baseConversation({
    transcriptMessageCount: 8,
    lastTranscriptAt: 10,
  })

  const next = conversationWithTimelineTranscript(conversation, [])

  assert.deepEqual(next.transcriptMessages, [])
  assert.equal(next.transcriptMessageCount, 0)
  assert.equal(next.lastTranscriptAt, 10)
})

test('conversationHasTranscriptMessages reads explicit transcript counts before message arrays', () => {
  const conversationWithoutCount = baseConversation({
    transcriptMessages: [message()],
  })
  delete conversationWithoutCount.transcriptMessageCount

  assert.equal(conversationHasTranscriptMessages(baseConversation({
    transcriptMessageCount: 2,
    transcriptMessages: [],
  })), true)
  assert.equal(conversationHasTranscriptMessages(baseConversation({
    transcriptMessageCount: 0,
    transcriptMessages: [message()],
  })), false)
  assert.equal(conversationHasTranscriptMessages(conversationWithoutCount), true)
})

function baseConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conversation_1',
    title: 'Conversation',
    transcriptMessages: [],
    transcriptMessageCount: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message_1',
    role: 'assistant',
    content: 'Message',
    timestamp: 1,
    ...overrides,
  }
}
