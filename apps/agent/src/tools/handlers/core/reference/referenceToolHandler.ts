import {
  buildRetrievedContextStore,
  countRetrievedContextChars,
  selectRetrievedContext,
  uniqueRetrievedContextRefs,
} from '../../../../context/ledger/retrieval/retrievedContextStore.js'
import { isJSONRecord } from '../../../../shared/json/jsonValue.js'
import type { RuntimeToolHandler } from '../../../../ports/runtime/runtimeToolHandlerPort.js'
import type { AgentRun, JSONValue } from '../../../../state/shared/types.js'

export function createCoreReferenceToolHandler(): RuntimeToolHandler {
  return {
    toolNames: ['reference_search', 'reference_get'],
    async execute({ call, args, run, referenceManager, signal }) {
      if (call.name === 'reference_search') {
        if (!referenceManager) return { result: { results: [] } as unknown as JSONValue }
        return { result: await referenceManager.search(args, { auth: runBackendAuth(run), ...(signal ? { signal } : {}) }) as unknown as JSONValue }
      }

      if (call.name === 'reference_get') {
        if (!referenceManager) throw new Error('reference manager unavailable')
        const budget = remainingReferenceBudget(run, stringField(args.id))
        if (budget.remainingChunks <= 0) {
          throw new Error(`reference chunk budget exceeded for this run (maxReferenceChunksPerRun=${budget.maxChunks})`)
        }
        if (budget.remainingChars <= 0) {
          throw new Error(`reference character budget exceeded for this run (maxReferenceCharsPerRun=${budget.maxChars})`)
        }
        return { result: referenceManager.get(args, { maxChars: budget.remainingChars }) }
      }

      return undefined
    },
  }
}

function remainingReferenceBudget(run: AgentRun, requestedId?: string): {
  maxChars: number
  maxChunks: number
  remainingChars: number
  remainingChunks: number
} {
  const metadata = isJSONRecord(run.metadata) ? run.metadata : undefined
  const limits = isJSONRecord(metadata?.limits) ? metadata.limits : {}
  const maxChars = positiveInteger(limits.maxReferenceCharsPerRun) ?? 8000
  const maxChunks = positiveInteger(limits.maxReferenceChunksPerRun) ?? 3
  const loadedReference = selectRetrievedContext({
    store: buildRetrievedContextStore(metadata?.contextLedger),
    source: 'reference',
    refType: 'reference',
    summaryPrefix: 'reference_get ',
  })
  const uniqueLoadedChunks = new Set(uniqueRetrievedContextRefs(loadedReference).map((ref) => ref.id))
  const usedChars = countRetrievedContextChars(loadedReference)
  const requestedChunkAlreadyLoaded = requestedId ? uniqueLoadedChunks.has(requestedId) : false
  return {
    maxChars,
    maxChunks,
    remainingChars: Math.max(0, maxChars - usedChars),
    remainingChunks: requestedChunkAlreadyLoaded ? 1 : Math.max(0, maxChunks - uniqueLoadedChunks.size),
  }
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined
}

function stringField(value: JSONValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function runBackendAuth(run: AgentRun): { backendAuthToken?: string; backendAPIBaseURL?: string } {
  const metadata = isJSONRecord(run.metadata) ? run.metadata : {}
  return {
    ...(typeof metadata.backendAuthToken === 'string' && metadata.backendAuthToken.trim() ? { backendAuthToken: metadata.backendAuthToken.trim() } : {}),
    ...(typeof metadata.backendAPIBaseURL === 'string' && metadata.backendAPIBaseURL.trim() ? { backendAPIBaseURL: metadata.backendAPIBaseURL.trim() } : {}),
  }
}
