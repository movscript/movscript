import type { QueryClient } from '@tanstack/react-query'
import { isAgentTranscriptExcludedAssistantMessage } from '@movscript/core/agent/protocol'
import { isProviderSessionThreadListQueryKey } from '@/features/agent/application/providerSessionQueryKeys'
import { providerSessionClient, type AgentRunRole, type AgentRunStatus, type ProviderSessionSummary, type AgentSessionSummary, type AgentThread, type AgentThreadListPage, type AgentThreadSummary } from '@/shared/infrastructure/providerSessionClient'

type StartProvisionalConversationInput = Parameters<typeof providerSessionClient.startProvisionalConversation>[0] & {
  workspaceDir?: string
}

export interface ProviderSessionRunListItem {
  id: string
  sessionId?: string
  workspaceDir?: string
  threadId: string
  status: AgentRunStatus
  role?: AgentRunRole
  parentRunId?: string
  taskGraphId?: string
  taskId?: string
  progress?: number
  blockedReason?: string
  pendingApprovals?: Array<{ status?: string }>
  pendingInputRequests?: Array<{ status?: string }>
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  cancelledAt?: string
  error?: string
  warnings?: string[]
  steps: unknown[]
}

export type ProviderSessionThreadMutationEvent =
  | {
    type: 'ProviderThreadUpdated'
    baseURL: string
    thread: AgentThreadSummary
    changedIds: readonly string[]
    changedPaths: readonly string[]
    snapshotVersion?: number
  }

export interface ProviderSessionThreadMutationResult {
  event: ProviderSessionThreadMutationEvent
  changedIds: readonly string[]
  changedPaths: readonly string[]
  snapshotVersion?: number
}

const pendingProvisionalConversations = new Map<string, Promise<AgentThread>>()

export function providerSessionThreadSummaryFromThread(thread: AgentThread): AgentThreadSummary {
  const transcriptMessages = thread.messages?.filter(isProviderSessionThreadSummaryTranscriptMessage) ?? []
  const lastMessage = transcriptMessages.at(-1)
  return {
    ...thread,
    archived: thread.archived === true,
    messageCount: transcriptMessages.length,
    ...(lastMessage ? { lastMessageAt: lastMessage.createdAt } : {}),
  }
}

export function providerSessionThreadSummaryFromProviderSession(summary: ProviderSessionSummary): AgentThreadSummary | undefined {
  const threadId = summary.state?.interactiveThreadId
    ?? summary.state?.rootThreadId
    ?? summary.state?.activeThreadId
  if (!threadId?.trim()) return undefined
  const title = providerSessionThreadTitleFromSummary(summary)
  return {
    id: threadId.trim(),
    sessionId: summary.session.id,
    ...(title ? { title } : {}),
    ...(typeof summary.state?.projectId === 'number' ? { projectId: summary.state.projectId } : typeof summary.session.projectId === 'number' ? { projectId: summary.session.projectId } : {}),
    archived: summary.state?.archived === true || summary.session.archived === true,
    ...(summary.state?.status === 'idle' || summary.state?.status === 'running' || summary.state?.status === 'requires_action' || summary.state?.status === 'completed' || summary.state?.status === 'failed' || summary.state?.status === 'cancelled' ? { status: summary.state.status } : {}),
    createdAt: summary.session.createdAt,
    updatedAt: summary.state?.threadUpdatedAt ?? summary.session.updatedAt,
    messageCount: summary.state?.messageCount ?? 0,
    ...(summary.state?.lastMessageAt ? { lastMessageAt: summary.state.lastMessageAt } : {}),
  }
}

