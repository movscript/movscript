import {
  type MovScriptWorkspaceEntityQuery,
  type MovScriptWorkspaceIndexedEntity,
} from '@movscript/workspace'
import type { SemanticEntityKind as MovScriptCoreSemanticEntityKind } from '@movscript/language/domain'
import {
  createElectronMovScriptWorkspaceFileRepository,
  createElectronMovScriptWorkspaceService,
} from '@/shared/infrastructure/workspaceDomainRepository'

const workspaceEntityBySemanticRecord = new WeakMap<Record<string, unknown>, MovScriptWorkspaceIndexedEntity>()

export type SemanticEntityKind =
  | 'scriptVersions'
  | 'scriptBlocks'
  | 'segments'
  | 'productionTextBlocks'
  | 'sceneMoments'
  | 'expressionUnits'
  | 'productions'
  | 'storyboardScripts'
  | 'storyboardVersions'
  | 'contentUnits'
  | 'keyframes'
  | 'previewTimelines'
  | 'previewTimelineItems'
  | 'settings'
  | 'settingStates'
  | 'settingUsages'
  | 'creativeRelationships'
  | 'assetSlots'
  | 'assetSlotCandidates'
  | 'candidateDecisions'
  | 'reviewEvents'
  | 'workItems'
  | 'workReviews'
  | 'workDependencies'
  | 'canvasOutputs'

export type SemanticEntityRecord = Record<string, unknown> & {
  ID: number
  CreatedAt?: string
  UpdatedAt?: string
  project_id?: number
  title?: string
  name?: string
  label?: string
  status?: string
  review_status?: string
  kind?: string
  order?: number
}

export interface SemanticEntityOption {
  value: string
  label: string
}

export interface SemanticEntityField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'boolean'
  required?: boolean
  placeholder?: string
  options?: SemanticEntityOption[]
  createOnly?: boolean
  helper?: string
}

export interface SemanticEntityConfig {
  kind: SemanticEntityKind
  path: string
  label: string
  pluralLabel: string
  description: string
  requiredHint?: string
  iconTone: string
  fields: SemanticEntityField[]
  summaryKeys: string[]
}

export type SemanticEntityPayload = Record<string, string | number | boolean | null>
export type SemanticEntityListParams = Record<string, string | number | boolean | null | undefined>

export interface Project {
  ID: number
  name: string
  description: string
  owner_id: number
  owner?: { ID: number; username: string; system_role: 'super_admin' | 'user' }
  total_episodes?: number
  aspect_ratio?: string
  visual_style?: string
  project_style?: string
  CreatedAt: string
  UpdatedAt: string
}

export interface EntityRelation extends SemanticEntityRecord {
  project_id: number
  source_type: string
  source_id: number
  target_type: string
  target_id: number
  category: string
  type: string
  direction: string
  weight: number
  source: string
}

export interface EntityRelationFilters {
  category?: string
  type?: string
  source_type?: string
  source_id?: number
  target_type?: string
  target_id?: number
  status?: string
}

export interface ScriptBlockUsages {
  segments: SemanticEntityRecord[]
  scene_moments: SemanticEntityRecord[]
  content_units: SemanticEntityRecord[]
}

export interface SourceLockStatus {
  entity_kind: string
  entity_id: number
  locked: boolean
  locked_fields: string[]
  reasons: Array<{ code: string; message: string; entity_kind: string; count: number }>
}

export interface GenerationContext {
  target: {
    type: 'content_unit'
    content_unit: SemanticEntityRecord
  }
  intent: 'keyframe' | 'video'
  production?: SemanticEntityRecord
  segment?: SemanticEntityRecord
  scene_moment?: SemanticEntityRecord
  script_block?: SemanticEntityRecord
  settings: Array<{ usage: SemanticEntityRecord; reference?: SemanticEntityRecord; state?: SemanticEntityRecord }>
  asset_slots: SemanticEntityRecord[]
  keyframes: SemanticEntityRecord[]
  constraints: {
    read_only_entities: string[]
    write_targets: string[]
  }
}

export interface AbandonSegmentResult {
  segment_id: number
  scene_moments_updated: number
  content_units_updated: number
  timeline_items_removed: number
}

export interface AbandonSceneMomentResult {
  scene_moment_id: number
  content_units_updated: number
  timeline_items_removed: number
}

