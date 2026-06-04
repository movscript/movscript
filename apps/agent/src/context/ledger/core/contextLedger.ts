import { createHash } from 'node:crypto'
import type { JSONValue } from '../../../shared/protocol/types.js'
import { isRecord } from '../../../shared/json/jsonValue.js'
import type { ToolCall } from '../../../state/shared/types.js'
import type { ToolSource } from '../../../ports/tools/toolExecutionSource.js'
import type { ContextLedger, ContextMutation, ContextMutationSummary, ContextRef, RetrievedContextRecord } from '../shared/contextLedgerTypes.js'
import { normalizeContextSource, normalizeEvidenceLevel, sourceBoundaryForContextRef } from '../source/sourceBoundary.js'
import { refKey } from '../retrieval/retrievedContextStore.js'
import { isValidAgentEntityId } from '../../runtime/runtimeContext.js'
import { runtimeToolName } from '../../../tools/registry/naming/toolNames.js'

const MAX_CONTEXT_MUTATIONS = 500

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

export interface ApplyContextMutationsInput extends CreateEmptyContextLedgerInput {
  ledger?: unknown
  mutations: ContextMutation[]
}

export interface AmendContextRecordInput extends CreateEmptyContextLedgerInput {
  ledger?: unknown
  targetKey: string
  record: RetrievedContextRecord
  reason?: string
}

export interface DeleteContextRecordInput extends CreateEmptyContextLedgerInput {
  ledger?: unknown
  targetKey: string
  reason?: string
}

export function recordToolResultInContextLedger(input: RecordToolResultInContextLedgerInput): ContextLedger {
  return recordToolResultInContextLedgerWithAudit(input).ledger
}

export function recordToolResultInContextLedgerWithAudit(input: RecordToolResultInContextLedgerInput): RecordToolResultInContextLedgerAudit {
  const now = input.now ?? new Date().toISOString()
  const ledger = normalizeContextLedger(input.ledger, { ...input, now })
  const resultHash = input.result === undefined ? undefined : stableHash(input.result)
  const refs = previewToolResultContextRefs(input.call, input.result, { fallbackId: now })
  const records = refs.map((ref) => buildRetrievedRecord({
      ref,
      call: input.call,
      result: input.result,
      source: input.source,
      resultHash,
      usedInPrompt: input.usedInPrompt !== false,
      now,
    }))
  const existingByKey = new Map(activeRetrievedRecords(ledger).map((record) => [refKey(record.ref), record]))
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
  const mutationLedger = applyContextMutations({
    ...input,
    now,
    ledger,
    mutations: records.map((record) => ({
      id: makeMutationId('append', refKey(record.ref), now),
      type: 'append',
      record,
      reason: `${input.call.name} result recorded`,
      createdAt: now,
    })),
  })
  const artifactRefs = mergeRefs(mutationLedger.artifactRefs, refs.filter((ref) => ref.type !== 'tool_result'))
  return {
    incomingCount: records.length,
    dedupedRecords,
    ledger: {
      ...mutationLedger,
      activeSkillIds: uniqueSorted(input.activeSkillIds ?? ledger.activeSkillIds),
      visibleToolNames: uniqueSorted(input.visibleToolNames ?? ledger.visibleToolNames),
      artifactRefs,
      updatedAt: now,
    },
  }
}

export function previewToolResultContextRefs(
  call: ToolCall,
  result: JSONValue | undefined,
  options: { fallbackId?: string } = {},
): ContextRef[] {
  const refs = extractContextRefs(call, result)
  if (refs.length > 0) return refs
  const resultHash = result === undefined ? undefined : stableHash(result)
  return [{
    type: 'tool_result',
    id: call.id ?? `${call.name}:${resultHash ?? options.fallbackId ?? 'unknown'}`,
    title: call.name,
    ...(resultHash ? { hash: resultHash } : {}),
  }]
}

