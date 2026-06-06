import type {
  ElectronMovScriptWorkspaceFileReadResult,
  ElectronMovScriptWorkspaceFilesInput,
  ElectronMovScriptWorkspaceRootResult,
} from '@/shared/contracts/electronApi'
import type { SemanticEntityPayload } from '@/shared/infrastructure/api/semanticEntities'
import { mergeMetadataJSON, metadataObject, parseMetadataJSON } from '@/features/content/domain/contentUnitPlanningMetadata'

const CONTENT_UNIT_WORKSPACE_SCHEMA = 'movscript.content_unit_workspace.v1'

export type ContentUnitWorkspaceEditRecord = {
  ID: number
  client_id?: unknown
  project_id?: unknown
  production_id?: unknown
  segment_id?: unknown
  scene_moment_id?: unknown
  script_block_id?: unknown
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
}

export type ContentUnitWorkspaceSceneMomentRecord = {
  ID: number
  production_id?: unknown
  segment_id?: unknown
  script_block_id?: unknown
}

export interface ContentUnitWorkspaceFilesAPI {
  root(input?: { workspaceDir?: string }): Promise<ElectronMovScriptWorkspaceRootResult>
  write(input: ElectronMovScriptWorkspaceFilesInput & { content: string }): Promise<ElectronMovScriptWorkspaceFileReadResult>
}

export function requireContentUnitWorkspaceAPI(): ContentUnitWorkspaceFilesAPI {
  const api = window.api
  if (!api?.getMovScriptWorkspaceRoot || !api.writeMovScriptWorkspaceFile) {
    throw new Error('当前窗口没有 MovScript 工作区文件能力')
  }
  return {
    root: api.getMovScriptWorkspaceRoot,
    write: api.writeMovScriptWorkspaceFile,
  }
}

export async function saveContentUnitWorkspaceEdit(
  projectId: number,
  unit: ContentUnitWorkspaceEditRecord,
  payload: SemanticEntityPayload,
  options: { keyframes?: ContentUnitWorkspaceKeyframeRecord[] } = {},
): Promise<ContentUnitWorkspaceEditRecord> {
  const api = requireContentUnitWorkspaceAPI()
  const root = await api.root()
  const path = contentUnitWorkspaceFilePath(root.manifest.activeUserId ?? 'local', projectId, unit)
  const next = contentUnitRecordFromPayload(unit, payload)
  await api.write({
    path,
    content: `${JSON.stringify(contentUnitWorkspaceEnvelope(next, options), null, 2)}\n`,
  })
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
  const api = requireContentUnitWorkspaceAPI()
  const root = await api.root()
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
  const units = [...input.units, nextUnit].sort((left, right) => (positiveNumber(left.order) ?? left.ID) - (positiveNumber(right.order) ?? right.ID))
  await api.write({
    path: contentUnitsWorkspaceFilePath(root.manifest.activeUserId ?? 'local', projectId, { production_id: productionId, scene_moment_id: input.moment.ID }),
    content: `${JSON.stringify(contentUnitsWorkspaceEnvelope({
      productionId,
      sceneMomentId: input.moment.ID,
      segmentId: positiveNumber(input.segment?.ID),
      units,
    }), null, 2)}\n`,
  })
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
  const api = requireContentUnitWorkspaceAPI()
  const root = await api.root()
  const path = contentUnitWorkspaceFilePath(root.manifest.activeUserId ?? 'local', projectId, unit)
  await api.write({
    path,
    content: `${JSON.stringify(contentUnitWorkspaceEnvelope(unit, options), null, 2)}\n`,
  })
}

export function contentUnitWorkspaceFilePath(
  _userId: string | number,
  projectId: string | number,
  unit: Pick<ContentUnitWorkspaceEditRecord, 'ID' | 'production_id' | 'scene_moment_id'>,
): string {
  const productionId = positiveNumber(unit.production_id)
  const sceneMomentId = positiveNumber(unit.scene_moment_id)
  if (!productionId) throw new Error('当前制作项未绑定制作，无法写入工作区')
  if (!sceneMomentId) throw new Error('当前制作项未绑定情节，无法写入工作区')
  return [
    'edit',
    'productions',
    `production_${String(productionId)}`,
    'content_units',
    `content_unit_${String(unit.ID)}.json`,
  ].join('/')
}