export interface AbandonContentUnitResult {
  content_unit_id: number
  timeline_items_removed: number
}

export const semanticEntityConfigs: SemanticEntityConfig[] = semanticCoreEntityConfigs()

export function semanticEntityConfig(kind: SemanticEntityKind): SemanticEntityConfig {
  return semanticEntityConfigs.find((config) => config.kind === kind) ?? semanticEntityConfigs[0]!
}

export async function listSemanticEntities(
  projectId: number,
  config: SemanticEntityConfig,
  params: SemanticEntityListParams = {},
): Promise<SemanticEntityRecord[]> {
  return await listWorkspaceSemanticEntities(projectId, config.kind, params)
}

export async function getProject(projectId: number): Promise<Project> {
  const project = (await createElectronMovScriptWorkspaceService({ projectId }).queryEntities({ entityKind: 'project', limit: 1 }))[0]
  if (project) return workspaceProjectRecord(project, projectId)
  throw new Error(`MovScript workspace project ${projectId} not found`)
}

export async function createSemanticEntity(
  projectId: number,
  config: SemanticEntityConfig,
  payload: SemanticEntityPayload,
): Promise<SemanticEntityRecord> {
  if (workspaceWritableEntityKind(config.kind)) {
    return writeWorkspaceSemanticEntity(projectId, config.kind, undefined, payload)
  }
  throw unsupportedWorkspaceSemanticWrite(config.kind)
}

export async function updateSemanticEntity(
  projectId: number,
  config: SemanticEntityConfig,
  id: number,
  payload: SemanticEntityPayload,
): Promise<SemanticEntityRecord> {
  if (workspaceWritableEntityKind(config.kind)) {
    const current = (await listWorkspaceSemanticEntities(projectId, config.kind, {})).find((record) => record.ID === id)
    return writeWorkspaceSemanticEntity(projectId, config.kind, current ?? ({ ID: id } as SemanticEntityRecord), payload)
  }
  throw unsupportedWorkspaceSemanticWrite(config.kind)
}

export async function deleteSemanticEntity(
  projectId: number,
  config: SemanticEntityConfig,
  id: number,
): Promise<void> {
  if (workspaceWritableEntityKind(config.kind)) {
    const current = (await listWorkspaceSemanticEntities(projectId, config.kind, {})).find((record) => record.ID === id)
    if (current) {
      await createElectronMovScriptWorkspaceService({ projectId }).deleteEntity({
        entity: workspaceEntityBySemanticRecord.get(current as Record<string, unknown>),
        record: current,
      })
      return
    }
  }
  throw unsupportedWorkspaceSemanticWrite(config.kind)
}

export async function getSourceLockStatus(
  _projectId: number,
  config: SemanticEntityConfig,
  id: number,
): Promise<SourceLockStatus> {
  return {
    entity_kind: config.path,
    entity_id: id,
    locked: false,
    locked_fields: [],
    reasons: [],
  }
}

export async function listEntityRelations(projectId: number, _filters: EntityRelationFilters = {}): Promise<EntityRelation[]> {
  return (await createElectronMovScriptWorkspaceService({ projectId }).queryEntities({
    entityKind: 'creative_relationship' as MovScriptCoreSemanticEntityKind,
  }))
    .map((entity: MovScriptWorkspaceIndexedEntity) => semanticRecordFromWorkspaceEntity(entity, projectId) as unknown as EntityRelation)
}

export async function listScriptBlockUsages(_projectId: number, _scriptBlockId: number): Promise<ScriptBlockUsages> {
  throw unsupportedWorkspaceSemanticRead('listScriptBlockUsages')
}

export async function listScriptBlockUsageMap(_projectId: number, _scriptVersionId: number): Promise<Record<string, ScriptBlockUsages>> {
  throw unsupportedWorkspaceSemanticRead('listScriptBlockUsageMap')
}

export async function buildContentUnitGenerationContext(
  _projectId: number,
  _contentUnitId: number,
  _intent: 'keyframe' | 'video' = 'video',
): Promise<GenerationContext> {
  throw unsupportedWorkspaceSemanticRead('buildContentUnitGenerationContext')
}

export async function abandonSegment(_projectId: number, _id: number): Promise<AbandonSegmentResult> {
  throw unsupportedWorkspaceSemanticRead('abandonSegment')
}

