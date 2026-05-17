import type { AgentPlan, AgentRun, AgentTask, AgentThread, AgentThreadSummary, AgentTraceEvent } from './types.js'
import type { AgentRunTraceSummary } from './runTrace.js'
import { isJSONValue } from '../jsonValue.js'
import { isValidAgentProjectId } from '../context/runtimeContext.js'

export interface AgentTraceQuery {
  cursor?: string
  limit?: number
  kind?: AgentTraceEvent['kind']
}

export interface AgentStore {
  createThread(thread: AgentThread): void
  updateThread(thread: AgentThread): void
  listThreads(): AgentThread[]
  listThreadSummaries(): AgentThreadSummary[]
  getThread(id: string): AgentThread | undefined
  createRun(run: AgentRun): void
  updateRun(run: AgentRun): void
  listRuns(query?: AgentRunQuery): AgentRun[]
  getRun(id: string): AgentRun | undefined
  listChildRuns(parentRunId: string): AgentRun[]
  createPlan(plan: AgentPlan): void
  updatePlan(plan: AgentPlan): void
  listPlans(): AgentPlan[]
  getPlan(id: string): AgentPlan | undefined
  createTask(task: AgentTask): void
  updateTask(task: AgentTask): void
  listTasks(planId?: string): AgentTask[]
  getTask(id: string): AgentTask | undefined
  appendTraceEvent(event: AgentTraceEvent): void
  listRunTraceEvents(runId: string, query?: AgentTraceQuery): AgentTraceEvent[]
  countRunTraceEvents(runId: string, query?: Pick<AgentTraceQuery, 'kind'>): number
  summarizeRunTraceEvents(runId: string): AgentRunTraceSummary
}

export interface AgentRunQuery {
  parentRunId?: string
  planId?: string
  taskId?: string
  role?: AgentRun['role']
}

export class InMemoryAgentStore implements AgentStore {
  private readonly threads = new Map<string, AgentThread>()
  private readonly runs = new Map<string, AgentRun>()
  private readonly plans = new Map<string, AgentPlan>()
  private readonly tasks = new Map<string, AgentTask>()
  private readonly traceEventsByRun = new Map<string, AgentTraceEvent[]>()

  createThread(thread: AgentThread): void {
    this.threads.set(thread.id, clone(thread))
  }

  updateThread(thread: AgentThread): void {
    this.threads.set(thread.id, clone(thread))
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
    }
  }

  listRuns(query: AgentRunQuery = {}): AgentRun[] {
    return Array.from(this.runs.values())
      .filter((run) => query.parentRunId === undefined || run.parentRunId === query.parentRunId)
      .filter((run) => query.planId === undefined || run.planId === query.planId)
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

  createPlan(plan: AgentPlan): void {
    this.plans.set(plan.id, clone(plan))
  }

  updatePlan(plan: AgentPlan): void {
    this.plans.set(plan.id, clone(plan))
  }

  listPlans(): AgentPlan[] {
    return Array.from(this.plans.values())
      .map((plan) => clone(plan))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  getPlan(id: string): AgentPlan | undefined {
    const plan = this.plans.get(id)
    return plan ? clone(plan) : undefined
  }

  createTask(task: AgentTask): void {
    this.tasks.set(task.id, clone(task))
  }

  updateTask(task: AgentTask): void {
    this.tasks.set(task.id, clone(task))
  }

  listTasks(planId?: string): AgentTask[] {
    return Array.from(this.tasks.values())
      .filter((task) => planId === undefined || task.planId === planId)
      .map((task) => clone(task))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  getTask(id: string): AgentTask | undefined {
    const task = this.tasks.get(id)
    return task ? clone(task) : undefined
  }

  appendTraceEvent(event: AgentTraceEvent): void {
    const events = this.traceEventsByRun.get(event.runId) ?? []
    const existingIndex = events.findIndex((item) => item.id === event.id)
    const normalizedEvent = normalizeTraceEvent(event)
    const next = existingIndex >= 0
      ? events.map((item, index) => index === existingIndex ? normalizedEvent : item)
      : [...events, normalizedEvent]
    this.traceEventsByRun.set(event.runId, next)
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
}

export function toThreadSummary(thread: AgentThread): AgentThreadSummary {
  const lastMessage = thread.messages.at(-1)
  return {
    id: thread.id,
    ...(thread.title ? { title: thread.title } : {}),
    ...(isValidAgentProjectId(thread.projectId) ? { projectId: thread.projectId } : {}),
    ...(thread.metadata ? { metadata: clone(thread.metadata) } : {}),
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
