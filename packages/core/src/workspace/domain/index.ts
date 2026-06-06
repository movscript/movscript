export type MovScriptWorkspaceEntityType =
  | 'project'
  | 'script'
  | 'script_version'
  | 'script_block'
  | 'production'
  | 'production_text_block'
  | 'segment'
  | 'scene_moment'
  | 'writing_expression'
  | 'storyboard_script'
  | 'storyboard_version'
  | 'content_unit'
  | 'keyframe'
  | 'preview_timeline'
  | 'preview_timeline_item'
  | 'setting'
  | 'setting_state'
  | 'setting_usage'
  | 'creative_relationship'
  | 'asset_slot'
  | 'asset_slot_candidate'
  | 'candidate'
  | 'candidate_decision'
  | 'review_event'
  | 'work_item'
  | 'work_review'
  | 'work_dependency'
  | 'delivery_version'
  | 'delivery_timeline_item'
  | 'export_record'
  | 'canvas_output'

export interface MovScriptWorkspaceDocument {
  path: string
  data: unknown
}

export interface MovScriptWorkspaceIndexedEntity {
  entityType: MovScriptWorkspaceEntityType
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
  byType: ReadonlyMap<MovScriptWorkspaceEntityType, MovScriptWorkspaceIndexedEntity[]>
}

export interface MovScriptWorkspaceEntityQuery {
  entityType?: MovScriptWorkspaceEntityType
  status?: string
  kind?: string
  query?: string
  ownerType?: string
  ownerId?: string | number
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  contentUnitId?: string | number
  settingId?: string | number
  settingStateId?: string | number
  limit?: number
}

export interface MovScriptWorkspaceSettingQuery {
  settingId?: string | number
  kind?: string
  status?: string
  query?: string
  limit?: number
}

export interface MovScriptWorkspaceAssetSlotQuery {
  assetSlotId?: string | number
  settingId?: string | number
  settingStateId?: string | number
  ownerType?: string
  ownerId?: string | number
  productionId?: string | number
  status?: string
  query?: string
  includeCandidates?: boolean
  limit?: number
}

export interface MovScriptWorkspaceProductionContextQuery {
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  contentUnitId?: string | number
  status?: string
  query?: string
  include?: Array<'productions' | 'segments' | 'scene_moments' | 'content_units' | 'keyframes'>
  limit?: number
}

export function buildMovScriptWorkspaceDomainIndex(documents: MovScriptWorkspaceDocument[]): MovScriptWorkspaceDomainIndex {
  const entities = documents.flatMap((document) => indexedEntitiesFromDocument(document))
  const byType = new Map<MovScriptWorkspaceEntityType, MovScriptWorkspaceIndexedEntity[]>()
  for (const entity of entities) {
    byType.set(entity.entityType, [...(byType.get(entity.entityType) ?? []), entity])
  }
  return { documents, entities, byType }
}

export function queryMovScriptWorkspaceEntities(
  index: MovScriptWorkspaceDomainIndex,
  query: MovScriptWorkspaceEntityQuery = {},
): MovScriptWorkspaceIndexedEntity[] {
  const source = query.entityType ? index.byType.get(query.entityType) ?? [] : index.entities
  const out = source.filter((entity) => {
    const record = entity.record
    if (query.status && stringField(record.status) !== query.status) return false
    if (query.kind && stringField(record.kind) !== query.kind) return false
    if (query.ownerType && stringField(record.owner_type ?? record.ownerType) !== query.ownerType) return false
    if (query.ownerId !== undefined && !sameId(record.owner_id ?? record.ownerId, query.ownerId)) return false
    if (query.productionId !== undefined && !sameId(record.production_id ?? record.productionId, query.productionId)) return false
    if (query.segmentId !== undefined && !sameId(record.segment_id ?? record.segmentId, query.segmentId)) return false
    if (query.sceneMomentId !== undefined && !sameId(record.scene_moment_id ?? record.sceneMomentId, query.sceneMomentId)) return false
    if (query.contentUnitId !== undefined && !sameId(record.content_unit_id ?? record.contentUnitId, query.contentUnitId)) return false
    if (query.settingId !== undefined && !sameId(record.setting_id ?? record.settingId, query.settingId)) return false
    if (query.settingStateId !== undefined && !sameId(record.setting_state_id ?? record.settingStateId, query.settingStateId)) return false
    if (query.query && !recordMatchesQuery(record, query.query)) return false
    return !isDeletedWorkspaceRecord(record)
  })
  return limitEntities(out, query.limit)
}