export async function abandonSceneMoment(_projectId: number, _id: number): Promise<AbandonSceneMomentResult> {
  throw unsupportedWorkspaceSemanticRead('abandonSceneMoment')
}

export async function abandonContentUnit(_projectId: number, _id: number): Promise<AbandonContentUnitResult> {
  throw unsupportedWorkspaceSemanticRead('abandonContentUnit')
}

async function listWorkspaceSemanticEntities(
  projectId: number,
  kind: SemanticEntityKind,
  params: SemanticEntityListParams,
): Promise<SemanticEntityRecord[]> {
  const service = createElectronMovScriptWorkspaceService({ projectId })
  if (kind === 'settings') {
    return (await service.querySettings({
      settingId: idParam(params.setting_id ?? params.settingId),
      kind: stringParam(params.kind),
      query: stringParam(params.query),
      limit: numberParam(params.limit),
    })).map((entity: MovScriptWorkspaceIndexedEntity) => semanticRecordFromWorkspaceEntity(entity, projectId))
  }
  if (kind === 'assetSlots') {
    return (await service.queryAssets({
      assetId: idParam(params.asset_slot_id ?? params.assetSlotId),
      settingId: idParam(params.setting_id ?? params.settingId),
      settingStateId: idParam(params.setting_state_id ?? params.settingStateId),
      query: stringParam(params.query),
      limit: numberParam(params.limit),
    })).assets.map((entity: MovScriptWorkspaceIndexedEntity) => semanticRecordFromWorkspaceEntity(entity, projectId))
  }

  const entityKind = semanticEntityType(kind)
  if (!entityKind) return []
  return (await service.queryEntities({
    entityKind,
    ...workspaceEntityQueryFromParams(params),
  })).map((entity: MovScriptWorkspaceIndexedEntity) => semanticRecordFromWorkspaceEntity(entity, projectId))
}

function workspaceEntityQueryFromParams(params: SemanticEntityListParams): Omit<MovScriptWorkspaceEntityQuery, 'entityKind'> {
  return {
    kind: stringParam(params.kind),
    query: stringParam(params.query),
    productionId: idParam(params.production_id ?? params.productionId),
    segmentId: idParam(params.segment_id ?? params.segmentId),
    sceneMomentId: idParam(params.scene_moment_id ?? params.sceneMomentId),
    storyboardId: idParam(params.storyboard_id ?? params.storyboardId),
    contentUnitId: idParam(params.content_unit_id ?? params.contentUnitId),
    settingId: idParam(params.setting_id ?? params.settingId),
    settingStateId: idParam(params.setting_state_id ?? params.settingStateId),
    limit: numberParam(params.limit),
  }
}

function semanticRecordFromWorkspaceEntity(entity: MovScriptWorkspaceIndexedEntity, projectId: number): SemanticEntityRecord {
  const record: Record<string, unknown> = { ...entity.record }
  const numericId = numberParam(record.ID ?? record.id ?? entity.id)
  if (numericId !== undefined) record.ID = numericId
  else if (entity.id !== undefined) record.id = entity.id
  if (record.project_id === undefined) record.project_id = projectId
  record.__workspace_entity_type = entity.entityKind
  const semanticRecord = record as SemanticEntityRecord
  workspaceEntityBySemanticRecord.set(semanticRecord, entity)
  return semanticRecord
}

function semanticRecordFromWorkspaceWrite(
  projectId: number,
  entityKind: MovScriptCoreSemanticEntityKind,
  path: string,
  value: Record<string, unknown>,
): SemanticEntityRecord {
  return semanticRecordFromWorkspaceEntity({
    entityKind,
    record: value,
    path,
    index: 0,
    id: value.id as string | number | undefined,
    schema: stringParam(value.schema),
  }, projectId)
}

function workspaceProjectRecord(entity: MovScriptWorkspaceIndexedEntity, projectId: number): Project {
  const record = semanticRecordFromWorkspaceEntity(entity, projectId)
  return {
    ID: numberParam(record.ID) ?? projectId,
    name: stringParam(record.name) ?? `Project ${projectId}`,
    description: stringParam(record.description) ?? '',
    owner_id: numberParam(record.owner_id) ?? 0,
    total_episodes: numberParam(record.total_episodes),
    aspect_ratio: stringParam(record.aspect_ratio),
    visual_style: stringParam(record.visual_style),
    project_style: stringParam(record.project_style),
    CreatedAt: stringParam(record.CreatedAt ?? record.created_at) ?? '',
    UpdatedAt: stringParam(record.UpdatedAt ?? record.updated_at) ?? '',
  }
}

