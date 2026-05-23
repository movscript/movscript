import type { RuntimeWork } from '../runtimeWork/runtimeWork.js'
import type {
  AgentSession,
  AgentSessionSummary,
  AgentTaskGraph,
  AgentRun,
  AgentTask,
  AgentThread,
  AgentThreadSummary,
  AgentTraceEvent,
  RuntimeContinuation,
  RuntimeInteraction,
} from './types.js'
import type { AgentRunTraceSummary, AgentTraceQuery } from '@movscript/protocol'
import {
  applyTraceEventToDebugLedger,
  buildRunDebugLedgerFromTrace,
  compactRunDebugLedger,
  createRunDebugLedger,
  type AgentRunDebugLedger,
} from './runDebugLedger.js'
import { isJSONValue } from '../jsonValue.js'
import { isValidAgentProjectId } from '../context/runtimeContext.js'

export interface AgentStore {
  createSession(session: AgentSession): void
  updateSession(session: AgentSession): void
  listSessions(): AgentSession[]
  listSessionSummaries(): AgentSessionSummary[]
  getSession(id: string): AgentSession | undefined
  createThread(thread: AgentThread): void
  updateThread(thread: AgentThread): void
  deleteThread(threadId: string): AgentThreadDeletionResult
  deleteAllThreads(): AgentThreadClearResult
  listThreads(): AgentThread[]
  listThreadSummaries(): AgentThreadSummary[]
  getThread(id: string): AgentThread | undefined
  createRun(run: AgentRun): void
  updateRun(run: AgentRun): void
  listRuns(query?: AgentRunQuery): AgentRun[]
  getRun(id: string): AgentRun | undefined
  listChildRuns(parentRunId: string): AgentRun[]
  createTaskGraph(taskGraph: AgentTaskGraph): void
  updateTaskGraph(taskGraph: AgentTaskGraph): void
  listTaskGraphs(): AgentTaskGraph[]
  getTaskGraph(id: string): AgentTaskGraph | undefined
  createTask(task: AgentTask): void
  updateTask(task: AgentTask): void
  listTasks(taskGraphId?: string): AgentTask[]
  getTask(id: string): AgentTask | undefined
  createRuntimeWork(work: RuntimeWork): void
  updateRuntimeWork(work: RuntimeWork): void
  listRuntimeWorks(query?: RuntimeWorkQuery): RuntimeWork[]
  getRuntimeWork(id: string): RuntimeWork | undefined
  createRuntimeInteraction(interaction: RuntimeInteraction): void
  updateRuntimeInteraction(interaction: RuntimeInteraction): void
  listRuntimeInteractions(query?: RuntimeInteractionQuery): RuntimeInteraction[]
  getRuntimeInteraction(id: string): RuntimeInteraction | undefined
  createRuntimeContinuation(continuation: RuntimeContinuation): void
  updateRuntimeContinuation(continuation: RuntimeContinuation): void
  listRuntimeContinuations(query?: RuntimeContinuationQuery): RuntimeContinuation[]
  getRuntimeContinuation(id: string): RuntimeContinuation | undefined
  appendTraceEvent(event: AgentTraceEvent): void
  listRunTraceEvents(runId: string, query?: AgentTraceQuery): AgentTraceEvent[]
  getRunTraceEventData(runId: string, eventId: string): unknown | undefined
  countRunTraceEvents(runId: string, query?: Pick<AgentTraceQuery, 'kind'>): number
  summarizeRunTraceEvents(runId: string): AgentRunTraceSummary
  getRunDebugLedger(runId: string): AgentRunDebugLedger | undefined
  updateRunDebugLedger(runId: string, ledger: AgentRunDebugLedger): void
}

export interface AgentThreadDeletionResult {
  deleted: boolean
  threadId: string
  deletedRunIds: string[]
  deletedTaskGraphIds: string[]
  deletedTaskIds: string[]
  deletedRuntimeWorkIds: string[]
  deletedRuntimeInteractionIds: string[]
  deletedRuntimeContinuationIds: string[]
}

