import {
  agentConversationIdForRegistryInput,
  selectAgentConversationRegistryRecords,
  type AgentConversationRegistryRecord,
} from '@movscript/core/agent'

import {
  agentConversationRegistryInputFromThreadSummary,
  agentThreadSummaryRegistryOpenState,
  shouldHydrateAgentThreadSummary,
} from '@/features/agent/application/useAgentThreadRegistryHydration'
import type { Conversation } from '@/features/agent/state/agentStore'
import type { AgentConversationThreadBinding, useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import type { AgentSessionSummary, AgentThreadSummary } from '@movscript/core/agent/protocol'

type ProviderIdentity = {
  provider: string
  providerId: string
  providerInstanceId: string
  providerProtocol: string
}

export function conversationProjectId(
  conversation: Conversation,
  context: {
    conversationsById: Record<string, AgentConversationRegistryRecord>
    providerSessionThreadsById: Map<string, AgentThreadSummary>
    conversationThreadBindings: Record<string, AgentConversationThreadBinding>
    providerSessionsById: Map<string, AgentSessionSummary>
    pageTasks: ReturnType<typeof useAgentSessionStore.getState>['pageTasks']
  },
) {
  const taskProjectId = Object.values(context.pageTasks)
    .filter((task) => task.conversationId === conversation.id)
    .map((task) => task.payload.projectId)
    .find((projectId): projectId is number => typeof projectId === 'number')
  if (taskProjectId !== undefined) return taskProjectId

  const binding = context.conversationThreadBindings[conversation.id]
  const sessionId = binding?.providerSessionTreeId ?? conversation.providerSessionId
  const sessionProjectId = sessionId ? context.providerSessionsById.get(sessionId)?.projectId : undefined
  if (typeof sessionProjectId === 'number') return sessionProjectId

  const recordProjectId = conversation.id ? context.conversationsById[conversation.id]?.projectId : undefined
  if (typeof recordProjectId === 'number') return recordProjectId

  const threadId = binding?.providerThreadId ?? conversation.providerThreadId
  const threadProjectId = threadId ? context.providerSessionThreadsById.get(threadId)?.projectId : undefined
  return typeof threadProjectId === 'number' ? threadProjectId : undefined
}

export function agentRuntimeConversationIdForThread(
  threadId: string,
  providerIdentity: ProviderIdentity,
): string {
  return agentConversationIdForRegistryInput({
    providerThreadId: threadId,
    ...providerIdentity,
  })
}

export function agentRuntimeConversationRecordsFromSourceThreads(input: {
  conversationsById: Record<string, AgentConversationRegistryRecord>
  providerIdentity: ProviderIdentity
  sourceThreads: AgentThreadSummary[]
  userId: string
}): AgentConversationRegistryRecord[] {
  const records: AgentConversationRegistryRecord[] = []
  const sourceRecordIds = new Set<string>()
  for (const thread of input.sourceThreads) {
    const canonicalId = agentRuntimeConversationIdForThread(thread.id, input.providerIdentity)
    const existing = input.conversationsById[canonicalId] ?? input.conversationsById[thread.id]
    if (!shouldHydrateAgentThreadSummary(thread, existing)) continue
    const registryInput = agentConversationRegistryInputFromThreadSummary({
      thread,
      userId: input.userId,
      providerIdentity: input.providerIdentity,
      open: agentThreadSummaryRegistryOpenState(thread, existing),
    })
    const id = existing?.id ?? canonicalId
    sourceRecordIds.add(id)
    records.push({
      id,
      userId: input.userId,
      providerThreadId: thread.id,
      open: registryInput.open !== false,
      archived: registryInput.archived === true,
      createdAt: registryInput.createdAt ?? Date.now(),
      updatedAt: registryInput.updatedAt ?? Date.now(),
      ...(registryInput.provider ? { provider: registryInput.provider } : {}),
      ...(registryInput.providerId ? { providerId: registryInput.providerId } : {}),
      ...(registryInput.providerInstanceId ? { providerInstanceId: registryInput.providerInstanceId } : {}),
      ...(registryInput.providerProtocol ? { providerProtocol: registryInput.providerProtocol } : {}),
      ...(registryInput.providerSessionId ? { providerSessionId: registryInput.providerSessionId } : {}),
      ...(registryInput.title ? { title: registryInput.title } : {}),
      ...(registryInput.status ? { status: registryInput.status } : {}),
      ...(typeof registryInput.projectId === 'number' ? { projectId: registryInput.projectId } : {}),
      ...(typeof existing?.deckOrder === 'number' ? { deckOrder: existing.deckOrder } : {}),
    })
  }
  const sourceThreadIds = new Set(input.sourceThreads.map((thread) => thread.id))
  for (const record of selectAgentConversationRegistryRecords(input.conversationsById, {
    userId: input.userId,
    ...input.providerIdentity,
    includeClosed: true,
    includeArchived: true,
  })) {
    if (sourceRecordIds.has(record.id) || sourceThreadIds.has(record.providerThreadId)) continue
    records.push(record)
  }
  return records.sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
}

export function conversationFromRegistryRecord(record: AgentConversationRegistryRecord): Conversation {
  const conversation: Conversation & { providerProtocol?: string } = {
    id: record.id,
    title: record.title ?? '',
    transcriptMessages: [],
    ...(record.providerSessionId ? { providerSessionId: record.providerSessionId } : {}),
    providerThreadId: record.providerThreadId,
    ...(record.archived ? { archived: true } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
  if (record.providerProtocol) conversation.providerProtocol = record.providerProtocol
  return conversation
}
