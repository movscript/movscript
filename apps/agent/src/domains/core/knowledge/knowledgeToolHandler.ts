import {
  buildRetrievedContextStore,
  countRetrievedContextChars,
  selectRetrievedContext,
  uniqueRetrievedContextRefs,
} from '../../../contextManager/retrievedContextStore.js'
import { isJSONRecord } from '../../../jsonValue.js'
import type { RuntimeToolHandler } from '../../../ports/runtime/runtimeToolHandlerPort.js'
import type { AgentRun, JSONValue } from '../../../state/types.js'

export function createCoreKnowledgeToolHandler(): RuntimeToolHandler {
  return {
    toolNames: ['knowledge_search', 'knowledge_get'],
    execute({ call, args, run, knowledgeManager }) {
      if (call.name === 'knowledge_search') {
        if (!knowledgeManager) return { result: { results: [] } as unknown as JSONValue }
        return { result: knowledgeManager.search(args) as unknown as JSONValue }
      }

      if (call.name === 'knowledge_get') {
        if (!knowledgeManager) throw new Error('knowledge manager unavailable')
        const budget = remainingKnowledgeBudget(run, stringField(args.id))
        if (budget.remainingChunks <= 0) {
          throw new Error(`knowledge chunk budget exceeded for this run (maxKnowledgeChunksPerRun=${budget.maxChunks})`)
        }
        if (budget.remainingChars <= 0) {
          throw new Error(`knowledge character budget exceeded for this run (maxKnowledgeCharsPerRun=${budget.maxChars})`)
        }
        return { result: knowledgeManager.get(args, { maxChars: budget.remainingChars }) }
      }

      return undefined
    },
  }
}

function remainingKnowledgeBudget(run: AgentRun, requestedId?: string): {
  maxChars: number
  maxChunks: number
  remainingChars: number
  remainingChunks: number
} {
  const metadata = isJSONRecord(run.metadata) ? run.metadata : undefined
  const limits = isJSONRecord(metadata?.limits) ? metadata.limits : {}
  const maxChars = positiveInteger(limits.maxKnowledgeCharsPerRun) ?? 8000
  const maxChunks = positiveInteger(limits.maxKnowledgeChunksPerRun) ?? 3
  const loadedKnowledge = selectRetrievedContext({
    store: buildRetrievedContextStore(metadata?.contextLedger),
    source: 'knowledge',
    refType: 'knowledge',
    summaryPrefix: 'knowledge_get ',
  })
  const uniqueLoadedChunks = new Set(uniqueRetrievedContextRefs(loadedKnowledge).map((ref) => ref.id))
  const usedChars = countRetrievedContextChars(loadedKnowledge)
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
