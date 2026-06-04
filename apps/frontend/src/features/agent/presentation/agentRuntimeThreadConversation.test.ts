import assert from 'node:assert/strict'
import test from 'node:test'

import {
  conversationFromRuntimeThreadSummary,
} from '@/features/agent/presentation/agentRuntimeThreadConversation'
import type { AgentThreadSummary } from '@/shared/infrastructure/localAgentClient'

test('conversationFromRuntimeThreadSummary prefers frontend metadata title', () => {
  const conversation = conversationFromRuntimeThreadSummary(makeThread({
    title: 'Runtime title',
    metadata: { frontendTitle: 'Edited title' },
  }), translate)

  assert.equal(conversation.title, 'Edited title')
})

test('conversationFromRuntimeThreadSummary falls back to persisted thread title', () => {
  const conversation = conversationFromRuntimeThreadSummary(makeThread({
    title: 'Edited title',
  }), translate)

  assert.equal(conversation.title, 'Edited title')
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
  if (key === 'agents.chat.panel.runtime.localThreadTitle') return `本地线程 ${String(options?.id ?? '')}`
  return key
}