function semanticEntityType(kind: SemanticEntityKind): MovScriptCoreSemanticEntityKind | undefined {
  return semanticEntityTypeByKind[kind]
}

async function writeWorkspaceSemanticEntity(
  projectId: number,
  kind: WorkspaceWritableSemanticEntityKind,
  record: SemanticEntityRecord | undefined,
  payload: SemanticEntityPayload,
): Promise<SemanticEntityRecord> {
  const service = createElectronMovScriptWorkspaceService({ projectId })
  if (kind === 'settings') {
    const result = await service.upsertSetting({
      entity: record ? workspaceEntityBySemanticRecord.get(record) : undefined,
      record,
      payload,
    })
    return semanticRecordFromWorkspaceWrite(projectId, result.entityKind, result.path, result.record)
  }
  if (kind === 'assetSlots') {
    const result = await service.upsertAsset({
      entity: record ? workspaceEntityBySemanticRecord.get(record) : undefined,
      record,
      payload,
    })
    return semanticRecordFromWorkspaceWrite(projectId, result.entityKind, result.path, result.record)
  }
  if (kind === 'productions') {
    const result = await upsertWorkspaceProduction(projectId, record, payload)
    return semanticRecordFromWorkspaceWrite(projectId, result.entityKind, result.path, result.record)
  }
  if (kind === 'segments') {
    const result = await upsertWorkspaceSegment(projectId, record, payload)
    return semanticRecordFromWorkspaceWrite(projectId, result.entityKind, result.path, result.record)
  }
  if (kind === 'sceneMoments') {
    const result = await upsertWorkspaceSceneMoment(projectId, record, payload)
    return semanticRecordFromWorkspaceWrite(projectId, result.entityKind, result.path, result.record)
  }
  throw unsupportedWorkspaceSemanticWrite(kind)
}

function workspaceWritableEntityKind(kind: SemanticEntityKind): kind is WorkspaceWritableSemanticEntityKind {
  return kind === 'settings' || kind === 'assetSlots' || kind === 'productions' || kind === 'segments' || kind === 'sceneMoments'
}

type WorkspaceWritableSemanticEntityKind =
  | 'settings'
  | 'assetSlots'
  | 'productions'
  | 'segments'
  | 'sceneMoments'

async function upsertWorkspaceProduction(
  projectId: number,
  record: SemanticEntityRecord | undefined,
  payload: SemanticEntityPayload,
): Promise<{ path: string; entityKind: 'production'; record: Record<string, unknown> }> {
  const current = stripWorkspacePrivateFields(record ?? {})
  const id = stableNumericEntityId(current, payload)
  const path = workspaceRecordPath(current) ?? workspaceEntityRecordPath(record) ?? `productions/${id}/production.json`
  const now = new Date().toISOString()
  const title = stringParam(payload.title ?? payload.name ?? current.title ?? current.name) ?? `制作 ${id}`
  const nextRecord = pruneUndefinedRecord({
    ...current,
    ...payload,
    schema: 'movscript.production.v1',
    kind: 'production',
    ID: id,
    id: stringParam(payload.id ?? current.id) ?? String(id),
    project_id: projectId,
    title,
    name: title,
    description: stringParam(payload.description ?? current.description) ?? '',
    script_version_id: numberParam(payload.script_version_id ?? current.script_version_id) ?? null,
    CreatedAt: stringParam(current.CreatedAt ?? current.created_at) ?? now,
    UpdatedAt: now,
  })
  await createElectronMovScriptWorkspaceFileRepository({ projectId }).write({
    path,
    content: `${JSON.stringify(nextRecord, null, 2)}\n`,
  })
  return { path, entityKind: 'production', record: nextRecord }
}

