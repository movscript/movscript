import {
  normalizeWorkspacePath,
  sameEntityRef,
} from '../layout/index.js'
import type { SemanticEntityKind } from '@movscript/language/domain'

export const SEMANTIC_ENTITY_KINDS = [
  'project',
  'project_standards',
  'script',
  'script_version',
  'script_block',
  'production',
  'segment',
  'scene_moment',
  'shot',
  'storyboard',
  'audio_cue',
  'expression_unit',
  'content_unit',
  'keyframe',
  'setting',
  'setting_state',
  'asset',
] as const satisfies readonly SemanticEntityKind[]

export interface MovScriptWorkspaceDocument {
  path: string
  data: unknown
  version?: string
  updatedAt?: string
}

export interface MovScriptWorkspaceIndexedEntity {
  entityKind: SemanticEntityKind
  record: Record<string, unknown>
  path: string
  index: number
  id?: string | number
  clientId?: string
  schema?: string
}

export interface MovScriptWorkspaceDomainIndex {
  documents: MovScriptWorkspaceDocument[]
  entities: MovScriptWorkspaceIndexedEntity[]
  byKind: ReadonlyMap<SemanticEntityKind, MovScriptWorkspaceIndexedEntity[]>
}

export interface MovScriptWorkspaceEntityQuery {
  entityKind?: SemanticEntityKind
  kind?: string
  query?: string
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  shotId?: string | number
  storyboardId?: string | number
  contentUnitId?: string | number
  settingId?: string | number
  settingStateId?: string | number
  limit?: number
}

export interface MovScriptWorkspaceSettingQuery {
  settingId?: string | number
  kind?: string
  query?: string
  limit?: number
}

export interface MovScriptWorkspaceAssetQuery {
  assetId?: string | number
  settingId?: string | number
  settingStateId?: string | number
  query?: string
  includeCandidates?: boolean
  limit?: number
}

export interface MovScriptWorkspaceProductionContextQuery {
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  shotId?: string | number
  storyboardId?: string | number
  contentUnitId?: string | number
  query?: string
  include?: Array<'productions' | 'segments' | 'scene_moments' | 'shots' | 'storyboards' | 'audio_cues' | 'expression_units' | 'content_units' | 'keyframes'>
  limit?: number
}

export function deriveMovScriptWorkspaceDomainIndex(documents: MovScriptWorkspaceDocument[]): MovScriptWorkspaceDomainIndex {
  const entities = documents.flatMap((document) => indexedEntitiesFromDocument(document))
  const byKind = new Map<SemanticEntityKind, MovScriptWorkspaceIndexedEntity[]>()
  for (const entity of entities) {
    byKind.set(entity.entityKind, [...(byKind.get(entity.entityKind) ?? []), entity])
  }
  return { documents, entities, byKind }
}

export function queryMovScriptWorkspaceEntities(
  index: MovScriptWorkspaceDomainIndex,
  query: MovScriptWorkspaceEntityQuery = {},
): MovScriptWorkspaceIndexedEntity[] {
  const source = query.entityKind ? index.byKind.get(query.entityKind) ?? [] : index.entities
  const out = source.filter((entity) => {
    const record = entity.record
    if (query.kind && !recordKindMatches(record, query.kind)) return false
    if (query.productionId !== undefined && !entityPathMatchesProduction(entity.path, query.productionId)) return false
    if (query.segmentId !== undefined && !entityPathMatchesSegment(entity.path, query.segmentId)) return false
    if (query.sceneMomentId !== undefined && !entityPathMatchesSceneMoment(entity.path, query.sceneMomentId)) return false
    if (query.shotId !== undefined && !entityMatchesShot(entity, query.shotId)) return false
    if (query.storyboardId !== undefined && !entityMatchesStoryboard(entity, query.storyboardId)) return false
    if (query.contentUnitId !== undefined && !entityPathMatchesContentUnit(entity.path, query.contentUnitId)) return false
    if (query.settingId !== undefined && !entityPathMatchesSetting(entity.path, query.settingId)) return false
    if (query.settingStateId !== undefined && !entityPathMatchesSettingState(entity.path, query.settingStateId)) return false
    if (query.query && !recordMatchesQuery(record, query.query)) return false
    return !isDeletedWorkspaceRecord(record)
  })
  return limitEntities(out, query.limit)
}

