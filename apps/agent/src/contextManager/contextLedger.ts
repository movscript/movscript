import { createHash } from 'node:crypto'
import type { JSONValue } from '../types.js'
import type { ToolCall } from '../state/types.js'
import type { ToolSource } from '../orchestration/toolExecutor.js'
import type { ContextLedger, ContextRef, RetrievedContextRecord } from './types.js'
import { normalizeContextSource, normalizeEvidenceLevel, sourceBoundaryForContextRef } from './sourceBoundary.js'
import { mergeRetrievedRecords, refKey } from './retrievedContextStore.js'

export interface CreateEmptyContextLedgerInput {
  runId: string
  threadId: string
  catalogSnapshotId: string
  catalogSnapshotVersion?: string | null
  activeSkillIds?: string[]
  visibleToolNames?: string[]
  now?: string
}

export function createEmptyContextLedger(input: CreateEmptyContextLedgerInput): ContextLedger {
  const now = input.now ?? new Date().toISOString()
  return {
    schema: 'movscript.context-ledger.v1',
    runId: input.runId,
    threadId: input.threadId,
    catalogSnapshotId: input.catalogSnapshotId,
    ...(input.catalogSnapshotVersion ? { catalogSnapshotVersion: input.catalogSnapshotVersion } : {}),
    activeSkillIds: uniqueSorted(input.activeSkillIds ?? []),
    visibleToolNames: uniqueSorted(input.visibleToolNames ?? []),
    retrieved: [],
    facts: [],
    artifactRefs: [],
    unresolvedQuestions: [],
    createdAt: now,
    updatedAt: now,
  }
}

export interface RecordToolResultInContextLedgerInput extends CreateEmptyContextLedgerInput {
  ledger?: unknown
  call: ToolCall
  result?: JSONValue
  source: ToolSource
  usedInPrompt?: boolean
}

export interface ContextLedgerDedupedRecord {
  key: string
  ref: ContextRef
  incomingTitle: string
  existingTitle: string
  existingRetrievedAt: string
}

export interface RecordToolResultInContextLedgerAudit {
  ledger: ContextLedger
  incomingCount: number
  dedupedRecords: ContextLedgerDedupedRecord[]
}

export function recordToolResultInContextLedger(input: RecordToolResultInContextLedgerInput): ContextLedger {
  return recordToolResultInContextLedgerWithAudit(input).ledger
}

export function recordToolResultInContextLedgerWithAudit(input: RecordToolResultInContextLedgerInput): RecordToolResultInContextLedgerAudit {
  const now = input.now ?? new Date().toISOString()
  const ledger = normalizeContextLedger(input.ledger, { ...input, now })
  const resultHash = input.result === undefined ? undefined : stableHash(input.result)
  const refs = extractContextRefs(input.call, input.result)
  const records = refs.length > 0
    ? refs.map((ref) => buildRetrievedRecord({
      ref,
      call: input.call,
      result: input.result,
      source: input.source,
      resultHash,
      usedInPrompt: input.usedInPrompt !== false,
      now,
    }))
    : [buildRetrievedRecord({
      ref: {
        type: 'tool_result',
        id: input.call.id ?? `${input.call.name}:${resultHash ?? now}`,
        title: input.call.name,
        ...(resultHash ? { hash: resultHash } : {}),
      },
      call: input.call,
      result: input.result,
      source: input.source,
      resultHash,
      usedInPrompt: input.usedInPrompt !== false,
      now,
    })]
  const existingByKey = new Map(ledger.retrieved.map((record) => [refKey(record.ref), record]))
  const dedupedRecords = records.flatMap((record): ContextLedgerDedupedRecord[] => {
    const key = refKey(record.ref)
    const existing = existingByKey.get(key)
    if (!existing) return []
    return [{
      key,
      ref: record.ref,
      incomingTitle: record.title,
      existingTitle: existing.title,
      existingRetrievedAt: existing.retrievedAt,
    }]
  })
  const retrieved = mergeRetrievedRecords(ledger.retrieved, records)
  const artifactRefs = mergeRefs(ledger.artifactRefs, refs.filter((ref) => ref.type !== 'tool_result'))
  return {
    incomingCount: records.length,
    dedupedRecords,
    ledger: {
      ...ledger,
      activeSkillIds: uniqueSorted(input.activeSkillIds ?? ledger.activeSkillIds),
      visibleToolNames: uniqueSorted(input.visibleToolNames ?? ledger.visibleToolNames),
      retrieved,
      artifactRefs,
      updatedAt: now,
    },
  }
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((a, b) => a.localeCompare(b))
}

