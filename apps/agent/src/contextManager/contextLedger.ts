import { createHash } from 'node:crypto'
import type { JSONValue } from '../types.js'
import type { ToolCall } from '../state/types.js'
import type { ToolSource } from '../orchestration/toolExecutor.js'
import type { ContextLedger, ContextRef, ContextSource, EvidenceLevel, RetrievedContextRecord } from './types.js'

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

export function recordToolResultInContextLedger(input: RecordToolResultInContextLedgerInput): ContextLedger {
  const now = input.now ?? new Date().toISOString()
  const ledger = normalizeContextLedger(input.ledger, { ...input, now })
  const resultHash = input.result === undefined ? undefined : stableHash(input.result)
  const charCount = input.result === undefined ? undefined : JSON.stringify(input.result).length
  const refs = extractContextRefs(input.call, input.result)
  const records = refs.length > 0
    ? refs.map((ref) => buildRetrievedRecord({
      ref,
      call: input.call,
      source: input.source,
      resultHash,
      charCount,
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
      source: input.source,
      resultHash,
      charCount,
      usedInPrompt: input.usedInPrompt !== false,
      now,
    })]
  const retrieved = mergeRetrievedRecords(ledger.retrieved, records)
  const artifactRefs = mergeRefs(ledger.artifactRefs, refs.filter((ref) => ref.type !== 'tool_result'))
  return {
    ...ledger,
    activeSkillIds: uniqueSorted(input.activeSkillIds ?? ledger.activeSkillIds),
    visibleToolNames: uniqueSorted(input.visibleToolNames ?? ledger.visibleToolNames),
    retrieved,
    artifactRefs,
    updatedAt: now,
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
  source: ToolSource
  resultHash?: string
  charCount?: number
  usedInPrompt: boolean
  now: string
}): RetrievedContextRecord {
  const { source, evidence } = sourceBoundaryForRef(input.ref, input.source)
  return {
    ref: input.ref,
    source,
    evidence,
    title: input.ref.title ?? input.ref.id,
    summary: `${input.call.name} result reference (${input.source})`,
    ...(input.resultHash ? { contentHash: input.resultHash } : {}),
    ...(input.charCount !== undefined ? { charCount: input.charCount } : {}),
    retrievedAt: input.now,
    usedInPrompt: input.usedInPrompt,
  }
}

function extractContextRefs(call: ToolCall, result: JSONValue | undefined): ContextRef[] {
  const refs: ContextRef[] = []
  const payload = unwrapResult(result)
  if (isRecord(payload)) {
    refs.push(...extractDraftRefs(payload))
    refs.push(...extractMemoryRefs(payload))
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

function sourceBoundaryForRef(ref: ContextRef, toolSource: ToolSource): { source: ContextSource; evidence: EvidenceLevel } {
  if (ref.type === 'draft') return { source: 'draft', evidence: 'draft' }
  if (ref.type === 'memory') return { source: 'memory', evidence: 'summary' }
  if (ref.type === 'project' || ref.type === 'production' || ref.type === 'asset_slot') return { source: toolSource === 'mcp' ? 'mcp' : 'backend', evidence: 'verified' }
  if (ref.type === 'generation_job') return { source: toolSource === 'mcp' ? 'mcp' : 'tool_result', evidence: 'runtime_state' }
  return { source: toolSource === 'mcp' ? 'mcp' : 'tool_result', evidence: toolSource === 'sandbox' ? 'advisory' : 'runtime_state' }
}

function mergeRetrievedRecords(existing: RetrievedContextRecord[], incoming: RetrievedContextRecord[]): RetrievedContextRecord[] {
  const byKey = new Map<string, RetrievedContextRecord>()
  for (const record of [...existing, ...incoming]) {
    const key = refKey(record.ref)
    const previous = byKey.get(key)
    byKey.set(key, previous ? { ...previous, ...record, retrievedAt: previous.retrievedAt } : record)
  }
  return Array.from(byKey.values())
}

function mergeRefs(existing: ContextRef[], incoming: ContextRef[]): ContextRef[] {
  const byKey = new Map<string, ContextRef>()
  for (const ref of [...existing, ...incoming]) {
    byKey.set(refKey(ref), { ...(byKey.get(refKey(ref)) ?? {}), ...ref })
  }
  return Array.from(byKey.values())
}

function refKey(ref: ContextRef): string {
  return `${ref.type}:${ref.id}:${ref.version ?? ref.hash ?? ''}`
}

function normalizeRetrievedRecord(value: unknown): RetrievedContextRecord[] {
  if (!isRecord(value)) return []
  const ref = normalizeContextRef(value.ref)[0]
  const source = normalizeSource(value.source)
  const evidence = normalizeEvidence(value.evidence)
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

function normalizeSource(value: unknown): ContextSource | undefined {
  return value === 'system'
    || value === 'catalog'
    || value === 'profile'
    || value === 'skill'
    || value === 'tool_result'
    || value === 'mcp'
    || value === 'backend'
    || value === 'draft'
    || value === 'memory'
    || value === 'knowledge'
    || value === 'user_input'
    || value === 'assistant_history'
    || value === 'thread_summary'
    ? value
    : undefined
}

function normalizeEvidence(value: unknown): EvidenceLevel | undefined {
  return value === 'verified'
    || value === 'runtime_state'
    || value === 'user_claimed'
    || value === 'draft'
    || value === 'advisory'
    || value === 'summary'
    || value === 'unknown'
    ? value
    : undefined
}

function unwrapResult(value: JSONValue | undefined): unknown {
  if (!isRecord(value)) return value
  if ('result' in value && isRecord(value.result)) return value.result
  return value
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