export function queryMovScriptCanonicalEntities(
  index: MovScriptWorkspaceDomainIndex,
  query: MovScriptWorkspaceEntityQuery = {},
): MovScriptWorkspaceIndexedEntity[] {
  return queryMovScriptWorkspaceEntities(index, query)
}

export function queryMovScriptWorkspaceSettings(
  index: MovScriptWorkspaceDomainIndex,
  query: MovScriptWorkspaceSettingQuery = {},
): MovScriptWorkspaceIndexedEntity[] {
  const references = queryMovScriptWorkspaceEntities(index, {
    entityKind: 'setting',
    kind: query.kind,
    query: query.query,
    limit: query.limit,
  })
  if (query.settingId === undefined) return references
  return references.filter((entity) => sameId(entity.id, query.settingId))
}

export function queryMovScriptWorkspaceAssets(
  index: MovScriptWorkspaceDomainIndex,
  query: MovScriptWorkspaceAssetQuery = {},
): {
  assets: MovScriptWorkspaceIndexedEntity[]
  candidates?: Record<string, unknown>[]
} {
  const assets = queryMovScriptWorkspaceEntities(index, {
    entityKind: 'asset',
    query: query.query,
    settingId: query.settingId,
    settingStateId: query.settingStateId,
    limit: query.limit,
  }).filter((entity) => query.assetId === undefined || sameId(entity.id, query.assetId))

  if (!query.includeCandidates) return { assets }
  const candidates = assets.flatMap((entity) => {
    const rows = entity.record.candidates
    return Array.isArray(rows) ? rows.filter(isRecord) : []
  })
  return { assets, candidates }
}

export function queryMovScriptWorkspaceProductionContext(
  index: MovScriptWorkspaceDomainIndex,
  query: MovScriptWorkspaceProductionContextQuery = {},
): Record<string, MovScriptWorkspaceIndexedEntity[]> {
  const include = new Set(query.include ?? ['productions', 'segments', 'scene_moments', 'shots', 'storyboards', 'audio_cues', 'expression_units', 'content_units', 'keyframes'])
  const result: Record<string, MovScriptWorkspaceIndexedEntity[]> = {}
  if (include.has('productions')) {
    result.productions = queryMovScriptWorkspaceEntities(index, {
      entityKind: 'production',
      query: query.query,
      limit: query.limit,
    }).filter((entity) => query.productionId === undefined || sameId(entity.id, query.productionId))
  }
  if (include.has('segments')) {
    result.segments = queryMovScriptWorkspaceEntities(index, {
      entityKind: 'segment',
      productionId: query.productionId,
      query: query.query,
      limit: query.limit,
    }).filter((entity) => query.segmentId === undefined || sameId(entity.id, query.segmentId))
  }
  if (include.has('scene_moments')) {
    result.scene_moments = queryMovScriptWorkspaceEntities(index, {
      entityKind: 'scene_moment',
      productionId: query.productionId,
      segmentId: query.segmentId,
      query: query.query,
      limit: query.limit,
    }).filter((entity) => query.sceneMomentId === undefined || sameId(entity.id, query.sceneMomentId))
  }
  if (include.has('shots')) {
    result.shots = queryMovScriptWorkspaceEntities(index, {
      entityKind: 'shot',
      productionId: query.productionId,
      segmentId: query.segmentId,
      sceneMomentId: query.sceneMomentId,
      query: query.query,
      limit: query.limit,
    }).filter((entity) => query.shotId === undefined || sameId(entity.id, query.shotId))
  }
  if (include.has('storyboards')) {
    result.storyboards = queryMovScriptWorkspaceEntities(index, {
      entityKind: 'storyboard',
      productionId: query.productionId,
      segmentId: query.segmentId,
      sceneMomentId: query.sceneMomentId,
      shotId: query.shotId,
      query: query.query,
      limit: query.limit,
    }).filter((entity) => query.storyboardId === undefined || sameId(entity.id, query.storyboardId))
  }
  if (include.has('audio_cues')) {
    result.audio_cues = queryMovScriptWorkspaceEntities(index, {
      entityKind: 'audio_cue',
      productionId: query.productionId,
      segmentId: query.segmentId,
      sceneMomentId: query.sceneMomentId,
      shotId: query.shotId,
      storyboardId: query.storyboardId,
      query: query.query,
      limit: query.limit,
    })
  }
  if (include.has('expression_units')) {
    result.expression_units = queryMovScriptWorkspaceEntities(index, {
      entityKind: 'expression_unit',
      productionId: query.productionId,
      segmentId: query.segmentId,
      sceneMomentId: query.sceneMomentId,
      query: query.query,
      limit: query.limit,
    })
  }
  if (include.has('content_units')) {
    result.content_units = queryMovScriptWorkspaceEntities(index, {
      entityKind: 'content_unit',
      contentUnitId: query.contentUnitId,
      query: query.query,
      limit: query.limit,
    })
  }
  if (include.has('keyframes')) {
    result.keyframes = queryMovScriptWorkspaceEntities(index, {
      entityKind: 'keyframe',
      sceneMomentId: query.sceneMomentId,
      shotId: query.shotId,
      contentUnitId: query.contentUnitId,
      query: query.query,
      limit: query.limit,
    })
  }
  return result
}