function normalizeContextLedger(value: unknown, fallback: CreateEmptyContextLedgerInput): ContextLedger {
  if (!isRecord(value) || value.schema !== 'movscript.context-ledger.v1') return createEmptyContextLedger(fallback)
  return {
    schema: 'movscript.context-ledger.v1',
    runId: typeof value.runId === 'string' ? value.runId : fallback.runId,
    threadId: typeof value.threadId === 'string' ? value.threadId : fallback.threadId,
    catalogSnapshotId: typeof value.catalogSnapshotId === 'string' ? value.catalogSnapshotId : fallback.catalogSnapshotId,
    ...(typeof value.catalogSnapshotVersion === 'string' ? { catalogSnapshotVersion: value.catalogSnapshotVersion } : fallback.catalogSnapshotVersion ? { catalogSnapshotVersion: fallback.catalogSnapshotVersion } : {}),
    activeSkillIds: Array.isArray(value.activeSkillIds) ? uniqueSorted(value.activeSkillIds.filter(isString)) : uniqueSorted(fallback.activeSkillIds ?? []),
    visibleToolNames: Array.isArray(value.visibleToolNames) ? uniqueSorted(value.visibleToolNames.filter(isString)) : uniqueSorted(fallback.visibleToolNames ?? []),
    retrieved: Array.isArray(value.retrieved) ? value.retrieved.flatMap(normalizeRetrievedRecord) : [],
    facts: [],
    artifactRefs: Array.isArray(value.artifactRefs) ? value.artifactRefs.flatMap(normalizeContextRef) : [],
    unresolvedQuestions: [],
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : fallback.now ?? new Date().toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : fallback.now ?? new Date().toISOString(),
  }
}

function buildRetrievedRecord(input: {
  ref: ContextRef
  call: ToolCall
  result?: JSONValue
  source: ToolSource
  resultHash?: string
  usedInPrompt: boolean
  now: string
}): RetrievedContextRecord {
  const { source, evidence } = sourceBoundaryForContextRef(input.ref, input.source)
  const charCount = retrievedRecordCharCount(input.ref, input.call, input.result)
  return {
    ref: input.ref,
    source,
    evidence,
    title: input.ref.title ?? input.ref.id,
    summary: `${input.call.name} result reference (${input.source})`,
    ...(input.resultHash ? { contentHash: input.resultHash } : {}),
    charCount,
    retrievedAt: input.now,
    usedInPrompt: input.usedInPrompt,
  }
}

function retrievedRecordCharCount(ref: ContextRef, call: ToolCall, result: JSONValue | undefined): number {
  const payload = unwrapResult(result)
  if (ref.type === 'knowledge') {
    if (call.name !== 'movscript_get_knowledge') return 0
    const item = findRefPayload(ref, payload)
    return positiveNumberField(item, 'charCount')
      ?? stringLengthField(item, 'content')
      ?? positiveNumberField(payload, 'charCount')
      ?? stringLengthField(payload, 'content')
      ?? 0
  }
  if (ref.type === 'memory') {
    if (call.name === 'movscript_search_memories') return 0
    const item = findRefPayload(ref, payload)
    return stringLengthField(item, 'content')
      ?? stringLengthField(payload, 'content')
      ?? 0
  }
  if (ref.type === 'draft') {
    if (call.name === 'movscript_list_drafts' || call.name === 'movscript_create_draft' || call.name === 'movscript_update_draft') return 0
    const item = findRefPayload(ref, payload)
    return stringLengthField(item, 'content')
      ?? stringLengthField(item, 'body')
      ?? stringLengthField(payload, 'content')
      ?? 0
  }
  if (ref.type === 'tool_result') {
    return result === undefined ? 0 : JSON.stringify(result).length
  }
  return 0
}

