import {
  queryMovScriptWorkspaceSettings,
  queryMovScriptWorkspaceAssetSlots,
  queryMovScriptWorkspaceEntities,
  type MovScriptWorkspaceEntityQuery,
  type MovScriptWorkspaceEntityType,
  type MovScriptWorkspaceIndexedEntity,
} from '@movscript/core/workspace'
import {
  createElectronMovScriptWorkspaceFileRepository,
  loadMovScriptProjectWorkspaceDomainIndex,
  resolveMovScriptWorkspaceProjectPath,
} from '@/shared/infrastructure/workspaceDomainRepository'
import type { ElectronAPI } from '@/shared/contracts/electronApi'

export type SemanticEntityKind =
  | 'scriptVersions'
  | 'scriptBlocks'
  | 'segments'
  | 'productionTextBlocks'
  | 'sceneMoments'
  | 'writingExpressions'
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
  | 'deliveryVersions'
  | 'deliveryTimelineItems'
  | 'exportRecords'
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
  status?: string
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

export interface ApplyWorkbenchWorkspaceResponse {
  project_id: number
  counts: Record<string, number | undefined>
}

export interface ApplyProductionWorkspaceResponse {
  production_id: number
  counts: ApplyProductionWorkspaceCounts
  segments: SemanticEntityRecord[]
  scene_moments: SemanticEntityRecord[]
  content_units: SemanticEntityRecord[]
  asset_slots: SemanticEntityRecord[]
  keyframes: SemanticEntityRecord[]
  writing_expressions: SemanticEntityRecord[]
}

export interface ApplyProductionWorkspaceCounts {
  segments_created: number
  scene_moments_created: number
  content_units_created: number
  asset_slots_created: number
  keyframes_created: number
  settings_created: number
  setting_usages: number
  writing_expressions_created: number
}

export type ProductionWorkspacePreviewSemanticChange = Record<string, unknown> & {
  kind: string
  action?: 'create' | 'update' | 'delete'
  title: string
  id?: string | number
  client_id?: string
}

export type ProductionWorkspacePreviewWarning = Record<string, unknown> & {
  code: string
  message: string
}

