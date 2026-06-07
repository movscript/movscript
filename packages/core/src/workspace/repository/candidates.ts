import {
  appendMovScriptInlineCandidate,
  type MovScriptInlineCandidateTargetKind,
} from './inlineCandidates.js'
import type { MovScriptWorkspaceFileRepository } from './types.js'

const CANDIDATE_SCHEMA = 'movscript.candidate.v1'

export interface MovScriptWorkspaceCandidateWriteInput {
  fileRepository: MovScriptWorkspaceFileRepository
  projectPath: string
  projectId: string | number
  payload: Record<string, unknown>
  targetRecord?: Record<string, unknown>
  nonce?: string
}

export interface MovScriptWorkspaceCandidateWriteResult {
  path: string
  entityType: 'candidate'
  record: Record<string, unknown>
  candidate?: Record<string, unknown>
  targetRecord?: Record<string, unknown>
}

export async function createMovScriptWorkspaceAssetSlotCandidate(
  input: MovScriptWorkspaceCandidateWriteInput,
): Promise<MovScriptWorkspaceCandidateWriteResult> {
  const targetPath = workspacePath(input.targetRecord)
  if (targetPath) {
    const result = await appendMovScriptInlineCandidate({
      fileRepository: input.fileRepository,
      targetPath,
      targetKind: 'asset',
      nonce: input.nonce,
      payload: inlineCandidatePayload(input.payload),
      ...(candidateShouldLock(input.payload) ? { lock: { reason: 'selected' } } : {}),
    })
    return {
      path: result.path,
      entityType: 'candidate',
      record: workspaceCandidateRecordFromInline({
        projectId: input.projectId,
        payload: input.payload,
        targetKind: 'asset',
        targetRecord: result.record,
        candidate: result.candidate,
        path: result.path,
      }),
      candidate: result.candidate,
      targetRecord: result.record,
    }
  }

  const record = buildMovScriptWorkspaceAssetSlotCandidateRecord(input)
  const parentSlotId = positiveNumber(record.asset_slot_id)
  if (!parentSlotId) throw new Error('候选缺少父素材需求')
  const path = `${normalizeProjectPath(input.projectPath)}/assets/asset_slot_${parentSlotId}.candidates/candidate_${workspaceCandidateFileKey(record)}.json`
  await input.fileRepository.write({ path, content: serializeWorkspaceRecord(record) })
  return { path, entityType: 'candidate', record }
}

export async function createMovScriptWorkspaceKeyframeCandidate(
  input: MovScriptWorkspaceCandidateWriteInput,
): Promise<MovScriptWorkspaceCandidateWriteResult> {
  const targetPath = workspacePath(input.targetRecord) ?? stringValue(input.payload.target_path ?? input.payload.targetPath)
  if (targetPath) {
    const result = await appendMovScriptInlineCandidate({
      fileRepository: input.fileRepository,
      targetPath,
      targetKind: 'keyframe',
      nonce: input.nonce,
      payload: inlineCandidatePayload(input.payload),
      ...(candidateShouldLock(input.payload) ? { lock: { reason: 'selected' } } : {}),
    })
    return {
      path: result.path,
      entityType: 'candidate',
      record: workspaceCandidateRecordFromInline({
        projectId: input.projectId,
        payload: input.payload,
        targetKind: 'keyframe',
        targetRecord: result.record,
        candidate: result.candidate,
        path: result.path,
      }),
      candidate: result.candidate,
      targetRecord: result.record,
    }
  }

  const record = buildMovScriptWorkspaceKeyframeCandidateRecord(input)
  const productionId = positiveNumber(record.production_id)
  if (!productionId) throw new Error('候选缺少制作 ID')
  const targetKeyframeId = positiveNumber(record.keyframe_id)
  if (!targetKeyframeId) throw new Error('候选缺少目标关键帧')
  const directory = `${normalizeProjectPath(input.projectPath)}/productions/production_${productionId}/keyframes/keyframe_${targetKeyframeId}.candidates`
  const path = `${directory}/candidate_${workspaceCandidateFileKey(record)}.json`
  await input.fileRepository.write({ path, content: serializeWorkspaceRecord(record) })
  return { path, entityType: 'candidate', record }
}