export function contentUnitsWorkspaceFilePath(
  _userId: string | number,
  projectId: string | number,
  input: { production_id?: unknown; scene_moment_id?: unknown },
): string {
  const productionId = positiveNumber(input.production_id)
  const sceneMomentId = positiveNumber(input.scene_moment_id)
  if (!productionId) throw new Error('当前情节未绑定制作，无法写入工作区')
  if (!sceneMomentId) throw new Error('当前情节缺少 ID，无法写入工作区')
  return [
    'edit',
    'productions',
    `production_${String(productionId)}`,
    'content_units',
    `content_units_${String(sceneMomentId)}.json`,
  ].join('/')
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

function contentUnitWorkspaceEnvelope(
  unit: ContentUnitWorkspaceEditRecord,
  options: { keyframes?: ContentUnitWorkspaceKeyframeRecord[] } = {},
): Record<string, unknown> {
  const metadata = parseMetadataJSON(unit.metadata_json)
  return {
    schema: CONTENT_UNIT_WORKSPACE_SCHEMA,
    scope: 'content_unit_workspace',
    productionId: positiveNumber(unit.production_id) ?? 0,
    ...(positiveNumber(unit.segment_id) ? { segmentId: positiveNumber(unit.segment_id) } : {}),
    ...(positiveNumber(unit.scene_moment_id) ? { sceneMomentId: positiveNumber(unit.scene_moment_id) } : {}),
    contentUnitId: unit.ID,
    workspace: {
      units: [pruneUndefined({
        id: unit.ID,
        title: stringValue(unit.title) || '未命名制作项',
        kind: stringValue(unit.kind) || 'shot',
        order: positiveNumber(unit.order),
        duration_sec: numberOrNull(unit.duration_sec),
        description: stringValue(unit.description) || '',
        prompt: stringValue(unit.prompt) || '',
        shot: pruneUndefined({
          shot_size: stringValue(unit.shot_size) || '',
          camera_angle: stringValue(unit.camera_angle) || '',
          camera_motion: stringValue(unit.camera_motion) || '',
        }),
        visual_taskGraph: metadataObject(metadata.visual_taskGraph),
        storyboard_brief: metadataObject(metadata.storyboard_brief),
        timing: metadataObject(metadata.timing),
        ...(options.keyframes ? { keyframes: options.keyframes.map(contentUnitKeyframeNode) } : {}),
        status: stringValue(unit.status) || 'workspace',
        ...('__delete' in unit ? { __delete: unit.__delete === true } : {}),
      })],
    },
    summary: '',
  }
}

function contentUnitsWorkspaceEnvelope(input: {
  productionId: number
  sceneMomentId: number
  segmentId?: number
  units: ContentUnitWorkspaceEditRecord[]
}): Record<string, unknown> {
  return {
    schema: CONTENT_UNIT_WORKSPACE_SCHEMA,
    scope: 'content_unit_workspace',
    productionId: input.productionId,
    ...(input.segmentId ? { segmentId: input.segmentId } : {}),
    sceneMomentId: input.sceneMomentId,
    workspace: {
      units: input.units.map((unit) => contentUnitNode(unit)),
    },
    summary: '',
  }
}

function contentUnitNode(unit: ContentUnitWorkspaceEditRecord): Record<string, unknown> {
  const metadata = parseMetadataJSON(unit.metadata_json)
  return pruneUndefined({
    ...(positiveNumber(unit.ID) ? { id: unit.ID } : {}),
    ...(stringValue(unit.client_id) ? { client_id: stringValue(unit.client_id) } : {}),
    title: stringValue(unit.title) || '未命名制作项',
    kind: stringValue(unit.kind) || 'shot',
    order: positiveNumber(unit.order),
    duration_sec: numberOrNull(unit.duration_sec),
    description: stringValue(unit.description) || '',
    prompt: stringValue(unit.prompt) || '',
    shot: pruneUndefined({
      shot_size: stringValue(unit.shot_size) || '',
      camera_angle: stringValue(unit.camera_angle) || '',
      camera_motion: stringValue(unit.camera_motion) || '',
    }),
    visual_taskGraph: metadataObject(metadata.visual_taskGraph),
    storyboard_brief: metadataObject(metadata.storyboard_brief),
    timing: metadataObject(metadata.timing),
    status: stringValue(unit.status) || 'workspace',
    ...('__delete' in unit ? { __delete: unit.__delete === true } : {}),
  })
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

function contentUnitKeyframeNode(keyframe: ContentUnitWorkspaceKeyframeRecord): Record<string, unknown> {
  const metadata = parseMetadataJSON(keyframe.metadata_json)
  return pruneUndefined({
    ...(positiveNumber(keyframe.ID) ? { id: keyframe.ID } : {}),
    ...(stringValue(keyframe.client_id) ? { client_id: stringValue(keyframe.client_id) } : {}),
    title: stringValue(keyframe.title) || '关键帧',
    description: stringValue(keyframe.description) || '',
    prompt: stringValue(keyframe.prompt) || '',
    order: positiveNumber(keyframe.order),
    status: stringValue(keyframe.status) || 'workspace',
    ...(metadata.frame_role ? { frame_role: metadata.frame_role } : {}),
    ...('__delete' in keyframe ? { __delete: (keyframe as { __delete?: boolean }).__delete } : {}),
  })
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

function numberOrNull(value: unknown): number | null {
  const next = Number(value)
  return Number.isFinite(next) && next > 0 ? next : null
}

function normalizedSeconds(value: unknown): number {
  const next = Number(value)
  return Number.isFinite(next) && next > 0 ? Math.round(next * 10) / 10 : 0
}