function findRefPayload(ref: ContextRef, value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value) && refMatchesRecord(ref, value)) return value
  if (isRecord(value)) {
    for (const key of ['draft', 'memory', 'knowledge', 'project', 'production', 'plan', 'job']) {
      const nested = value[key]
      if (isRecord(nested) && refMatchesRecord(ref, nested)) return nested
    }
    for (const key of ['results', 'memories', 'drafts', 'items']) {
      const nested = value[key]
      if (!Array.isArray(nested)) continue
      const found = nested.find((item) => isRecord(item) && refMatchesRecord(ref, item))
      if (isRecord(found)) return found
    }
  }
  return undefined
}

function refMatchesRecord(ref: ContextRef, value: Record<string, unknown>): boolean {
  const id = stringField(value.id)
    ?? stringField(value.memoryId)
    ?? stringField(value.draftId)
    ?? stringField(value.draftRef)
    ?? stringField(value.proposalRef)
  return id === ref.id
}

function stringLengthField(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined
  const item = value[key]
  return typeof item === 'string' ? item.length : undefined
}

function positiveNumberField(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined
  const item = value[key]
  return typeof item === 'number' && Number.isFinite(item) && item >= 0 ? item : undefined
}

function extractContextRefs(call: ToolCall, result: JSONValue | undefined): ContextRef[] {
  const refs: ContextRef[] = []
  const payload = unwrapResult(result)
  if (isRecord(payload)) {
    refs.push(...extractDraftRefs(payload))
    refs.push(...extractMemoryRefs(payload))
    refs.push(...extractKnowledgeRefs(payload))
    refs.push(...extractPlanRefs(payload))
    refs.push(...extractGenerationRefs(payload))
    refs.push(...extractProjectRefs(call, payload))
    refs.push(...extractProductionRefs(call, payload))
  }
  if (refs.length === 0) {
    refs.push(...extractRefsFromArgs(call))
  }
  return mergeRefs([], refs)
}

function extractDraftRefs(payload: Record<string, unknown>): ContextRef[] {
  const draft = isRecord(payload.draft) ? payload.draft : undefined
  const id = stringField(payload.draftId)
    ?? stringField(payload.draftRef)
    ?? stringField(payload.proposalRef)
    ?? stringField(draft?.id)
    ?? (typeof payload.kind === 'string' && typeof payload.id === 'string' ? payload.id : undefined)
  if (!id) return []
  return [{
    type: 'draft',
    id,
    title: stringField(draft?.title) ?? stringField(payload.title) ?? id,
    ...(stringField(draft?.updatedAt) ? { version: stringField(draft?.updatedAt) } : {}),
    source: 'draft',
  }]
}

function extractMemoryRefs(payload: Record<string, unknown>): ContextRef[] {
  const memories = Array.isArray(payload.memories) ? payload.memories : undefined
  if (memories) {
    return memories.flatMap((item) => {
      if (!isRecord(item)) return []
      const id = stringField(item.id)
      if (!id) return []
      return [{
        type: 'memory' as const,
        id,
        title: stringField(item.title) ?? id,
        ...(stringField(item.updatedAt) ? { version: stringField(item.updatedAt) } : {}),
        source: 'memory',
      }]
    })
  }
  const id = stringField(payload.id) ?? stringField(payload.memoryId)
  if (!id || !('kind' in payload) || !('content' in payload)) return []
  return [{
    type: 'memory',
    id,
    title: stringField(payload.title) ?? id,
    ...(stringField(payload.updatedAt) ? { version: stringField(payload.updatedAt) } : {}),
    source: 'memory',
  }]
}

function extractKnowledgeRefs(payload: Record<string, unknown>): ContextRef[] {
  const results = Array.isArray(payload.results) ? payload.results : undefined
  if (results) {
    return results.flatMap((item) => {
      if (!isRecord(item)) return []
      const id = stringField(item.id)
      if (!id) return []
      return [{
        type: 'knowledge' as const,
        id,
        title: stringField(item.title) ?? id,
        ...(stringField(item.contentHash) ? { hash: stringField(item.contentHash) } : {}),
        source: 'knowledge',
      }]
    })
  }
  const id = stringField(payload.id)
  if (!id || !('collectionId' in payload) || !('contentHash' in payload)) return []
  return [{
    type: 'knowledge',
    id,
    title: stringField(payload.title) ?? id,
    ...(stringField(payload.contentHash) ? { hash: stringField(payload.contentHash) } : {}),
    source: 'knowledge',
  }]
}

