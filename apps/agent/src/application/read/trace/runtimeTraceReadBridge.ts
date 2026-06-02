import type { AgentRunTracePage, AgentRunTraceSummary, AgentTraceQuery } from '@movscript/protocol'
import type { AgentStore } from '../../../state/store/core/store.js'
import {
  buildRunDebugLedgerFromTrace,
  findRunDebugEvidenceRefs,
  resolveRunDebugEvidence,
  type AgentRunDebugEvidence,
  type AgentRunDebugLedger,
  type AgentRunDebugLedgerEvidenceRef,
} from '../../../trace/debug/ledger/runDebugLedger.js'
import { buildRunTracePage, normalizeTracePageLimit } from '../../../trace/run/runTrace.js'
import type { AgentTraceEvent } from '../../../state/shared/types.js'
import type { AgentToolResultRecord, AgentToolResultStore } from '../../../state/store/tool-results/toolResultStore.js'
import type { RuntimeWork } from '../../../runtime-work/core/runtimeWork.js'
import { requireRuntimeRun } from '../../shared/store/runtimeStoreLookup.js'
import { buildRuntimeRunGenerationView, type AgentRunGenerationView } from '../generation/runtimeGenerationView.js'
import { buildRuntimeTraceDebugView, type AgentTraceDebugView } from '../../../trace/debug/view/runtimeTraceDebugView.js'

export interface RuntimeTraceReadBridge {
  getRunTraceEvents(runId: string, query?: AgentTraceQuery): AgentTraceEvent[]
  getRunTracePage(runId: string, query?: AgentTraceQuery): AgentRunTracePage
  getRunTraceEventData(runId: string, eventId: string): unknown | undefined
  getRunTraceSummary(runId: string): AgentRunTraceSummary
  getRunTraceDebugView(runId: string): AgentTraceDebugView
  getRunDebugLedger(runId: string): AgentRunDebugLedger
  findRunDebugEvidenceRefs(runId: string, query: RuntimeDebugEvidenceRefQuery): AgentRunDebugLedgerEvidenceRef[]
  getRunDebugEvidence(runId: string, evidenceId: string): AgentRunDebugEvidence
  getRunToolResult(runId: string, refKey: string): AgentToolResultRecord
  findRunToolResults(runId: string, query?: RuntimeToolResultQuery): AgentToolResultRecord[]
  getRunGenerationView(runId: string): AgentRunGenerationView
}

export interface RuntimeDebugEvidenceRefQuery {
  kind?: AgentRunDebugLedgerEvidenceRef['kind']
  contextBundleId?: string
  refKey?: string
  contentHash?: string
  resultHash?: string
}

export interface RuntimeToolResultQuery {
  refKey?: string
  resultHash?: string
}

export function createRuntimeTraceReadBridge(input: {
  store: Pick<AgentStore, 'getRun' | 'listRunTraceEvents' | 'getRunTraceEventData' | 'countRunTraceEvents' | 'summarizeRunTraceEvents' | 'getRunDebugLedger'> & {
    listRuntimeWorks?: (query?: { runId?: string }) => RuntimeWork[]
  }
  toolResultStore?: AgentToolResultStore
}): RuntimeTraceReadBridge {
  const requireRun = (runId: string) => requireRuntimeRun(input.store, runId)
  const readDebugLedger = (runId: string): AgentRunDebugLedger => {
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
  }

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
      return readDebugLedger(runId)
    },
    findRunDebugEvidenceRefs: (runId, query) => {
      const ledger = readDebugLedger(runId)
      return findRunDebugEvidenceRefs({ ledger, ...query })
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
    getRunToolResult: (runId, refKey) => {
      requireRun(runId)
      const direct = input.toolResultStore?.getToolResult(refKey)
      const record = direct && direct.runId === runId
        ? direct
        : input.toolResultStore?.listToolResults({ runId, refKey })[0]
      if (!record) throw new Error(`tool result not found: ${refKey}`)
      return record
    },
    findRunToolResults: (runId, query = {}) => {
      requireRun(runId)
      return input.toolResultStore?.listToolResults({ runId, ...query }) ?? []
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