export interface AgentThreadClearResult {
  deleted: boolean
  deletedThreadIds: string[]
  deletedRunIds: string[]
  deletedTaskGraphIds: string[]
  deletedTaskIds: string[]
  deletedRuntimeWorkIds: string[]
  deletedRuntimeInteractionIds: string[]
  deletedRuntimeContinuationIds: string[]
}

export interface AgentRunQuery {
  sessionId?: string
  threadId?: string
  parentRunId?: string
  taskGraphId?: string
  taskId?: string
  role?: AgentRun['role']
}

export interface RuntimeWorkQuery {
  sessionId?: string
  threadId?: string
  runId?: string
  status?: RuntimeWork['status']
  kind?: RuntimeWork['kind']
}

export interface RuntimeInteractionQuery {
  threadId?: string
  runId?: string
  workId?: string
  status?: RuntimeInteraction['status']
  kind?: RuntimeInteraction['kind']
}

export interface RuntimeContinuationQuery {
  threadId?: string
  runId?: string
  status?: RuntimeContinuation['status']
}

export class InMemoryAgentStore implements AgentStore {
  private readonly sessions = new Map<string, AgentSession>()
  private readonly threads = new Map<string, AgentThread>()
  private readonly runs = new Map<string, AgentRun>()
  private readonly plans = new Map<string, AgentTaskGraph>()
  private readonly tasks = new Map<string, AgentTask>()
  private readonly runtimeWorks = new Map<string, RuntimeWork>()
  private readonly runtimeInteractions = new Map<string, RuntimeInteraction>()
  private readonly runtimeContinuations = new Map<string, RuntimeContinuation>()
  private readonly traceEventsByRun = new Map<string, AgentTraceEvent[]>()
  private readonly debugLedgersByRun = new Map<string, AgentRunDebugLedger>()

  createSession(session: AgentSession): void {
    this.sessions.set(session.id, clone(session))
  }

  updateSession(session: AgentSession): void {
    this.sessions.set(session.id, clone(session))
  }