export function buildMovScriptWorkspaceAssetSlotCandidateRecord(input: {
  projectId: string | number
  payload: Record<string, unknown>
  targetRecord?: Record<string, unknown>
  nonce?: string
}): Record<string, unknown> {
  const parentSlotId = positiveNumber(input.payload.asset_slot_id ?? input.payload.assetSlotId ?? input.targetRecord?.ID ?? input.targetRecord?.id)
  if (!parentSlotId) throw new Error('候选缺少父素材需求')
  const resourceId = positiveNumber(input.payload.resource_id ?? input.payload.resourceId)
  if (!resourceId) throw new Error('resource_id required')
  const clientId = localClientId('asset_slot_candidate', parentSlotId, resourceId, input.nonce)
  const note = stringValue(input.payload.note ?? input.payload.notes)
  const sourceType = stringValue(input.payload.source_type ?? input.payload.sourceType ?? input.payload.source) ?? 'manual'
  const sourceId = positiveNumber(input.payload.source_id ?? input.payload.sourceId)
  return pruneUndefined({
    schema: CANDIDATE_SCHEMA,
    ID: -stablePositiveHash(clientId),
    id: -stablePositiveHash(clientId),
    client_id: clientId,
    project_id: numericOrString(input.projectId),
    target: { type: 'asset_slot', id: parentSlotId },
    asset_slot_id: parentSlotId,
    kind: stringValue(input.payload.kind) ?? stringValue(input.targetRecord?.kind ?? input.targetRecord?.asset_kind) ?? 'image',
    name: note ?? `候选素材 #${resourceId}`,
    description: note,
    priority: 'normal',
    resource_id: resourceId,
    source_type: sourceType,
    ...(sourceId ? { source_id: sourceId } : {}),
    metadata_json: JSON.stringify(pruneUndefined({
      source: 'workspace_asset_slot_candidate',
      asset_slot_id: parentSlotId,
      resource_id: resourceId,
      source_type: sourceType,
      source_id: sourceId,
      score: numberValue(input.payload.score),
      note,
    })),
  })
}

export function buildMovScriptWorkspaceKeyframeCandidateRecord(input: {
  projectId: string | number
  payload: Record<string, unknown>
  nonce?: string
}): Record<string, unknown> {
  const resourceId = positiveNumber(input.payload.resource_id ?? input.payload.resourceId)
  if (!resourceId) throw new Error('resource_id required')
  const targetKeyframeId = keyframeCandidateTargetId(input.payload)
  if (!targetKeyframeId) throw new Error('候选缺少目标关键帧')
  const clientId = localClientId('keyframe_candidate', targetKeyframeId, resourceId, input.nonce)
  return pruneUndefined({
    ...input.payload,
    schema: CANDIDATE_SCHEMA,
    ID: -stablePositiveHash(clientId),
    id: -stablePositiveHash(clientId),
    client_id: clientId,
    project_id: numericOrString(input.projectId),
    target: { type: 'keyframe', id: targetKeyframeId },
    keyframe_id: targetKeyframeId,
    resource_id: resourceId,
    production_id: numberValue(input.payload.production_id ?? input.payload.productionId),
    scene_moment_id: numberValue(input.payload.scene_moment_id ?? input.payload.sceneMomentId),
    content_unit_id: numberValue(input.payload.content_unit_id ?? input.payload.contentUnitId),
    canvas_id: numberValue(input.payload.canvas_id ?? input.payload.canvasId),
    title: stringValue(input.payload.title) ?? `候选画面 #${resourceId}`,
    description: stringValue(input.payload.description) ?? '',
    prompt: stringValue(input.payload.prompt) ?? '',
    order: numberValue(input.payload.order ?? input.payload.sort_order ?? input.payload.sortOrder) ?? 0,
  })
}

export function workspaceCandidateSemanticRecord(
  result: MovScriptWorkspaceCandidateWriteResult,
): Record<string, unknown> {
  return {
    ...result.record,
    __workspace_path: result.path,
    __workspace_entity_type: result.entityType,
  }
}

