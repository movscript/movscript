import assert from 'node:assert/strict'
import test from 'node:test'

import {
  conversationFromProviderSessionThreadSummary,
} from '@/features/agent/presentation/providerSessionThreadConversation'
import type { AgentThreadSummary } from '@/shared/infrastructure/providerSessionClient'

test('conversationFromProviderSessionThreadSummary prefers frontend metadata title', () => {
  const conversation = conversationFromProviderSessionThreadSummary(makeThread({
    title: 'Runtime title',
    metadata: { frontendTitle: 'Edited title' },
  }), translate)

  assert.equal(conversation.title, 'Edited title')
})

test('conversationFromProviderSessionThreadSummary falls back to persisted thread title', () => {
  const conversation = conversationFromProviderSessionThreadSummary(makeThread({
    title: 'Edited title',
  }), translate)

  assert.equal(conversation.title, 'Edited title')
})

test('conversationFromProviderSessionThreadSummary fallback does not expose thread id', () => {
  const conversation = conversationFromProviderSessionThreadSummary(makeThread(), translate)

  assert.equal(conversation.title, '未命名会话')
  assert.equal(conversation.title.includes('thread_123456'), false)
})

function makeThread(overrides: Partial<AgentThreadSummary> = {}): AgentThreadSummary {
  return {
    id: 'thread_123456',
    archived: false,
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
    messageCount: 0,
    ...overrides,
  }
}

function translate(key: string, options?: Record<string, unknown>) {
  if (key === 'agents.chat.panel.providerSession.providerThreadTitle') return '未命名会话'
  return key
}