  listSessions(): AgentSession[] {
    return Array.from(this.sessions.values())
      .map((session) => clone(session))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  listSessionSummaries(): AgentSessionSummary[] {
    const threadCounts = new Map<string, number>()
    for (const thread of this.threads.values()) {
      if (!thread.sessionId) continue
      threadCounts.set(thread.sessionId, (threadCounts.get(thread.sessionId) ?? 0) + 1)
    }
    return this.listSessions().map((session) => toSessionSummary(session, threadCounts.get(session.id) ?? 0))
  }

  getSession(id: string): AgentSession | undefined {
    const session = this.sessions.get(id)
    return session ? clone(session) : undefined
  }

  createThread(thread: AgentThread): void {
    this.threads.set(thread.id, clone(thread))
  }

  updateThread(thread: AgentThread): void {
    this.threads.set(thread.id, clone(thread))
  }

  deleteThread(threadId: string): AgentThreadDeletionResult {
    const thread = this.threads.get(threadId)
    const deletedRunIds = Array.from(this.runs.values())
      .filter((run) => run.threadId === threadId)
      .map((run) => run.id)
    const deletedTaskGraphIds = Array.from(this.plans.values())
      .filter((taskGraph) => taskGraph.threadId === threadId)
      .map((taskGraph) => taskGraph.id)
    const deletedTaskGraphIdSet = new Set(deletedTaskGraphIds)
    const deletedTaskIds = Array.from(this.tasks.values())
      .filter((task) => deletedTaskGraphIdSet.has(task.taskGraphId))
      .map((task) => task.id)
    const deletedRuntimeWorkIds = Array.from(this.runtimeWorks.values())
      .filter((work) => work.threadId === threadId)
      .map((work) => work.id)
    const deletedRuntimeInteractionIds = Array.from(this.runtimeInteractions.values())
      .filter((interaction) => interaction.threadId === threadId)
      .map((interaction) => interaction.id)
    const deletedRuntimeContinuationIds = Array.from(this.runtimeContinuations.values())
      .filter((continuation) => continuation.threadId === threadId)
      .map((continuation) => continuation.id)

    if (!thread) {
      return {
        deleted: false,
        threadId,
        deletedRunIds: [],
        deletedTaskGraphIds: [],
        deletedTaskIds: [],
        deletedRuntimeWorkIds: [],
        deletedRuntimeInteractionIds: [],
        deletedRuntimeContinuationIds: [],
      }
    }

    this.threads.delete(threadId)
    for (const runId of deletedRunIds) {
      this.runs.delete(runId)
      this.traceEventsByRun.delete(runId)
      this.debugLedgersByRun.delete(runId)
    }
    for (const taskGraphId of deletedTaskGraphIds) this.plans.delete(taskGraphId)
    for (const taskId of deletedTaskIds) this.tasks.delete(taskId)
    for (const workId of deletedRuntimeWorkIds) this.runtimeWorks.delete(workId)
    for (const interactionId of deletedRuntimeInteractionIds) this.runtimeInteractions.delete(interactionId)
    for (const continuationId of deletedRuntimeContinuationIds) this.runtimeContinuations.delete(continuationId)

    return {
      deleted: true,
      threadId,
      deletedRunIds,
      deletedTaskGraphIds,
      deletedTaskIds,
      deletedRuntimeWorkIds,
      deletedRuntimeInteractionIds,
      deletedRuntimeContinuationIds,
    }
  }

  deleteAllThreads(): AgentThreadClearResult {
    const threadIds = Array.from(this.threads.keys())
    const deletedRunIds = Array.from(this.runs.keys())
    const deletedTaskGraphIds = Array.from(this.plans.keys())
    const deletedTaskIds = Array.from(this.tasks.keys())
    const deletedRuntimeWorkIds = Array.from(this.runtimeWorks.keys())
    const deletedRuntimeInteractionIds = Array.from(this.runtimeInteractions.keys())
    const deletedRuntimeContinuationIds = Array.from(this.runtimeContinuations.keys())
    const deleted = threadIds.length > 0
      || deletedRunIds.length > 0
      || deletedTaskGraphIds.length > 0
      || deletedTaskIds.length > 0
      || deletedRuntimeWorkIds.length > 0
      || deletedRuntimeInteractionIds.length > 0
      || deletedRuntimeContinuationIds.length > 0

    this.sessions.clear()
    this.threads.clear()
    this.runs.clear()
    this.plans.clear()
    this.tasks.clear()
    this.runtimeWorks.clear()
    this.runtimeInteractions.clear()
    this.runtimeContinuations.clear()
    this.traceEventsByRun.clear()
    this.debugLedgersByRun.clear()

    return {
      deleted,
      deletedThreadIds: threadIds,
      deletedRunIds,
      deletedTaskGraphIds,
      deletedTaskIds,
      deletedRuntimeWorkIds,
      deletedRuntimeInteractionIds,
      deletedRuntimeContinuationIds,
    }
  }

  listThreads(): AgentThread[] {
    return Array.from(this.threads.values())
      .map((thread) => clone(thread))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  listThreadSummaries(): AgentThreadSummary[] {
    return this.listThreads().map(toThreadSummary)
  }

  getThread(id: string): AgentThread | undefined {
    const thread = this.threads.get(id)
    return thread ? clone(thread) : undefined
  }

  createRun(run: AgentRun): void {
    const { run: normalizedRun, traceEvents } = detachTraceEvents(run)
    this.runs.set(run.id, clone(normalizedRun))
    if (traceEvents.length > 0) {
      this.traceEventsByRun.set(run.id, traceEvents.map(normalizeTraceEvent))
      this.debugLedgersByRun.set(run.id, buildRunDebugLedgerFromTrace({
        run: normalizedRun,
        events: traceEvents.map(normalizeTraceEvent),
      }))
    } else {
      this.debugLedgersByRun.set(run.id, createRunDebugLedger(normalizedRun))
    }
  }

  updateRun(run: AgentRun): void {
    const { run: normalizedRun, traceEvents } = detachTraceEvents(run)
    this.runs.set(run.id, clone(normalizedRun))
    if (traceEvents.length > 0) {
      const existing = this.traceEventsByRun.get(run.id) ?? []
      const seen = new Set(existing.map((event) => event.id))
      const next = [...existing]
      for (const event of traceEvents) {
        if (seen.has(event.id)) continue
        seen.add(event.id)
        next.push(normalizeTraceEvent(event))
      }
      this.traceEventsByRun.set(run.id, next)
      this.debugLedgersByRun.set(run.id, buildRunDebugLedgerFromTrace({
        run: normalizedRun,
        events: next,
      }))
    } else {
      const current = this.debugLedgersByRun.get(run.id)
      this.debugLedgersByRun.set(run.id, compactRunDebugLedger({
        ...(current ?? createRunDebugLedger(normalizedRun)),
        run: {
          ...(current?.run ?? createRunDebugLedger(normalizedRun).run),
          status: normalizedRun.status,
          ...(normalizedRun.role ? { role: normalizedRun.role } : {}),
          ...(normalizedRun.error ? { error: normalizedRun.error } : {}),
          warnings: normalizedRun.warnings ?? current?.run.warnings ?? [],
        },
      }))
    }
  }

  listRuns(query: AgentRunQuery = {}): AgentRun[] {
    return Array.from(this.runs.values())
      .filter((run) => query.sessionId === undefined || run.sessionId === query.sessionId)
      .filter((run) => query.threadId === undefined || run.threadId === query.threadId)
      .filter((run) => query.parentRunId === undefined || run.parentRunId === query.parentRunId)
      .filter((run) => query.taskGraphId === undefined || run.taskGraphId === query.taskGraphId)
      .filter((run) => query.taskId === undefined || run.taskId === query.taskId)
      .filter((run) => query.role === undefined || run.role === query.role)
      .map((run) => clone(run))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  getRun(id: string): AgentRun | undefined {
    const run = this.runs.get(id)
    return run ? clone(run) : undefined
  }

  listChildRuns(parentRunId: string): AgentRun[] {
    return this.listRuns({ parentRunId })
  }

  createTaskGraph(taskGraph: AgentTaskGraph): void {
    this.plans.set(taskGraph.id, clone(taskGraph))
  }

  updateTaskGraph(taskGraph: AgentTaskGraph): void {
    this.plans.set(taskGraph.id, clone(taskGraph))
  }

  listTaskGraphs(): AgentTaskGraph[] {
    return Array.from(this.plans.values())
      .map((taskGraph) => clone(taskGraph))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  getTaskGraph(id: string): AgentTaskGraph | undefined {
    const taskGraph = this.plans.get(id)
    return taskGraph ? clone(taskGraph) : undefined
  }

  createTask(task: AgentTask): void {
    this.tasks.set(task.id, clone(task))
  }

  updateTask(task: AgentTask): void {
    this.tasks.set(task.id, clone(task))
  }

  listTasks(taskGraphId?: string): AgentTask[] {
    return Array.from(this.tasks.values())
      .filter((task) => taskGraphId === undefined || task.taskGraphId === taskGraphId)
      .map((task) => clone(task))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  getTask(id: string): AgentTask | undefined {
    const task = this.tasks.get(id)
    return task ? clone(task) : undefined
  }

  createRuntimeWork(work: RuntimeWork): void {
    this.runtimeWorks.set(work.id, clone(work))
  }

  updateRuntimeWork(work: RuntimeWork): void {
    this.runtimeWorks.set(work.id, clone(work))
  }

  listRuntimeWorks(query: RuntimeWorkQuery = {}): RuntimeWork[] {
    return Array.from(this.runtimeWorks.values())
      .filter((work) => query.sessionId === undefined || work.sessionId === query.sessionId)
      .filter((work) => query.threadId === undefined || work.threadId === query.threadId)
      .filter((work) => query.runId === undefined || work.runId === query.runId)
      .filter((work) => query.status === undefined || work.status === query.status)
      .filter((work) => query.kind === undefined || work.kind === query.kind)
      .map((work) => clone(work))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  getRuntimeWork(id: string): RuntimeWork | undefined {
    const work = this.runtimeWorks.get(id)
    return work ? clone(work) : undefined
  }

  createRuntimeInteraction(interaction: RuntimeInteraction): void {
    this.runtimeInteractions.set(interaction.id, clone(interaction))
  }

  updateRuntimeInteraction(interaction: RuntimeInteraction): void {
    this.runtimeInteractions.set(interaction.id, clone(interaction))
  }

  listRuntimeInteractions(query: RuntimeInteractionQuery = {}): RuntimeInteraction[] {
    return Array.from(this.runtimeInteractions.values())
      .filter((interaction) => query.threadId === undefined || interaction.threadId === query.threadId)
      .filter((interaction) => query.runId === undefined || interaction.runId === query.runId)
      .filter((interaction) => query.workId === undefined || interaction.workId === query.workId)
      .filter((interaction) => query.status === undefined || interaction.status === query.status)
      .filter((interaction) => query.kind === undefined || interaction.kind === query.kind)
      .map((interaction) => clone(interaction))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  getRuntimeInteraction(id: string): RuntimeInteraction | undefined {
    const interaction = this.runtimeInteractions.get(id)
    return interaction ? clone(interaction) : undefined
  }

  createRuntimeContinuation(continuation: RuntimeContinuation): void {
    this.runtimeContinuations.set(continuation.id, clone(continuation))
  }

  updateRuntimeContinuation(continuation: RuntimeContinuation): void {
    this.runtimeContinuations.set(continuation.id, clone(continuation))
  }

  listRuntimeContinuations(query: RuntimeContinuationQuery = {}): RuntimeContinuation[] {
    return Array.from(this.runtimeContinuations.values())
      .filter((continuation) => query.threadId === undefined || continuation.threadId === query.threadId)
      .filter((continuation) => query.runId === undefined || continuation.runId === query.runId)
      .filter((continuation) => query.status === undefined || continuation.status === query.status)
      .map((continuation) => clone(continuation))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  getRuntimeContinuation(id: string): RuntimeContinuation | undefined {
    const continuation = this.runtimeContinuations.get(id)
    return continuation ? clone(continuation) : undefined
  }

  appendTraceEvent(event: AgentTraceEvent): void {
    const events = this.traceEventsByRun.get(event.runId) ?? []
    const existingIndex = events.findIndex((item) => item.id === event.id)
    const normalizedEvent = normalizeTraceEvent(event)
    const next = existingIndex >= 0
      ? events.map((item, index) => index === existingIndex ? normalizedEvent : item)
      : [...events, normalizedEvent]
    this.traceEventsByRun.set(event.runId, next)
    const run = this.runs.get(event.runId)
    if (run) {
      const current = this.debugLedgersByRun.get(event.runId) ?? createRunDebugLedger(run)
      this.debugLedgersByRun.set(event.runId, applyTraceEventToDebugLedger({
        ledger: current,
        event: normalizedEvent,
        run,
      }))
    }
  }

  listRunTraceEvents(runId: string, query: AgentTraceQuery = {}): AgentTraceEvent[] {
    const limit = normalizeTraceLimit(query.limit)
    const events = (this.traceEventsByRun.get(runId) ?? [])
      .filter((event) => !query.kind || event.kind === query.kind)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const cursorIndex = query.cursor ? events.findIndex((event) => event.id === query.cursor) : -1
    if (query.cursor && cursorIndex < 0) return []
    const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0
    return events.slice(startIndex, startIndex + limit).map((event) => clone(event))
  }

  getRunTraceEventData(runId: string, eventId: string): unknown | undefined {
    const event = (this.traceEventsByRun.get(runId) ?? []).find((item) => item.id === eventId)
    return event?.data === undefined ? undefined : clone(event.data)
  }

  countRunTraceEvents(runId: string, query: Pick<AgentTraceQuery, 'kind'> = {}): number {
    const events = this.traceEventsByRun.get(runId) ?? []
    return query.kind ? events.filter((event) => event.kind === query.kind).length : events.length
  }

  summarizeRunTraceEvents(runId: string): AgentRunTraceSummary {
    const events = this.traceEventsByRun.get(runId) ?? []
    const byKind: AgentRunTraceSummary['byKind'] = {}
    let latestEvent: AgentTraceEvent | undefined
    for (const event of events) {
      byKind[event.kind] = (byKind[event.kind] ?? 0) + 1
      if (!latestEvent || event.createdAt.localeCompare(latestEvent.createdAt) >= 0) latestEvent = event
    }
    return {
      runId,
      total: events.length,
      byKind,
      ...(latestEvent ? { latestEvent: clone(latestEvent) } : {}),
    }
  }

  getRunDebugLedger(runId: string): AgentRunDebugLedger | undefined {
    const ledger = this.debugLedgersByRun.get(runId)
    if (ledger) return clone(ledger)
    const run = this.runs.get(runId)
    if (!run) return undefined
    return buildRunDebugLedgerFromTrace({
      run,
      events: this.traceEventsByRun.get(runId) ?? [],
    })
  }

  updateRunDebugLedger(runId: string, ledger: AgentRunDebugLedger): void {
    this.debugLedgersByRun.set(runId, compactRunDebugLedger(ledger))
  }
}

export function toThreadSummary(thread: AgentThread): AgentThreadSummary {
  const lastMessage = thread.messages.at(-1)
  return {
    id: thread.id,
    ...(thread.sessionId ? { sessionId: thread.sessionId } : {}),
    ...(thread.title ? { title: thread.title } : {}),
    ...(thread.agentName ? { agentName: thread.agentName } : {}),
    ...(thread.agentRole ? { agentRole: thread.agentRole } : {}),
    ...(thread.parentThreadId ? { parentThreadId: thread.parentThreadId } : {}),
    ...(thread.parentRunId ? { parentRunId: thread.parentRunId } : {}),
    ...(isValidAgentProjectId(thread.projectId) ? { projectId: thread.projectId } : {}),
    ...(thread.metadata ? { metadata: clone(thread.metadata) } : {}),
    ...(thread.currentPlan ? { currentPlan: clone(thread.currentPlan) } : {}),
    archived: thread.archived === true,
    ...(thread.status ? { status: thread.status } : {}),
    ...(thread.activeRunId ? { activeRunId: thread.activeRunId } : {}),
    ...(thread.lastRunId ? { lastRunId: thread.lastRunId } : {}),
    ...(thread.lastRunStatus ? { lastRunStatus: thread.lastRunStatus } : {}),
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messageCount: thread.messages.length,
    ...(lastMessage ? { lastMessageAt: lastMessage.createdAt } : {}),
  }
}

export function toSessionSummary(session: AgentSession, threadCount: number): AgentSessionSummary {
  return {
    id: session.id,
    ...(session.title ? { title: session.title } : {}),
    ...(isValidAgentProjectId(session.projectId) ? { projectId: session.projectId } : {}),
    ...(session.metadata ? { metadata: clone(session.metadata) } : {}),
    ...(session.rootThreadId ? { rootThreadId: session.rootThreadId } : {}),
    ...(session.activeThreadId ? { activeThreadId: session.activeThreadId } : {}),
    ...(session.status ? { status: session.status } : {}),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    threadCount,
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function detachTraceEvents(run: AgentRun): { run: AgentRun; traceEvents: AgentTraceEvent[] } {
  const traceEvents = Array.isArray(run.traceEvents) ? run.traceEvents : []
  return {
    run: {
      ...run,
      traceEvents: [],
    },
    traceEvents,
  }
}

function normalizeTraceLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 200
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, Math.floor(value)))
}

function normalizeTraceEvent(event: AgentTraceEvent): AgentTraceEvent {
  const next = clone(event)
  if (event.data !== undefined && !isJSONValue(event.data)) {
    delete next.data
  }
  if (typeof next.durationMs !== 'number' || !Number.isFinite(next.durationMs) || next.durationMs < 0) {
    delete next.durationMs
  }
  return next
}
