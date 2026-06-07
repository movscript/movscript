import type { SemanticEntityPayload } from '@/shared/infrastructure/api/semanticEntities'
import { createElectronMovScriptWorkspaceService } from '@/shared/infrastructure/workspaceDomainRepository'
import { mergeMetadataJSON, metadataObject, parseMetadataJSON } from '@/features/content/domain/contentUnitPlanningMetadata'

export type ContentUnitWorkspaceEditRecord = {
  ID: number
  client_id?: unknown
  project_id?: unknown
  production_id?: unknown
  segment_id?: unknown
  scene_moment_id?: unknown
  script_block_id?: unknown
  storyboard_id?: unknown
  title?: unknown
  kind?: unknown
  description?: unknown
  prompt?: unknown
  status?: unknown
  order?: unknown
  duration_sec?: unknown
  shot_size?: unknown
  camera_angle?: unknown
  camera_motion?: unknown
  metadata_json?: unknown
  __delete?: unknown
}

export type ContentUnitWorkspaceKeyframeRecord = {
  ID: number
  client_id?: unknown
  content_unit_id?: unknown
  title?: unknown
  description?: unknown
  prompt?: unknown
  order?: unknown
  status?: unknown
  metadata_json?: unknown
  __delete?: unknown
}

export type ContentUnitWorkspaceSceneMomentRecord = {
  ID: number
  production_id?: unknown
  segment_id?: unknown
  script_block_id?: unknown
}

export async function saveContentUnitWorkspaceEdit(
  projectId: number,
  unit: ContentUnitWorkspaceEditRecord,
  payload: SemanticEntityPayload,
  options: { keyframes?: ContentUnitWorkspaceKeyframeRecord[] } = {},
): Promise<ContentUnitWorkspaceEditRecord> {
  const next = contentUnitRecordFromPayload(unit, payload)
  await writeContentUnitWorkspaceEdit(projectId, next, options)
  return next
}

export async function createContentUnitWorkspaceEdit(
  projectId: number,
  input: {
    moment: ContentUnitWorkspaceSceneMomentRecord
    segment?: { ID?: unknown; production_id?: unknown; script_block_id?: unknown } | null
    productionIds: number[]
    selectedUnit?: ContentUnitWorkspaceEditRecord | null
    units: ContentUnitWorkspaceEditRecord[]
    payload: SemanticEntityPayload
  },
): Promise<ContentUnitWorkspaceEditRecord> {
  const productionId = positiveNumber(input.selectedUnit?.production_id)
    ?? positiveNumber(input.moment.production_id)
    ?? positiveNumber(input.segment?.production_id)
    ?? input.productionIds.find((id) => Number.isFinite(id) && id > 0)
  if (!productionId) throw new Error('当前情节未绑定制作，无法写入工作区')
  const now = Date.now()
  const clientId = `content_unit_local_${now}`
  const nextUnit: ContentUnitWorkspaceEditRecord = contentUnitRecordFromPayload({
    ID: -now,
    client_id: clientId,
    project_id: projectId,
    production_id: productionId,
    segment_id: positiveNumber(input.segment?.ID) ?? null,
    scene_moment_id: input.moment.ID,
    script_block_id: positiveNumber(input.selectedUnit?.script_block_id) ?? positiveNumber(input.moment.script_block_id) ?? positiveNumber(input.segment?.script_block_id) ?? null,
    status: 'candidate',
  } as ContentUnitWorkspaceEditRecord, input.payload)
  await writeContentUnitWorkspaceEdit(projectId, nextUnit)
  return nextUnit
}

export async function createContentUnitKeyframeWorkspaceEdit(
  projectId: number,
  unit: ContentUnitWorkspaceEditRecord,
  keyframes: ContentUnitWorkspaceKeyframeRecord[],
  payload: SemanticEntityPayload,
): Promise<ContentUnitWorkspaceKeyframeRecord> {
  const now = Date.now()
  const nextKeyframe = contentUnitKeyframeRecordFromPayload({
    ID: -now,
    client_id: `keyframe_local_${now}`,
    content_unit_id: unit.ID,
    status: 'candidate',
  }, payload)
  const nextKeyframes = [...keyframes, nextKeyframe].sort((left, right) => (positiveNumber(left.order) ?? left.ID) - (positiveNumber(right.order) ?? right.ID))
  await writeContentUnitWorkspaceEdit(projectId, unit, { keyframes: nextKeyframes })
  return nextKeyframe
}

export async function saveContentUnitKeyframeWorkspaceEdit(
  projectId: number,
  unit: ContentUnitWorkspaceEditRecord,
  keyframes: ContentUnitWorkspaceKeyframeRecord[],
  keyframe: ContentUnitWorkspaceKeyframeRecord,
  payload: SemanticEntityPayload,
): Promise<ContentUnitWorkspaceKeyframeRecord> {
  const nextKeyframe = contentUnitKeyframeRecordFromPayload(keyframe, payload)
  const nextKeyframes = keyframes.map((item) => item.ID === keyframe.ID ? nextKeyframe : item)
  await writeContentUnitWorkspaceEdit(projectId, unit, { keyframes: nextKeyframes })
  return nextKeyframe
}

export async function deleteContentUnitWorkspaceEdit(
  projectId: number,
  unit: ContentUnitWorkspaceEditRecord,
  keyframes: ContentUnitWorkspaceKeyframeRecord[] = [],
): Promise<ContentUnitWorkspaceEditRecord> {
  const nextUnit = { ...unit, __delete: true }
  await writeContentUnitWorkspaceEdit(projectId, nextUnit, { keyframes })
  return nextUnit
}

