import assert from 'node:assert/strict'
import test from 'node:test'

import type { AgentConversationRegistryRecord } from '@movscript/core/agent'
import type { Conversation } from '@/features/agent/state/agentStore'
import { sortAgentModeOpenConversations } from './ProjectAgentModeSidebarModel'

function conversation(id: string, updatedAt: number): Conversation {
  return {
    id,
    title: id,
    transcriptMessages: [],
    createdAt: 1_000,
    updatedAt,
  } as Conversation
}

function registryRecord(id: string, deckOrder: number, updatedAt: number): AgentConversationRegistryRecord {
  return {
    id,
    userId: 'user-1',
    providerThreadId: `thread-${id}`,
    open: true,
    archived: false,
    createdAt: 1_000,
    updatedAt,
    deckOrder,
  }
}

test('project agent mode open conversations keep registry deck order during stream updates', () => {
  const records = {
    alpha: registryRecord('alpha', 2, 10_000),
    beta: registryRecord('beta', 1, 20_000),
    gamma: registryRecord('gamma', 3, 30_000),
  }
  const conversations = [
    conversation('alpha', 10_000),
    conversation('beta', 20_000),
    conversation('gamma', 30_000),
  ]

  assert.deepEqual(
    sortAgentModeOpenConversations({ conversations, conversationsById: records }).map((item) => item.id),
    ['beta', 'alpha', 'gamma'],
  )

  const streamedConversations = conversations.map((item) => (
    item.id === 'gamma' ? { ...item, updatedAt: 99_999 } : item
  ))
  assert.deepEqual(
    sortAgentModeOpenConversations({ conversations: streamedConversations, conversationsById: records }).map((item) => item.id),
    ['beta', 'alpha', 'gamma'],
  )
})
