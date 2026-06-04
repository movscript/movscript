import type { JSONValue } from '../../../shared/protocol/types.js'
import type { ToolCall } from '../../../state/shared/types.js'
import { summarizeContextMutations, type RecordToolResultInContextLedgerAudit } from '../../ledger/core/contextLedger.js'
import type { ContextLedger } from '../../ledger/shared/contextLedgerTypes.js'
import { refKey } from '../../ledger/retrieval/retrievedContextStore.js'
import type { ModelToolResultContext } from '../../tool-result/toolResultContext.js'
import { promptContextEvidenceRefsFromLedger } from '../ledger/promptEvidence.js'
import type { CompactedPromptHistory } from '../hygiene/promptHygiene.js'
import { isRecord } from '../../../shared/json/jsonValue.js'
import { runtimeToolName } from '../../../tools/registry/naming/toolNames.js'

export interface ContextTracePayload {
  title: string
  summary: string
  data: Record<string, JSONValue>
}

export interface BuildReferenceTraceInput {
  call: ToolCall
  result?: JSONValue
  ledger: ContextLedger
}

export interface ReferenceContextTrace {
  title: string
  summary: string
  data: Record<string, JSONValue>
}

export function buildHistoryCompactedTracePayload(history: CompactedPromptHistory): ContextTracePayload | undefined {
  if (history.compactedCount <= 0 && history.filteredCount <= 0) return undefined
  return {
    title: 'Thread history compacted',
    summary: `${history.compactedCount} older message(s) summarized and ${history.filteredCount} runtime failure message(s) filtered before prompt composition.`,
    data: {
      eventType: 'context.history_compacted',
      compactedCount: history.compactedCount,
      retainedCount: history.messages.length,
      inputCount: history.inputCount,
      filteredCount: history.filteredCount,
      summaryChars: history.summaryChars,
      projectionDecisions: history.projectionDecisions as unknown as JSONValue,
    },
  }
}

export function buildToolResultDroppedTracePayload(toolName: string, result: ModelToolResultContext): ContextTracePayload | undefined {
  if (!result.dropped) return undefined
  return {
    title: 'Tool result body summarized',
    summary: `${toolName} result reduced from ${result.originalChars} to ${result.renderedChars} chars before the next model turn.`,
    data: {
      eventType: 'context.item_dropped',
      reason: result.reason ?? null,
      originalChars: result.originalChars,
      renderedChars: result.renderedChars,
      ...(result.resultRef ? {
        resultRef: result.resultRef as unknown as JSONValue,
        resultHash: result.resultRef.hash ?? null,
        refKey: result.resultRef.key,
      } : {}),
    },
  }
}

export function buildLedgerUpdatedTracePayload(ledger: ContextLedger): ContextTracePayload {
  const records = promptContextEvidenceRefsFromLedger(ledger).map((record) => ({
    ...record,
    version: ledger.retrieved.find((item) => refKey(item.ref) === record.key)?.version ?? null,
    hash: record.contentHash,
  }))
  const activeCount = records.filter((record) => record.status === 'active').length
  const amendedCount = records.filter((record) => record.status === 'amended').length
  const deletedCount = records.filter((record) => record.status === 'deleted').length
  const refLimit = 50
  return {
    title: 'Context ledger updated',
    summary: `${activeCount} active ref(s), ${amendedCount} amended, ${deletedCount} deleted.`,
    data: {
      eventType: 'context.ledger_updated',
      retrievedCount: ledger.retrieved.length,
      activeCount,
      amendedCount,
      deletedCount,
      artifactRefCount: ledger.artifactRefs.length,
      mutationSummary: summarizeContextMutations(ledger) as unknown as JSONValue,
      refs: records.slice(-refLimit) as unknown as JSONValue,
      refsTruncated: records.length > refLimit,
    },
  }
}

