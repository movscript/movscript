import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agentThreadSummaryHasContent,
  agentThreadSummaryRegistryOpenState,
  shouldHydrateAgentThreadSummary,
} from '@/features/agent/application/useAgentThreadRegistryHydration'
import type { AgentConversationRegistryRecord } from '@movscript/core/agent'
import type { AgentThreadSummary } from '@/shared/infrastructure/providerSessionClient'

test('agent thread registry hydration ignores new empty threads', () => {
  const thread = threadSummary({ messageCount: 0, title: undefined })

  assert.equal(agentThreadSummaryHasContent(thread), false)
  assert.equal(shouldHydrateAgentThreadSummary(thread), false)
})

test('agent thread registry hydration opens new content threads', () => {
  const thread = threadSummary({ messageCount: 2 })

  assert.equal(agentThreadSummaryHasContent(thread), true)
  assert.equal(shouldHydrateAgentThreadSummary(thread), true)
  assert.equal(agentThreadSummaryRegistryOpenState(thread), true)
})

test('agent thread registry hydration preserves explicit closed records as history', () => {
  const existing = conversationRecord({ open: false })
  const thread = threadSummary({ messageCount: 3 })

  assert.equal(shouldHydrateAgentThreadSummary(thread, existing), true)
  assert.equal(agentThreadSummaryRegistryOpenState(thread, existing), false)
})

function threadSummary(input: Partial<AgentThreadSummary> = {}): AgentThreadSummary {
  return {
    id: input.id ?? 'thread_1',
    archived: input.archived ?? false,
    createdAt: input.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-01-01T00:00:00.000Z',
    messageCount: input.messageCount ?? 0,
    ...(input.title !== undefined ? { title: input.title } : {}),
  }
}

function conversationRecord(input: Partial<AgentConversationRegistryRecord> = {}): AgentConversationRegistryRecord {
  return {
    id: input.id ?? 'thread_1',
    userId: input.userId ?? 'user_1',
    providerThreadId: input.providerThreadId ?? 'thread_1',
    open: input.open ?? true,
    archived: input.archived ?? false,
    createdAt: input.createdAt ?? 1000,
    updatedAt: input.updatedAt ?? 2000,
  }
}
