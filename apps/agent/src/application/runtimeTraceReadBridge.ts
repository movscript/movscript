import type { AgentStore, AgentTraceQuery } from '../state/store.js'
import { buildRunTracePage, normalizeTracePageLimit, type AgentRunTracePage, type AgentRunTraceSummary } from '../state/runTrace.js'
import type { AgentTraceEvent } from '../state/types.js'
import { requireRuntimeRun } from './runtimeStoreLookup.js'

export interface RuntimeTraceReadBridge {
  getRunTraceEvents(runId: string, query?: AgentTraceQuery): AgentTraceEvent[]
  getRunTracePage(runId: string, query?: AgentTraceQuery): AgentRunTracePage
  getRunTraceSummary(runId: string): AgentRunTraceSummary
}

export function createRuntimeTraceReadBridge(input: {
  store: Pick<AgentStore, 'getRun' | 'listRunTraceEvents' | 'countRunTraceEvents' | 'summarizeRunTraceEvents'>
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
      return input.store.summarizeRunTraceEvents(runId)
    },
  }
}
