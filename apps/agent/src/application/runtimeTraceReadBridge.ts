import type { AgentRunTracePage, AgentRunTraceSummary, AgentTraceQuery } from '@movscript/protocol'
import type { AgentStore } from '../state/store.js'
import { buildRunDebugLedgerFromTrace, resolveRunDebugEvidence, type AgentRunDebugEvidence, type AgentRunDebugLedger } from '../state/runDebugLedger.js'
import { buildRunTracePage, normalizeTracePageLimit } from '../state/runTrace.js'
import type { AgentTraceEvent } from '../state/types.js'
import type { RuntimeWork } from '../runtimeWork/runtimeWork.js'
import { requireRuntimeRun } from './runtimeStoreLookup.js'
import { buildRuntimeRunGenerationView, type AgentRunGenerationView } from './runtimeGenerationView.js'
import { buildRuntimeTraceDebugView, type AgentTraceDebugView } from './runtimeTraceDebugView.js'

export interface RuntimeTraceReadBridge {
  getRunTraceEvents(runId: string, query?: AgentTraceQuery): AgentTraceEvent[]
  getRunTracePage(runId: string, query?: AgentTraceQuery): AgentRunTracePage
  getRunTraceEventData(runId: string, eventId: string): unknown | undefined
  getRunTraceSummary(runId: string): AgentRunTraceSummary
  getRunTraceDebugView(runId: string): AgentTraceDebugView
  getRunDebugLedger(runId: string): AgentRunDebugLedger
  getRunDebugEvidence(runId: string, evidenceId: string): AgentRunDebugEvidence
  getRunGenerationView(runId: string): AgentRunGenerationView
}

export function createRuntimeTraceReadBridge(input: {
  store: Pick<AgentStore, 'getRun' | 'listRunTraceEvents' | 'getRunTraceEventData' | 'countRunTraceEvents' | 'summarizeRunTraceEvents' | 'getRunDebugLedger'> & {
    listRuntimeWorks?: (query?: { runId?: string }) => RuntimeWork[]
  }
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
    getRunTraceEventData: (runId, eventId) => {
      requireRun(runId)
      const data = input.store.getRunTraceEventData(runId, eventId)
      if (data === undefined) throw new Error(`trace event data not found: ${eventId}`)
      return data
    },
    getRunTraceSummary: (runId) => {
      requireRun(runId)
      return input.store.summarizeRunTraceEvents(runId)
    },
    getRunTraceDebugView: (runId) => {
      const run = requireRun(runId)
      const events = hydrateTraceEventData({
        runId,
        store: input.store,
        events: input.store.listRunTraceEvents(runId, { limit: Number.MAX_SAFE_INTEGER }),
      })
      return buildRuntimeTraceDebugView({
        run,
        events,
        summary: input.store.summarizeRunTraceEvents(runId),
      })
    },
    getRunDebugLedger: (runId) => {
      const run = requireRun(runId)
      const events = hydrateTraceEventData({
        runId,
        store: input.store,
        events: input.store.listRunTraceEvents(runId, { limit: Number.MAX_SAFE_INTEGER }),
      })
      return input.store.getRunDebugLedger(runId) ?? buildRunDebugLedgerFromTrace({
        run,
        events,
      })
    },
    getRunDebugEvidence: (runId, evidenceId) => {
      requireRun(runId)
      const events = hydrateTraceEventData({
        runId,
        store: input.store,
        events: input.store.listRunTraceEvents(runId, { limit: Number.MAX_SAFE_INTEGER }),
      })
      const evidence = resolveRunDebugEvidence({
        runId,
        evidenceId,
        events,
      })
      if (!evidence) throw new Error(`debug evidence not found: ${evidenceId}`)
      return evidence
    },
    getRunGenerationView: (runId) => {
      const run = requireRun(runId)
      const events = hydrateTraceEventData({
        runId,
        store: input.store,
        events: input.store.listRunTraceEvents(runId, { limit: Number.MAX_SAFE_INTEGER }),
      })
      return buildRuntimeRunGenerationView({
        run,
        events,
        works: input.store.listRuntimeWorks?.({ runId }),
      })
    },
  }
}

function hydrateTraceEventData(input: {
  runId: string
  store: Pick<AgentStore, 'getRunTraceEventData'>
  events: AgentTraceEvent[]
}): AgentTraceEvent[] {
  return input.events.map((event) => {
    const data = input.store.getRunTraceEventData(input.runId, event.id)
    return data === undefined ? event : { ...event, data: data as AgentTraceEvent['data'] }
  })
}
