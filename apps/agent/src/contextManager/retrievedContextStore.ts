import { isRecord } from '../jsonValue.js'
import type { ContextLedger, ContextRef, ContextSource, RetrievedContextRecord } from './types.js'
import { normalizeContextSource, normalizeEvidenceLevel } from './sourceBoundary.js'

export interface RetrievedContextStore {
  records: RetrievedContextRecord[]
}

export interface SelectRetrievedContextInput {
  store: RetrievedContextStore
  source?: ContextSource
  refType?: ContextRef['type']
  summaryPrefix?: string
  maxChars?: number
  maxRecords?: number
}

export function buildRetrievedContextStore(ledger: unknown): RetrievedContextStore {
  const value = isRecord(ledger) ? ledger : undefined
  const records = Array.isArray(value?.retrieved) ? value.retrieved.flatMap(normalizeRetrievedRecord) : []
  return { records: mergeRetrievedRecords([], records) }
}

export function selectRetrievedContext(input: SelectRetrievedContextInput): RetrievedContextRecord[] {
  const records = input.store.records.filter((record) => {
    if (input.source && record.source !== input.source) return false
    if (input.refType && record.ref.type !== input.refType) return false
    if (input.summaryPrefix && !record.summary?.startsWith(input.summaryPrefix)) return false
    return true
  }).sort((a, b) => b.retrievedAt.localeCompare(a.retrievedAt) || refKey(a.ref).localeCompare(refKey(b.ref)))
  const selected: RetrievedContextRecord[] = []
  let chars = 0
  for (const record of records) {
    const nextChars = record.charCount ?? 0
    if (input.maxRecords !== undefined && selected.length >= input.maxRecords) break
    if (input.maxChars !== undefined && chars + nextChars > input.maxChars) break
    selected.push(record)
    chars += nextChars
  }
  return selected
}

export function countRetrievedContextChars(records: RetrievedContextRecord[]): number {
  return records.reduce((total, record) => total + (record.charCount ?? 0), 0)
}

export function uniqueRetrievedContextRefs(records: RetrievedContextRecord[]): ContextRef[] {
  return records.map((record) => record.ref).filter((ref, index, refs) => refs.findIndex((candidate) => refKey(candidate) === refKey(ref)) === index)
}

export function mergeRetrievedRecords(existing: RetrievedContextRecord[], incoming: RetrievedContextRecord[]): RetrievedContextRecord[] {
  const byKey = new Map<string, RetrievedContextRecord>()
  for (const record of [...existing, ...incoming]) {
    const key = refKey(record.ref)
    const previous = byKey.get(key)
    byKey.set(key, previous ? { ...previous, ...record, retrievedAt: previous.retrievedAt } : record)
  }
  return Array.from(byKey.values())
}

export function refKey(ref: ContextRef): string {
  return `${ref.type}:${ref.id}:${ref.version ?? ref.hash ?? ''}`
}

export function ledgerFromRetrievedStore(ledger: ContextLedger, store: RetrievedContextStore): ContextLedger {
  return {
    ...ledger,
    retrieved: store.records,
  }
}

function normalizeRetrievedRecord(value: unknown): RetrievedContextRecord[] {
  if (!isRecord(value)) return []
  const ref = normalizeContextRef(value.ref)[0]
  const source = normalizeContextSource(value.source)
  const evidence = normalizeEvidenceLevel(value.evidence)
  const title = stringField(value.title)
  const retrievedAt = stringField(value.retrievedAt)
  if (!ref || !source || !evidence || !title || !retrievedAt) return []
  return [{
    ref,
    source,
    evidence,
    title,
    ...(stringField(value.summary) ? { summary: stringField(value.summary) } : {}),
    ...(stringField(value.contentHash) ? { contentHash: stringField(value.contentHash) } : {}),
    ...(typeof value.charCount === 'number' ? { charCount: value.charCount } : {}),
    retrievedAt,
    usedInPrompt: value.usedInPrompt === true,
    ...(stringField(value.reusedFromRunId) ? { reusedFromRunId: stringField(value.reusedFromRunId) } : {}),
  }]
}

function normalizeContextRef(value: unknown): ContextRef[] {
  if (!isRecord(value)) return []
  const type = normalizeRefType(value.type)
  const id = stringField(value.id)
  if (!type || !id) return []
  return [{
    type,
    id,
    ...(stringField(value.title) ? { title: stringField(value.title) } : {}),
    ...(stringField(value.version) ? { version: stringField(value.version) } : {}),
    ...(stringField(value.hash) ? { hash: stringField(value.hash) } : {}),
    ...(stringField(value.source) ? { source: stringField(value.source) } : {}),
  }]
}

function normalizeRefType(value: unknown): ContextRef['type'] | undefined {
  return value === 'knowledge'
    || value === 'memory'
    || value === 'draft'
    || value === 'tool_result'
    || value === 'project'
    || value === 'production'
    || value === 'asset_slot'
    || value === 'generation_job'
    || value === 'plan'
    ? value
    : undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}
