import type { MovScriptWorkspaceFileRepository } from './types.js'
import {
  buildMovScriptCandidateSelectionRecord,
  clearMovScriptCandidateSelectionRecord,
  selectMovScriptCandidateRecord,
  type MovScriptDecisionTargetKind,
} from '@movscript/decision'

export type MovScriptInlineCandidateTargetKind = MovScriptDecisionTargetKind

export interface MovScriptInlineCandidatePayload {
  id?: string
  resource_id?: number
  resourceId?: number
  artifact_ref?: string
  artifactRef?: string
  source?: string
  notes?: string
  metadata?: Record<string, unknown>
}

export interface MovScriptInlineCandidateWriteInput {
  fileRepository: MovScriptWorkspaceFileRepository
  targetPath: string
  targetKind: MovScriptInlineCandidateTargetKind
  payload: MovScriptInlineCandidatePayload
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
  const { candidate, record } = selectMovScriptCandidateRecord(current, {
    candidateId: input.candidateId,
    reason: input.reason,
  })
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
    ...(input.payload.resource_id !== undefined || input.payload.resourceId !== undefined ? { resource_id: requiredResourceId(input.payload.resource_id ?? input.payload.resourceId) } : {}),
    ...(input.payload.artifact_ref !== undefined || input.payload.artifactRef !== undefined ? { artifact_ref: stringField(input.payload.artifact_ref ?? input.payload.artifactRef) } : {}),
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
  const record = clearMovScriptCandidateSelectionRecord(current)
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
  const resourceId = requiredResourceId(payload.resource_id ?? payload.resourceId)
  if (resourceId === undefined) {
    throw new Error('resource_id required')
  }
  const id = payload.id ?? `candidate_${safeFileToken(String(resourceId))}_${safeFileToken(nonce ?? randomNonce())}`
  return pruneUndefined({
    id,
    resource_id: resourceId,
    artifact_ref: stringField(payload.artifact_ref ?? payload.artifactRef),
    source: payload.source ?? 'manual',
    notes: payload.notes,
    metadata: payload.metadata,
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

function requiredResourceId(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }
  throw new Error('resource_id must be a positive integer RawResource ID')
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function randomNonce(): string {
  const random = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (random?.randomUUID) return random.randomUUID()
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
