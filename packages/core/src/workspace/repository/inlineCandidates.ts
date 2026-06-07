import type { MovScriptWorkspaceFileRepository } from './types.js'

export type MovScriptInlineCandidateTargetKind = 'asset' | 'keyframe' | 'content_unit'

export interface MovScriptInlineCandidatePayload {
  id?: string
  resource_id?: string | number
  resourceId?: string | number
  source?: string
  notes?: string
  metadata?: Record<string, unknown>
}

export interface MovScriptInlineCandidateWriteInput {
  fileRepository: MovScriptWorkspaceFileRepository
  targetPath: string
  targetKind: MovScriptInlineCandidateTargetKind
  payload: MovScriptInlineCandidatePayload
  lock?: boolean | {
    reason?: string
  }
  nonce?: string
}

export interface MovScriptInlineCandidateWriteResult {
  path: string
  targetKind: MovScriptInlineCandidateTargetKind
  candidate: Record<string, unknown>
  record: Record<string, unknown>
}

export async function appendMovScriptInlineCandidate(
  input: MovScriptInlineCandidateWriteInput,
): Promise<MovScriptInlineCandidateWriteResult> {
  const targetPath = normalizeWorkspacePath(input.targetPath)
  const current = await readTargetRecord(input.fileRepository, targetPath)
  validateTargetKind(input.targetKind, current)
  const candidate = buildInlineCandidate(input.payload, input.nonce)
  const candidates = arrayField(current.candidates).filter(isRecord)
  if (candidates.some((item) => String(item.id) === String(candidate.id))) {
    throw new Error(`candidate already exists: ${String(candidate.id)}`)
  }
  const record = {
    ...current,
    candidates: [...candidates, candidate],
    ...(input.lock ? { lock: lockRecord(candidate, input.lock) } : {}),
  }
  await input.fileRepository.write({ path: targetPath, content: serializeWorkspaceRecord(record) })
  return { path: targetPath, targetKind: input.targetKind, candidate, record }
}

export interface MovScriptInlineCandidateLockInput {
  fileRepository: MovScriptWorkspaceFileRepository
  targetPath: string
  targetKind: MovScriptInlineCandidateTargetKind
  candidateId: string
  reason?: string
}

export async function selectMovScriptInlineCandidate(
  input: MovScriptInlineCandidateLockInput,
): Promise<MovScriptInlineCandidateWriteResult> {
  const targetPath = normalizeWorkspacePath(input.targetPath)
  const current = await readTargetRecord(input.fileRepository, targetPath)
  validateTargetKind(input.targetKind, current)
  const candidate = arrayField(current.candidates).filter(isRecord)
    .find((item) => String(item.id) === input.candidateId)
  if (!candidate) throw new Error(`candidate not found: ${input.candidateId}`)
  const record = {
    ...current,
    lock: lockRecord(candidate, { reason: input.reason }),
  }
  await input.fileRepository.write({ path: targetPath, content: serializeWorkspaceRecord(record) })
  return { path: targetPath, targetKind: input.targetKind, candidate, record }
}

export const lockMovScriptInlineCandidate = selectMovScriptInlineCandidate

export interface MovScriptInlineCandidateUpdateInput {
  fileRepository: MovScriptWorkspaceFileRepository
  targetPath?: string
  targetRecord?: Record<string, unknown>
  targetEntity?: {
    record: Record<string, unknown>
    path: string
  }
  targetKind: MovScriptInlineCandidateTargetKind
  candidateId: string
  payload: Partial<MovScriptInlineCandidatePayload>
}

