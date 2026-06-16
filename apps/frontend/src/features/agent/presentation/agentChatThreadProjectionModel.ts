import {
  type AgentChatDataSource,
  type AgentChatThread,
} from '@movscript/core/agent/chat'
import type { AgentConversationRegistryInput, AgentConversationRegistryRecord } from '@movscript/core/agent'

export function agentChatSourceThreadHasContent(thread: Pick<AgentChatThread, 'name' | 'preview' | 'turns'>): boolean {
  if (thread.name?.trim() || thread.preview?.trim()) return true
  return thread.turns.some((turn) => turn.items.some((item) => item.type === 'userMessage' || item.type === 'agentMessage'))
}

export function selectAgentChatInitialSourceThread(input: {
  closedThreadIds: Set<string>
  threads: AgentChatThread[]
}): AgentChatThread | undefined {
  return input.threads.find((thread) => (
    agentChatSourceThreadHasContent(thread)
    && !input.closedThreadIds.has(thread.id)
  ))
}

export function agentConversationRecordMatchesProviderIdentity(
  record: AgentConversationRegistryRecord,
  identity: {
    provider?: string
    providerId?: string
    providerInstanceId?: string
    providerProtocol?: string
  },
): boolean {
  const recordHasProviderIdentity = Boolean(record.provider || record.providerId || record.providerInstanceId || record.providerProtocol)
  if (!recordHasProviderIdentity) return true
  if (record.provider && identity.provider && record.provider !== identity.provider) return false
  if (record.providerId && identity.providerId && record.providerId !== identity.providerId) return false
  if (record.providerInstanceId && identity.providerInstanceId && record.providerInstanceId !== identity.providerInstanceId) return false
  if (record.providerProtocol && identity.providerProtocol && record.providerProtocol !== identity.providerProtocol) return false
  return true
}

export function buildAgentChatProviderIdentity(input: {
  provider?: string
  providerId?: string
  providerInstanceId?: string
  providerProtocol?: string
}): {
  provider?: string
  providerId?: string
  providerInstanceId?: string
  providerProtocol?: string
} {
  return {
    provider: input.provider,
    providerId: input.providerId?.trim(),
    providerInstanceId: input.providerInstanceId?.trim(),
    providerProtocol: input.providerProtocol,
  }
}

export function buildAgentChatConversationPatchInput(input: {
  nowMs: number
  open: boolean
  provider?: string
  providerId?: string
  providerInstanceId?: string
  providerProtocol?: string
  threadId: string
  userId: string
}): AgentConversationRegistryInput {
  return {
    userId: input.userId,
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.providerId?.trim() ? { providerId: input.providerId.trim() } : {}),
    ...(input.providerInstanceId?.trim() ? { providerInstanceId: input.providerInstanceId.trim() } : {}),
    ...(input.providerProtocol?.trim() ? { providerProtocol: input.providerProtocol } : {}),
    providerThreadId: input.threadId,
    open: input.open,
    archived: false,
    updatedAt: input.nowMs,
  }
}

export function buildAgentChatConversationRegistryIndex(input: {
  records: AgentConversationRegistryRecord[]
  userId: string
  providerIdentity: Parameters<typeof agentConversationRecordMatchesProviderIdentity>[1]
}): {
  closedThreadIds: Set<string>
  openThreadIds: Set<string>
  threadOrderIndex: Map<string, number>
} {
  const matchingRecords = input.records.filter((record) => (
    record.userId === input.userId
    && agentConversationRecordMatchesProviderIdentity(record, input.providerIdentity)
  ))
  const closedThreadIds = new Set(matchingRecords
    .filter((record) => record.open === false)
    .map((record) => record.providerThreadId))
  const openRecords = matchingRecords
    .filter((record) => record.open !== false)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  return {
    closedThreadIds,
    openThreadIds: new Set(openRecords.map((record) => record.providerThreadId)),
    threadOrderIndex: new Map(openRecords.map((record, index) => [record.providerThreadId, index])),
  }
}

export function resolveAgentChatEmptyThreadLabel(input: {
  emptyThreadLabel?: string
  selectedProjectId?: number
  workspaceProjectOptions: Array<{ value: string; label: string }>
}): string | undefined {
  const selectedProjectLabel = input.selectedProjectId !== undefined
    ? input.workspaceProjectOptions.find((option) => option.value === String(input.selectedProjectId))?.label ?? `项目 #${input.selectedProjectId}`
    : undefined
  return selectedProjectLabel?.trim()
    ? `我们在${selectedProjectLabel.trim()}中做些什么？`
    : input.emptyThreadLabel
}