export function queryMovScriptWorkspaceSettings(
  index: MovScriptWorkspaceDomainIndex,
  query: MovScriptWorkspaceSettingQuery = {},
): MovScriptWorkspaceIndexedEntity[] {
  const references = queryMovScriptWorkspaceEntities(index, {
    entityType: 'setting',
    kind: query.kind,
    status: query.status,
    query: query.query,
    limit: query.limit,
  })
  if (query.settingId === undefined) return references
  return references.filter((entity) => sameId(entity.id, query.settingId))
}

export function queryMovScriptWorkspaceAssetSlots(
  index: MovScriptWorkspaceDomainIndex,
  query: MovScriptWorkspaceAssetSlotQuery = {},
): {
  assetSlots: MovScriptWorkspaceIndexedEntity[]
  candidates?: MovScriptWorkspaceIndexedEntity[]
} {
  const assetSlots = queryMovScriptWorkspaceEntities(index, {
    entityType: 'asset_slot',
    status: query.status,
    query: query.query,
    ownerType: query.ownerType,
    ownerId: query.ownerId,
    productionId: query.productionId,
    limit: query.limit,
  }).filter((entity) => {
    if (query.assetSlotId !== undefined && !sameId(entity.id, query.assetSlotId)) return false
    if (query.settingId !== undefined && !assetSlotMatchesSetting(entity.record, query.settingId)) return false
    if (query.settingStateId !== undefined && !assetSlotMatchesSettingState(entity.record, query.settingStateId)) return false
    return true
  })

  if (!query.includeCandidates) return { assetSlots }
  const assetSlotIds = new Set(assetSlots.map((entity) => String(entity.id ?? '')).filter(Boolean))
  const candidates = [
    ...(index.byType.get('asset_slot_candidate') ?? []),
    ...(index.byType.get('candidate') ?? []).filter((entity) => candidateTargetsAssetSlot(entity.record)),
  ].filter((entity) => {
    if (isDeletedWorkspaceRecord(entity.record)) return false
    const directSlotId = entity.record.asset_slot_id ?? entity.record.assetSlotId
    const target = isRecord(entity.record.target) ? entity.record.target : undefined
    const targetId = directSlotId ?? target?.id
    return targetId !== undefined && assetSlotIds.has(String(targetId))
  })
  return { assetSlots, candidates }
}

export function queryMovScriptWorkspaceProductionContext(
  index: MovScriptWorkspaceDomainIndex,
  query: MovScriptWorkspaceProductionContextQuery = {},
): Record<string, MovScriptWorkspaceIndexedEntity[]> {
  const include = new Set(query.include ?? ['productions', 'segments', 'scene_moments', 'content_units', 'keyframes'])
  const result: Record<string, MovScriptWorkspaceIndexedEntity[]> = {}
  if (include.has('productions')) {
    result.productions = queryMovScriptWorkspaceEntities(index, {
      entityType: 'production',
      status: query.status,
      query: query.query,
      limit: query.limit,
    }).filter((entity) => query.productionId === undefined || sameId(entity.id, query.productionId))
  }
  if (include.has('segments')) {
    result.segments = queryMovScriptWorkspaceEntities(index, {
      entityType: 'segment',
      status: query.status,
      productionId: query.productionId,
      query: query.query,
      limit: query.limit,
    }).filter((entity) => query.segmentId === undefined || sameId(entity.id, query.segmentId))
  }
  if (include.has('scene_moments')) {
    result.scene_moments = queryMovScriptWorkspaceEntities(index, {
      entityType: 'scene_moment',
      status: query.status,
      productionId: query.productionId,
      segmentId: query.segmentId,
      query: query.query,
      limit: query.limit,
    }).filter((entity) => query.sceneMomentId === undefined || sameId(entity.id, query.sceneMomentId))
  }
  if (include.has('content_units')) {
    result.content_units = queryMovScriptWorkspaceEntities(index, {
      entityType: 'content_unit',
      status: query.status,
      productionId: query.productionId,
      segmentId: query.segmentId,
      sceneMomentId: query.sceneMomentId,
      query: query.query,
      limit: query.limit,
    }).filter((entity) => query.contentUnitId === undefined || sameId(entity.id, query.contentUnitId))
  }
  if (include.has('keyframes')) {
    result.keyframes = queryMovScriptWorkspaceEntities(index, {
      entityType: 'keyframe',
      status: query.status,
      productionId: query.productionId,
      sceneMomentId: query.sceneMomentId,
      contentUnitId: query.contentUnitId,
      query: query.query,
      limit: query.limit,
    })
  }
  return result
}