async function upsertWorkspaceSegment(
  projectId: number,
  record: SemanticEntityRecord | undefined,
  payload: SemanticEntityPayload,
): Promise<{ path: string; entityKind: 'segment'; record: Record<string, unknown> }> {
  const current = stripWorkspacePrivateFields(record ?? {})
  const productionId = requiredNumericRef(payload.production_id ?? current.production_id, 'production_id')
  const id = stableNumericEntityId(current, payload)
  const path = workspaceRecordPath(current)
    ?? workspaceEntityRecordPath(record)
    ?? `productions/${productionId}/segments/${id}/segment.json`
  const now = new Date().toISOString()
  const title = stringParam(payload.title ?? current.title) ?? `段落 ${id}`
  const segmentKind = stringParam(payload.segment_kind ?? payload.kind ?? current.segment_kind ?? current.kind)
  const nextRecord = pruneUndefinedRecord({
    ...current,
    ...payload,
    schema: 'movscript.segment.v1',
    kind: segmentKind ?? 'segment',
    entity_kind: 'segment',
    ID: id,
    id: stringParam(payload.id ?? current.id) ?? String(id),
    project_id: projectId,
    production_id: productionId,
    title,
    summary: stringParam(payload.summary ?? current.summary) ?? '',
    order: numberParam(payload.order ?? current.order) ?? null,
    segment_kind: segmentKind ?? 'emotional_function',
    script_block_id: numberParam(payload.script_block_id ?? current.script_block_id) ?? null,
    CreatedAt: stringParam(current.CreatedAt ?? current.created_at) ?? now,
    UpdatedAt: now,
  })
  await createElectronMovScriptWorkspaceFileRepository({ projectId }).write({
    path,
    content: `${JSON.stringify(nextRecord, null, 2)}\n`,
  })
  return { path, entityKind: 'segment', record: nextRecord }
}

async function upsertWorkspaceSceneMoment(
  projectId: number,
  record: SemanticEntityRecord | undefined,
  payload: SemanticEntityPayload,
): Promise<{ path: string; entityKind: 'scene_moment'; record: Record<string, unknown> }> {
  const current = stripWorkspacePrivateFields(record ?? {})
  const productionId = requiredNumericRef(payload.production_id ?? current.production_id, 'production_id')
  const segmentId = requiredNumericRef(payload.segment_id ?? current.segment_id, 'segment_id')
  const id = stableNumericEntityId(current, payload)
  const momentDir = `productions/${productionId}/segments/${segmentId}/scene_moments/${id}`
  const existingPath = workspaceRecordPath(current) ?? workspaceEntityRecordPath(record)
  const path = existingPath
    ?? `${momentDir}/scene_moment.json`
  const now = new Date().toISOString()
  const title = stringParam(payload.title ?? current.title) ?? `情节 ${id}`
  const timeText = stringParam(payload.time_text ?? payload.when ?? current.time_text ?? current.when)
  const locationText = stringParam(payload.location_text ?? payload.where ?? current.location_text ?? current.where)
  const actionText = stringParam(payload.action_text ?? payload.action ?? current.action_text ?? current.action)
  const mood = stringParam(payload.mood ?? payload.emotion ?? current.mood ?? current.emotion)
  const storyboardId = stringParam(current.storyboard_id) ?? 'main'
  const nextRecord = pruneUndefinedRecord({
    ...current,
    ...payload,
    schema: 'movscript.scene_moment.v1',
    kind: 'scene_moment',
    ID: id,
    id: stringParam(payload.id ?? current.id) ?? String(id),
    project_id: projectId,
    production_id: productionId,
    segment_id: segmentId,
    scene_code: stringParam(payload.scene_code ?? current.scene_code),
    title,
    time_text: timeText,
    location_text: locationText,
    condition_text: stringParam(payload.condition_text ?? current.condition_text),
    action_text: actionText,
    mood,
    when: timeText,
    where: locationText,
    action: actionText,
    emotion: mood,
    description: stringParam(payload.description ?? current.description) ?? '',
    order: numberParam(payload.order ?? current.order) ?? null,
    script_block_id: numberParam(payload.script_block_id ?? current.script_block_id) ?? null,
    CreatedAt: stringParam(current.CreatedAt ?? current.created_at) ?? now,
    UpdatedAt: now,
  })
  const repository = createElectronMovScriptWorkspaceFileRepository({ projectId })
  await repository.write({ path, content: `${JSON.stringify(nextRecord, null, 2)}\n` })
  if (!existingPath) {
    await repository.write({
      path: `${momentDir}/storyboards/${storyboardId}/storyboard.json`,
      content: `${JSON.stringify({
        schema: 'movscript.storyboard.v1',
        kind: 'storyboard',
        ID: numericSuffix(storyboardId) ?? storyboardId,
        id: storyboardId,
        title: `${title} storyboard`,
        order: 1,
        setting_refs: [],
      }, null, 2)}\n`,
    })
  }
  return { path, entityKind: 'scene_moment', record: nextRecord }
}

