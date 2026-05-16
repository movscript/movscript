import type { AgentStore, AgentTraceQuery } from '../state/store.js'
import { buildRunTracePage, normalizeTracePageLimit, type AgentRunTracePage } from '../state/runTrace.js'
import type { AgentTraceEvent, AgentTraceEventKind } from '../state/types.js'
import { requireRuntimeRun } from './runtimeStoreLookup.js'

export interface RuntimeTraceReadBridge {
  getRunTraceEvents(runId: string, query?: AgentTraceQuery): AgentTraceEvent[]
  getRunTracePage(runId: string, query?: AgentTraceQuery): AgentRunTracePage
  getRunTraceSummary(runId: string): {
    runId: string
    total: number
    byKind: Partial<Record<AgentTraceEventKind, number>>
    latestEvent?: AgentTraceEvent
  }
}

export function createRuntimeTraceReadBridge(input: {
  store: Pick<AgentStore, 'getRun' | 'listRunTraceEvents' | 'countRunTraceEvents'>
}): RuntimeTraceReadBridge {
  const requireRun = (runId: string) => requireRuntimeRun(input.store, runId)

  return {
    getRunTraceEvents: (runId, query = {}) => {
      requireRun(runId)
      return input.store.listRunTraceEvents(runId, query)
    },
    getRunTracePage: (runId, query = {}) => {
      requireRun(runId)
      const limit = normalizeTracePageLimit(query.limit)
      const eventsPlusOne = input.store.listRunTraceEvents(runId, { ...query, limit: limit + 1 })
      return buildRunTracePage({
        runId,
        eventsPlusOne,
        limit,
        total: input.store.countRunTraceEvents(runId, { kind: query.kind }),
      })
    },
    getRunTraceSummary: (runId) => {
      requireRun(runId)
      const events = input.store.listRunTraceEvents(runId, { limit: Number.MAX_SAFE_INTEGER })
      const byKind: Partial<Record<AgentTraceEventKind, number>> = {}
      for (const event of events) byKind[event.kind] = (byKind[event.kind] ?? 0) + 1
      const latestEvent = events.at(-1)
      return {
        runId,
        total: events.length,
        byKind,
        ...(latestEvent ? { latestEvent } : {}),
      }
    },
  }
}