export function mergeAgentChatThreadListPage(current: AgentChatThread[], page: AgentChatThread[]): AgentChatThread[] {
  const existingIds = new Set(current.map((thread) => thread.id))
  return [
    ...current,
    ...page.filter((thread) => !existingIds.has(thread.id)),
  ].sort((left, right) => right.updatedAt - left.updatedAt)
}

export function agentChatThreadFromRegistryRecord(record: AgentConversationRegistryRecord, dataSource: AgentChatDataSource): AgentChatThread {
  const threadId = record.providerThreadId.trim()
  const title = record.title?.trim()
  return {
    provider: dataSource.provider,
    ...(threadId ? { providerThreadId: threadId } : {}),
    ...(record.providerSessionId?.trim() ? { providerSessionTreeId: record.providerSessionId.trim(), sessionId: record.providerSessionId.trim() } : {}),
    id: threadId,
    preview: title || 'Loading thread...',
    name: title || null,
    createdAt: millisecondsToUnixSeconds(record.createdAt),
    updatedAt: millisecondsToUnixSeconds(record.updatedAt),
    status: agentChatThreadStatusFromRegistryStatus(record.status),
    ...(record.providerThreadCwd?.trim() ? { cwd: record.providerThreadCwd.trim() } : {}),
    turns: [],
  }
}

export function provisionalAgentChatThread(threadId: string, dataSource: AgentChatDataSource, title?: string): AgentChatThread {
  const now = Math.floor(Date.now() / 1000)
  const normalizedTitle = title?.trim()
  return {
    provider: dataSource.provider,
    ...(dataSource.providerId ? { providerThreadId: threadId } : {}),
    ...(dataSource.providerInstanceId ? { providerSessionTreeId: dataSource.providerInstanceId } : {}),
    id: threadId,
    preview: normalizedTitle || 'Loading thread...',
    name: normalizedTitle || null,
    createdAt: now,
    updatedAt: now,
    status: 'notLoaded',
    turns: [],
  }
}

export function formatAgentChatTime(value: number | undefined): string {
  if (!value) return ''
  return new Date(value * 1000).toLocaleString()
}

export function agentChatThreadProviderSessionState(thread: AgentChatThread): 'stopped' | 'waiting' | 'active' | 'error' {
  if (thread.status === 'running') return 'active'
  if (thread.status === 'failed') return 'error'
  return 'stopped'
}

export interface AgentChatThreadTabView {
  id: string
  messageCount: number
  sessionState: ReturnType<typeof agentChatThreadProviderSessionState>
  title: string
}

export function buildAgentChatOpenThreadCandidates(input: {
  activeThreadId: string | null
  closedThreadIds: Set<string>
  conversations: AgentConversationRegistryRecord[]
  dataSource: AgentChatDataSource | null | undefined
  openThreadIds: Set<string>
  projectId?: number
  providerIdentity: Parameters<typeof agentConversationRecordMatchesProviderIdentity>[1]
  sourceThreadList: AgentChatThread[]
  threads: AgentChatThread[]
  userId: string
}): AgentChatThread[] {
  const projectByThreadId = agentChatProjectByProviderThreadId(input.conversations)
  const sourceOpenThreads = input.sourceThreadList.filter((thread) => (
    agentChatSourceThreadHasContent(thread)
    && !input.closedThreadIds.has(thread.id)
    && agentChatThreadMatchesProject(thread, input.projectId, projectByThreadId)
  ))
  const registryOpenThreads = input.dataSource
    ? input.conversations
      .filter((record) => (
        record.userId === input.userId
        && Boolean(record.providerThreadId.trim())
        && record.open !== false
        && !record.archived
        && agentConversationRecordMatchesProviderIdentity(record, input.providerIdentity)
        && agentChatRegistryRecordMatchesProject(record, input.projectId)
      ))
      .map((record) => agentChatThreadFromRegistryRecord(record, input.dataSource as AgentChatDataSource))
    : []
  const next = new Map<string, AgentChatThread>()
  for (const thread of registryOpenThreads) next.set(thread.id, thread)
  for (const thread of sourceOpenThreads) {
    if (thread.id === input.activeThreadId || input.openThreadIds.has(thread.id)) next.set(thread.id, thread)
  }
  for (const thread of input.threads) {
    if (input.closedThreadIds.has(thread.id)) continue
    if (!agentChatThreadMatchesProject(thread, input.projectId, projectByThreadId)) continue
    if (thread.id === input.activeThreadId || input.openThreadIds.has(thread.id)) next.set(thread.id, thread)
  }
  return Array.from(next.values())
}