function unsupportedWorkspaceSemanticWrite(kind: SemanticEntityKind): Error {
  return new Error(`MovScript workspace write is not implemented for ${kind}; direct backend semantic writes have been removed`)
}

function unsupportedWorkspaceSemanticRead(operation: string): never {
  throw new Error(`${operation} is not implemented by the Git canonical workspace reader`)
}

function stableNumericEntityId(current: Record<string, unknown>, payload: Record<string, unknown>): number {
  const existing = numberParam(payload.ID ?? payload.id ?? current.ID ?? current.id)
    ?? numericSuffix(payload.id)
    ?? numericSuffix(current.id)
  if (existing && existing > 0) return existing
  return Date.now()
}

function numericSuffix(value: unknown): number | undefined {
  const text = stringParam(value)
  if (!text) return undefined
  const match = text.match(/(\d+)$/)
  return match ? numberParam(match[1]) : undefined
}

function requiredNumericRef(value: unknown, label: string): number {
  const id = numberParam(value) ?? numericSuffix(value)
  if (id === undefined || id <= 0) throw new Error(`${label} is required`)
  return id
}

function workspaceRecordPath(record: Record<string, unknown>): string | undefined {
  return stringParam(record.__workspace_path ?? record.workspace_path ?? record.path)
}

function workspaceEntityRecordPath(record: SemanticEntityRecord | undefined): string | undefined {
  return record ? workspaceEntityBySemanticRecord.get(record as Record<string, unknown>)?.path : undefined
}

function stripWorkspacePrivateFields(record: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('__workspace_')) continue
    output[key] = value
  }
  return output
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pruneUndefinedRecord<T extends Record<string, unknown>>(record: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined && value !== '') output[key] = value
  }
  return output as T
}

const semanticEntityTypeByKind: Partial<Record<SemanticEntityKind, MovScriptCoreSemanticEntityKind>> = {
  scriptVersions: 'script_version',
  scriptBlocks: 'script_block',
  segments: 'segment',
  sceneMoments: 'scene_moment',
  expressionUnits: 'expression_unit',
  productions: 'production',
  storyboardScripts: 'storyboard',
  storyboardVersions: 'storyboard',
  contentUnits: 'content_unit',
  keyframes: 'keyframe',
  settings: 'setting',
  settingStates: 'setting_state',
  assetSlots: 'asset',
}

