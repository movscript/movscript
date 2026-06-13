import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { agentConversationIdForRegistryInput, type AgentConversationRegistryInput, type AgentConversationRegistryRecord } from '@movscript/core/agent'
import type { AgentChatThread, AgentChatThreadStatus } from '@movscript/core/agent/chat'

import { createAgentChatDataSourceForProvider } from '@/features/agent/application/agentChatDataSourceFactory'
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

  return {
    ...query,
    providerIdentity,
    sourceThreads: query.data ?? [],
  }
}

export function agentConversationRegistryInputFromThreadSummary(input: {
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

export function shouldHydrateAgentThreadSummary(
  thread: Pick<AgentThreadSummary, 'messageCount' | 'title' | 'archived'>,
  existing?: AgentConversationRegistryRecord,
): boolean {
  return Boolean(existing) || agentThreadSummaryHasContent(thread)
}

export function agentThreadSummaryRegistryOpenState(
  thread: Pick<AgentThreadSummary, 'messageCount' | 'title' | 'archived'>,
  existing?: Pick<AgentConversationRegistryRecord, 'open'>,
): boolean {
  if (existing) return existing.open
  if (thread.archived === true) return false
  return agentThreadSummaryHasContent(thread)
}

export function agentThreadSummaryHasContent(
  thread: Pick<AgentThreadSummary, 'messageCount' | 'title'>,
): boolean {
  return thread.messageCount > 0 || Boolean(thread.title?.trim())
}

export function agentConversationRegistryRecordMatchesInput(
  record: AgentConversationRegistryRecord,
  input: AgentConversationRegistryInput,
): boolean {
  return record.id === agentConversationIdForRegistryInput(input)
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
  const transcriptMessageCount = thread.turns.reduce((count, turn) => (
    count + turn.items.filter((item) => item.type === 'userMessage' || item.type === 'agentMessage').length
  ), 0)
  const preview = thread.preview?.trim()
  return {
    id: thread.id,
    ...(thread.providerSessionTreeId?.trim() || thread.sessionId?.trim()
      ? { sessionId: thread.providerSessionTreeId?.trim() || thread.sessionId?.trim() }
      : {}),
    title: thread.name?.trim() || preview || undefined,
    archived: false,
    ...(status ? { status } : {}),
    createdAt: agentChatThreadTimestampIso(thread.createdAt),
    updatedAt: agentChatThreadTimestampIso(thread.updatedAt),
    messageCount: transcriptMessageCount > 0 ? transcriptMessageCount : preview ? 1 : 0,
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
