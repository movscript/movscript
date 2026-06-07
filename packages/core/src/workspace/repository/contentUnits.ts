import { safeWorkspacePathToken } from '../layout/index.js'
import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptContentUnitWriteInput {
  fileRepository: MovScriptWorkspaceFileRepository
  projectId?: string | number
  unit: Record<string, unknown>
  keyframes?: Array<Record<string, unknown>>
}

export interface MovScriptContentUnitWriteResult {
  contentUnitPath: string
  keyframePaths: string[]
  record: Record<string, unknown>
  keyframes: Array<Record<string, unknown>>
}

export async function upsertMovScriptContentUnit(
  input: MovScriptContentUnitWriteInput,
): Promise<MovScriptContentUnitWriteResult> {
  const contentUnitId = stableEntityId(input.unit.ID ?? input.unit.id ?? input.unit.client_id, 'content_unit')
  const contentUnitPath = movScriptContentUnitPath(input.unit)
  const current = await readOptionalRecord(input.fileRepository, contentUnitPath)
  const record = normalizeContentUnitRecord(input.projectId, input.unit, current, contentUnitId)
  await writeRecord(input.fileRepository, contentUnitPath, record)

  const keyframePaths: string[] = []
  const normalizedKeyframes: Array<Record<string, unknown>> = []
  for (const keyframe of input.keyframes ?? []) {
    const keyframeId = stableEntityId(keyframe.ID ?? keyframe.id ?? keyframe.client_id, 'keyframe')
    const keyframePath = `${contentUnitDirectory(contentUnitId)}/keyframes/${keyframeId}/keyframe.json`
    const currentKeyframe = await readOptionalRecord(input.fileRepository, keyframePath)
    const keyframeRecord = normalizeKeyframeRecord(keyframe, currentKeyframe, keyframeId, contentUnitPath)
    await writeRecord(input.fileRepository, keyframePath, keyframeRecord)
    keyframePaths.push(keyframePath)
    normalizedKeyframes.push(keyframeRecord)
  }

  return { contentUnitPath, keyframePaths, record, keyframes: normalizedKeyframes }
}

export function movScriptContentUnitPath(unit: Record<string, unknown>): string {
  const id = stableEntityId(unit.ID ?? unit.id ?? unit.client_id, 'content_unit')
  return `${contentUnitDirectory(id)}/content_unit.json`
}

export function movScriptContentUnitKeyframePath(input: {
  contentUnitId: string | number
  keyframeId: string | number
}): string {
  const contentUnitId = stableEntityId(input.contentUnitId, 'content_unit')
  const keyframeId = stableEntityId(input.keyframeId, 'keyframe')
  return `${contentUnitDirectory(contentUnitId)}/keyframes/${keyframeId}/keyframe.json`
}

export function movScriptContentUnitsSceneAggregatePath(input: { scene_moment_id?: unknown }): string {
  const sceneMomentId = stableEntityId(input.scene_moment_id, 'scene_moment')
  return `content_units/by_scene_moment/${sceneMomentId}.json`
}

function normalizeContentUnitRecord(
  projectId: string | number | undefined,
  unit: Record<string, unknown>,
  current: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  const metadata = parseMetadata(unit.metadata_json ?? current.metadata_json)
  const productionId = ref(unit.production_id ?? current.production_id, 'production')
  const segmentId = ref(unit.segment_id ?? current.segment_id, 'segment')
  const sceneMomentId = ref(unit.scene_moment_id ?? current.scene_moment_id, 'scene_moment')
  const storyboardId = ref(unit.storyboard_id ?? current.storyboard_id ?? 'main', 'storyboard')
  const sourceContext = sceneMomentId
    ? {
        scene_moment_ref: sceneMomentRef(productionId, segmentId, sceneMomentId),
        storyboard_ref: storyboardRef(productionId, segmentId, sceneMomentId, storyboardId),
      }
    : current.source_context

  return pruneUndefined({
    ...stripWorkspacePrivateFields(current),
    schema: 'movscript.content_unit.v1',
    kind: 'content_unit',
    id,
    project_id: projectId ?? current.project_id,
    production_id: productionId,
    segment_id: segmentId,
    scene_moment_id: sceneMomentId,
    title: stringValue(unit.title ?? current.title) ?? 'Untitled content unit',
    unit_kind: normalizeUnitKind(unit.kind ?? unit.unit_kind ?? current.unit_kind),
    order: finiteNumber(unit.order) ?? finiteNumber(current.order),
    duration_sec: positiveNumberOrNull(unit.duration_sec ?? current.duration_sec),
    description: stringValue(unit.description ?? current.description) ?? '',
    source_context: sourceContext,
    editable_prompt: pruneUndefined({
      ...(isRecord(current.editable_prompt) ? current.editable_prompt : {}),
      prompt: stringValue(unit.prompt ?? current.prompt),
    }),
    shot: pruneUndefined({
      ...(isRecord(current.shot) ? current.shot : {}),
      shot_size: stringValue(unit.shot_size),
      camera_angle: stringValue(unit.camera_angle),
      camera_motion: stringValue(unit.camera_motion),
    }),
    visual_taskGraph: isRecord(metadata.visual_taskGraph) ? metadata.visual_taskGraph : undefined,
    storyboard_brief: isRecord(metadata.storyboard_brief) ? metadata.storyboard_brief : undefined,
    timing: isRecord(metadata.timing) ? metadata.timing : undefined,
    ...(unit.__delete === true ? { __delete: true } : {}),
  })
}