function indexedEntitiesFromDocument(document: MovScriptWorkspaceDocument): MovScriptWorkspaceIndexedEntity[] {
  const path = normalizeWorkspacePath(document.path)
  if (typeof document.data === 'string' && path.endsWith('/script.md')) {
    const scriptId = pathSegmentAfter(path, 'scripts')
    return [indexedEntity('script', { id: scriptId, content: document.data, raw_source: document.data }, path, 0)]
  }
  if (!isRecord(document.data)) return []

  const directType = entityTypeFromSchema(stringField(document.data.schema)) ?? entityTypeFromPath(path)
  const out: MovScriptWorkspaceIndexedEntity[] = []
  if (directType) out.push(indexedEntity(directType, document.data, path, 0))

  const workspace = isRecord(document.data.workspace)
    ? document.data.workspace
    : isRecord(document.data.data)
      ? document.data.data
      : undefined
  if (workspace) {
    collectWorkspaceRows(out, path, workspace)
    collectProductionTreeRows(out, path, workspace)
    collectContentUnitWorkspaceRows(out, path, workspace)
  }
  return dedupeEntities(out)
}

function collectWorkspaceRows(out: MovScriptWorkspaceIndexedEntity[], path: string, workspace: Record<string, unknown>): void {
  const mappings: Array<[string, MovScriptWorkspaceEntityType]> = [
    ['scripts', 'script'],
    ['script_versions', 'script_version'],
    ['script_blocks', 'script_block'],
    ['productions', 'production'],
    ['production_text_blocks', 'production_text_block'],
    ['segments', 'segment'],
    ['scene_moments', 'scene_moment'],
    ['writing_expressions', 'writing_expression'],
    ['storyboard_scripts', 'storyboard_script'],
    ['storyboard_versions', 'storyboard_version'],
    ['content_units', 'content_unit'],
    ['keyframes', 'keyframe'],
    ['preview_timelines', 'preview_timeline'],
    ['preview_timeline_items', 'preview_timeline_item'],
    ['settings', 'setting'],
    ['setting_states', 'setting_state'],
    ['setting_usages', 'setting_usage'],
    ['creative_relationships', 'creative_relationship'],
    ['asset_slots', 'asset_slot'],
    ['asset_slot_candidates', 'asset_slot_candidate'],
    ['candidates', 'candidate'],
    ['candidate_decisions', 'candidate_decision'],
    ['review_events', 'review_event'],
    ['work_items', 'work_item'],
    ['work_reviews', 'work_review'],
    ['work_dependencies', 'work_dependency'],
    ['delivery_versions', 'delivery_version'],
    ['delivery_timeline_items', 'delivery_timeline_item'],
    ['export_records', 'export_record'],
    ['canvas_outputs', 'canvas_output'],
  ]
  for (const [key, entityType] of mappings) {
    const rows = workspace[key]
    if (!Array.isArray(rows)) continue
    rows.filter(isRecord).forEach((row, index) => out.push(indexedEntity(entityType, row, path, index)))
  }
}

