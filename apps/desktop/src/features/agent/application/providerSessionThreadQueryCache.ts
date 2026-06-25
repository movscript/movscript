import type { QueryClient } from '@tanstack/react-query'
import { isAgentTranscriptExcludedAssistantMessage } from '@movscript/agent-protocol'
import { isProviderSessionThreadListQueryKey } from '@/features/agent/application/providerSessionQueryKeys'
import { agentProviderSessionCompatibilityClient } from '@/features/agent/infrastructure/agentProviderSessionCompatibility'
import type {
  AgentRunRole,
  AgentRunStatus,
  AgentSessionSummary,
  AgentThread,
  AgentThreadListPage,
  AgentThreadSummary,
} from '@movscript/agent-protocol'
import type { ProviderSessionSummary } from '@/shared/contracts/electronApiProviderSessions'

export interface ProviderSessionRunListItem {
  id: string
  providerSessionTreeId?: string
  /** @deprecated Prefer providerSessionTreeId for related-thread provider-session trees. */
  sessionId?: string // deprecated providerSessionTreeId compatibility mirror
  movScriptHomeDir?: string
  /** @deprecated Use movScriptHomeDir for the desktop control/home directory. */
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
    providerSessionTreeId: summary.session.id,
    sessionId: summary.session.id, // deprecated providerSessionTreeId compatibility mirror
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
  const compatibilityClient = agentProviderSessionCompatibilityClient('legacy-thread-cache')
  const providerSessions = await compatibilityClient.listProviderSessionsFromWorkspace({
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
  const compatibilityClient = agentProviderSessionCompatibilityClient('legacy-thread-cache')
  const providerSessions = await compatibilityClient.listProviderSessionsFromWorkspace({
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
    const compatibilityClient = agentProviderSessionCompatibilityClient('legacy-thread-cache')
    const livePage = await compatibilityClient.listThreads({
      limit: Math.max(threads.length, 100),
      includeProvisional: input.includeProvisional,
    }, input.signal)
    const liveThreadsById = new Map(livePage.threads.map((thread) => [thread.id, thread]))
    return threads.map((thread) => {
      const liveThread = liveThreadsById.get(thread.id)
      if (!liveThread) return thread
      const providerSessionTreeId = liveThread.providerSessionTreeId ?? liveThread.sessionId ?? thread.providerSessionTreeId ?? thread.sessionId
      return {
        ...thread,
        ...liveThread,
        ...(providerSessionTreeId ? { providerSessionTreeId, sessionId: providerSessionTreeId } : {}),
      }
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
  const compatibilityClient = agentProviderSessionCompatibilityClient('legacy-thread-cache')
  const providerSessions = await compatibilityClient.listProviderSessionsFromWorkspace({
    ...(input.providerProfileKey?.trim() ? { providerProfileKey: input.providerProfileKey.trim() } : {}),
  })
  return providerSessions.sessions.map(providerSessionSummaryFromProviderSession)
}

export function providerSessionRunSummariesFromProviderSession(summary: ProviderSessionSummary): ProviderSessionRunListItem[] {
  const movScriptHomeDir = providerSessionHomeDir(summary)
  return (summary.runs ?? []).flatMap((run) => {
    const status = providerSessionRunStatus(run.status)
    if (!status) return []
    if (!run.id.trim() || !run.threadId.trim() || !run.createdAt.trim() || !run.updatedAt.trim()) return []
    return [{
      id: run.id.trim(),
      providerSessionTreeId: run.providerSessionTreeId?.trim() || run.sessionId?.trim() || summary.session.id,
      sessionId: run.providerSessionTreeId?.trim() || run.sessionId?.trim() || summary.session.id,
      ...(movScriptHomeDir ? { movScriptHomeDir, workspaceDir: movScriptHomeDir } : {}),
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

export async function listProviderSessionRunSummariesFromProviderSessions(input: { providerProfileKey?: string } = {}): Promise<ProviderSessionRunListItem[]> {
  const compatibilityClient = agentProviderSessionCompatibilityClient('legacy-thread-cache')
  const providerSessions = await compatibilityClient.listProviderSessionsFromWorkspace({
    ...(input.providerProfileKey?.trim() ? { providerProfileKey: input.providerProfileKey.trim() } : {}),
  })
  return providerSessions.sessions
    .flatMap(providerSessionRunSummariesFromProviderSession)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

function isProviderSessionThreadSummaryTranscriptMessage(message: AgentThread['messages'][number]): boolean {
  return !isAgentTranscriptExcludedAssistantMessage(message)
}

export function providerThreadUpdatedResult(input: {
  thread: AgentThreadSummary
  changedPaths?: readonly string[]
  snapshotVersion?: number
}): ProviderSessionThreadMutationResult {
  const event: ProviderSessionThreadMutationEvent = {
    type: 'ProviderThreadUpdated',
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
    predicate: (query) => isProviderSessionThreadListQueryKey(query.queryKey),
  }, (threads) => {
    if (!threads) return [event.thread]
    const existing = threads.some((item) => item.id === event.thread.id)
    if (!existing) return [event.thread, ...threads]
    return threads.map((item) => item.id === event.thread.id ? { ...item, ...event.thread } : item)
  })
}

function providerSessionHomeDir(summary: ProviderSessionSummary): string | undefined {
  return summary.movScriptHomeDir?.trim() || summary.workspaceDir?.trim() || undefined
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