function indexedEntitiesFromDocument(document: MovScriptWorkspaceDocument): MovScriptWorkspaceIndexedEntity[] {
  const path = normalizeIndexedDocumentPath(document.path)
  if (!isRecord(document.data)) return []

  const entityKind = entityKindFromSchema(stringField(document.data.schema)) ?? entityKindFromPath(path)
  return entityKind ? [indexedEntity(entityKind, workspaceRecordWithDocumentMetadata(document.data, document), path, 0)] : []
}

function indexedEntity(
  entityKind: SemanticEntityKind,
  record: Record<string, unknown>,
  path: string,
  index: number,
): MovScriptWorkspaceIndexedEntity {
  const schema = stringField(record.schema)
  const id = entityIdField(entityKind, record)
  const clientId = stringField(record.client_id ?? record.clientId)
  return {
    entityKind,
    record,
    path,
    index,
    ...(id !== undefined ? { id } : {}),
    ...(clientId ? { clientId } : {}),
    ...(schema ? { schema } : {}),
  }
}

function workspaceRecordWithDocumentMetadata(
  record: Record<string, unknown>,
  document: MovScriptWorkspaceDocument,
): Record<string, unknown> {
  return {
    ...record,
    __workspace_path: document.path,
    ...(document.version !== undefined ? { __workspace_version: document.version } : {}),
    ...(document.updatedAt !== undefined ? { __workspace_updated_at: document.updatedAt } : {}),
  }
}

function entityKindFromSchema(schema: string | undefined): SemanticEntityKind | undefined {
  if (!schema) return undefined
  const normalized = schema.replace(/^movscript\./, '').replace(/\.v\d+$/, '')
  return schemaEntityKinds[normalized]
}

function entityKindFromPath(path: string): SemanticEntityKind | undefined {
  const name = path.split('/').pop() ?? path
  if (name === 'project.json') return 'project'
  if (name === 'project_standards.json') return 'project_standards'
  if (name === 'script.meta.json' || name === 'script.json') return 'script'
  if (name === 'setting.json') return 'setting'
  if (name === 'setting_state.json') return 'setting_state'
  if (name === 'asset.json') return 'asset'
  if (name === 'script_version.json') return 'script_version'
  if (name === 'script_block.json') return 'script_block'
  if (name === 'production.json') return 'production'
  if (name === 'segment.json') return 'segment'
  if (name === 'scene_moment.json') return 'scene_moment'
  if (name === 'shot.json') return 'shot'
  if (name === 'storyboard.json') return 'storyboard'
  if (name === 'audio_cue.json') return 'audio_cue'
  if (name === 'expression_unit.json') return 'expression_unit'
  if (name === 'content_unit.json') return 'content_unit'
  if (name === 'keyframe.json') return 'keyframe'
  return undefined
}

const schemaEntityKinds: Record<string, SemanticEntityKind> = {
  project: 'project',
  project_standards: 'project_standards',
  script: 'script',
  script_version: 'script_version',
  script_block: 'script_block',
  production: 'production',
  segment: 'segment',
  scene_moment: 'scene_moment',
  shot: 'shot',
  storyboard: 'storyboard',
  audio_cue: 'audio_cue',
  expression_unit: 'expression_unit',
  content_unit: 'content_unit',
  keyframe: 'keyframe',
  setting: 'setting',
  setting_state: 'setting_state',
  asset: 'asset',
}

function entityPathMatchesProduction(path: string, productionId: string | number): boolean {
  return pathSegmentAfter(path, 'productions') !== undefined && sameEntityRef(pathSegmentAfter(path, 'productions'), productionId, 'production')
}