function collectProductionTreeRows(out: MovScriptWorkspaceIndexedEntity[], path: string, workspace: Record<string, unknown>): void {
  const segments = Array.isArray(workspace.segments) ? workspace.segments.filter(isRecord) : []
  for (const [segmentIndex, segment] of segments.entries()) {
    out.push(indexedEntity('segment', segment, path, segmentIndex))
    const sceneMoments = Array.isArray(segment.scene_moments) ? segment.scene_moments.filter(isRecord) : []
    for (const [momentIndex, moment] of sceneMoments.entries()) {
      const momentRecord = inheritForeignIds(moment, segment, ['production_id', 'productionId'], ['segment_id', 'segmentId'])
      out.push(indexedEntity('scene_moment', momentRecord, path, momentIndex))
      collectNestedRows(out, path, momentRecord, 'content_units', 'content_unit')
      collectNestedRows(out, path, momentRecord, 'keyframes', 'keyframe')
      collectNestedRows(out, path, momentRecord, 'asset_slots', 'asset_slot')
      collectNestedRows(out, path, momentRecord, 'writing_expressions', 'writing_expression')
      const contentUnits = Array.isArray(momentRecord.content_units) ? momentRecord.content_units.filter(isRecord) : []
      for (const [unitIndex, unit] of contentUnits.entries()) {
        const unitRecord = inheritForeignIds(unit, momentRecord, ['production_id', 'productionId'], ['segment_id', 'segmentId'], ['scene_moment_id', 'sceneMomentId'])
        out.push(indexedEntity('content_unit', unitRecord, path, unitIndex))
        collectNestedRows(out, path, unitRecord, 'keyframes', 'keyframe')
        collectNestedRows(out, path, unitRecord, 'asset_slots', 'asset_slot')
      }
    }
  }
}

function collectContentUnitWorkspaceRows(out: MovScriptWorkspaceIndexedEntity[], path: string, workspace: Record<string, unknown>): void {
  const units = Array.isArray(workspace.units) ? workspace.units.filter(isRecord) : []
  for (const [index, unit] of units.entries()) out.push(indexedEntity('content_unit', unit, path, index))
  const keyframes = Array.isArray(workspace.keyframes) ? workspace.keyframes.filter(isRecord) : []
  for (const [index, keyframe] of keyframes.entries()) out.push(indexedEntity('keyframe', keyframe, path, index))
}

function collectNestedRows(
  out: MovScriptWorkspaceIndexedEntity[],
  path: string,
  owner: Record<string, unknown>,
  key: string,
  entityType: MovScriptWorkspaceEntityType,
): void {
  const rows = owner[key]
  if (!Array.isArray(rows)) return
  rows.filter(isRecord).forEach((row, index) => out.push(indexedEntity(entityType, inheritForeignIds(row, owner), path, index)))
}

function indexedEntity(
  entityType: MovScriptWorkspaceEntityType,
  record: Record<string, unknown>,
  path: string,
  index: number,
): MovScriptWorkspaceIndexedEntity {
  const schema = stringField(record.schema)
  const id = idField(record.ID ?? record.id)
  const clientId = stringField(record.client_id ?? record.clientId)
  return {
    entityType,
    record,
    path,
    index,
    ...(id !== undefined ? { id } : {}),
    ...(clientId ? { clientId } : {}),
    ...(schema ? { schema } : {}),
  }
}

function inheritForeignIds(
  record: Record<string, unknown>,
  owner: Record<string, unknown>,
  ...keys: Array<[string, string]>
): Record<string, unknown> {
  const inherited = { ...record }
  const pairs = keys.length > 0
    ? keys
    : [
        ['production_id', 'productionId'],
        ['segment_id', 'segmentId'],
        ['scene_moment_id', 'sceneMomentId'],
        ['content_unit_id', 'contentUnitId'],
      ] as Array<[string, string]>
  for (const [snake, camel] of pairs) {
    if (inherited[snake] !== undefined || inherited[camel] !== undefined) continue
    const value = owner[snake] ?? owner[camel] ?? owner.ID ?? owner.id
    if (value !== undefined && ownerLooksLikeFieldOwner(owner, snake)) inherited[snake] = value
  }
  return inherited
}

function ownerLooksLikeFieldOwner(owner: Record<string, unknown>, snakeField: string): boolean {
  if (snakeField === 'segment_id') return owner.segment_id !== undefined || owner.segmentId !== undefined || owner.scene_moments !== undefined
  if (snakeField === 'scene_moment_id') return owner.scene_moment_id !== undefined || owner.sceneMomentId !== undefined || owner.content_units !== undefined
  if (snakeField === 'content_unit_id') return owner.content_unit_id !== undefined || owner.contentUnitId !== undefined || owner.keyframes !== undefined
  if (snakeField === 'production_id') return owner.production_id !== undefined || owner.productionId !== undefined
  return false
}

