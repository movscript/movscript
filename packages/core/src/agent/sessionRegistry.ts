import type { AgentChatThread } from './chat/index.js'

export type AgentSessionWorkspaceScope = 'global' | 'project' | 'production' | (string & {})

export interface AgentSessionWorkspaceContext {
  scope?: AgentSessionWorkspaceScope
  projectId?: string | number
  productionId?: string | number
}

export interface AgentConversationRegistryRecord {
  id: string
  userId: string
  provider?: string
  providerId?: string
  providerInstanceId?: string
  providerProtocol?: string
  providerSessionId?: string
  providerThreadId: string
  providerThreadCwd?: string
  workspaceContext?: AgentSessionWorkspaceContext
  projectId?: number
  title?: string
  status?: string
  activeRunId?: string
  lastRunId?: string
  open: boolean
  archived: boolean
  createdAt: number
  updatedAt: number
}

export type AgentConversationRegistryInput =
  Omit<Partial<AgentConversationRegistryRecord>, 'id' | 'userId' | 'providerThreadId' | 'createdAt' | 'updatedAt'> & {
    id?: string
    userId: string
    providerThreadId: string
    createdAt?: number
    updatedAt?: number
  }

export interface AgentConversationRegistryState {
  activeConversationIdsByUser: Record<string, string | null>
  conversationsById: Record<string, AgentConversationRegistryRecord>
}

export interface AgentConversationRegistrySelectorInput {
  userId?: string
  projectId?: number
  surface?: 'agent' | 'project'
  provider?: string
  providerId?: string
  providerInstanceId?: string
  providerProtocol?: string
  includeArchived?: boolean
  includeClosed?: boolean
}

export function agentConversationIdForRegistryInput(
  input: Pick<AgentConversationRegistryInput, 'id' | 'providerThreadId' | 'provider' | 'providerId' | 'providerInstanceId' | 'providerProtocol'>,
): string {
  const explicitId = input.id?.trim()
  const providerThreadId = input.providerThreadId.trim()
  if (explicitId && explicitId !== providerThreadId) return explicitId
  const providerScopeKey = agentConversationProviderScopeKey(input)
  if (providerScopeKey && providerThreadId) return `${providerScopeKey}:thread:${encodeURIComponent(providerThreadId)}`
  return explicitId || providerThreadId
}

export function upsertAgentConversationRegistryRecord(
  records: Record<string, AgentConversationRegistryRecord>,
  input: AgentConversationRegistryInput,
): Record<string, AgentConversationRegistryRecord> {
  const id = agentConversationIdForRegistryInput(input)
  const providerThreadId = input.providerThreadId.trim()
  const userId = input.userId.trim()
  if (!id || !providerThreadId || !userId) return records
  const legacyId = input.id?.trim() || providerThreadId
  const legacyRecord = legacyId !== id ? records[legacyId] : undefined
  const existing = records[id] ?? (
    legacyRecord
    && legacyRecord.providerThreadId === providerThreadId
    && agentConversationRegistryRecordMatchesProvider(legacyRecord, input)
      ? legacyRecord
      : undefined
  )
  const now = Date.now()
  const createdAt = normalizedTimestamp(input.createdAt, existing?.createdAt ?? now)
  const updatedAt = normalizedTimestamp(input.updatedAt, now)
  const next = { ...records }
  if (legacyId !== id && existing === legacyRecord) delete next[legacyId]
  return {
    ...next,
    [id]: normalizeAgentConversationRegistryRecord({
      ...(existing ?? {
        id,
        userId,
        providerThreadId,
        open: true,
        archived: false,
        createdAt,
        updatedAt,
      }),
      ...input,
      id,
      userId,
      providerThreadId,
      createdAt,
      updatedAt,
    }),
  }
}

function agentConversationProviderScopeKey(
  input: Pick<AgentConversationRegistryInput, 'provider' | 'providerId' | 'providerInstanceId' | 'providerProtocol'>,
): string {
  const provider = input.provider?.trim()
  const providerId = input.providerId?.trim()
  const providerInstanceId = input.providerInstanceId?.trim()
  const providerProtocol = input.providerProtocol?.trim()
  if (!provider && !providerId && !providerInstanceId && !providerProtocol) return ''
  return [
    'provider',
    providerProtocol || 'unknown-protocol',
    provider || 'unknown-provider',
    providerId || provider || 'unknown-id',
    providerInstanceId || providerId || provider || 'default',
  ].map(encodeURIComponent).join(':')
}

export function removeAgentConversationRegistryRecord(
  records: Record<string, AgentConversationRegistryRecord>,
  conversationId: string,
): Record<string, AgentConversationRegistryRecord> {
  if (!records[conversationId]) return records
  const next = { ...records }
  delete next[conversationId]
  return next
}

export function setAgentConversationRegistryOpen(
  records: Record<string, AgentConversationRegistryRecord>,
  conversationId: string,
  open: boolean,
): Record<string, AgentConversationRegistryRecord> {
  const current = records[conversationId]
  if (!current) return records
  return {
    ...records,
    [conversationId]: {
      ...current,
      open,
      archived: open ? false : current.archived,
      updatedAt: Date.now(),
    },
  }
}