export function providerSessionSummaryFromProviderSession(summary: ProviderSessionSummary): AgentSessionSummary {
  return {
    id: summary.session.id,
    ...(summary.session.title?.trim() ? { title: summary.session.title.trim() } : {}),
    ...(typeof summary.session.projectId === 'number' ? { projectId: summary.session.projectId } : typeof summary.state?.projectId === 'number' ? { projectId: summary.state.projectId } : {}),
    ...(summary.state?.rootThreadId?.trim() ? { rootThreadId: summary.state.rootThreadId.trim() } : {}),
    ...(summary.state?.interactiveThreadId?.trim() ? { interactiveThreadId: summary.state.interactiveThreadId.trim() } : {}),
    ...(summary.state?.activeThreadId?.trim() ? { activeThreadId: summary.state.activeThreadId.trim() } : {}),
    status: providerSessionStatus(summary.state?.status),
    createdAt: summary.session.createdAt,
    updatedAt: summary.session.updatedAt,
    threadCount: summary.state?.rootThreadId ? 1 : 0,
  }
}

export async function listProviderSessionThreadSummariesFromWorkspace(input: { includeProvisional?: boolean; providerProfileKey?: string; signal?: AbortSignal } = {}): Promise<AgentThreadSummary[]> {
  const providerSessions = await providerSessionClient.listProviderSessionsFromWorkspace({
    ...(input.providerProfileKey?.trim() ? { providerProfileKey: input.providerProfileKey.trim() } : {}),
  })
  const sessionThreads = providerSessions.sessions.flatMap((summary) => providerSessionThreadSummaryFromProviderSession(summary) ?? [])
  return mergeWorkspaceThreadSummariesWithLiveThreads(sessionThreads, input)
}

export async function listProviderSessionThreadPageFromWorkspace(input: {
  includeProvisional?: boolean
  providerProfileKey?: string
  limit?: number
  cursor?: string
  signal?: AbortSignal
} = {}): Promise<AgentThreadListPage> {
  const providerSessions = await providerSessionClient.listProviderSessionsFromWorkspace({
    ...(input.providerProfileKey?.trim() ? { providerProfileKey: input.providerProfileKey.trim() } : {}),
  })
  const sessionThreads = await mergeWorkspaceThreadSummariesWithLiveThreads(
    providerSessions.sessions.flatMap((summary) => providerSessionThreadSummaryFromProviderSession(summary) ?? []),
    input,
  )
  const limit = typeof input.limit === 'number' && input.limit > 0 ? input.limit : sessionThreads.length
  const offset = workspaceCursorOffset(input.cursor)
  const threads = sessionThreads.slice(offset, offset + limit)
  const nextOffset = offset + threads.length
  return {
    threads,
    total: sessionThreads.length,
    limit,
    hasMore: nextOffset < sessionThreads.length,
    ...(nextOffset < sessionThreads.length ? { nextCursor: `workspace:${nextOffset}` } : {}),
  }
}

async function mergeWorkspaceThreadSummariesWithLiveThreads(threads: AgentThreadSummary[], input: { includeProvisional?: boolean; signal?: AbortSignal } = {}): Promise<AgentThreadSummary[]> {
  if (threads.length === 0) return threads
  try {
    const livePage = await providerSessionClient.listThreads({
      limit: Math.max(threads.length, 100),
      includeProvisional: input.includeProvisional,
    }, input.signal)
    const liveThreadsById = new Map(livePage.threads.map((thread) => [thread.id, thread]))
    return threads.map((thread) => {
      const liveThread = liveThreadsById.get(thread.id)
      return liveThread ? { ...thread, ...liveThread, sessionId: liveThread.sessionId ?? thread.sessionId } : thread
    })
  } catch {
    return threads
  }
}

function providerSessionThreadTitleFromSummary(summary: ProviderSessionSummary): string | undefined {
  const state = summary.state as (ProviderSessionSummary['state'] & Record<string, unknown>) | undefined
  const explicitTitle = firstTrimmedString(
    state?.threadTitle,
    state?.threadName,
    state?.name,
    state?.title,
  )
  const sessionTitle = summary.session.title?.trim()
  if (!explicitTitle) return undefined
  return explicitTitle === sessionTitle ? undefined : explicitTitle
}

function firstTrimmedString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

