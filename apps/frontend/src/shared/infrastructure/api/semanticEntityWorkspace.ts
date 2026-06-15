import {
  type MovScriptWorkspaceEntityQuery,
  type MovScriptWorkspaceIndexedEntity,
} from '@movscript/workspace'
import type { SemanticEntityKind as MovScriptCoreSemanticEntityKind } from '@movscript/language/domain'
import {
  createElectronMovScriptWorkspaceService,
} from '@/shared/infrastructure/workspaceDomainRepository'
import { semanticEntityType } from './semanticEntityConfigs'
import { idParam, numberParam, stringParam } from './semanticEntityParams'
import type {
  EntityRelation,
  Project,
  SemanticEntityKind,
  SemanticEntityListParams,
  SemanticEntityPayload,
  SemanticEntityRecord,
} from './semanticEntityTypes'

const workspaceEntityBySemanticRecord = new WeakMap<Record<string, unknown>, MovScriptWorkspaceIndexedEntity>()

export async function getWorkspaceProject(projectId: number): Promise<Project> {
  const project = (await createElectronMovScriptWorkspaceService({ projectId }).queryEntities({ entityKind: 'project', limit: 1 }))[0]
  if (project) return workspaceProjectRecord(project, projectId)
  throw new Error(`MovScript workspace project ${projectId} not found`)
}

export async function deleteWorkspaceSemanticEntity(
  projectId: number,
  kind: SemanticEntityKind,
  id: number,
): Promise<void> {
  if (workspaceWritableEntityKind(kind)) {
    const current = (await listWorkspaceSemanticEntities(projectId, kind, {})).find((record) => record.ID === id)
    if (current) {
      await createElectronMovScriptWorkspaceService({ projectId }).deleteEntity({
        entity: workspaceEntityBySemanticRecord.get(current as Record<string, unknown>),
        record: current,
      })
      return
    }
  }
  throw unsupportedWorkspaceSemanticWrite(kind)
}

export async function listWorkspaceEntityRelations(projectId: number): Promise<EntityRelation[]> {
  return (await createElectronMovScriptWorkspaceService({ projectId }).queryEntities({
    entityKind: 'creative_relationship' as MovScriptCoreSemanticEntityKind,
  }))
    .map((entity: MovScriptWorkspaceIndexedEntity) => semanticRecordFromWorkspaceEntity(entity, projectId) as unknown as EntityRelation)
}

export async function listWorkspaceSemanticEntities(
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

export function workspaceEntityQueryFromParams(params: SemanticEntityListParams): Omit<MovScriptWorkspaceEntityQuery, 'entityKind'> {
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

export function semanticRecordFromWorkspaceEntity(entity: MovScriptWorkspaceIndexedEntity, projectId: number): SemanticEntityRecord {
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

export function semanticRecordFromWorkspaceWrite(
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

export function workspaceProjectRecord(entity: MovScriptWorkspaceIndexedEntity, projectId: number): Project {
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

export async function writeWorkspaceSemanticEntity(
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

export function workspaceWritableEntityKind(kind: SemanticEntityKind): kind is WorkspaceWritableSemanticEntityKind {
  return kind === 'settings' || kind === 'assetSlots' || kind === 'productions' || kind === 'segments' || kind === 'sceneMoments'
}

export type WorkspaceWritableSemanticEntityKind =
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
  const result = await createElectronMovScriptWorkspaceService({ projectId }).saveProductionSnapshot({
    productionId: id,
    snapshot: {
      production: nextRecord,
      segments: [],
    },
  })
  return { path: result.productionPath, entityKind: 'production', record: nextRecord }
}

async function upsertWorkspaceSegment(
  projectId: number,
  record: SemanticEntityRecord | undefined,
  payload: SemanticEntityPayload,
): Promise<{ path: string; entityKind: 'segment'; record: Record<string, unknown> }> {
  const current = stripWorkspacePrivateFields(record ?? {})
  const productionId = requiredNumericRef(payload.production_id ?? current.production_id, 'production_id')
  const id = stableNumericEntityId(current, payload)
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
  const result = await createElectronMovScriptWorkspaceService({ projectId }).saveProductionSnapshot({
    productionId,
    snapshot: {
      segments: [{
        ...nextRecord,
        order: numberParam(nextRecord.order),
      }],
    },
  })
  const path = result.writtenPaths.find((path) => path.endsWith('/segment.json')) ?? result.productionPath
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
  const now = new Date().toISOString()
  const title = stringParam(payload.title ?? current.title) ?? `情节 ${id}`
  const timeText = stringParam(payload.time_text ?? payload.when ?? current.time_text ?? current.when)
  const locationText = stringParam(payload.location_text ?? payload.where ?? current.location_text ?? current.where)
  const actionText = stringParam(payload.action_text ?? payload.action ?? current.action_text ?? current.action)
  const mood = stringParam(payload.mood ?? payload.emotion ?? current.mood ?? current.emotion)
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
  const result = await createElectronMovScriptWorkspaceService({ projectId }).saveProductionSnapshot({
    productionId,
    snapshot: {
      segments: [{
        id: segmentId,
        scene_moments: [{
          ...nextRecord,
          order: numberParam(nextRecord.order),
        }],
      }],
    },
  })
  const path = result.writtenPaths.find((path) => path.endsWith('/scene_moment.json')) ?? result.productionPath
  return { path, entityKind: 'scene_moment', record: nextRecord }
}

export function unsupportedWorkspaceSemanticWrite(kind: SemanticEntityKind): Error {
  return new Error(`MovScript workspace write is not implemented for ${kind}; direct backend semantic writes have been removed`)
}

export function unsupportedWorkspaceSemanticRead(operation: string): never {
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

function stripWorkspacePrivateFields(record: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('__workspace_')) continue
    output[key] = value
  }
  return output
}

function pruneUndefinedRecord<T extends Record<string, unknown>>(record: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined && value !== '') output[key] = value
  }
  return output as T
}