function extractPlanRefs(payload: Record<string, unknown>): ContextRef[] {
  const plan = isRecord(payload.plan) ? payload.plan : payload
  const id = stringField(plan.id) ?? stringField(payload.planId)
  if (!id || !('tasks' in plan || 'status' in plan || 'planId' in payload)) return []
  return [{
    type: 'plan',
    id,
    title: stringField(plan.title) ?? id,
    ...(stringField(plan.updatedAt) ? { version: stringField(plan.updatedAt) } : {}),
    source: 'agent_plan',
  }]
}

function extractGenerationRefs(payload: Record<string, unknown>): ContextRef[] {
  const job = isRecord(payload.job) ? payload.job : undefined
  const id = numberField(payload.jobId)
    ?? numberField(payload.job_id)
    ?? numberField(job?.ID)
    ?? numberField(job?.id)
  if (id === undefined) return []
  const hash = stableHash(payload as JSONValue)
  return [{
    type: 'generation_job',
    id: String(id),
    title: stringField(payload.message) ?? `Generation job #${id}`,
    hash,
    source: 'generation',
  }]
}

function extractProjectRefs(call: ToolCall, payload: Record<string, unknown>): ContextRef[] {
  const id = numberField(payload.projectId)
    ?? numberField(payload.project_id)
    ?? numberField(payload.project, 'id')
    ?? numberField(call.args?.projectId)
    ?? numberField(call.args?.project_id)
  if (id === undefined) return []
  return [{
    type: 'project',
    id: String(id),
    title: stringField(payload.project, 'name') ?? `Project #${id}`,
    source: call.name,
  }]
}

function extractProductionRefs(call: ToolCall, payload: Record<string, unknown>): ContextRef[] {
  const id = numberField(payload.productionId)
    ?? numberField(payload.production_id)
    ?? numberField(payload.production, 'id')
    ?? numberField(call.args?.productionId)
    ?? numberField(call.args?.production_id)
  if (id === undefined || !call.name.includes('production')) return []
  return [{
    type: 'production',
    id: String(id),
    title: stringField(payload.production, 'name') ?? `Production #${id}`,
    source: call.name,
  }]
}

function extractRefsFromArgs(call: ToolCall): ContextRef[] {
  const refs: ContextRef[] = []
  const draftId = stringField(call.args?.draftId) ?? stringField(call.args?.draft_id) ?? stringField(call.args?.draftRef)
  if (draftId) refs.push({ type: 'draft', id: draftId, title: draftId, source: call.name })
  const memoryId = stringField(call.args?.memoryId) ?? stringField(call.args?.id)
  if (memoryId && call.name.includes('memory')) refs.push({ type: 'memory', id: memoryId, title: memoryId, source: call.name })
  return refs
}

function mergeRefs(existing: ContextRef[], incoming: ContextRef[]): ContextRef[] {
  const byKey = new Map<string, ContextRef>()
  for (const ref of [...existing, ...incoming]) {
    byKey.set(refKey(ref), { ...(byKey.get(refKey(ref)) ?? {}), ...ref })
  }
  return Array.from(byKey.values())
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

function unwrapResult(value: JSONValue | undefined): unknown {
  if (!isRecord(value)) return value
  if (value.data !== undefined) return value.data
  const content = value.content
  if (Array.isArray(content)) {
    const first = content[0]
    if (isRecord(first) && typeof first.text === 'string') {
      return parseJSONText(first.text)
    }
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

function stableHash(value: JSONValue): string {
  return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`
}

function stringField(value: unknown, key?: string): string | undefined {
  const candidate = key && isRecord(value) ? value[key] : value
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : undefined
}

function numberField(value: unknown, key?: string): number | undefined {
  const candidate = key && isRecord(value) ? value[key] : value
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