function inlineCandidatePayload(payload: Record<string, unknown>): {
  id?: string
  resource_id?: string | number
  source?: string
  notes?: string
  metadata?: Record<string, unknown>
} {
  const resourceId = payload.resource_id ?? payload.resourceId
  return pruneUndefined({
    id: stringValue(payload.id ?? payload.client_id ?? payload.clientId),
    resource_id: typeof resourceId === 'string' || typeof resourceId === 'number' ? resourceId : undefined,
    source: stringValue(payload.source ?? payload.source_type ?? payload.sourceType),
    notes: stringValue(payload.notes ?? payload.note ?? payload.description),
    metadata: pruneUndefined({
      source_id: payload.source_id ?? payload.sourceId,
      score: payload.score,
      raw: payload,
    }),
  })
}

function workspaceCandidateRecordFromInline(input: {
  projectId: string | number
  payload: Record<string, unknown>
  targetKind: MovScriptInlineCandidateTargetKind
  targetRecord: Record<string, unknown>
  candidate: Record<string, unknown>
  path: string
}): Record<string, unknown> {
  const targetId = input.targetRecord.ID ?? input.targetRecord.id
  const candidateId = stringValue(input.candidate.id) ?? localClientId(`${input.targetKind}_candidate`, String(targetId ?? 'target'), Number(input.candidate.resource_id) || 0)
  const numericCandidateId = -stablePositiveHash(candidateId)
  return pruneUndefined({
    schema: CANDIDATE_SCHEMA,
    ID: numericCandidateId,
    id: numericCandidateId,
    client_id: candidateId,
    project_id: numericOrString(input.projectId),
    target: { type: input.targetKind, id: targetId },
    asset_slot_id: input.targetKind === 'asset' ? numericId(targetId) : undefined,
    keyframe_id: input.targetKind === 'keyframe' ? numericId(targetId) : undefined,
    resource_id: numericOrStringCandidate(input.candidate.resource_id),
    source_type: input.candidate.source,
    note: input.candidate.notes,
    metadata_json: JSON.stringify(pruneUndefined({
      source: 'workspace_inline_candidate',
      target_path: input.path,
      target_kind: input.targetKind,
      candidate_id: input.candidate.id,
      payload: input.payload,
    })),
  })
}

function keyframeCandidateTargetId(payload: Record<string, unknown>): number | undefined {
  const metadata = parseMetadata(payload.metadata_json)
  return positiveNumber(payload.keyframe_id ?? payload.keyframeId ?? metadata?.target_keyframe_id)
}

function workspacePath(record: Record<string, unknown> | undefined): string | undefined {
  return stringValue(record?.__workspace_path ?? record?.workspace_path ?? record?.path)
}

function parseMetadata(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function serializeWorkspaceRecord(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function workspaceCandidateFileKey(record: Record<string, unknown>): string {
  return safeFileToken(stringValue(record.client_id) ?? String(record.id ?? record.ID ?? Date.now()))
}

function localClientId(prefix: string, targetId: string | number, resourceId: number, nonce?: string): string {
  return `${prefix}_${targetId}_${resourceId}_${nonce ?? randomNonce()}`
}

function randomNonce(): string {
  const random = globalThis.crypto
  if (random && 'randomUUID' in random) return random.randomUUID()
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function normalizeProjectPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.movscript\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
}

function safeFileToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_')
}

function positiveNumber(value: unknown): number | undefined {
  const number = numberValue(value)
  return number !== undefined && number > 0 ? number : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const number = Number(value)
    if (Number.isFinite(number)) return number
  }
  return undefined
}

function numericId(value: unknown): number | undefined {
  return numberValue(value)
}

function numericOrString(value: string | number): string | number {
  return typeof value === 'number' ? value : numberValue(value) ?? value
}

function numericOrStringCandidate(value: unknown): string | number | undefined {
  if (typeof value === 'number' || typeof value === 'string') return numberValue(value) ?? value
  return undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function candidateShouldLock(payload: Record<string, unknown>): boolean {
  const status = stringValue(payload.status)?.toLowerCase()
  return status === 'selected' || status === 'locked' || status === 'accepted'
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

function stablePositiveHash(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 31) + value.charCodeAt(index)) >>> 0
  }
  return (hash % 2_000_000_000) + 1
}
