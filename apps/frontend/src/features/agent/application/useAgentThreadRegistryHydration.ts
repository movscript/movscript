import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AgentConversationRegistryInput, AgentConversationRegistryRecord } from '@movscript/core/agent'
import type { AgentChatThread, AgentChatThreadStatus } from '@movscript/core/agent/chat'

import { createAgentChatDataSourceForProvider } from '@/features/agent/application/agentChatDataSourceFactory'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import type { AgentThreadSummary } from '@/shared/infrastructure/providerSessionClient'
import {
  providerInstanceId,
  providerProtocol,
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'

export const AGENT_THREAD_REGISTRY_HYDRATION_PAGE_SIZE = 80

export function appServerThreadRegistryHydrationQueryKey(provider: ProviderConfig) {
  return ['app-server-threads', provider.id, providerInstanceId(provider), 'agent-thread-registry-hydration'] as const
}

export function useAgentThreadRegistryHydration({
  enabled = true,
  provider,
  userId,
}: {
  enabled?: boolean
  provider?: ProviderConfig
  userId: string
}) {
  const upsertConversation = useAgentSessionStore((state) => state.upsertConversation)
  const providerIdentity = useMemo(() => {
    if (!provider) return null
    return {
      provider: provider.kind,
      providerId: provider.id,
      providerInstanceId: providerInstanceId(provider),
      providerProtocol: providerProtocol(provider),
    }
  }, [provider?.id, provider?.kind, provider?.protocol, provider?.appServerProfile?.id])

  const query = useQuery<AgentThreadSummary[]>({
    queryKey: provider
      ? appServerThreadRegistryHydrationQueryKey(provider)
      : ['app-server-threads', 'missing-provider', 'agent-thread-registry-hydration'],
    queryFn: async () => {
      if (!provider) return []
      const dataSource = await createAgentChatDataSourceForProvider(provider)
      const page = await dataSource.listThreads({ limit: AGENT_THREAD_REGISTRY_HYDRATION_PAGE_SIZE })
      return page.threads.map(agentThreadSummaryFromAgentChatThread)
    },
    enabled: enabled && Boolean(userId) && Boolean(provider),
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
  })

  useEffect(() => {
    if (!providerIdentity || !userId || !query.data) return
    const currentRecords = useAgentSessionStore.getState().conversationsById
    for (const thread of query.data) {
      const existing = currentRecords[thread.id]
      const input = agentConversationRegistryInputFromThreadSummary({
        thread,
        userId,
        providerIdentity,
        open: existing?.open ?? false,
      })
      if (existing && agentConversationRegistryRecordMatchesInput(existing, input)) continue
      upsertConversation(input)
    }
  }, [providerIdentity, query.data, upsertConversation, userId])

  return {
    ...query,
    sourceThreads: query.data ?? [],
  }
}

function agentConversationRegistryInputFromThreadSummary(input: {
  thread: AgentThreadSummary
  userId: string
  providerIdentity: {
    provider: string
    providerId: string
    providerInstanceId: string
    providerProtocol: string
  }
  open: boolean
}): AgentConversationRegistryInput {
  const { providerIdentity, thread } = input
  return {
    id: thread.id,
    userId: input.userId,
    provider: providerIdentity.provider,
    providerId: providerIdentity.providerId,
    providerInstanceId: providerIdentity.providerInstanceId,
    providerProtocol: providerIdentity.providerProtocol,
    ...(thread.sessionId?.trim() ? { providerSessionId: thread.sessionId.trim() } : {}),
    providerThreadId: thread.id,
    ...(thread.title?.trim() ? { title: thread.title.trim() } : {}),
    ...(typeof thread.projectId === 'number' ? { projectId: thread.projectId } : {}),
    ...(thread.status ? { status: thread.status } : {}),
    archived: thread.archived === true,
    open: input.open,
    createdAt: Date.parse(thread.createdAt) || undefined,
    updatedAt: Date.parse(thread.updatedAt) || undefined,
  }
}

function agentConversationRegistryRecordMatchesInput(
  record: AgentConversationRegistryRecord,
  input: AgentConversationRegistryInput,
): boolean {
  return record.id === (input.id ?? input.providerThreadId)
    && record.userId === input.userId
    && record.provider === input.provider
    && record.providerId === input.providerId
    && record.providerInstanceId === input.providerInstanceId
    && record.providerProtocol === input.providerProtocol
    && record.providerSessionId === input.providerSessionId
    && record.providerThreadId === input.providerThreadId
    && record.title === input.title
    && record.projectId === input.projectId
    && record.status === input.status
    && record.archived === input.archived
    && record.open === input.open
    && record.createdAt === input.createdAt
    && record.updatedAt === input.updatedAt
}

function agentThreadSummaryFromAgentChatThread(thread: AgentChatThread): AgentThreadSummary {
  const status = agentThreadSummaryStatusFromAgentChatThreadStatus(thread.status)
  return {
    id: thread.id,
    ...(thread.providerSessionTreeId?.trim() || thread.sessionId?.trim()
      ? { sessionId: thread.providerSessionTreeId?.trim() || thread.sessionId?.trim() }
      : {}),
    title: thread.name?.trim() || thread.preview?.trim() || undefined,
    archived: false,
    ...(status ? { status } : {}),
    createdAt: agentChatThreadTimestampIso(thread.createdAt),
    updatedAt: agentChatThreadTimestampIso(thread.updatedAt),
    messageCount: thread.turns.reduce((count, turn) => (
      count + turn.items.filter((item) => item.type === 'userMessage' || item.type === 'agentMessage').length
    ), 0),
  }
}

function agentThreadSummaryStatusFromAgentChatThreadStatus(status: AgentChatThreadStatus): AgentThreadSummary['status'] | undefined {
  if (status === 'idle' || status === 'running' || status === 'requires_action' || status === 'completed' || status === 'failed' || status === 'cancelled') {
    return status
  }
  return undefined
}

function agentChatThreadTimestampIso(timestampSeconds: number): string {
  const timestampMs = Number.isFinite(timestampSeconds) ? timestampSeconds * 1000 : Date.now()
  return new Date(timestampMs).toISOString()
}