export function resolveAgentChatNextThreadAfterClose(input: {
  closingThreadId: string
  openThreadCandidates: AgentChatThread[]
}): AgentChatThread | undefined {
  const closingIndex = input.openThreadCandidates.findIndex((item) => item.id === input.closingThreadId)
  const remainingThreads = input.openThreadCandidates.filter((item) => item.id !== input.closingThreadId)
  return remainingThreads[Math.max(0, closingIndex - 1)] ?? remainingThreads[0]
}

export function buildAgentChatThreadTabs(input: {
  threadOrderIndex: Map<string, number>
  threads: AgentChatThread[]
}): AgentChatThreadTabView[] {
  return input.threads
    .map((thread, index) => ({ thread, index }))
    .sort((a, b) => {
      const aOrder = input.threadOrderIndex.get(a.thread.id) ?? Number.MAX_SAFE_INTEGER
      const bOrder = input.threadOrderIndex.get(b.thread.id) ?? Number.MAX_SAFE_INTEGER
      return aOrder - bOrder || a.index - b.index
    })
    .map(({ thread }) => ({
      id: thread.id,
      title: thread.name || thread.preview || 'Untitled thread',
      messageCount: thread.turns.reduce((count, turn) => count + turn.items.filter((item) => item.type === 'userMessage' || item.type === 'agentMessage').length, 0),
      sessionState: agentChatThreadProviderSessionState(thread),
    }))
}

export function selectAgentChatClosedHistoryThreads(input: {
  closedThreadIds: Set<string>
  conversations?: AgentConversationRegistryRecord[]
  projectId?: number
  sourceThreadList: AgentChatThread[]
}): AgentChatThread[] {
  const projectByThreadId = agentChatProjectByProviderThreadId(input.conversations ?? [])
  return input.sourceThreadList.filter((thread) => (
    agentChatSourceThreadHasContent(thread)
    && input.closedThreadIds.has(thread.id)
    && agentChatThreadMatchesProject(thread, input.projectId, projectByThreadId)
  ))
}

function agentChatProjectByProviderThreadId(records: AgentConversationRegistryRecord[]): Map<string, number> {
  const next = new Map<string, number>()
  for (const record of records) {
    const threadId = record.providerThreadId?.trim()
    if (!threadId || typeof record.projectId !== 'number') continue
    next.set(threadId, record.projectId)
  }
  return next
}

function agentChatRegistryRecordMatchesProject(record: AgentConversationRegistryRecord, projectId: number | undefined): boolean {
  return projectId === undefined || record.projectId === projectId
}

function agentChatThreadMatchesProject(thread: Pick<AgentChatThread, 'id' | 'cwd'>, projectId: number | undefined, projectByThreadId: Map<string, number>): boolean {
  if (projectId === undefined) return true
  const registryProjectId = projectByThreadId.get(thread.id)
  if (registryProjectId !== undefined) return registryProjectId === projectId
  return agentChatProjectIdFromThreadCwd(thread.cwd) === projectId
}

function agentChatProjectIdFromThreadCwd(cwd: string | null | undefined): number | undefined {
  const normalized = cwd?.replace(/\\/g, '/')
  if (!normalized) return undefined
  const match = /(?:^|\/)\.movscript\/(?:local|user\/[^/]+|org\/[^/]+)\/projects\/project_(\d+)(?:\/|$)/.exec(normalized)
    ?? /(?:^|\/)(?:local|user\/[^/]+|org\/[^/]+)\/projects\/project_(\d+)(?:\/|$)/.exec(normalized)
  const projectId = Number(match?.[1])
  return Number.isInteger(projectId) && projectId > 0 ? projectId : undefined
}

function agentChatThreadStatusFromRegistryStatus(status: string | undefined): AgentChatThread['status'] {
  if (status === 'idle' || status === 'running' || status === 'requires_action' || status === 'failed' || status === 'completed' || status === 'cancelled' || status === 'unknown') {
    return status
  }
  return 'notLoaded'
}

function millisecondsToUnixSeconds(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value / 1000) : Math.floor(Date.now() / 1000)
}