export function buildLedgerDedupedTracePayload(toolName: string, audit: RecordToolResultInContextLedgerAudit): ContextTracePayload | undefined {
  if (audit.dedupedRecords.length === 0) return undefined
  return {
    title: 'Context item deduped',
    summary: `${audit.dedupedRecords.length} duplicate context item(s) merged for ${toolName}.`,
    data: {
      eventType: 'context.item_deduped',
      incomingCount: audit.incomingCount,
      dedupedCount: audit.dedupedRecords.length,
      records: audit.dedupedRecords.map((record) => ({
        key: record.key,
        type: record.ref.type,
        id: record.ref.id,
        title: record.ref.title ?? record.incomingTitle,
        existingTitle: record.existingTitle,
        existingRetrievedAt: record.existingRetrievedAt,
      })),
    },
  }
}

export function buildReferenceTracePayload(input: BuildReferenceTraceInput): ReferenceContextTrace | undefined {
  const toolName = runtimeToolName(input.call.name)
  if (toolName !== 'reference_search' && toolName !== 'reference_get') return undefined
  const payload = unwrapResult(input.result)
  if (toolName === 'reference_search') return buildReferenceSearchedTrace(input.call, payload, input.ledger)
  return buildReferenceLoadedTrace(input.call, payload, input.ledger)
}

function buildReferenceSearchedTrace(call: ToolCall, payload: unknown, ledger: ContextLedger): ReferenceContextTrace {
  const record = isRecord(payload) ? payload : {}
  const query = stringField(record.query) ?? stringField(call.args?.query) ?? ''
  const domain = stringField(record.domain) ?? stringField(call.args?.domain) ?? null
  const results = Array.isArray(record.results) ? record.results.filter(isRecord) : []
  const resultIds = new Set(results.flatMap((item) => stringField(item.id) ? [stringField(item.id)!] : []))
  const refs = referenceLedgerRefs(ledger, resultIds)
  return {
    title: 'Reference search recorded',
    summary: `${results.length} reference result(s) for ${query || 'query'}.`,
    data: {
      eventType: 'context.reference_searched',
      query,
      domain,
      resultCount: results.length,
      refs: refs as unknown as JSONValue,
    },
  }
}

function buildReferenceLoadedTrace(call: ToolCall, payload: unknown, ledger: ContextLedger): ReferenceContextTrace {
  const record = isRecord(payload) ? payload : {}
  const id = stringField(record.id) ?? stringField(call.args?.id) ?? ''
  const refs = referenceLedgerRefs(ledger, id ? new Set([id]) : undefined)
  const content = stringField(record.content)
  const contentChars = content?.length ?? 0
  const charCount = numberField(record.charCount) ?? contentChars
  return {
    title: 'Reference loaded',
    summary: id ? `Reference ${id} loaded (${charCount} chars).` : 'Reference result loaded.',
    data: {
      eventType: 'context.reference_loaded',
      id,
      title: stringField(record.title) ?? id,
      domain: stringField(record.domain) ?? null,
      truncated: record.truncated === true,
      contentChars,
      charCount,
      refs: refs as unknown as JSONValue,
    },
  }
}

function referenceLedgerRefs(ledger: ContextLedger, ids?: Set<string>): Array<Record<string, JSONValue>> {
  return ledger.retrieved
    .filter((record) => (record.status ?? 'active') === 'active' && record.ref.type === 'reference')
    .filter((record) => !ids || ids.has(record.ref.id))
    .map((record) => ({
      key: refKey(record.ref),
      type: record.ref.type,
      id: record.ref.id,
      title: record.ref.title ?? record.title,
      source: record.source,
      evidence: record.evidence,
      contentHash: record.contentHash ?? record.ref.hash ?? null,
      charCount: record.charCount ?? 0,
      status: record.status ?? 'active',
    }))
}

function unwrapResult(value: JSONValue | undefined): unknown {
  if (!isRecord(value)) return value
  if (value.data !== undefined) return value.data
  const content = value.content
  if (Array.isArray(content)) {
    const first = content[0]
    if (isRecord(first) && typeof first.text === 'string') return parseJSONText(first.text)
  }
  if ('result' in value && isRecord(value.result)) return value.result
  return value
}

function parseJSONText(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}