function normalizeKeyframeRecord(
  keyframe: Record<string, unknown>,
  current: Record<string, unknown>,
  id: string,
  contentUnitPath: string,
): Record<string, unknown> {
  const metadata = parseMetadata(keyframe.metadata_json ?? current.metadata_json)
  return pruneUndefined({
    ...stripWorkspacePrivateFields(current),
    schema: 'movscript.keyframe.v1',
    kind: 'keyframe',
    id,
    title: stringValue(keyframe.title ?? current.title) ?? 'Keyframe',
    description: stringValue(keyframe.description ?? current.description) ?? '',
    prompt: stringValue(keyframe.prompt ?? current.prompt) ?? '',
    order: finiteNumber(keyframe.order) ?? finiteNumber(current.order),
    content_unit_ref: contentUnitPath,
    frame_role: stringValue(metadata.frame_role),
    ...(keyframe.__delete === true ? { __delete: true } : {}),
  })
}

function contentUnitDirectory(id: string): string {
  return `content_units/${id}`
}

function sceneMomentRef(
  productionId: string | undefined,
  segmentId: string | undefined,
  sceneMomentId: string,
): string {
  if (productionId && segmentId) return `productions/${productionId}/segments/${segmentId}/scene_moments/${sceneMomentId}`
  return `scene_moments/${sceneMomentId}`
}

function storyboardRef(
  productionId: string | undefined,
  segmentId: string | undefined,
  sceneMomentId: string,
  storyboardId: string | undefined,
): string {
  const id = storyboardId ?? 'storyboard_main'
  return `${sceneMomentRef(productionId, segmentId, sceneMomentId)}/storyboards/${id}`
}

function stableEntityId(value: unknown, prefix: string): string {
  const raw = value === undefined || value === null || String(value).trim() === '' ? 'local' : String(value)
  const normalized = String(raw).startsWith('-') ? `local_${String(raw).replace(/^-+/, '')}` : String(raw)
  const token = safeWorkspacePathToken(normalized)
  return token.startsWith(`${prefix}_`) ? token : `${prefix}_${token}`
}

function ref(value: unknown, prefix: string): string | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined
  return stableEntityId(value, prefix)
}

function normalizeUnitKind(value: unknown): string {
  const kind = stringValue(value)
  if (kind === 'shot' || kind === 'voiceover' || kind === 'dialogue_audio' || kind === 'sound' || kind === 'music_beat' || kind === 'subtitle' || kind === 'caption_card' || kind === 'transition') return kind
  return 'shot'
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

async function readOptionalRecord(fileRepository: MovScriptWorkspaceFileRepository, path: string): Promise<Record<string, unknown>> {
  return fileRepository.read({ path }).then((file) => {
    const parsed = JSON.parse(file.content) as unknown
    return isRecord(parsed) ? parsed : {}
  }).catch(() => ({}))
}

async function writeRecord(
  fileRepository: MovScriptWorkspaceFileRepository,
  path: string,
  record: Record<string, unknown>,
): Promise<void> {
  await fileRepository.write({ path, content: `${JSON.stringify(record, null, 2)}\n` })
}

function stripWorkspacePrivateFields(record: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('__workspace_')) continue
    output[key] = value
  }
  return output
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function finiteNumber(value: unknown): number | undefined {
  const next = Number(value)
  return Number.isFinite(next) ? next : undefined
}

function positiveNumberOrNull(value: unknown): number | null | undefined {
  if (value === null) return null
  const next = Number(value)
  return Number.isFinite(next) && next > 0 ? next : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined && item !== '') output[key] = item
  }
  return output as T
}