export function applyContextMutations(input: ApplyContextMutationsInput): ContextLedger {
  const now = input.now ?? new Date().toISOString()
  const ledger = normalizeContextLedger(input.ledger, { ...input, now })
  const byKey = new Map<string, RetrievedContextRecord>()
  for (const record of ledger.retrieved) {
    byKey.set(refKey(record.ref), record)
  }
  const appliedMutations: ContextMutation[] = []

  for (const mutation of input.mutations) {
    const normalized = normalizeContextMutation(mutation)[0]
    if (!normalized) continue
    appliedMutations.push(normalized)
    if (normalized.type === 'append') {
      const record = withRecordDefaults(normalized.record, normalized.id, normalized.createdAt)
      const key = refKey(record.ref)
      const previous = byKey.get(key)
      byKey.set(key, previous
        ? {
          ...previous,
          ...record,
          status: 'active',
          retrievedAt: previous.retrievedAt,
          updatedAt: normalized.createdAt,
          mutationId: normalized.id,
        }
        : record)
    } else if (normalized.type === 'amend') {
      const previous = byKey.get(normalized.targetKey)
      if (previous) {
        byKey.set(normalized.targetKey, {
          ...previous,
          status: 'amended',
          usedInPrompt: false,
          amendedBy: normalized.id,
          updatedAt: normalized.createdAt,
        })
      }
      const record = withRecordDefaults(normalized.record, normalized.id, normalized.createdAt)
      const nextKey = refKey(record.ref)
      byKey.set(nextKey, {
        ...record,
        status: 'active',
        supersedes: normalized.targetKey,
        updatedAt: normalized.createdAt,
        mutationId: normalized.id,
      })
    } else {
      const previous = byKey.get(normalized.targetKey)
      if (previous) {
        byKey.set(normalized.targetKey, {
          ...previous,
          status: 'deleted',
          usedInPrompt: false,
          deletedBy: normalized.id,
          deletedAt: normalized.createdAt,
          deleteReason: normalized.reason,
          updatedAt: normalized.createdAt,
        })
      }
    }
  }

  const retrieved = Array.from(byKey.values())
  return {
    ...ledger,
    activeSkillIds: uniqueSorted(input.activeSkillIds ?? ledger.activeSkillIds),
    visibleToolNames: uniqueSorted(input.visibleToolNames ?? ledger.visibleToolNames),
    retrieved,
    artifactRefs: activeArtifactRefs(ledger.artifactRefs, retrieved),
    mutations: [...(ledger.mutations ?? []), ...appliedMutations].slice(-MAX_CONTEXT_MUTATIONS),
    updatedAt: now,
  }
}

export function amendContextLedgerRecord(input: AmendContextRecordInput): ContextLedger {
  const now = input.now ?? new Date().toISOString()
  return applyContextMutations({
    ...input,
    now,
    mutations: [{
      id: makeMutationId('amend', input.targetKey, now),
      type: 'amend',
      targetKey: input.targetKey,
      record: input.record,
      ...(input.reason ? { reason: input.reason } : {}),
      createdAt: now,
    }],
  })
}

export function deleteContextLedgerRecord(input: DeleteContextRecordInput): ContextLedger {
  const now = input.now ?? new Date().toISOString()
  return applyContextMutations({
    ...input,
    now,
    mutations: [{
      id: makeMutationId('delete', input.targetKey, now),
      type: 'delete',
      targetKey: input.targetKey,
      ...(input.reason ? { reason: input.reason } : {}),
      createdAt: now,
    }],
  })
}