function dedupeEntities(entities: MovScriptWorkspaceIndexedEntity[]): MovScriptWorkspaceIndexedEntity[] {
  const indexByKey = new Map<string, number>()
  const out: MovScriptWorkspaceIndexedEntity[] = []
  for (const entity of entities) {
    const key = entity.id !== undefined || entity.clientId
      ? `${entity.entityType}:${entity.id ?? entity.clientId}`
      : `${entity.entityType}:${entity.path}:${entity.index}`
    const existingIndex = indexByKey.get(key)
    if (existingIndex !== undefined) {
      if (isDirectObjectPath(entity.path) && !isDirectObjectPath(out[existingIndex]?.path ?? '')) {
        out[existingIndex] = entity
      }
      continue
    }
    indexByKey.set(key, out.length)
    out.push(entity)
  }
  return out
}

function isDirectObjectPath(path: string): boolean {
  const name = path.split('/').pop() ?? path
  return /^([a-z_]+)_([^/]+)\.json$/.test(name)
    || name === 'project.json'
    || name === 'script.meta.json'
}

function entityTypeFromSchema(schema: string | undefined): MovScriptWorkspaceEntityType | undefined {
  if (!schema) return undefined
  const normalized = schema.replace(/^movscript\./, '').replace(/\.v\d+$/, '')
  return schemaEntityTypes[normalized]
}

function entityTypeFromPath(path: string): MovScriptWorkspaceEntityType | undefined {
  const name = path.split('/').pop() ?? path
  if (name === 'project.json') return 'project'
  if (name === 'script.meta.json' || name === 'script.json') return 'script'
  if (/^setting_[^/]+\.json$/.test(name)) return 'setting'
  if (/^asset_slot_[^/]+\.json$/.test(name)) return 'asset_slot'
  if (/^candidate_[^/]+\.json$/.test(name)) return 'candidate'
  return undefined
}

const schemaEntityTypes: Record<string, MovScriptWorkspaceEntityType> = {
  project: 'project',
  script: 'script',
  script_version: 'script_version',
  script_block: 'script_block',
  production: 'production',
  production_text_block: 'production_text_block',
  segment: 'segment',
  scene_moment: 'scene_moment',
  writing_expression: 'writing_expression',
  storyboard_script: 'storyboard_script',
  storyboard_version: 'storyboard_version',
  content_unit: 'content_unit',
  keyframe: 'keyframe',
  preview_timeline: 'preview_timeline',
  preview_timeline_item: 'preview_timeline_item',
  setting: 'setting',
  setting_state: 'setting_state',
  setting_usage: 'setting_usage',
  creative_relationship: 'creative_relationship',
  asset_slot: 'asset_slot',
  asset_slot_candidate: 'asset_slot_candidate',
  candidate: 'candidate',
  candidate_decision: 'candidate_decision',
  review_event: 'review_event',
  work_item: 'work_item',
  work_review: 'work_review',
  work_dependency: 'work_dependency',
  delivery_version: 'delivery_version',
  delivery_timeline_item: 'delivery_timeline_item',
  export_record: 'export_record',
  canvas_output: 'canvas_output',
}

function candidateTargetsAssetSlot(record: Record<string, unknown>): boolean {
  const target = isRecord(record.target) ? record.target : undefined
  return stringField(target?.type) === 'asset_slot' || record.asset_slot_id !== undefined || record.assetSlotId !== undefined
}

function assetSlotMatchesSetting(record: Record<string, unknown>, settingId: string | number): boolean {
  return sameId(record.setting_id ?? record.settingId, settingId)
    || (stringField(record.owner_type ?? record.ownerType) === 'setting' && sameId(record.owner_id ?? record.ownerId, settingId))
}

function assetSlotMatchesSettingState(record: Record<string, unknown>, stateId: string | number): boolean {
  return sameId(record.setting_state_id ?? record.settingStateId, stateId)
    || (stringField(record.owner_type ?? record.ownerType) === 'setting_state' && sameId(record.owner_id ?? record.ownerId, stateId))
}

function recordMatchesQuery(record: Record<string, unknown>, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return ['name', 'title', 'label', 'alias', 'description', 'content', 'summary', 'prompt', 'prompt_hint', 'metadata_json']
    .some((key) => String(record[key] ?? '').toLowerCase().includes(needle))
}

function isDeletedWorkspaceRecord(record: Record<string, unknown>): boolean {
  return record.__delete === true || record.deleted === true || record.status === 'deleted'
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

function normalizeWorkspacePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.movscript\//, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