export async function saveContentUnitTimingWorkspaceEdit(
  projectId: number,
  unit: ContentUnitWorkspaceEditRecord,
  keyframes: ContentUnitWorkspaceKeyframeRecord[],
  timing: { localStartSec: number; localDurationSec?: number; order?: number },
): Promise<ContentUnitWorkspaceEditRecord> {
  const currentTiming = metadataObject(parseMetadataJSON(unit.metadata_json).timing)
  const nextTiming = pruneUndefined({
    ...currentTiming,
    local_start_sec: normalizedSeconds(timing.localStartSec),
    local_duration_sec: positiveNumber(timing.localDurationSec),
  })
  const nextUnit = {
    ...unit,
    ...(positiveNumber(timing.order) ? { order: positiveNumber(timing.order) } : {}),
    metadata_json: JSON.stringify(mergeMetadataJSON(unit.metadata_json, { timing: nextTiming })),
  }
  await writeContentUnitWorkspaceEdit(projectId, nextUnit, { keyframes })
  return nextUnit
}

export async function deleteContentUnitKeyframeWorkspaceEdit(
  projectId: number,
  unit: ContentUnitWorkspaceEditRecord,
  keyframes: ContentUnitWorkspaceKeyframeRecord[],
  keyframe: ContentUnitWorkspaceKeyframeRecord,
): Promise<ContentUnitWorkspaceKeyframeRecord> {
  const nextKeyframe = { ...keyframe, __delete: true } as ContentUnitWorkspaceKeyframeRecord & { __delete: true }
  const nextKeyframes = keyframes.map((item) => item.ID === keyframe.ID ? nextKeyframe : item)
  await writeContentUnitWorkspaceEdit(projectId, unit, { keyframes: nextKeyframes })
  return nextKeyframe
}

export async function reorderContentUnitKeyframesWorkspaceEdit(
  projectId: number,
  unit: ContentUnitWorkspaceEditRecord,
  keyframes: ContentUnitWorkspaceKeyframeRecord[],
  patches: Array<{ keyframeId: number; order: number }>,
): Promise<ContentUnitWorkspaceKeyframeRecord[]> {
  const orderById = new Map(patches.map((patch) => [patch.keyframeId, patch.order]))
  const nextKeyframes = keyframes
    .map((keyframe) => orderById.has(keyframe.ID) ? { ...keyframe, order: orderById.get(keyframe.ID) } : keyframe)
    .sort((left, right) => (positiveNumber(left.order) ?? left.ID) - (positiveNumber(right.order) ?? right.ID))
  await writeContentUnitWorkspaceEdit(projectId, unit, { keyframes: nextKeyframes })
  return nextKeyframes
}

export async function reorderContentUnitsWorkspaceEdit(
  projectId: number,
  units: ContentUnitWorkspaceEditRecord[],
  keyframes: ContentUnitWorkspaceKeyframeRecord[],
  patches: Array<{ unitId: number; order: number }>,
): Promise<ContentUnitWorkspaceEditRecord[]> {
  const orderById = new Map(patches.map((patch) => [patch.unitId, patch.order]))
  const nextUnits = units
    .map((unit) => orderById.has(unit.ID) ? { ...unit, order: orderById.get(unit.ID) } : unit)
    .sort((left, right) => (positiveNumber(left.order) ?? left.ID) - (positiveNumber(right.order) ?? right.ID))
  await Promise.all(nextUnits
    .filter((unit) => orderById.has(unit.ID))
    .map((unit) => writeContentUnitWorkspaceEdit(projectId, unit, {
      keyframes: keyframes.filter((keyframe) => Number((keyframe as { content_unit_id?: unknown }).content_unit_id) === unit.ID),
    })))
  return nextUnits
}

async function writeContentUnitWorkspaceEdit(
  projectId: number,
  unit: ContentUnitWorkspaceEditRecord,
  options: { keyframes?: ContentUnitWorkspaceKeyframeRecord[] } = {},
): Promise<void> {
  const service = createElectronMovScriptWorkspaceService({ projectId })
  await service.upsertContentUnit({
    projectId,
    unit: unit as Record<string, unknown>,
    keyframes: options.keyframes?.map((keyframe) => keyframe as Record<string, unknown>),
  })
}

function contentUnitRecordFromPayload(
  unit: ContentUnitWorkspaceEditRecord,
  payload: SemanticEntityPayload,
): ContentUnitWorkspaceEditRecord {
  return {
    ...unit,
    ...payload,
    ID: unit.ID,
    project_id: unit.project_id,
    production_id: unit.production_id,
    scene_moment_id: unit.scene_moment_id,
    segment_id: unit.segment_id,
  }
}

function contentUnitKeyframeRecordFromPayload(
  keyframe: ContentUnitWorkspaceKeyframeRecord,
  payload: SemanticEntityPayload,
): ContentUnitWorkspaceKeyframeRecord {
  return {
    ...keyframe,
    ...payload,
    ID: keyframe.ID,
  }
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function positiveNumber(value: unknown): number | undefined {
  const next = Number(value)
  return Number.isFinite(next) && next > 0 ? next : undefined
}

function normalizedSeconds(value: unknown): number {
  const next = Number(value)
  return Number.isFinite(next) && next > 0 ? Math.round(next * 10) / 10 : 0
}
