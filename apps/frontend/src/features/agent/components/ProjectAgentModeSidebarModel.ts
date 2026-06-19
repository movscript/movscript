import {
  conversationProjectId,
} from '@/features/agent/components/ProjectAgentModeConversationModel'
import {
  shouldHydrateAgentThreadSummary,
} from '@/features/agent/application/useAgentThreadRegistryHydration'
import type { AgentModeHistoryItem, AgentModeProjectConversationGroup, } from '@/features/agent/components/ProjectAgentModeSidebarParts'
import type { Conversation } from '@/features/agent/state/agentStore'
import type { AgentConversationThreadBinding, useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import {
  buildSessionDeckIndex,
  type AgentConversationRegistryRecord,
} from '@movscript/core/agent'
import type { AgentSessionSummary, AgentThreadSummary } from '@movscript/core/agent/protocol'

export function sortAgentModeOpenConversations(input: {
  conversations: Conversation[]
  conversationsById: Record<string, AgentConversationRegistryRecord>
}): Conversation[] {
  const { conversations, conversationsById } = input
  const sourceIndex = new Map(conversations.map((conversation, index) => [conversation.id, index]))
  const deck = buildSessionDeckIndex({
    entries: conversations.map((conversation) => {
      const record = conversationsById[conversation.id]
      return {
        id: conversation.id,
        open: record?.open,
        archived: record?.archived ?? conversation.archived,
        createdAt: record?.createdAt ?? conversation.createdAt,
        updatedAt: record?.updatedAt ?? conversation.updatedAt,
        deckOrder: record?.deckOrder,
      }
    }),
  })
  return [...conversations].sort((a, b) => {
    const leftOrder = deck.orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = deck.orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder
      || b.updatedAt - a.updatedAt
      || (sourceIndex.get(a.id) ?? 0) - (sourceIndex.get(b.id) ?? 0)
  })
}

export function buildProjectAgentModeConversationScopes(input: {
  conversationThreadBindings: Record<string, AgentConversationThreadBinding>
  conversationsById: Record<string, AgentConversationRegistryRecord>
  locale: string | undefined
  openConversations: Conversation[]
  pageTasks: ReturnType<typeof useAgentSessionStore.getState>['pageTasks']
  projectFallbackLabel: string
  projectNamesById: Map<number, string>
  providerSessionThreadsById: Map<string, AgentThreadSummary>
  providerSessionsById: Map<string, AgentSessionSummary>
}): {
  chatConversations: Conversation[]
  projectGroups: AgentModeProjectConversationGroup[]
} {
  const projectGroupsById = new Map<number, AgentModeProjectConversationGroup>()
  const chatConversations: Conversation[] = []
  for (const conversation of input.openConversations) {
    const projectId = conversationProjectId(conversation, {
      conversationsById: input.conversationsById,
      providerSessionThreadsById: input.providerSessionThreadsById,
      conversationThreadBindings: input.conversationThreadBindings,
      providerSessionsById: input.providerSessionsById,
      pageTasks: input.pageTasks,
    })
    if (projectId === undefined) {
      chatConversations.push(conversation)
      continue
    }
    const group = projectGroupsById.get(projectId) ?? {
      projectId,
      projectName: input.projectNamesById.get(projectId) ?? `${input.projectFallbackLabel} #${projectId}`,
      conversations: [],
    }
    group.conversations.push(conversation)
    projectGroupsById.set(projectId, group)
  }
  const projectGroups = Array.from(projectGroupsById.values())
    .sort((a, b) => a.projectName.localeCompare(b.projectName, input.locale))
  return { projectGroups, chatConversations }
}

export function buildProjectAgentModeHistoryItems(input: {
  archivedConversations: Conversation[]
  archivedProviderThreadIds: Set<string>
  closedConversations: Conversation[]
  closedProviderThreadIds: Set<string>
  openProviderThreadIds: Set<string>
  sourceThreads: AgentThreadSummary[]
}): AgentModeHistoryItem[] {
  return [
    ...input.archivedConversations.map((conversation) => ({
      type: 'conversation' as const,
      id: conversation.id,
      timestamp: conversation.updatedAt,
      conversation,
    })),
    ...input.closedConversations.map((conversation) => ({
      type: 'conversation' as const,
      id: conversation.id,
      timestamp: conversation.updatedAt,
      conversation,
    })),
    ...input.sourceThreads
      .filter((thread) => (
        shouldIncludeProviderThreadHistoryItem({
          archivedProviderThreadIds: input.archivedProviderThreadIds,
          closedProviderThreadIds: input.closedProviderThreadIds,
          openProviderThreadIds: input.openProviderThreadIds,
          thread,
        })
      ))
      .map((thread) => ({
        type: 'provider-thread' as const,
        id: thread.id,
        timestamp: Date.parse(thread.updatedAt) || 0,
        thread,
      })),
  ].sort((a, b) => b.timestamp - a.timestamp)
}

function shouldIncludeProviderThreadHistoryItem(input: {
  archivedProviderThreadIds: Set<string>
  closedProviderThreadIds: Set<string>
  openProviderThreadIds: Set<string>
  thread: AgentThreadSummary
}): boolean {
  return shouldHydrateAgentThreadSummary(input.thread)
    && !input.archivedProviderThreadIds.has(input.thread.id)
    && !input.closedProviderThreadIds.has(input.thread.id)
    && !input.openProviderThreadIds.has(input.thread.id)
}