export function summarizeContextMutations(
  value: ContextLedger | ContextMutation[],
  options: { limit?: number } = {},
): ContextMutationSummary {
  const mutations = Array.isArray(value) ? value : value.mutations ?? []
  const limit = Math.max(1, Math.floor(options.limit ?? 20))
  const appendedContextKeys: string[] = []
  const amendedContextKeys: string[] = []
  const deletedContextKeys: string[] = []
  for (const mutation of mutations) {
    if (mutation.type === 'append') {
      appendedContextKeys.push(refKey(mutation.record.ref))
    } else if (mutation.type === 'amend') {
      amendedContextKeys.push(mutation.targetKey, refKey(mutation.record.ref))
    } else {
      deletedContextKeys.push(mutation.targetKey)
    }
  }
  const latest = mutations.at(-1)
  return {
    schema: 'movscript.context-mutation-summary.v1',
    total: mutations.length,
    appended: mutations.filter((mutation) => mutation.type === 'append').length,
    amended: mutations.filter((mutation) => mutation.type === 'amend').length,
    deleted: mutations.filter((mutation) => mutation.type === 'delete').length,
    affectedContextKeys: uniqueOrdered([...appendedContextKeys, ...amendedContextKeys, ...deletedContextKeys]).slice(-limit),
    appendedContextKeys: uniqueOrdered(appendedContextKeys).slice(-limit),
    amendedContextKeys: uniqueOrdered(amendedContextKeys).slice(-limit),
    deletedContextKeys: uniqueOrdered(deletedContextKeys).slice(-limit),
    ...(latest ? {
      latest: {
        id: latest.id,
        type: latest.type,
        createdAt: latest.createdAt,
        ...(latest.reason ? { reason: latest.reason } : {}),
      },
    } : {}),
  }
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((a, b) => a.localeCompare(b))
}

function uniqueOrdered(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
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
    mutations: Array.isArray(value.mutations) ? value.mutations.flatMap(normalizeContextMutation) : [],
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
    id: `${input.ref.type}:${input.ref.id}`,
    ref: input.ref,
    status: 'active',
    source,
    evidence,
    title: input.ref.title ?? input.ref.id,
    summary: `${input.call.name} result reference (${input.source})`,
    ...(input.resultHash ? { contentHash: input.resultHash } : {}),
    charCount,
    retrievedAt: input.now,
    usedInPrompt: input.usedInPrompt,
    updatedAt: input.now,
  }
}