export interface PreviewProductionWorkspaceApplyResponse {
  status: string
  dry_run: boolean
  would_apply: ApplyProductionWorkspaceResponse
  semantic_changes?: ProductionWorkspacePreviewSemanticChange[]
  warnings?: ProductionWorkspacePreviewWarning[]
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
  const index = await loadMovScriptProjectWorkspaceDomainIndex(projectId)
  const project = queryMovScriptWorkspaceEntities(index, { entityType: 'project', limit: 1 })[0]
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
    const workspacePath = stringParam(current?.__workspace_path)
    if (workspacePath && workspaceEntityPathMatchesKind(config.kind, workspacePath)) {
      await createElectronMovScriptWorkspaceFileRepository().delete({ path: workspacePath })
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
  const index = await loadMovScriptProjectWorkspaceDomainIndex(projectId)
  return queryMovScriptWorkspaceEntities(index, { entityType: 'creative_relationship' })
    .map((entity) => semanticRecordFromWorkspaceEntity(entity, projectId) as unknown as EntityRelation)
}

export async function listScriptBlockUsages(_projectId: number, _scriptBlockId: number): Promise<ScriptBlockUsages> {
  throw unsupportedBackendSemanticOperation('listScriptBlockUsages')
}

export async function listScriptBlockUsageMap(_projectId: number, _scriptVersionId: number): Promise<Record<string, ScriptBlockUsages>> {
  throw unsupportedBackendSemanticOperation('listScriptBlockUsageMap')
}

export async function buildContentUnitGenerationContext(
  _projectId: number,
  _contentUnitId: number,
  _intent: 'keyframe' | 'video' = 'video',
): Promise<GenerationContext> {
  throw unsupportedBackendSemanticOperation('buildContentUnitGenerationContext')
}

export async function abandonSegment(_projectId: number, _id: number): Promise<AbandonSegmentResult> {
  throw unsupportedBackendSemanticOperation('abandonSegment')
}

export async function abandonSceneMoment(_projectId: number, _id: number): Promise<AbandonSceneMomentResult> {
  throw unsupportedBackendSemanticOperation('abandonSceneMoment')
}

export async function abandonContentUnit(_projectId: number, _id: number): Promise<AbandonContentUnitResult> {
  throw unsupportedBackendSemanticOperation('abandonContentUnit')
}

export async function applyProjectStandardsWorkspace(
  _projectId: number,
  _payload: Record<string, unknown>,
): Promise<ApplyWorkbenchWorkspaceResponse> {
  throw unsupportedBackendSemanticOperation('applyProjectStandardsWorkspace')
}

export async function applySettingWorkspace(
  _projectId: number,
  _payload: Record<string, unknown>,
): Promise<ApplyWorkbenchWorkspaceResponse> {
  throw unsupportedBackendSemanticOperation('applySettingWorkspace')
}

export async function applyAssetWorkspace(
  _projectId: number,
  _payload: Record<string, unknown>,
): Promise<ApplyWorkbenchWorkspaceResponse> {
  throw unsupportedBackendSemanticOperation('applyAssetWorkspace')
}

export async function previewProductionWorkspaceApply(
  _projectId: number,
  _payload: Record<string, unknown>,
): Promise<PreviewProductionWorkspaceApplyResponse> {
  throw unsupportedBackendSemanticOperation('previewProductionWorkspaceApply')
}

export async function applyProductionWorkspace(
  _projectId: number,
  _payload: Record<string, unknown>,
): Promise<ApplyProductionWorkspaceResponse> {
  throw unsupportedBackendSemanticOperation('applyProductionWorkspace')
}

async function listWorkspaceSemanticEntities(
  projectId: number,
  kind: SemanticEntityKind,
  params: SemanticEntityListParams,
): Promise<SemanticEntityRecord[]> {
  const index = await loadMovScriptProjectWorkspaceDomainIndex(projectId)
  if (kind === 'settings') {
    return queryMovScriptWorkspaceSettings(index, {
      settingId: idParam(params.setting_id ?? params.settingId),
      kind: stringParam(params.kind),
      status: stringParam(params.status),
      query: stringParam(params.query),
      limit: numberParam(params.limit),
    }).map((entity) => semanticRecordFromWorkspaceEntity(entity, projectId))
  }
  if (kind === 'assetSlots') {
    return queryMovScriptWorkspaceAssetSlots(index, {
      assetSlotId: idParam(params.asset_slot_id ?? params.assetSlotId),
      settingId: idParam(params.setting_id ?? params.settingId),
      settingStateId: idParam(params.setting_state_id ?? params.settingStateId),
      ownerType: stringParam(params.owner_type ?? params.ownerType),
      ownerId: idParam(params.owner_id ?? params.ownerId),
      productionId: idParam(params.production_id ?? params.productionId),
      status: stringParam(params.status),
      query: stringParam(params.query),
      limit: numberParam(params.limit),
    }).assetSlots.map((entity) => semanticRecordFromWorkspaceEntity(entity, projectId))
  }

  const entityType = semanticEntityType(kind)
  if (!entityType) return []
  return queryMovScriptWorkspaceEntities(index, {
    entityType,
    ...workspaceEntityQueryFromParams(params),
  }).map((entity) => semanticRecordFromWorkspaceEntity(entity, projectId))
}

function workspaceEntityQueryFromParams(params: SemanticEntityListParams): Omit<MovScriptWorkspaceEntityQuery, 'entityType'> {
  return {
    status: stringParam(params.status),
    kind: stringParam(params.kind),
    query: stringParam(params.query),
    ownerType: stringParam(params.owner_type ?? params.ownerType),
    ownerId: idParam(params.owner_id ?? params.ownerId),
    productionId: idParam(params.production_id ?? params.productionId),
    segmentId: idParam(params.segment_id ?? params.segmentId),
    sceneMomentId: idParam(params.scene_moment_id ?? params.sceneMomentId),
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
  record.__workspace_path = entity.path
  record.__workspace_entity_type = entity.entityType
  return record as SemanticEntityRecord
}

function workspaceProjectRecord(entity: MovScriptWorkspaceIndexedEntity, projectId: number): Project {
  const record = semanticRecordFromWorkspaceEntity(entity, projectId)
  return {
    ID: numberParam(record.ID) ?? projectId,
    name: stringParam(record.name) ?? `Project ${projectId}`,
    description: stringParam(record.description) ?? '',
    owner_id: numberParam(record.owner_id) ?? 0,
    status: stringParam(record.status),
    total_episodes: numberParam(record.total_episodes),
    aspect_ratio: stringParam(record.aspect_ratio),
    visual_style: stringParam(record.visual_style),
    project_style: stringParam(record.project_style),
    CreatedAt: stringParam(record.CreatedAt ?? record.created_at) ?? '',
    UpdatedAt: stringParam(record.UpdatedAt ?? record.updated_at) ?? '',
  }
}

function semanticEntityType(kind: SemanticEntityKind): MovScriptWorkspaceEntityType | undefined {
  return semanticEntityTypeByKind[kind]
}

async function writeWorkspaceSemanticEntity(
  projectId: number,
  kind: WorkspaceWritableSemanticEntityKind,
  record: SemanticEntityRecord | undefined,
  payload: SemanticEntityPayload,
): Promise<SemanticEntityRecord> {
  const workspaceApi = requireWorkspaceAPI()
  const projectPath = await resolveMovScriptWorkspaceProjectPath(workspaceApi, projectId)
  const next = normalizeWritableWorkspaceEntity(projectId, kind, record, payload)
  const path = writableWorkspaceEntityPath(projectPath, kind, record, next)
  await createElectronMovScriptWorkspaceFileRepository(workspaceApi).write({
    path,
    content: `${JSON.stringify(next, null, 2)}\n`,
  })
  const output: Record<string, unknown> = {
    ...next,
    __workspace_path: path,
    __workspace_entity_type: semanticEntityType(kind),
  }
  return output as SemanticEntityRecord
}

function normalizeWritableWorkspaceEntity(
  projectId: number,
  kind: WorkspaceWritableSemanticEntityKind,
  record: SemanticEntityRecord | undefined,
  payload: SemanticEntityPayload,
): Record<string, unknown> {
  const now = Date.now()
  const current = stripWorkspacePrivateFields(record ?? {})
  const currentId = numberParam(current.ID ?? current.id)
  const id = currentId ?? -now
  const clientId = stringParam(current.client_id ?? current.clientId) ?? (id > 0 ? undefined : `${workspaceWritableFilePrefix(kind)}_local_${now}`)
  return pruneUndefined({
    ...current,
    ...payload,
    schema: workspaceWritableSchema(kind),
    ID: id,
    id,
    ...(clientId ? { client_id: clientId } : {}),
    project_id: projectId,
  })
}

function writableWorkspaceEntityPath(
  projectPath: string,
  kind: WorkspaceWritableSemanticEntityKind,
  record: SemanticEntityRecord | undefined,
  next: Record<string, unknown>,
): string {
  const existingPath = stringParam(record?.__workspace_path)
  if (existingPath && workspaceEntityPathMatchesKind(kind, existingPath)) return existingPath
  const id = numberParam(next.ID ?? next.id)
  const clientId = stringParam(next.client_id ?? next.clientId)
  const fileKey = id !== undefined && id > 0 ? String(id) : clientId ?? `local_${Date.now()}`
  return `${projectPath}/${workspaceWritableDirectory(kind)}/${workspaceWritableFilePrefix(kind)}_${fileKey}.json`
}

function workspaceWritableEntityKind(kind: SemanticEntityKind): kind is WorkspaceWritableSemanticEntityKind {
  return kind in workspaceWritableEntitySpecs
}

type WorkspaceWritableSemanticEntityKind =
  | 'scriptVersions'
  | 'settings'
  | 'assetSlots'
  | 'deliveryVersions'
  | 'deliveryTimelineItems'
  | 'exportRecords'
  | 'workItems'
  | 'workReviews'

function workspaceWritableSchema(kind: WorkspaceWritableSemanticEntityKind): string {
  return workspaceWritableEntitySpecs[kind].schema
}

function workspaceWritableDirectory(kind: WorkspaceWritableSemanticEntityKind): string {
  return workspaceWritableEntitySpecs[kind].directory
}

function workspaceWritableFilePrefix(kind: WorkspaceWritableSemanticEntityKind): string {
  return workspaceWritableEntitySpecs[kind].filePrefix
}

function workspaceEntityPathMatchesKind(kind: WorkspaceWritableSemanticEntityKind, path: string): boolean {
  return path.includes(`/${workspaceWritableDirectory(kind)}/`)
    && path.split('/').pop()?.startsWith(`${workspaceWritableFilePrefix(kind)}_`) === true
}

function stripWorkspacePrivateFields(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('__workspace_')) continue
    out[key] = value
  }
  return out
}

function pruneUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))
}

function unsupportedWorkspaceSemanticWrite(kind: SemanticEntityKind): Error {
  return new Error(`MovScript workspace write is not implemented for ${kind}; direct backend semantic writes have been removed`)
}

function unsupportedBackendSemanticOperation(operation: string): never {
  throw new Error(`${operation} is no longer available through the frontend semantic API; use workspace files and Git canonical review/submit`)
}

function requireWorkspaceAPI(): ElectronAPI {
  const workspaceApi = window.api
  if (!workspaceApi) throw new Error('当前窗口没有 MovScript 工作区能力')
  return workspaceApi
}

const semanticEntityTypeByKind: Record<SemanticEntityKind, MovScriptWorkspaceEntityType> = {
  scriptVersions: 'script_version',
  scriptBlocks: 'script_block',
  segments: 'segment',
  productionTextBlocks: 'production_text_block',
  sceneMoments: 'scene_moment',
  writingExpressions: 'writing_expression',
  productions: 'production',
  storyboardScripts: 'storyboard_script',
  storyboardVersions: 'storyboard_version',
  contentUnits: 'content_unit',
  keyframes: 'keyframe',
  previewTimelines: 'preview_timeline',
  previewTimelineItems: 'preview_timeline_item',
  settings: 'setting',
  settingStates: 'setting_state',
  settingUsages: 'setting_usage',
  creativeRelationships: 'creative_relationship',
  assetSlots: 'asset_slot',
  assetSlotCandidates: 'candidate',
  candidateDecisions: 'candidate_decision',
  reviewEvents: 'review_event',
  workItems: 'work_item',
  workReviews: 'work_review',
  workDependencies: 'work_dependency',
  deliveryVersions: 'delivery_version',
  deliveryTimelineItems: 'delivery_timeline_item',
  exportRecords: 'export_record',
  canvasOutputs: 'canvas_output',
}

