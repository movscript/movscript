import assert from 'node:assert/strict'
import test from 'node:test'

import type { AgentConversationRegistryRecord } from '@movscript/core/agent'
import type { AgentThreadSummary } from '@movscript/core/agent/protocol'
import type { Conversation } from '@/features/agent/state/agentStore'
import {
  agentRuntimeConversationIdForThread,
  type AgentRuntimeConversationProviderIdentity,
} from './ProjectAgentModeConversationModel'
import {
  buildProjectAgentModeHistoryItems,
  sortAgentModeOpenConversations,
} from './ProjectAgentModeSidebarModel'

const codexIdentity: AgentRuntimeConversationProviderIdentity = {
  provider: 'codex',
  providerId: 'codex',
  providerInstanceId: 'codex-app-server',
  providerProtocol: 'sdk',
}

const movaIdentity: AgentRuntimeConversationProviderIdentity = {
  provider: 'mova',
  providerId: 'mova',
  providerInstanceId: 'mova-app-server',
  providerProtocol: 'sdk',
}

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

test('project agent mode history source threads are scoped by provider identity', () => {
  const items = buildProjectAgentModeHistoryItems({
    archivedConversations: [],
    archivedConversationIds: new Set(),
    closedConversations: [],
    closedConversationIds: new Set(),
    openConversationIds: new Set([agentRuntimeConversationIdForThread('thread_same', codexIdentity)]),
    sourceThreads: [
      { providerIdentity: codexIdentity, thread: threadSummary({ id: 'thread_same', title: 'Codex' }) },
      { providerIdentity: movaIdentity, thread: threadSummary({ id: 'thread_same', title: 'Mova' }) },
    ],
  })

  assert.equal(items.length, 1)
  assert.equal(items[0]?.type, 'provider-thread')
  if (items[0]?.type === 'provider-thread') {
    assert.equal(items[0].providerIdentity.provider, 'mova')
  }
})

function threadSummary(input: Partial<AgentThreadSummary> = {}): AgentThreadSummary {
  return {
    id: input.id ?? 'thread_1',
    title: input.title ?? 'Thread',
    archived: input.archived ?? false,
    createdAt: input.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-01-02T00:00:00.000Z',
    messageCount: input.messageCount ?? 1,
  }
}
