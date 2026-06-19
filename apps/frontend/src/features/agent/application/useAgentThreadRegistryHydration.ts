import { useCallback, useEffect, useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { agentConversationIdForRegistryInput, type AgentConversationRegistryInput, type AgentConversationRegistryRecord } from '@movscript/core/agent'
import type { AgentChatThread, AgentChatThreadStatus } from '@movscript/core/agent/chat'

import { createAgentChatDataSourceForProvider } from '@/features/agent/application/agentChatDataSourceFactory'
import { agentProtocolUsesProviderSession } from '@/features/agent/domain/agentProviderSessionProtocol'
import {
  readAgentConversationRecordsById,
  registerAgentConversation,
} from '@/features/agent/state/agentConversationRegistryStore'
import type { AgentThreadSummary } from '@movscript/core/agent/protocol'
import {
  providerInstanceId,
  providerProtocol,
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'

export const AGENT_THREAD_REGISTRY_HYDRATION_PAGE_SIZE = 80
const EMPTY_AGENT_THREAD_SUMMARIES: AgentThreadSummary[] = []

export type AgentThreadRegistryProviderIdentity = {
  provider: string
  providerId: string
  providerInstanceId: string
  providerProtocol: string
}

export interface AgentThreadRegistryProviderHydration {
  provider: ProviderConfig
  providerIdentity: AgentThreadRegistryProviderIdentity
  sourceThreads: AgentThreadSummary[]
  isLoading: boolean
  refetch: () => Promise<unknown>
}

export function agentRuntimeThreadRegistryHydrationQueryKey(provider: ProviderConfig) {
  return ['agent-runtime-threads', provider.id, providerInstanceId(provider), 'agent-thread-registry-hydration'] as const
}

export function agentThreadRegistryProviderIdentity(provider: ProviderConfig): AgentThreadRegistryProviderIdentity {
  return {
    provider: provider.kind,
    providerId: provider.id,
    providerInstanceId: providerInstanceId(provider),
    providerProtocol: providerProtocol(provider),
  }
}

export async function listAgentThreadSummariesForProvider(provider: ProviderConfig): Promise<AgentThreadSummary[]> {
  const dataSource = await createAgentChatDataSourceForProvider(provider)
  const page = await dataSource.listThreads({ limit: AGENT_THREAD_REGISTRY_HYDRATION_PAGE_SIZE })
  return page.threads.map(agentThreadSummaryFromAgentChatThread)
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
    return agentThreadRegistryProviderIdentity(provider)
  }, [provider?.id, provider?.kind, provider?.protocol, provider?.runtime?.id])

  const query = useQuery<AgentThreadSummary[]>({
    queryKey: provider
      ? agentRuntimeThreadRegistryHydrationQueryKey(provider)
      : ['agent-runtime-threads', 'missing-provider', 'agent-thread-registry-hydration'],
    queryFn: async () => {
      if (!provider) return []
      return listAgentThreadSummariesForProvider(provider)
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
    hydrateAgentThreadRegistryFromSummaries({ providerIdentity, sourceThreads, userId })
  }, [providerIdentity, sourceThreads, userId])

  return {
    ...query,
    providerIdentity,
    sourceThreads,
  }
}

export function useAgentThreadRegistryHydrations({
  enabled = true,
  providers,
  userId,
}: {
  enabled?: boolean
  providers: ProviderConfig[]
  userId: string
}) {
  const providerEntries = useMemo(() => providers.map((provider) => ({
    provider,
    providerIdentity: agentThreadRegistryProviderIdentity(provider),
  })), [providers])
  const queries = useQueries({
    queries: providerEntries.map((entry) => ({
      queryKey: agentRuntimeThreadRegistryHydrationQueryKey(entry.provider),
      queryFn: () => listAgentThreadSummariesForProvider(entry.provider),
      enabled: enabled && Boolean(userId),
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: false,
    })),
  })
  const providerHydrations = useMemo<AgentThreadRegistryProviderHydration[]>(() => (
    providerEntries.map((entry, index) => ({
      ...entry,
      sourceThreads: queries[index]?.data ?? EMPTY_AGENT_THREAD_SUMMARIES,
      isLoading: queries[index]?.isLoading === true,
      refetch: () => queries[index]?.refetch() ?? Promise.resolve(undefined),
    }))
  ), [providerEntries, queries])

  useEffect(() => {
    if (!userId) return
    for (const hydration of providerHydrations) {
      if (hydration.sourceThreads.length === 0) continue
      hydrateAgentThreadRegistryFromSummaries({
        providerIdentity: hydration.providerIdentity,
        sourceThreads: hydration.sourceThreads,
        userId,
      })
    }
  }, [providerHydrations, userId])

  const refetch = useCallback(() => Promise.all(providerHydrations.map((hydration) => hydration.refetch())), [providerHydrations])

  return {
    providerHydrations,
    sourceThreads: providerHydrations.flatMap((hydration) => hydration.sourceThreads),
    isLoading: providerHydrations.some((hydration) => hydration.isLoading),
    refetch,
  }
}

export function hydrateAgentThreadRegistryFromSummaries(input: {
  providerIdentity: AgentThreadRegistryProviderIdentity
  sourceThreads: AgentThreadSummary[]
  userId: string
}): void {
  let currentRecords = readAgentConversationRecordsById()
  for (const thread of input.sourceThreads) {
    const existing = agentConversationRegistryRecordForThread(currentRecords, {
      providerIdentity: input.providerIdentity,
      threadId: thread.id,
      userId: input.userId,
    })
    if (!shouldHydrateAgentThreadSummary(thread, existing)) continue
    const registryInput = agentConversationRegistryInputFromThreadSummary({
      thread,
      userId: input.userId,
      providerIdentity: input.providerIdentity,
      open: agentThreadSummaryRegistryOpenState(thread, existing),
    })
    if (existing && agentConversationRegistryRecordMatchesInput(existing, registryInput)) continue
    registerAgentConversation(registryInput)
    currentRecords = readAgentConversationRecordsById()
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
  const providerSessionTreeId = agentProtocolUsesProviderSession(providerIdentity)
    ? thread.providerSessionTreeId?.trim() || thread.sessionId?.trim()
    : ''
  return {
    userId: input.userId,
    provider: providerIdentity.provider,
    providerId: providerIdentity.providerId,
    providerInstanceId: providerIdentity.providerInstanceId,
    providerProtocol: providerIdentity.providerProtocol,
    ...(providerSessionTreeId ? { providerSessionId: providerSessionTreeId } : {}),
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
  const providerSessionTreeId = thread.providerSessionTreeId?.trim() || thread.sessionId?.trim()
  return {
    id: thread.id,
    ...(providerSessionTreeId ? { providerSessionTreeId, sessionId: providerSessionTreeId } : {}),
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