const workspaceWritableEntitySpecs: Record<WorkspaceWritableSemanticEntityKind, {
  schema: string
  directory: string
  filePrefix: string
}> = {
  scriptVersions: {
    schema: 'movscript.script_version.v1',
    directory: 'scripts/versions',
    filePrefix: 'script_version',
  },
  settings: {
    schema: 'movscript.setting.v1',
    directory: 'setting',
    filePrefix: 'setting',
  },
  assetSlots: {
    schema: 'movscript.asset_slot.v1',
    directory: 'assets',
    filePrefix: 'asset_slot',
  },
  deliveryVersions: {
    schema: 'movscript.delivery_version.v1',
    directory: 'delivery',
    filePrefix: 'delivery_version',
  },
  deliveryTimelineItems: {
    schema: 'movscript.delivery_timeline_item.v1',
    directory: 'delivery',
    filePrefix: 'delivery_timeline_item',
  },
  exportRecords: {
    schema: 'movscript.export_record.v1',
    directory: 'delivery',
    filePrefix: 'export_record',
  },
  workItems: {
    schema: 'movscript.work_item.v1',
    directory: 'work',
    filePrefix: 'work_item',
  },
  workReviews: {
    schema: 'movscript.work_review.v1',
    directory: 'work',
    filePrefix: 'work_review',
  },
}