export function setAgentRegistryActiveConversation(
  state: AgentConversationRegistryState,
  userId: string,
  conversationId: string | null,
): AgentConversationRegistryState {
  return {
    ...state,
    activeConversationIdsByUser: {
      ...state.activeConversationIdsByUser,
      [userId]: conversationId,
    },
  }
}

export function activeAgentConversationIdForUser(
  state: Pick<AgentConversationRegistryState, 'activeConversationIdsByUser'>,
  userId: string,
): string | null {
  return state.activeConversationIdsByUser[userId] ?? null
}

export function selectAgentConversationRegistryRecords(
  records: Record<string, AgentConversationRegistryRecord>,
  input: AgentConversationRegistrySelectorInput = {},
): AgentConversationRegistryRecord[] {
  return Object.values(records)
    .filter((record) => {
      if (input.userId && record.userId !== input.userId) return false
      if (!agentConversationRegistryRecordMatchesProvider(record, input)) return false
      if (!input.includeArchived && record.archived) return false
      if (!input.includeClosed && !record.open) return false
      if (input.surface === 'project' && input.projectId !== undefined && record.projectId !== input.projectId) return false
      return true
    })
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
}

export function selectActiveAgentConversationRegistryRecord(
  state: AgentConversationRegistryState,
  input: AgentConversationRegistrySelectorInput = {},
): AgentConversationRegistryRecord | null {
  const activeId = input.userId ? activeAgentConversationIdForUser(state, input.userId) : null
  const activeRecord = activeId ? state.conversationsById[activeId] : undefined
  if (
    activeRecord
    && agentConversationRegistryRecordMatchesSelector(activeRecord, input)
  ) {
    return activeRecord
  }
  if (activeId) return null
  return selectAgentConversationRegistryRecords(state.conversationsById, input)[0] ?? null
}

export function agentConversationRegistryRecordFromChatThread(input: {
  userId: string
  thread: Pick<AgentChatThread, 'id' | 'name' | 'preview' | 'status' | 'createdAt' | 'updatedAt' | 'cwd'>
  provider?: string
  providerId?: string
  providerInstanceId?: string
  providerProtocol?: string
  providerSessionId?: string
  workspaceContext?: AgentSessionWorkspaceContext
  projectId?: number
}): AgentConversationRegistryInput {
  const title = input.thread.name?.trim() || input.thread.preview?.trim()
  return {
    id: input.thread.id,
    userId: input.userId,
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.providerInstanceId ? { providerInstanceId: input.providerInstanceId } : {}),
    ...(input.providerProtocol ? { providerProtocol: input.providerProtocol } : {}),
    ...(input.providerSessionId ? { providerSessionId: input.providerSessionId } : {}),
    providerThreadId: input.thread.id,
    ...(input.thread.cwd?.trim() ? { providerThreadCwd: input.thread.cwd.trim() } : {}),
    ...(input.workspaceContext ? { workspaceContext: input.workspaceContext } : {}),
    ...(typeof input.projectId === 'number' ? { projectId: input.projectId } : {}),
    ...(title ? { title } : {}),
    ...(input.thread.status ? { status: input.thread.status } : {}),
    createdAt: unixSecondsToMilliseconds(input.thread.createdAt),
    updatedAt: unixSecondsToMilliseconds(input.thread.updatedAt),
    open: true,
    archived: false,
  }
}

export function normalizeAgentConversationRegistryRecord(
  record: AgentConversationRegistryRecord,
): AgentConversationRegistryRecord {
  const projectId = normalizeProjectId(record.projectId ?? record.workspaceContext?.projectId)
  return {
    ...record,
    id: record.id.trim(),
    userId: record.userId.trim(),
    providerThreadId: record.providerThreadId.trim(),
    ...(record.providerSessionId?.trim() ? { providerSessionId: record.providerSessionId.trim() } : {}),
    ...(record.providerThreadCwd?.trim() ? { providerThreadCwd: record.providerThreadCwd.trim() } : {}),
    ...(record.title?.trim() ? { title: record.title.trim() } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
    open: record.open !== false,
    archived: record.archived === true,
    createdAt: normalizedTimestamp(record.createdAt, Date.now()),
    updatedAt: normalizedTimestamp(record.updatedAt, Date.now()),
  }
}

function agentConversationRegistryRecordMatchesSelector(
  record: AgentConversationRegistryRecord,
  input: AgentConversationRegistrySelectorInput,
): boolean {
  if (input.userId && record.userId !== input.userId) return false
  if (!agentConversationRegistryRecordMatchesProvider(record, input)) return false
  if (!input.includeArchived && record.archived) return false
  if (!input.includeClosed && !record.open) return false
  if (input.surface === 'project' && input.projectId !== undefined && record.projectId !== input.projectId) return false
  return true
}

function agentConversationRegistryRecordMatchesProvider(
  record: AgentConversationRegistryRecord,
  input: Pick<AgentConversationRegistrySelectorInput, 'provider' | 'providerId' | 'providerInstanceId' | 'providerProtocol'>,
): boolean {
  if (input.provider && record.provider !== input.provider) return false
  if (input.providerId && record.providerId !== input.providerId) return false
  if (input.providerInstanceId && record.providerInstanceId !== input.providerInstanceId) return false
  if (input.providerProtocol && record.providerProtocol !== input.providerProtocol) return false
  return true
}

function normalizedTimestamp(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeProjectId(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function unixSecondsToMilliseconds(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value * 1000 : undefined
}