function semanticCoreEntityConfigs(): SemanticEntityConfig[] {
  return [
    cfg('scriptVersions', 'script-versions', '剧本版本', '导入剧本、brief 或修订文本后的稳定版本。', ['title', 'source_type'], [
      num('script_id', 'Script ID', true, true),
      textCreateOnly('title', '标题', true),
      selectCreateOnly('source_type', '来源类型', ['raw', 'adapted', 'revised', 'ai']),
      areaCreateOnly('content', '正文'),
      areaCreateOnly('raw_source', '原文'),
      areaCreateOnly('summary', '摘要'),
    ]),
    cfg('scriptBlocks', 'script-blocks', '剧本块', '绑定到剧本版本的可引用文本块。', ['kind', 'speaker', 'content'], [
      num('script_id', 'Script ID', true, true),
      num('script_version_id', 'ScriptVersion ID', true, true),
      num('parent_block_id', '父剧本块 ID'),
      num('order', '顺序'),
      select('kind', '类型', ['scene_heading', 'action', 'dialogue', 'transition', 'note']),
      text('speaker', '说话人'),
      area('content', '内容'),
    ]),
    cfg('segments', 'segments', '段落', '制作结构中的叙事段落。', ['title', 'order'], [
      num('production_id', 'Production ID'),
      text('title', '标题', true),
      area('summary', '摘要'),
      num('order', '顺序'),
    ]),
    cfg('productionTextBlocks', 'production-text-blocks', '制作文本块', '制作阶段使用的文本片段。', ['kind', 'content'], [
      num('production_id', 'Production ID'),
      select('kind', '类型', ['brief', 'note', 'dialogue', 'action']),
      area('content', '内容'),
    ]),
    cfg('sceneMoments', 'scene-moments', '情节', '段落下的具体情节。', ['title', 'scene_code'], [
      num('production_id', 'Production ID'),
      num('segment_id', 'Segment ID'),
      text('scene_code', '场景编号'),
      text('title', '标题', true),
      text('time_text', '时间'),
      text('location_text', '地点'),
      area('action_text', '动作'),
      area('description', '描述'),
      num('order', '顺序'),
    ]),
    cfg('expressionUnits', 'expression-units', '表达单元', '情节下逐条编辑的对白、动作、旁白、屏幕文字和镜头描述。', ['kind', 'speaker', 'text'], [
      num('scene_moment_id', 'SceneMoment ID', true),
      selectOptions('kind', '类型', [
        { value: 'dialogue', label: '对白' },
        { value: 'action', label: '动作' },
        { value: 'narration', label: '旁白' },
        { value: 'subtitle', label: '屏幕文字' },
        { value: 'visual', label: '镜头描述' },
      ], true),
      text('speaker', '说话人'),
      area('text', '文本', true),
      area('note', '备注'),
      num('order', '顺序'),
    ]),
    cfg('productions', 'productions', '制作', '项目中的制作单元。', ['name'], [
      text('name', '名称', true),
      area('description', '描述'),
      num('script_version_id', 'ScriptVersion ID'),
    ]),
    cfg('storyboardScripts', 'storyboard-scripts', '分镜脚本', '分镜脚本。', ['title'], genericFields()),
    cfg('storyboardVersions', 'storyboard-versions', '分镜版本', '分镜版本。', ['title'], genericFields()),
    cfg('contentUnits', 'content-units', '制作项', '可生产的内容单元。', ['title', 'kind'], [
      num('production_id', 'Production ID'),
      num('scene_moment_id', 'SceneMoment ID'),
      text('unit_code', '制作项编号'),
      text('title', '标题', true),
      select('kind', '类型', ['shot', 'voiceover', 'dialogue_audio', 'sound', 'music_beat', 'subtitle', 'caption_card', 'transition'], true),
      area('description', '描述'),
      area('prompt', '提示词'),
      num('duration_sec', '时长'),
    ]),
    cfg('keyframes', 'keyframes', '关键帧', '制作项或情节下的关键画面。', ['title'], [
      num('production_id', 'Production ID'),
      num('scene_moment_id', 'SceneMoment ID'),
      num('content_unit_id', 'ContentUnit ID'),
      text('title', '标题', true),
      area('description', '描述'),
      area('prompt', '提示词'),
      num('order', '顺序'),
    ]),
    cfg('previewTimelines', 'preview-timelines', '预览时间线', '预览时间线。', ['title'], genericFields()),
    cfg('previewTimelineItems', 'preview-timeline-items', '预览时间线项', '预览时间线项。', ['owner_type', 'owner_id'], timelineFields('preview_timeline_id', 'PreviewTimeline ID')),
    cfg('settings', 'settings', '设定', '旧兼容名称；新 workspace ontology 中统一为 setting。', ['name', 'kind'], [
      text('name', '名称', true),
      select('kind', '类型', ['character', 'location', 'prop', 'world_rule', 'style_reference', 'organization']),
      area('description', '描述'),
      area('content', '内容'),
    ]),
    cfg('settingStates', 'setting-states', '设定状态', '旧兼容名称；新 workspace ontology 中统一为 setting_state。', ['name'], [
      num('setting_id', 'Setting ID', true),
      text('name', '名称'),
      text('scope_type', '范围类型'),
      num('scope_id', '范围 ID'),
      area('description', '描述'),
    ]),
    cfg('settingUsages', 'setting-usages', '设定引用', '结构对象对设定的引用。', ['owner_type', 'owner_id', 'role'], [
      text('owner_type', '归属类型', true),
      num('owner_id', '归属 ID', true),
      num('setting_id', '设定 ID', true),
      num('setting_state_id', '设定状态 ID'),
      text('role', '角色'),
    ]),
    cfg('creativeRelationships', 'creative-relationships', '设定关系', '设定之间的关系。', ['type'], [
      num('source_setting_id', 'SourceSetting ID', true),
      num('target_setting_id', 'TargetSetting ID', true),
      text('type', '类型'),
      text('label', '标签'),
    ]),
    cfg('assetSlots', 'asset-slots', '素材需求', '需要生成或绑定的素材需求。', ['name', 'kind'], [
      select('owner_type', '归属类型', ['setting', 'segment', 'scene_moment', 'content_unit', 'keyframe', 'setting_state']),
      num('owner_id', '归属 ID'),
      num('production_id', 'Production ID'),
      num('setting_id', '设定 ID'),
      num('setting_state_id', '设定状态 ID'),
      text('name', '名称', true),
      select('kind', '类型', ['image', 'video', 'audio', 'text'], true),
      area('description', '描述'),
      text('slot_key', 'Slot Key'),
      area('prompt_hint', '提示词线索'),
    ]),
    cfg('assetSlotCandidates', 'asset-slot-candidates', '素材候选', '素材需求的候选结果。', ['name', 'resource_id'], [
      num('asset_slot_id', 'AssetSlot ID', true),
      num('candidate_asset_slot_id', 'CandidateAssetSlot ID'),
      num('resource_id', 'Resource ID', false, true, '创建时可直接填资源 ID'),
      text('name', '名称'),
      area('description', '描述'),
    ], '创建时需要填写 asset_slot_id，并提供 candidate_asset_slot_id 或 resource_id；传入 resource_id 时会自动创建候选素材位。'),
    cfg('candidateDecisions', 'candidate-decisions', '候选决策', '候选素材的决策记录。', ['status'], genericFields()),
    cfg('reviewEvents', 'review-events', '审阅事件', '审阅事件。', ['status'], genericFields()),
    cfg('workItems', 'work-items', '任务', '项目任务。', ['title', 'status'], [
      text('title', '标题', true),
      area('description', '描述'),
      text('owner_type', '归属类型'),
      num('owner_id', '归属 ID'),
      select('status', '状态', ['workspace', 'todo', 'doing', 'done', 'blocked', 'archived']),
    ]),
    cfg('workReviews', 'work-reviews', '任务审阅', '任务审阅记录。', ['status'], genericFields()),
    cfg('workDependencies', 'work-dependencies', '任务依赖', '任务依赖。', ['status'], genericFields()),
    cfg('canvasOutputs', 'canvas-outputs', '画布输出', '画布输出。', ['status'], genericFields()),
  ]
}