function semanticCoreEntityConfigs(): SemanticEntityConfig[] {
  return [
    cfg('scriptVersions', 'script-versions', '剧本版本', '导入剧本、brief 或修订文本后的稳定版本。', ['title', 'source_type', 'status'], [
      num('script_id', 'Script ID', true, true),
      textCreateOnly('title', '标题', true),
      selectCreateOnly('source_type', '来源类型', ['raw', 'adapted', 'revised', 'ai']),
      areaCreateOnly('content', '正文'),
      areaCreateOnly('raw_source', '原文'),
      areaCreateOnly('summary', '摘要'),
      selectCreateOnly('status', '状态', ['workspace', 'active', 'archived']),
    ]),
    cfg('scriptBlocks', 'script-blocks', '剧本块', '绑定到剧本版本的可引用文本块。', ['kind', 'speaker', 'content'], [
      num('script_id', 'Script ID', true, true),
      num('script_version_id', 'ScriptVersion ID', true, true),
      num('parent_block_id', '父剧本块 ID'),
      num('order', '顺序'),
      select('kind', '类型', ['scene_heading', 'action', 'dialogue', 'transition', 'note']),
      text('speaker', '说话人'),
      area('content', '内容'),
      select('status', '状态', ['workspace', 'active', 'archived']),
    ]),
    cfg('segments', 'segments', '段落', '制作结构中的叙事段落。', ['title', 'order', 'status'], [
      num('production_id', 'Production ID'),
      text('title', '标题', true),
      area('summary', '摘要'),
      num('order', '顺序'),
      select('status', '状态', ['workspace', 'active', 'abandoned', 'archived']),
    ]),
    cfg('productionTextBlocks', 'production-text-blocks', '制作文本块', '制作阶段使用的文本片段。', ['kind', 'content', 'status'], [
      num('production_id', 'Production ID'),
      select('kind', '类型', ['brief', 'note', 'dialogue', 'action']),
      area('content', '内容'),
      select('status', '状态', ['workspace', 'active', 'archived']),
    ]),
    cfg('sceneMoments', 'scene-moments', '情节', '段落下的具体情节。', ['title', 'scene_code', 'status'], [
      num('production_id', 'Production ID'),
      num('segment_id', 'Segment ID'),
      text('scene_code', '场景编号'),
      text('title', '标题', true),
      text('time_text', '时间'),
      text('location_text', '地点'),
      area('action_text', '动作'),
      area('description', '描述'),
      num('order', '顺序'),
      select('status', '状态', ['workspace', 'active', 'abandoned', 'archived']),
    ]),
    cfg('writingExpressions', 'writing-expressions', '编剧表达', '编剧在情节下逐条编辑的对白、动作、旁白、屏幕文字和镜头描述。', ['kind', 'speaker', 'text'], [
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
      select('status', '状态', ['workspace', 'active', 'archived']),
    ]),
    cfg('productions', 'productions', '制作', '项目中的制作单元。', ['name', 'status'], [
      text('name', '名称', true),
      area('description', '描述'),
      num('script_version_id', 'ScriptVersion ID'),
      select('status', '状态', ['workspace', 'active', 'archived']),
    ]),
    cfg('storyboardScripts', 'storyboard-scripts', '分镜脚本', '分镜脚本。', ['title', 'status'], genericFields()),
    cfg('storyboardVersions', 'storyboard-versions', '分镜版本', '分镜版本。', ['title', 'status'], genericFields()),
    cfg('contentUnits', 'content-units', '制作项', '可生产的内容单元。', ['title', 'kind', 'status'], [
      num('production_id', 'Production ID'),
      num('scene_moment_id', 'SceneMoment ID'),
      text('unit_code', '制作项编号'),
      text('title', '标题', true),
      select('kind', '类型', ['shot', 'voiceover', 'dialogue_audio', 'sound', 'music_beat', 'subtitle', 'caption_card', 'transition'], true),
      area('description', '描述'),
      area('prompt', '提示词'),
      num('duration_sec', '时长'),
      select('status', '状态', ['workspace', 'active', 'approved', 'archived']),
    ]),
    cfg('keyframes', 'keyframes', '关键帧', '制作项或情节下的关键画面。', ['title', 'status'], [
      num('production_id', 'Production ID'),
      num('scene_moment_id', 'SceneMoment ID'),
      num('content_unit_id', 'ContentUnit ID'),
      text('title', '标题', true),
      area('description', '描述'),
      area('prompt', '提示词'),
      num('order', '顺序'),
      select('status', '状态', ['workspace', 'candidate', 'approved', 'locked', 'archived']),
    ]),
    cfg('previewTimelines', 'preview-timelines', '预览时间线', '预览时间线。', ['title', 'status'], genericFields()),
    cfg('previewTimelineItems', 'preview-timeline-items', '预览时间线项', '预览时间线项。', ['owner_type', 'owner_id', 'status'], timelineFields('preview_timeline_id', 'PreviewTimeline ID')),
    cfg('settings', 'settings', '设定', '旧兼容名称；新 workspace ontology 中统一为 setting。', ['name', 'kind', 'status'], [
      text('name', '名称', true),
      select('kind', '类型', ['character', 'location', 'prop', 'world_rule', 'style_reference', 'organization']),
      area('description', '描述'),
      area('content', '内容'),
      select('status', '状态', ['workspace', 'confirmed', 'merged', 'ignored', 'locked']),
    ]),
    cfg('settingStates', 'setting-states', '设定状态', '旧兼容名称；新 workspace ontology 中统一为 setting_state。', ['name', 'status'], [
      num('setting_id', 'Setting ID', true),
      text('name', '名称'),
      text('scope_type', '范围类型'),
      num('scope_id', '范围 ID'),
      area('description', '描述'),
      select('status', '状态', ['workspace', 'confirmed', 'locked', 'ignored']),
    ]),
    cfg('settingUsages', 'setting-usages', '设定引用', '结构对象对设定的引用。', ['owner_type', 'owner_id', 'role'], [
      text('owner_type', '归属类型', true),
      num('owner_id', '归属 ID', true),
      num('setting_id', '设定 ID', true),
      num('setting_state_id', '设定状态 ID'),
      text('role', '角色'),
      select('status', '状态', ['workspace', 'confirmed', 'corrected', 'ignored']),
    ]),
    cfg('creativeRelationships', 'creative-relationships', '设定关系', '设定之间的关系。', ['type', 'status'], [
      num('source_setting_id', 'SourceSetting ID', true),
      num('target_setting_id', 'TargetSetting ID', true),
      text('type', '类型'),
      text('label', '标签'),
      select('status', '状态', ['workspace', 'confirmed', 'corrected', 'ignored']),
    ]),
    cfg('assetSlots', 'asset-slots', '素材需求', '需要生成或绑定的素材需求。', ['name', 'kind', 'status'], [
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
      select('status', '状态', ['workspace', 'confirmed', 'needs_asset', 'missing', 'locked', 'approved']),
    ]),
    cfg('assetSlotCandidates', 'asset-slot-candidates', '素材候选', '素材需求的候选结果。', ['name', 'resource_id', 'status'], [
      num('asset_slot_id', 'AssetSlot ID', true),
      num('candidate_asset_slot_id', 'CandidateAssetSlot ID'),
      num('resource_id', 'Resource ID', false, true, '创建时可直接填资源 ID'),
      text('name', '名称'),
      area('description', '描述'),
      select('status', '状态', ['workspace', 'candidate', 'accepted', 'rejected', 'locked']),
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
    cfg('deliveryVersions', 'delivery-versions', '交付版本', '交付版本。', ['title', 'status'], genericFields()),
    cfg('deliveryTimelineItems', 'delivery-timeline-items', '交付时间线项', '交付时间线项。', ['owner_type', 'owner_id', 'status'], timelineFields('delivery_version_id', 'DeliveryVersion ID')),
    cfg('exportRecords', 'export-records', '导出记录', '导出记录。', ['status'], genericFields()),
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
    select('status', '状态', ['workspace', 'active', 'archived']),
  ]
}

function timelineFields(ownerKey: string, ownerLabel: string): SemanticEntityField[] {
  return [
    num(ownerKey, ownerLabel),
    text('owner_type', '归属类型'),
    num('owner_id', '归属 ID'),
    num('start_sec', '开始时间'),
    num('duration_sec', '时长'),
    select('status', '状态', ['workspace', 'active', 'archived']),
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