export async function listProviderSessionSummariesFromWorkspace(input: { providerProfileKey?: string } = {}): Promise<AgentSessionSummary[]> {
  const providerSessions = await providerSessionClient.listProviderSessionsFromWorkspace({
    ...(input.providerProfileKey?.trim() ? { providerProfileKey: input.providerProfileKey.trim() } : {}),
  })
  return providerSessions.sessions.map(providerSessionSummaryFromProviderSession)
}

export function providerSessionRunSummariesFromProviderSession(summary: ProviderSessionSummary): ProviderSessionRunListItem[] {
  return (summary.runs ?? []).flatMap((run) => {
    const status = providerSessionRunStatus(run.status)
    if (!status) return []
    if (!run.id.trim() || !run.threadId.trim() || !run.createdAt.trim() || !run.updatedAt.trim()) return []
    return [{
      id: run.id.trim(),
      sessionId: run.sessionId?.trim() || summary.session.id,
      ...(summary.workspaceDir?.trim() ? { workspaceDir: summary.workspaceDir.trim() } : {}),
      threadId: run.threadId.trim(),
      status,
      ...(providerSessionRunRole(run.role) ? { role: providerSessionRunRole(run.role) } : {}),
      ...(run.parentRunId?.trim() ? { parentRunId: run.parentRunId.trim() } : {}),
      ...(run.taskGraphId?.trim() ? { taskGraphId: run.taskGraphId.trim() } : {}),
      ...(run.taskId?.trim() ? { taskId: run.taskId.trim() } : {}),
      ...(typeof run.progress === 'number' ? { progress: run.progress } : {}),
      ...(run.blockedReason?.trim() ? { blockedReason: run.blockedReason.trim() } : {}),
      ...(Array.isArray(run.pendingApprovals) ? { pendingApprovals: run.pendingApprovals.flatMap(pendingStatusRecord) } : {}),
      ...(Array.isArray(run.pendingInputRequests) ? { pendingInputRequests: run.pendingInputRequests.flatMap(pendingStatusRecord) } : {}),
      ...(run.metadata ? { metadata: run.metadata } : {}),
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      ...(run.startedAt ? { startedAt: run.startedAt } : {}),
      ...(run.completedAt ? { completedAt: run.completedAt } : {}),
      ...(run.failedAt ? { failedAt: run.failedAt } : {}),
      ...(run.cancelledAt ? { cancelledAt: run.cancelledAt } : {}),
      ...(run.error ? { error: run.error } : {}),
      ...(run.warnings?.length ? { warnings: run.warnings } : {}),
      steps: Array.isArray(run.steps) ? run.steps : [],
    }]
  })
}

