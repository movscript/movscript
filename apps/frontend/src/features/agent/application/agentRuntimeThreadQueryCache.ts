import type { QueryClient } from '@tanstack/react-query'
import { isAgentTranscriptExcludedAssistantMessage } from '@movscript/protocol'
import { localAgentClient, type AgentRunRole, type AgentRunStatus, type AgentRuntimeSessionSummary, type AgentSessionSummary, type AgentThread, type AgentThreadListPage, type AgentThreadSummary } from '@/shared/infrastructure/localAgentClient'

type StartProvisionalConversationInput = Parameters<typeof localAgentClient.startProvisionalConversation>[0] & {
  workspaceDir?: string
}

export interface AgentWorkspaceRunListItem {
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

const pendingProvisionalConversations = new Map<string, Promise<AgentThread>>()

export function runtimeThreadSummaryFromThread(thread: AgentThread): AgentThreadSummary {
  const transcriptMessages = thread.messages?.filter(isRuntimeThreadSummaryTranscriptMessage) ?? []
  const lastMessage = transcriptMessages.at(-1)
  return {
    ...thread,
    archived: thread.archived === true,
    messageCount: transcriptMessages.length,
    ...(lastMessage ? { lastMessageAt: lastMessage.createdAt } : {}),
  }
}

export function runtimeThreadSummaryFromRuntimeSession(summary: AgentRuntimeSessionSummary): AgentThreadSummary | undefined {
  const threadId = summary.state?.interactiveThreadId
    ?? summary.state?.rootThreadId
    ?? summary.state?.activeThreadId
  if (!threadId?.trim()) return undefined
  return {
    id: threadId.trim(),
    sessionId: summary.session.id,
    ...(summary.state?.title?.trim() || summary.session.title?.trim() ? { title: summary.state?.title?.trim() || summary.session.title?.trim() } : {}),
    ...(typeof summary.state?.projectId === 'number' ? { projectId: summary.state.projectId } : typeof summary.session.projectId === 'number' ? { projectId: summary.session.projectId } : {}),
    archived: summary.state?.archived === true || summary.session.archived === true,
    ...(summary.state?.status === 'idle' || summary.state?.status === 'running' || summary.state?.status === 'requires_action' || summary.state?.status === 'completed' || summary.state?.status === 'failed' || summary.state?.status === 'cancelled' ? { status: summary.state.status } : {}),
    createdAt: summary.session.createdAt,
    updatedAt: summary.state?.threadUpdatedAt ?? summary.session.updatedAt,
    messageCount: summary.state?.messageCount ?? 0,
    ...(summary.state?.lastMessageAt ? { lastMessageAt: summary.state.lastMessageAt } : {}),
  }
}

export function runtimeSessionSummaryFromRuntimeSession(summary: AgentRuntimeSessionSummary): AgentSessionSummary {
  return {
    id: summary.session.id,
    ...(summary.session.title?.trim() ? { title: summary.session.title.trim() } : {}),
    ...(typeof summary.session.projectId === 'number' ? { projectId: summary.session.projectId } : typeof summary.state?.projectId === 'number' ? { projectId: summary.state.projectId } : {}),
    ...(summary.state?.rootThreadId?.trim() ? { rootThreadId: summary.state.rootThreadId.trim() } : {}),
    ...(summary.state?.interactiveThreadId?.trim() ? { interactiveThreadId: summary.state.interactiveThreadId.trim() } : {}),
    ...(summary.state?.activeThreadId?.trim() ? { activeThreadId: summary.state.activeThreadId.trim() } : {}),
    status: runtimeSessionStatus(summary.state?.status),
    createdAt: summary.session.createdAt,
    updatedAt: summary.session.updatedAt,
    threadCount: summary.state?.rootThreadId ? 1 : 0,
  }
}

export async function listRuntimeThreadSummariesFromWorkspace(_input: { includeProvisional?: boolean; signal?: AbortSignal } = {}): Promise<AgentThreadSummary[]> {
  const runtimeSessions = await localAgentClient.listRuntimeSessionsFromWorkspace()
  return runtimeSessions.sessions.flatMap((summary) => runtimeThreadSummaryFromRuntimeSession(summary) ?? [])
}

export async function listRuntimeThreadPageFromWorkspace(input: {
  includeProvisional?: boolean
  limit?: number
  cursor?: string
  signal?: AbortSignal
} = {}): Promise<AgentThreadListPage> {
  const runtimeSessions = await localAgentClient.listRuntimeSessionsFromWorkspace()
  const sessionThreads = runtimeSessions.sessions.flatMap((summary) => runtimeThreadSummaryFromRuntimeSession(summary) ?? [])
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

export async function listRuntimeSessionSummariesFromWorkspace(): Promise<AgentSessionSummary[]> {
  const runtimeSessions = await localAgentClient.listRuntimeSessionsFromWorkspace()
  return runtimeSessions.sessions.map(runtimeSessionSummaryFromRuntimeSession)
}

export function runtimeRunSummariesFromRuntimeSession(summary: AgentRuntimeSessionSummary): AgentWorkspaceRunListItem[] {
  return (summary.runs ?? []).flatMap((run) => {
    const status = runtimeRunStatus(run.status)
    if (!status) return []
    if (!run.id.trim() || !run.threadId.trim() || !run.createdAt.trim() || !run.updatedAt.trim()) return []
    return [{
      id: run.id.trim(),
      sessionId: run.sessionId?.trim() || summary.session.id,
      ...(summary.workspaceDir?.trim() ? { workspaceDir: summary.workspaceDir.trim() } : {}),
      threadId: run.threadId.trim(),
      status,
      ...(runtimeRunRole(run.role) ? { role: runtimeRunRole(run.role) } : {}),
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

export async function listRuntimeRunSummariesFromWorkspace(): Promise<AgentWorkspaceRunListItem[]> {
  const runtimeSessions = await localAgentClient.listRuntimeSessionsFromWorkspace()
  return runtimeSessions.sessions
    .flatMap(runtimeRunSummariesFromRuntimeSession)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

function isRuntimeThreadSummaryTranscriptMessage(message: AgentThread['messages'][number]): boolean {
  return !isAgentTranscriptExcludedAssistantMessage(message)
}

export function upsertCachedLocalAgentThread(queryClient: QueryClient, thread: AgentThreadSummary) {
  queryClient.setQueriesData<AgentThreadSummary[]>({
    predicate: (query) => Array.isArray(query.queryKey)
      && query.queryKey[0] === 'local-agent-threads'
      && query.queryKey[1] === localAgentClient.baseURL,
  }, (threads) => {
    if (!threads) return [thread]
    const existing = threads.some((item) => item.id === thread.id)
    if (!existing) return [thread, ...threads]
    return threads.map((item) => item.id === thread.id ? { ...item, ...thread } : item)
  })
}

export async function startSharedProvisionalConversation(input: StartProvisionalConversationInput = {}): Promise<AgentThread> {
  const key = provisionalConversationKey(input)
  const pending = pendingProvisionalConversations.get(key)
  if (pending) return pending

  const promise = (async () => {
    const sessionId = input.sessionId?.trim() || makeAgentRuntimeSessionId()
    const client = localAgentClient.forSession({
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

function makeAgentRuntimeSessionId(): string {
  return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function workspaceCursorOffset(cursor: string | undefined): number {
  if (!cursor?.startsWith('workspace:')) return 0
  const offset = Number(cursor.slice('workspace:'.length))
  return Number.isInteger(offset) && offset > 0 ? offset : 0
}

function runtimeSessionStatus(value: string | undefined): AgentSessionSummary['status'] {
  return value === 'idle' || value === 'running' || value === 'requires_action' || value === 'completed' || value === 'failed' || value === 'cancelled'
    ? value
    : 'idle'
}

function runtimeRunStatus(value: string | undefined): AgentRunStatus | undefined {
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

function runtimeRunRole(value: string | undefined): AgentRunRole | undefined {
  return value === 'planner' || value === 'worker' ? value : undefined
}

function pendingStatusRecord(value: unknown): Array<{ status?: string }> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
  const status = (value as { status?: unknown }).status
  return [{ ...(typeof status === 'string' ? { status } : {}) }]
}

function provisionalConversationThreadInput(input: StartProvisionalConversationInput, sessionId: string): Parameters<typeof localAgentClient.startProvisionalConversation>[0] {
  return {
    sessionId,
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(typeof input.projectId === 'number' ? { projectId: input.projectId } : {}),
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
  }
}
