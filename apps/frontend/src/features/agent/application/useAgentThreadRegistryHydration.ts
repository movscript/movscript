import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { agentConversationIdForRegistryInput, type AgentConversationRegistryInput, type AgentConversationRegistryRecord } from '@movscript/core/agent'
import type { AgentChatThread, AgentChatThreadStatus } from '@movscript/core/agent/chat'

import { createAgentChatDataSourceForProvider } from '@/features/agent/application/agentChatDataSourceFactory'
import { agentProtocolUsesProviderSession } from '@/features/agent/domain/agentProviderSessionProtocol'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import type { AgentThreadSummary } from '@movscript/core/agent/protocol'
import {
  providerInstanceId,
  providerProtocol,
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'

export const AGENT_THREAD_REGISTRY_HYDRATION_PAGE_SIZE = 80
const EMPTY_AGENT_THREAD_SUMMARIES: AgentThreadSummary[] = []

export function agentRuntimeThreadRegistryHydrationQueryKey(provider: ProviderConfig) {
  return ['agent-runtime-threads', provider.id, providerInstanceId(provider), 'agent-thread-registry-hydration'] as const
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
  }, [provider?.id, provider?.kind, provider?.protocol, provider?.runtime?.id])
  const upsertConversation = useAgentSessionStore((state) => state.upsertConversation)

  const query = useQuery<AgentThreadSummary[]>({
    queryKey: provider
      ? agentRuntimeThreadRegistryHydrationQueryKey(provider)
      : ['agent-runtime-threads', 'missing-provider', 'agent-thread-registry-hydration'],
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
  const sourceThreads = query.data ?? EMPTY_AGENT_THREAD_SUMMARIES

  useEffect(() => {
    if (!providerIdentity || sourceThreads.length === 0) return
    const currentRecords = useAgentSessionStore.getState().conversationsById
    for (const thread of sourceThreads) {
      const existing = agentConversationRegistryRecordForThread(currentRecords, {
        providerIdentity,
        threadId: thread.id,
        userId,
      })
      if (!shouldHydrateAgentThreadSummary(thread, existing)) continue
      upsertConversation(agentConversationRegistryInputFromThreadSummary({
        thread,
        userId,
        providerIdentity,
        open: agentThreadSummaryRegistryOpenState(thread, existing),
      }))
    }
  }, [providerIdentity, sourceThreads, upsertConversation, userId])

  return {
    ...query,
    providerIdentity,
    sourceThreads,
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
  const providerSessionId = agentProtocolUsesProviderSession(providerIdentity)
    ? thread.sessionId?.trim()
    : ''
  return {
    userId: input.userId,
    provider: providerIdentity.provider,
    providerId: providerIdentity.providerId,
    providerInstanceId: providerIdentity.providerInstanceId,
    providerProtocol: providerIdentity.providerProtocol,
    ...(providerSessionId ? { providerSessionId } : {}),
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

function agentConversationRegistryRecordForThread(
  records: Record<string, AgentConversationRegistryRecord>,
  input: {
    providerIdentity: {
      provider: string
      providerId: string
      providerInstanceId: string
      providerProtocol: string
    }
    threadId: string
    userId: string
  },
): AgentConversationRegistryRecord | undefined {
  const id = agentConversationIdForRegistryInput({
    providerThreadId: input.threadId,
    ...input.providerIdentity,
  })
  return records[id] ?? records[input.threadId]
}

function agentThreadSummaryFromAgentChatThread(thread: AgentChatThread): AgentThreadSummary {
  const status = agentThreadSummaryStatusFromAgentChatThreadStatus(thread.status)
  const transcriptMessageCount = thread.turns.reduce((count, turn) => (
    count + turn.items.filter((item) => item.type === 'userMessage' || item.type === 'agentMessage').length
  ), 0)
  const preview = thread.preview?.trim()
  const projectId = projectIdFromProviderSessionCwd(thread.cwd)
  return {
    id: thread.id,
    ...(thread.sessionId?.trim() || thread.providerSessionTreeId?.trim()
      ? { sessionId: thread.sessionId?.trim() || thread.providerSessionTreeId?.trim() }
      : {}),
    title: thread.name?.trim() || preview || undefined,
    ...(projectId !== undefined ? { projectId } : {}),
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
  const timestampMs = Number.isFinite(timestampSeconds)
    ? timestampSeconds * 1000
    : Date.now()
  return new Date(timestampMs).toISOString()
}

function projectIdFromProviderSessionCwd(cwd: string | null | undefined): number | undefined {
  const normalized = cwd?.replace(/\\/g, '/')
  if (!normalized) return undefined
  const match = /(?:^|\/)\.movscript\/(?:local|user\/[^/]+|org\/[^/]+)\/projects\/project_(\d+)(?:\/|$)/.exec(normalized)
    ?? /(?:^|\/)(?:local|user\/[^/]+|org\/[^/]+)\/projects\/project_(\d+)(?:\/|$)/.exec(normalized)
  if (!match?.[1]) return undefined
  const projectId = Number(match[1])
  return Number.isInteger(projectId) && projectId > 0 ? projectId : undefined
}
