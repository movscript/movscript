import { useSyncExternalStore } from 'react'

export const AGENT_CONNECTION_DEBUG_EVENT_LIMIT = 500
export const AGENT_CONNECTION_DEBUG_GLOBAL_THREAD_ID = '__global__'

export type AgentConnectionDebugDirection = 'request' | 'response'

export interface AgentConnectionDebugEventInput {
  direction: AgentConnectionDebugDirection
  source: string
  method?: string
  threadId?: string | null
  requestId?: string | number | null
  connectionId?: string | null
  raw: unknown
}

export interface AgentConnectionDebugEvent extends AgentConnectionDebugEventInput {
  id: string
  sequence: number
  timestamp: number
  threadId: string
  requestId?: string | number | null
  connectionId?: string | null
}

export interface AgentConnectionDebugThreadSummary {
  threadId: string
  label: string
  eventCount: number
  requestCount: number
  responseCount: number
  lastEventAt: number
  lastMethod?: string
  lastDirection?: AgentConnectionDebugDirection
  connectionIds: string[]
}

export interface AgentConnectionDebugSnapshot {
  version: number
  totalEvents: number
  threads: AgentConnectionDebugThreadSummary[]
}

type StoreState = {
  version: number
  sequence: number
  threads: Map<string, AgentConnectionDebugEvent[]>
}

const state: StoreState = {
  version: 0,
  sequence: 0,
  threads: new Map(),
}
const listeners = new Set<() => void>()
let cachedSnapshotVersion = -1
let cachedSnapshot: AgentConnectionDebugSnapshot = {
  version: -1,
  totalEvents: 0,
  threads: [],
}
const cachedThreadEvents = new Map<string, { version: number; events: AgentConnectionDebugEvent[] }>()

export function recordAgentConnectionDebugEvent(input: AgentConnectionDebugEventInput): AgentConnectionDebugEvent {
  const threadId = normalizeThreadId(input.threadId)
  const sequence = state.sequence + 1
  state.sequence = sequence
  const event: AgentConnectionDebugEvent = {
    ...input,
    id: `${sequence}`,
    sequence,
    timestamp: Date.now(),
    threadId,
  }
  const events = state.threads.get(threadId) ?? []
  events.push(event)
  if (events.length > AGENT_CONNECTION_DEBUG_EVENT_LIMIT) {
    events.splice(0, events.length - AGENT_CONNECTION_DEBUG_EVENT_LIMIT)
  }
  state.threads.set(threadId, events)
  state.version += 1
  emit()
  return event
}

export function clearAgentConnectionDebugEvents(threadId?: string): void {
  if (threadId) {
    state.threads.delete(normalizeThreadId(threadId))
  } else {
    state.threads.clear()
  }
  state.version += 1
  emit()
}

export function getAgentConnectionDebugSnapshot(): AgentConnectionDebugSnapshot {
  if (cachedSnapshotVersion === state.version) return cachedSnapshot
  const threads = Array.from(state.threads.entries()).map(([threadId, events]) => {
    let requestCount = 0
    let responseCount = 0
    const connectionIds = new Set<string>()
    for (const event of events) {
      if (event.direction === 'request') requestCount += 1
      if (event.direction === 'response') responseCount += 1
      if (event.connectionId) connectionIds.add(event.connectionId)
    }
    const last = events[events.length - 1]
    return {
      threadId,
      label: threadId === AGENT_CONNECTION_DEBUG_GLOBAL_THREAD_ID ? 'Global' : threadId,
      eventCount: events.length,
      requestCount,
      responseCount,
      lastEventAt: last?.timestamp ?? 0,
      lastMethod: last?.method,
      lastDirection: last?.direction,
      connectionIds: Array.from(connectionIds),
    }
  }).sort((a, b) => b.lastEventAt - a.lastEventAt)
  cachedSnapshot = {
    version: state.version,
    totalEvents: threads.reduce((sum, thread) => sum + thread.eventCount, 0),
    threads,
  }
  cachedSnapshotVersion = state.version
  return cachedSnapshot
}

export function getAgentConnectionDebugThreadEvents(threadId: string): AgentConnectionDebugEvent[] {
  const normalizedThreadId = normalizeThreadId(threadId)
  const cached = cachedThreadEvents.get(normalizedThreadId)
  if (cached?.version === state.version) return cached.events
  const events = [...(state.threads.get(normalizedThreadId) ?? [])]
  cachedThreadEvents.set(normalizedThreadId, { version: state.version, events })
  return events
}

export function subscribeAgentConnectionDebug(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAgentConnectionDebugSnapshot(): AgentConnectionDebugSnapshot {
  return useSyncExternalStore(
    subscribeAgentConnectionDebug,
    getAgentConnectionDebugSnapshot,
    getAgentConnectionDebugSnapshot,
  )
}

export function useAgentConnectionDebugThreadEvents(threadId: string): AgentConnectionDebugEvent[] {
  return useSyncExternalStore(
    subscribeAgentConnectionDebug,
    () => getAgentConnectionDebugThreadEvents(threadId),
    () => getAgentConnectionDebugThreadEvents(threadId),
  )
}

export function agentConnectionDebugRawText(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function extractAgentConnectionDebugThreadId(value: unknown, depth = 0): string | undefined {
  if (depth > 5) return undefined
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const threadId = extractAgentConnectionDebugThreadId(item, depth + 1)
      if (threadId) return threadId
    }
    return undefined
  }
  const record = value as Record<string, unknown>
  const direct = stringValue(record.threadId) || stringValue(record.thread_id)
  if (direct) return direct
  for (const key of ['thread', 'params', 'result', 'turn', 'event']) {
    const threadId = extractAgentConnectionDebugThreadId(record[key], depth + 1)
    if (threadId) return threadId
  }
  return undefined
}

function normalizeThreadId(threadId: string | null | undefined): string {
  return threadId?.trim() || AGENT_CONNECTION_DEBUG_GLOBAL_THREAD_ID
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function emit(): void {
  for (const listener of Array.from(listeners)) listener()
}