export async function updateMovScriptInlineCandidate(
  input: MovScriptInlineCandidateUpdateInput,
): Promise<MovScriptInlineCandidateWriteResult> {
  const targetPath = normalizeWorkspacePath(input.targetPath ?? input.targetEntity?.path ?? workspacePath(input.targetRecord))
  const current = await readTargetRecord(input.fileRepository, targetPath)
  validateTargetKind(input.targetKind, current)
  const candidates = arrayField(current.candidates).filter(isRecord)
  const candidateIndex = candidates.findIndex((item) => String(item.id) === input.candidateId)
  if (candidateIndex < 0) throw new Error(`candidate not found: ${input.candidateId}`)
  const currentCandidate = candidates[candidateIndex]!
  const candidate = pruneUndefined({
    ...currentCandidate,
    ...(input.payload.resource_id !== undefined || input.payload.resourceId !== undefined ? { resource_id: input.payload.resource_id ?? input.payload.resourceId } : {}),
    ...(input.payload.source !== undefined ? { source: input.payload.source } : {}),
    ...(input.payload.notes !== undefined ? { notes: input.payload.notes } : {}),
    ...(input.payload.metadata !== undefined ? { metadata: input.payload.metadata } : {}),
  })
  const nextCandidates = [...candidates]
  nextCandidates[candidateIndex] = candidate
  const record = {
    ...current,
    candidates: nextCandidates,
  }
  await input.fileRepository.write({ path: targetPath, content: serializeWorkspaceRecord(record) })
  return { path: targetPath, targetKind: input.targetKind, candidate, record }
}

function workspacePath(record: Record<string, unknown> | undefined): string {
  const value = record?.__workspace_path ?? record?.workspace_path ?? record?.path
  if (typeof value === 'string' && value.trim()) return value
  throw new Error('candidate target path is required')
}

export interface MovScriptInlineCandidateUnlockInput {
  fileRepository: MovScriptWorkspaceFileRepository
  targetPath: string
  targetKind: MovScriptInlineCandidateTargetKind
}

export async function unlockMovScriptInlineCandidate(
  input: MovScriptInlineCandidateUnlockInput,
): Promise<Omit<MovScriptInlineCandidateWriteResult, 'candidate'>> {
  const targetPath = normalizeWorkspacePath(input.targetPath)
  const current = await readTargetRecord(input.fileRepository, targetPath)
  validateTargetKind(input.targetKind, current)
  const { lock: _lock, ...record } = current
  await input.fileRepository.write({ path: targetPath, content: serializeWorkspaceRecord(record) })
  return { path: targetPath, targetKind: input.targetKind, record }
}

function readTargetRecord(
  fileRepository: MovScriptWorkspaceFileRepository,
  targetPath: string,
): Promise<Record<string, unknown>> {
  return fileRepository.read({ path: targetPath }).then((file) => {
    const parsed = JSON.parse(file.content) as unknown
    if (!isRecord(parsed)) throw new Error(`target JSON must be an object: ${targetPath}`)
    return parsed
  })
}

function validateTargetKind(targetKind: MovScriptInlineCandidateTargetKind, record: Record<string, unknown>): void {
  if (record.kind === targetKind) return
  const schemaKind = typeof record.schema === 'string'
    ? record.schema.replace(/^movscript\./, '').replace(/\.v\d+$/, '')
    : undefined
  if (schemaKind === targetKind) return
  throw new Error(`target kind mismatch: expected ${targetKind}`)
}

function buildInlineCandidate(payload: MovScriptInlineCandidatePayload, nonce?: string): Record<string, unknown> {
  const resourceId = payload.resource_id ?? payload.resourceId
  if (resourceId === undefined || resourceId === null || String(resourceId).trim() === '') {
    throw new Error('resource_id required')
  }
  const id = payload.id ?? `candidate_${safeFileToken(String(resourceId))}_${safeFileToken(nonce ?? randomNonce())}`
  return pruneUndefined({
    id,
    resource_id: resourceId,
    source: payload.source ?? 'manual',
    notes: payload.notes,
    metadata: payload.metadata,
  })
}

function lockRecord(candidate: Record<string, unknown>, lock: NonNullable<MovScriptInlineCandidateWriteInput['lock']>): Record<string, unknown> {
  const reason = typeof lock === 'object' ? lock.reason : undefined
  return pruneUndefined({
    candidate_id: candidate.id,
    resource_id: candidate.resource_id,
    reason: reason ?? 'selected',
  })
}

function serializeWorkspaceRecord(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function normalizeWorkspacePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.movscript\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
}

function safeFileToken(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '_')
}

function randomNonce(): string {
  const random = globalThis.crypto
  if (random && 'randomUUID' in random) return random.randomUUID()
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item
  }
  return output as T
}
