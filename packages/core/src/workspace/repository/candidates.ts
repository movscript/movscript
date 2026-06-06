import type { MovScriptWorkspaceFileRepository } from './types.js'

const ASSET_SLOT_SCHEMA = 'movscript.asset_slot.v1'
const KEYFRAME_SCHEMA = 'movscript.keyframe.v1'

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
  entityType: 'asset_slot' | 'keyframe'
  record: Record<string, unknown>
}

export async function createMovScriptWorkspaceAssetSlotCandidate(
  input: MovScriptWorkspaceCandidateWriteInput,
): Promise<MovScriptWorkspaceCandidateWriteResult> {
  const record = buildMovScriptWorkspaceAssetSlotCandidateRecord(input)
  const path = `${normalizeProjectPath(input.projectPath)}/assets/asset_slot_${workspaceCandidateFileKey(record)}.json`
  await input.fileRepository.write({ path, content: serializeWorkspaceRecord(record) })
  return { path, entityType: 'asset_slot', record }
}

export async function createMovScriptWorkspaceKeyframeCandidate(
  input: MovScriptWorkspaceCandidateWriteInput,
): Promise<MovScriptWorkspaceCandidateWriteResult> {
  const record = buildMovScriptWorkspaceKeyframeCandidateRecord(input)
  const productionId = positiveNumber(record.production_id)
  const directory = productionId
    ? `${normalizeProjectPath(input.projectPath)}/productions/production_${productionId}/keyframes`
    : `${normalizeProjectPath(input.projectPath)}/productions/keyframes`
  const path = `${directory}/keyframe_${workspaceCandidateFileKey(record)}.json`
  await input.fileRepository.write({ path, content: serializeWorkspaceRecord(record) })
  return { path, entityType: 'keyframe', record }
}

export function buildMovScriptWorkspaceAssetSlotCandidateRecord(input: {
  projectId: string | number
  payload: Record<string, unknown>
  targetRecord?: Record<string, unknown>
  nonce?: string
}): Record<string, unknown> {
  const parentSlotId = positiveNumber(input.payload.asset_slot_id ?? input.payload.assetSlotId)
  if (!parentSlotId) throw new Error('候选缺少父素材需求')
  const resourceId = positiveNumber(input.payload.resource_id ?? input.payload.resourceId)
  if (!resourceId) throw new Error('resource_id required')
  const clientId = localClientId('asset_slot_candidate', parentSlotId, resourceId, input.nonce)
  const note = stringValue(input.payload.note)
  const sourceType = stringValue(input.payload.source_type ?? input.payload.sourceType) ?? 'manual'
  const sourceId = positiveNumber(input.payload.source_id ?? input.payload.sourceId)
  return pruneUndefined({
    schema: ASSET_SLOT_SCHEMA,
    ID: -stablePositiveHash(clientId),
    id: -stablePositiveHash(clientId),
    client_id: clientId,
    project_id: numericOrString(input.projectId),
    owner_type: 'asset_slot',
    owner_id: parentSlotId,
    kind: stringValue(input.payload.kind) ?? stringValue(input.targetRecord?.kind) ?? 'image',
    name: note ?? `候选素材 #${resourceId}`,
    description: note,
    status: stringValue(input.payload.status) ?? 'candidate',
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
  const clientId = localClientId('keyframe_candidate', targetKeyframeId ?? 'target', resourceId, input.nonce)
  return pruneUndefined({
    ...input.payload,
    schema: KEYFRAME_SCHEMA,
    ID: -stablePositiveHash(clientId),
    id: -stablePositiveHash(clientId),
    client_id: clientId,
    project_id: numericOrString(input.projectId),
    resource_id: resourceId,
    production_id: numberValue(input.payload.production_id ?? input.payload.productionId),
    scene_moment_id: numberValue(input.payload.scene_moment_id ?? input.payload.sceneMomentId),
    content_unit_id: numberValue(input.payload.content_unit_id ?? input.payload.contentUnitId),
    canvas_id: numberValue(input.payload.canvas_id ?? input.payload.canvasId),
    title: stringValue(input.payload.title) ?? `候选画面 #${resourceId}`,
    description: stringValue(input.payload.description) ?? '',
    prompt: stringValue(input.payload.prompt) ?? '',
    order: numberValue(input.payload.order ?? input.payload.sort_order ?? input.payload.sortOrder) ?? 0,
    status: stringValue(input.payload.status) ?? 'candidate',
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

function keyframeCandidateTargetId(payload: Record<string, unknown>): number | undefined {
  const metadata = parseMetadata(payload.metadata_json)
  return positiveNumber(metadata?.target_keyframe_id)
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

function numericOrString(value: string | number): string | number {
  return typeof value === 'number' ? value : numberValue(value) ?? value
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
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