function retrievedRecordCharCount(ref: ContextRef, call: ToolCall, result: JSONValue | undefined): number {
  const payload = unwrapResult(result)
  if (ref.type === 'reference') {
    if (runtimeToolName(call.name) === 'reference_search') return 0
    const item = findRefPayload(ref, payload)
    return positiveNumberField(item, 'charCount')
      ?? stringLengthField(item, 'content')
      ?? positiveNumberField(payload, 'charCount')
      ?? stringLengthField(payload, 'content')
      ?? 0
  }
  if (ref.type === 'memory') {
    if (call.name === 'core_memory_search') return 0
    const item = findRefPayload(ref, payload)
    return stringLengthField(item, 'content')
      ?? stringLengthField(payload, 'content')
      ?? 0
  }
  if (ref.type === 'workspace') {
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
    for (const key of ['workspace', 'memory', 'reference', 'project', 'production', 'taskGraph', 'job']) {
      const nested = value[key]
      if (isRecord(nested) && refMatchesRecord(ref, nested)) return nested
    }
    for (const key of ['results', 'memories', 'workspaces', 'items']) {
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
    ?? stringField(value.workspaceId)
    ?? stringField(value.workspaceRef)
    ?? stringField(value.workspaceRef)
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
    refs.push(...extractWorkspaceRefs(payload))
    refs.push(...extractMemoryRefs(payload))
    refs.push(...extractReferenceRefs(payload))
    refs.push(...extractPlanRefs(payload))
    refs.push(...extractGenerationRefs(payload))
    refs.push(...extractProjectRefs(call, payload))
  }
  if (refs.length === 0) {
    refs.push(...extractRefsFromArgs(call))
  }
  return mergeRefs([], refs)
}

function extractWorkspaceRefs(payload: Record<string, unknown>): ContextRef[] {
  const workspace = isRecord(payload.workspace) ? payload.workspace : undefined
  const id = stringField(payload.workspaceId)
    ?? stringField(payload.workspaceRef)
    ?? stringField(payload.workspaceRef)
    ?? stringField(workspace?.id)
    ?? (typeof payload.kind === 'string' && typeof payload.id === 'string' ? payload.id : undefined)
  if (!id) return []
  return [{
    type: 'workspace',
    id,
    title: stringField(workspace?.title) ?? stringField(payload.title) ?? id,
    ...(stringField(workspace?.updatedAt) ? { version: stringField(workspace?.updatedAt) } : {}),
    source: 'workspace',
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

function extractReferenceRefs(payload: Record<string, unknown>): ContextRef[] {
  const results = Array.isArray(payload.results) ? payload.results : undefined
  if (results) {
    return results.flatMap((item) => {
      if (!isRecord(item)) return []
      const id = stringField(item.id)
      if (!id) return []
      const metadata = isRecord(item.metadata) ? item.metadata : {}
      const contentHash = stringField(item.contentHash) ?? stringField(metadata.contentHash)
      return [{
        type: 'reference' as const,
        id,
        title: stringField(item.title) ?? id,
        ...(contentHash ? { hash: contentHash } : {}),
        source: 'reference',
      }]
    })
  }
  const id = stringField(payload.id)
  if (!id || !('contentHash' in payload)) return []
  return [{
    type: 'reference',
    id,
    title: stringField(payload.title) ?? id,
    ...(stringField(payload.contentHash) ? { hash: stringField(payload.contentHash) } : {}),
    source: 'reference',
  }]
}

function extractPlanRefs(payload: Record<string, unknown>): ContextRef[] {
  const taskGraph = isRecord(payload.taskGraph) ? payload.taskGraph : payload
  const id = stringField(taskGraph.id) ?? stringField(payload.taskGraphId)
  if (!id || !('tasks' in taskGraph || 'status' in taskGraph || 'taskGraphId' in payload)) return []
  return [{
    type: 'taskGraph',
    id,
    title: stringField(taskGraph.title) ?? id,
    ...(stringField(taskGraph.updatedAt) ? { version: stringField(taskGraph.updatedAt) } : {}),
    source: 'agent_taskGraph',
  }]
}

function extractGenerationRefs(payload: Record<string, unknown>): ContextRef[] {
  const work = isRecord(payload.work) ? payload.work : undefined
  const workResult = isRecord(work?.result) ? work.result : undefined
  const externalHandle = isRecord(work?.externalHandle) ? work.externalHandle : undefined
  const generationPayload = workResult ?? payload
  const job = isRecord(generationPayload.job) ? generationPayload.job : undefined
  const id = numberField(generationPayload.jobId)
    ?? numberField(generationPayload.job_id)
    ?? (externalHandle?.type === 'generation_job' ? numberField(externalHandle.id) : undefined)
    ?? numberField(job?.ID)
    ?? numberField(job?.id)
  if (id === undefined) return []
  const hash = stableHash(payload as JSONValue)
  return [{
    type: 'generation_job',
    id: String(id),
    title: stringField(generationPayload.message) ?? `Generation job #${id}`,
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

function extractRefsFromArgs(call: ToolCall): ContextRef[] {
  const refs: ContextRef[] = []
  const workspaceId = stringField(call.args?.workspaceId) ?? stringField(call.args?.workspace_id) ?? stringField(call.args?.workspaceRef)
  if (workspaceId) refs.push({ type: 'workspace', id: workspaceId, title: workspaceId, source: call.name })
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

function activeRetrievedRecords(ledger: ContextLedger): RetrievedContextRecord[] {
  return ledger.retrieved.filter((record) => (record.status ?? 'active') === 'active')
}

function activeArtifactRefs(existing: ContextRef[], records: RetrievedContextRecord[]): ContextRef[] {
  const activeRefs = records
    .filter((record) => (record.status ?? 'active') === 'active' && record.ref.type !== 'tool_result')
    .map((record) => record.ref)
  const existingWithoutRetrieved = existing.filter((ref) => !records.some((record) => refKey(record.ref) === refKey(ref)))
  return mergeRefs(existingWithoutRetrieved, activeRefs)
}

function withRecordDefaults(record: RetrievedContextRecord, mutationId: string, now: string): RetrievedContextRecord {
  return {
    ...record,
    id: record.id ?? `${record.ref.type}:${record.ref.id}`,
    status: record.status ?? 'active',
    mutationId,
    retrievedAt: record.retrievedAt || now,
    updatedAt: now,
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
    ...(stringField(value.id) ? { id: stringField(value.id) } : {}),
    ...(stringField(value.version) ? { version: stringField(value.version) } : {}),
    ref,
    ...(normalizeRecordStatus(value.status) ? { status: normalizeRecordStatus(value.status) } : {}),
    source,
    evidence,
    title,
    ...(stringField(value.summary) ? { summary: stringField(value.summary) } : {}),
    ...(stringField(value.contentHash) ? { contentHash: stringField(value.contentHash) } : {}),
    ...(typeof value.charCount === 'number' ? { charCount: value.charCount } : {}),
    retrievedAt,
    usedInPrompt: value.usedInPrompt === true,
    ...(stringField(value.reusedFromRunId) ? { reusedFromRunId: stringField(value.reusedFromRunId) } : {}),
    ...(stringField(value.supersedes) ? { supersedes: stringField(value.supersedes) } : {}),
    ...(stringField(value.amendedBy) ? { amendedBy: stringField(value.amendedBy) } : {}),
    ...(stringField(value.deletedBy) ? { deletedBy: stringField(value.deletedBy) } : {}),
    ...(stringField(value.deletedAt) ? { deletedAt: stringField(value.deletedAt) } : {}),
    ...(stringField(value.deleteReason) ? { deleteReason: stringField(value.deleteReason) } : {}),
    ...(stringField(value.mutationId) ? { mutationId: stringField(value.mutationId) } : {}),
    ...(stringField(value.updatedAt) ? { updatedAt: stringField(value.updatedAt) } : {}),
  }]
}

function normalizeContextMutation(value: unknown): ContextMutation[] {
  if (!isRecord(value)) return []
  const id = stringField(value.id)
  const createdAt = stringField(value.createdAt)
  const type = value.type
  if (!id || !createdAt) return []
  if (type === 'append') {
    const record = normalizeRetrievedRecord(value.record)[0]
    if (!record) return []
    return [{
      id,
      type,
      record,
      ...(stringField(value.reason) ? { reason: stringField(value.reason) } : {}),
      createdAt,
    }]
  }
  if (type === 'amend') {
    const targetKey = stringField(value.targetKey)
    const record = normalizeRetrievedRecord(value.record)[0]
    if (!targetKey || !record) return []
    return [{
      id,
      type,
      targetKey,
      record,
      ...(stringField(value.reason) ? { reason: stringField(value.reason) } : {}),
      createdAt,
    }]
  }
  if (type === 'delete') {
    const targetKey = stringField(value.targetKey)
    if (!targetKey) return []
    return [{
      id,
      type,
      targetKey,
      ...(stringField(value.reason) ? { reason: stringField(value.reason) } : {}),
      createdAt,
    }]
  }
  return []
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
  return value === 'reference'
    || value === 'memory'
    || value === 'workspace'
    || value === 'tool_result'
    || value === 'project'
    || value === 'generation_job'
    || value === 'taskGraph'
    ? value
    : undefined
}

function normalizeRecordStatus(value: unknown): RetrievedContextRecord['status'] | undefined {
  return value === 'active' || value === 'amended' || value === 'deleted' || value === 'expired'
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

function makeMutationId(type: string, key: string, now: string): string {
  return `ctx_mut_${type}_${createHash('sha256').update(`${type}:${key}:${now}`).digest('hex').slice(0, 16)}`
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
  return isValidAgentEntityId(candidate) ? candidate : undefined
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}