function entityPathMatchesSegment(path: string, segmentId: string | number): boolean {
  return pathSegmentAfter(path, 'segments') !== undefined && sameEntityRef(pathSegmentAfter(path, 'segments'), segmentId, 'segment')
}

function entityPathMatchesSceneMoment(path: string, sceneMomentId: string | number): boolean {
  return pathSegmentAfter(path, 'scene_moments') !== undefined && sameEntityRef(pathSegmentAfter(path, 'scene_moments'), sceneMomentId, 'scene_moment')
}

function entityPathMatchesShot(path: string, shotId: string | number): boolean {
  return pathSegmentAfter(path, 'shots') !== undefined && sameEntityRef(pathSegmentAfter(path, 'shots'), shotId, 'shot')
}

function entityMatchesShot(entity: MovScriptWorkspaceIndexedEntity, shotId: string | number): boolean {
  if (entityPathMatchesShot(entity.path, shotId)) return true
  const shotRef = stringField(entity.record.shot_ref)
  return shotRef !== undefined && entityPathMatchesShot(shotRef, shotId)
}

function entityPathMatchesStoryboard(path: string, storyboardId: string | number): boolean {
  return pathSegmentAfter(path, 'storyboards') !== undefined && sameEntityRef(pathSegmentAfter(path, 'storyboards'), storyboardId, 'storyboard')
}

function entityMatchesStoryboard(entity: MovScriptWorkspaceIndexedEntity, storyboardId: string | number): boolean {
  if (entityPathMatchesStoryboard(entity.path, storyboardId)) return true
  const storyboardRef = stringField(entity.record.storyboard_ref)
  return storyboardRef !== undefined && entityPathMatchesStoryboard(storyboardRef, storyboardId)
}

function entityPathMatchesContentUnit(path: string, contentUnitId: string | number): boolean {
  return pathSegmentAfter(path, 'content_units') !== undefined && sameEntityRef(pathSegmentAfter(path, 'content_units'), contentUnitId, 'content_unit')
}

function entityPathMatchesSetting(path: string, settingId: string | number): boolean {
  return pathSegmentAfter(path, 'settings') !== undefined && sameEntityRef(pathSegmentAfter(path, 'settings'), settingId, 'setting')
}

function entityPathMatchesSettingState(path: string, stateId: string | number): boolean {
  return pathSegmentAfter(path, 'states') !== undefined && sameEntityRef(pathSegmentAfter(path, 'states'), stateId, 'setting_state')
}

export function isSemanticEntityKind(entityKind: string): entityKind is SemanticEntityKind {
  return (SEMANTIC_ENTITY_KINDS as readonly string[]).includes(entityKind)
}

function recordMatchesQuery(record: Record<string, unknown>, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return ['id', 'title', 'label', 'alias', 'description', 'content', 'summary', 'prompt', 'notes']
    .some((key) => String(record[key] ?? '').toLowerCase().includes(needle))
}

function recordKindMatches(record: Record<string, unknown>, kind: string): boolean {
  return [
    record.kind,
    record.setting_kind,
    record.content_unit_type,
    record.asset_kind,
    record.shot_kind,
    record.segment_kind,
    record.expression_kind,
    record.cue_kind,
  ].some((value) => stringField(value) === kind)
}

function isDeletedWorkspaceRecord(record: Record<string, unknown>): boolean {
  return record.__delete === true || record.deleted === true
}

function limitEntities<T>(items: T[], limit: number | undefined): T[] {
  if (limit === undefined) return items
  if (!Number.isFinite(limit) || limit <= 0) return []
  return items.slice(0, Math.floor(limit))
}

function sameId(left: unknown, right: unknown): boolean {
  const leftId = idField(left)
  const rightId = idField(right)
  return leftId !== undefined && rightId !== undefined && String(leftId) === String(rightId)
}

function entityIdField(entityKind: SemanticEntityKind, record: Record<string, unknown>): string | number | undefined {
  if (entityKind === 'project') return idField(record.project_id ?? record.ID ?? record.id)
  return idField(record.ID ?? record.id)
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function pathSegmentAfter(path: string, segment: string): string | undefined {
  const parts = path.split('/')
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

function normalizeIndexedDocumentPath(path: string): string {
  return normalizeWorkspacePath(path).replace(/^\.movscript\//, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