export async function listProviderSessionRunSummariesFromProviderSessions(): Promise<ProviderSessionRunListItem[]> {
  const providerSessions = await providerSessionClient.listProviderSessionsFromWorkspace()
  return providerSessions.sessions
    .flatMap(providerSessionRunSummariesFromProviderSession)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

function isProviderSessionThreadSummaryTranscriptMessage(message: AgentThread['messages'][number]): boolean {
  return !isAgentTranscriptExcludedAssistantMessage(message)
}

export function providerThreadUpdatedResult(input: {
  thread: AgentThreadSummary
  baseURL?: string
  changedPaths?: readonly string[]
  snapshotVersion?: number
}): ProviderSessionThreadMutationResult {
  const event: ProviderSessionThreadMutationEvent = {
    type: 'ProviderThreadUpdated',
    baseURL: input.baseURL ?? providerSessionClient.baseURL,
    thread: input.thread,
    changedIds: [input.thread.id],
    changedPaths: input.changedPaths ?? [],
    ...(input.snapshotVersion !== undefined ? { snapshotVersion: input.snapshotVersion } : {}),
  }
  return {
    event,
    changedIds: event.changedIds,
    changedPaths: event.changedPaths,
    ...(event.snapshotVersion !== undefined ? { snapshotVersion: event.snapshotVersion } : {}),
  }
}

export function applyProviderSessionThreadMutationResult(
  queryClient: QueryClient,
  result: ProviderSessionThreadMutationResult,
): void {
  applyProviderSessionThreadMutationEvent(queryClient, result.event)
}

export function applyProviderSessionThreadMutationEvent(
  queryClient: QueryClient,
  event: ProviderSessionThreadMutationEvent,
): void {
  switch (event.type) {
    case 'ProviderThreadUpdated':
      applyProviderThreadUpdated(queryClient, event)
      return
  }
}

function applyProviderThreadUpdated(
  queryClient: QueryClient,
  event: Extract<ProviderSessionThreadMutationEvent, { type: 'ProviderThreadUpdated' }>,
) {
  queryClient.setQueriesData<AgentThreadSummary[]>({
    predicate: (query) => isProviderSessionThreadListQueryKey(query.queryKey, event.baseURL),
  }, (threads) => {
    if (!threads) return [event.thread]
    const existing = threads.some((item) => item.id === event.thread.id)
    if (!existing) return [event.thread, ...threads]
    return threads.map((item) => item.id === event.thread.id ? { ...item, ...event.thread } : item)
  })
}


export async function startSharedProvisionalConversation(input: StartProvisionalConversationInput = {}): Promise<AgentThread> {
  const key = provisionalConversationKey(input)
  const pending = pendingProvisionalConversations.get(key)
  if (pending) return pending

  const promise = (async () => {
    const sessionId = input.sessionId?.trim() || makeProviderSessionId()
    const client = providerSessionClient.forSession({
      sessionId,
      ...(input.workspaceDir?.trim() ? { workspaceDir: input.workspaceDir.trim() } : {}),
    })
    await client.ensureRunning()
    return client.startProvisionalConversation(provisionalConversationThreadInput(input, sessionId))
  })().finally(() => {
    pendingProvisionalConversations.delete(key)
  })
  pendingProvisionalConversations.set(key, promise)
  return promise
}

function provisionalConversationKey(input: StartProvisionalConversationInput = {}) {
  return JSON.stringify({
    sessionId: input.sessionId?.trim() ?? '',
    workspaceDir: input.workspaceDir?.trim() ?? '',
    title: input.title?.trim() ?? '',
    projectId: typeof input.projectId === 'number' ? input.projectId : null,
    expiresAt: input.expiresAt ?? null,
  })
}

function makeProviderSessionId(): string {
  return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function workspaceCursorOffset(cursor: string | undefined): number {
  if (!cursor?.startsWith('workspace:')) return 0
  const offset = Number(cursor.slice('workspace:'.length))
  return Number.isInteger(offset) && offset > 0 ? offset : 0
}

function providerSessionStatus(value: string | undefined): AgentSessionSummary['status'] {
  return value === 'idle' || value === 'running' || value === 'requires_action' || value === 'completed' || value === 'failed' || value === 'cancelled'
    ? value
    : 'idle'
}

function providerSessionRunStatus(value: string | undefined): AgentRunStatus | undefined {
  return value === 'queued'
    || value === 'in_progress'
    || value === 'requires_action'
    || value === 'completed'
    || value === 'completed_with_warnings'
    || value === 'failed'
    || value === 'cancelled'
    ? value
    : undefined
}

function providerSessionRunRole(value: string | undefined): AgentRunRole | undefined {
  return value === 'planner' || value === 'worker' ? value : undefined
}

function pendingStatusRecord(value: unknown): Array<{ status?: string }> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
  const status = (value as { status?: unknown }).status
  return [{ ...(typeof status === 'string' ? { status } : {}) }]
}

function provisionalConversationThreadInput(input: StartProvisionalConversationInput, sessionId: string): Parameters<typeof providerSessionClient.startProvisionalConversation>[0] {
  return {
    sessionId,
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(typeof input.projectId === 'number' ? { projectId: input.projectId } : {}),
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
  }
}