function cfg(
  kind: SemanticEntityKind,
  path: string,
  label: string,
  description: string,
  summaryKeys: string[],
  fields: SemanticEntityField[],
  requiredHint?: string,
): SemanticEntityConfig {
  return {
    kind,
    path,
    label,
    pluralLabel: label,
    description,
    requiredHint,
    iconTone: 'blue',
    fields,
    summaryKeys,
  }
}

function genericFields(): SemanticEntityField[] {
  return [
    text('title', '标题'),
    text('name', '名称'),
    area('description', '描述'),
  ]
}

function timelineFields(ownerKey: string, ownerLabel: string): SemanticEntityField[] {
  return [
    num(ownerKey, ownerLabel),
    text('owner_type', '归属类型'),
    num('owner_id', '归属 ID'),
    num('start_sec', '开始时间'),
    num('duration_sec', '时长'),
  ]
}

function text(key: string, label: string, required = false): SemanticEntityField {
  return { key, label, type: 'text', required }
}

function textCreateOnly(key: string, label: string, required = false, helper?: string): SemanticEntityField {
  return { key, label, type: 'text', required, createOnly: true, helper }
}

function area(key: string, label: string, required = false): SemanticEntityField {
  return { key, label, type: 'textarea', required }
}

function areaCreateOnly(key: string, label: string, helper?: string): SemanticEntityField {
  return { key, label, type: 'textarea', createOnly: true, helper }
}

function num(key: string, label: string, required = false, createOnly = false, helper?: string): SemanticEntityField {
  return { key, label, type: 'number', required, createOnly, helper }
}

function select(key: string, label: string, values: string[], required = false, helper?: string): SemanticEntityField {
  return { key, label, type: 'select', options: values.map((value) => ({ value, label: value })), required, helper }
}

function selectCreateOnly(key: string, label: string, values: string[], required = false, helper?: string): SemanticEntityField {
  return { key, label, type: 'select', options: values.map((value) => ({ value, label: value })), required, createOnly: true, helper }
}

function selectOptions(key: string, label: string, options: SemanticEntityOption[], required = false): SemanticEntityField {
  return { key, label, type: 'select', options, required }
}

function stringParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberParam(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value)
  return undefined
}

function idParam(value: unknown): string | number | undefined {
  return numberParam(value) ?? stringParam(value)
}
