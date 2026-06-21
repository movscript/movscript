import assert from 'node:assert/strict'
import test from 'node:test'

import type { AgentConversationRegistryRecord } from '@movscript/core/agent'
import type { AgentThreadSummary } from '@movscript/core/agent/protocol'

import {
  agentRuntimeConversationIdForThread,
  agentRuntimeConversationRecordsFromProviderSources,
  agentRuntimeConversationRecordsFromSourceThreads,
  agentRuntimeProviderIdentityKey,
  type AgentRuntimeConversationProviderIdentity,
} from './ProjectAgentModeConversationModel'

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

test('agent runtime source thread projection preserves existing project workspace binding', () => {
  const id = agentRuntimeConversationIdForThread('thread_1', codexIdentity)
  const existing = conversationRecord({
    id,
    ...codexIdentity,
    providerThreadId: 'thread_1',
    providerThreadCwd: '/workspace/projects/demo-film',
    workspaceContext: { scope: 'project', projectId: 42 },
    projectId: 42,
    deckOrder: 3,
  })

  const records = agentRuntimeConversationRecordsFromSourceThreads({
    conversationsById: { [id]: existing },
    providerIdentity: codexIdentity,
    sourceThreads: [threadSummary({ id: 'thread_1', projectId: undefined })],
    userId: 'user_1',
  })

  assert.equal(records.length, 1)
  assert.equal(records[0]?.projectId, 42)
  assert.equal(records[0]?.providerThreadCwd, '/workspace/projects/demo-film')
  assert.deepEqual(records[0]?.workspaceContext, { scope: 'project', projectId: 42 })
  assert.equal(records[0]?.deckOrder, 3)
})

test('agent runtime source records are scoped by provider identity', () => {
  const records = agentRuntimeConversationRecordsFromProviderSources({
    conversationsById: {},
    providerSources: [
      {
        providerIdentity: codexIdentity,
        sourceThreads: [threadSummary({ id: 'thread_same', title: 'Codex thread' })],
      },
      {
        providerIdentity: movaIdentity,
        sourceThreads: [threadSummary({ id: 'thread_same', title: 'Mova thread' })],
      },
    ],
    userId: 'user_1',
  })

  assert.equal(records.length, 2)
  assert.notEqual(records[0]?.id, records[1]?.id)
  assert.deepEqual(
    records.map((record) => agentRuntimeProviderIdentityKey(record)).sort(),
    [agentRuntimeProviderIdentityKey(codexIdentity), agentRuntimeProviderIdentityKey(movaIdentity)].sort(),
  )
})

test('agent runtime source projection includes registry-only provider conversations', () => {
  const id = agentRuntimeConversationIdForThread('registry_only_thread', movaIdentity)
  const existing = conversationRecord({
    id,
    ...movaIdentity,
    providerThreadId: 'registry_only_thread',
    providerThreadCwd: '/workspace/projects/demo-film',
    workspaceContext: { scope: 'project', projectId: 42 },
    projectId: 42,
    title: 'Registry-only project conversation',
  })

  const records = agentRuntimeConversationRecordsFromProviderSources({
    conversationsById: { [id]: existing },
    providerSources: [{
      providerIdentity: movaIdentity,
      sourceThreads: [],
    }],
    userId: 'user_1',
  })

  assert.equal(records.length, 1)
  assert.equal(records[0]?.id, id)
  assert.equal(records[0]?.projectId, 42)
  assert.equal(records[0]?.title, 'Registry-only project conversation')
})

function threadSummary(input: Partial<AgentThreadSummary> = {}): AgentThreadSummary {
  return {
    id: input.id ?? 'thread_1',
    title: input.title ?? 'Thread',
    archived: input.archived ?? false,
    status: input.status,
    createdAt: input.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-01-01T00:00:00.000Z',
    messageCount: input.messageCount ?? 1,
    ...(typeof input.projectId === 'number' ? { projectId: input.projectId } : {}),
  }
}

function conversationRecord(input: Partial<AgentConversationRegistryRecord> = {}): AgentConversationRegistryRecord {
  return {
    id: input.id ?? 'thread_1',
    userId: input.userId ?? 'user_1',
    providerThreadId: input.providerThreadId ?? 'thread_1',
    open: input.open ?? true,
    archived: input.archived ?? false,
    createdAt: input.createdAt ?? 1_000,
    updatedAt: input.updatedAt ?? 2_000,
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.providerInstanceId ? { providerInstanceId: input.providerInstanceId } : {}),
    ...(input.providerProtocol ? { providerProtocol: input.providerProtocol } : {}),
    ...(input.providerSessionId ? { providerSessionId: input.providerSessionId } : {}),
    ...(input.providerThreadCwd ? { providerThreadCwd: input.providerThreadCwd } : {}),
    ...(input.workspaceContext ? { workspaceContext: input.workspaceContext } : {}),
    ...(typeof input.projectId === 'number' ? { projectId: input.projectId } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(typeof input.deckOrder === 'number' ? { deckOrder: input.deckOrder } : {}),
  }
}
