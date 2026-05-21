import type { AgentStore, AgentTraceQuery } from '../state/store.js'
import { buildRunTracePage, normalizeTracePageLimit, type AgentRunTracePage, type AgentRunTraceSummary } from '../state/runTrace.js'
import { buildRunDebugLedgerFromTrace, resolveRunDebugEvidence, type AgentRunDebugEvidence, type AgentRunDebugLedger } from '../state/runDebugLedger.js'
import type { AgentTraceEvent } from '../state/types.js'
import { requireRuntimeRun } from './runtimeStoreLookup.js'
import { buildRuntimeRunGenerationView, type AgentRunGenerationView } from './runtimeGenerationView.js'
import { buildRuntimeTraceDebugView, type AgentTraceDebugView } from './runtimeTraceDebugView.js'

export interface RuntimeTraceReadBridge {
  getRunTraceEvents(runId: string, query?: AgentTraceQuery): AgentTraceEvent[]
  getRunTracePage(runId: string, query?: AgentTraceQuery): AgentRunTracePage
  getRunTraceSummary(runId: string): AgentRunTraceSummary
  getRunTraceDebugView(runId: string): AgentTraceDebugView
  getRunDebugLedger(runId: string): AgentRunDebugLedger
  getRunDebugEvidence(runId: string, evidenceId: string): AgentRunDebugEvidence
  getRunGenerationView(runId: string): AgentRunGenerationView
}

export function createRuntimeTraceReadBridge(input: {
  store: Pick<AgentStore, 'getRun' | 'listRunTraceEvents' | 'countRunTraceEvents' | 'summarizeRunTraceEvents' | 'getRunDebugLedger'>
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
    getRunTraceDebugView: (runId) => {
      const run = requireRun(runId)
      return buildRuntimeTraceDebugView({
        run,
        events: input.store.listRunTraceEvents(runId, { limit: Number.MAX_SAFE_INTEGER }),
        summary: input.store.summarizeRunTraceEvents(runId),
      })
    },
    getRunDebugLedger: (runId) => {
      const run = requireRun(runId)
      return input.store.getRunDebugLedger(runId) ?? buildRunDebugLedgerFromTrace({
        run,
        events: input.store.listRunTraceEvents(runId, { limit: Number.MAX_SAFE_INTEGER }),
      })
    },
    getRunDebugEvidence: (runId, evidenceId) => {
      requireRun(runId)
      const evidence = resolveRunDebugEvidence({
        runId,
        evidenceId,
        events: input.store.listRunTraceEvents(runId, { limit: Number.MAX_SAFE_INTEGER }),
      })
      if (!evidence) throw new Error(`debug evidence not found: ${evidenceId}`)
      return evidence
    },
    getRunGenerationView: (runId) => {
      const run = requireRun(runId)
      return buildRuntimeRunGenerationView({
        run,
        events: input.store.listRunTraceEvents(runId, { limit: Number.MAX_SAFE_INTEGER }),
      })
    },
  }
}
