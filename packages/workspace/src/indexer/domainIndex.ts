import {
  normalizeWorkspacePath,
  sameEntityRef,
} from '../layout/index.js'
import type { SemanticEntityKind } from '@movscript/language/domain'
import {
  classifyMovScriptEntityKind,
  entityDir,
  nearestParentPath,
  normalizeContentUnitTargetEdges,
  normalizePathParentEdge,
  normalizeNamespaceVocabulary,
  projectMovScriptDomainNodeKind,
  type MovScriptDomainEdge,
  type MovScriptDomainNode,
  type MovScriptDomainRef,
  type MovScriptNormalizedNamespaceVocabulary,
} from '@movscript/domain'

export const SEMANTIC_ENTITY_KINDS = [
  'project',
  'project_standards',
  'script',
  'script_version',
  'script_block',
  'production',
  'segment',
  'scene_moment',
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
  namespaceVocabulary: MovScriptNormalizedNamespaceVocabulary
  domainNodes: MovScriptDomainNode[]
  domainEdges: MovScriptDomainEdge[]
}

export interface MovScriptWorkspaceEntityQuery {
  entityKind?: SemanticEntityKind
  kind?: string
  query?: string
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
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
  storyboardId?: string | number
  contentUnitId?: string | number
  query?: string
  include?: Array<'productions' | 'segments' | 'scene_moments' | 'storyboards' | 'audio_cues' | 'expression_units' | 'content_units' | 'keyframes'>
  limit?: number
}

interface MovScriptWorkspaceEntityQueryContext {
  entityByPath: Map<string, MovScriptWorkspaceIndexedEntity>
  parentPathByPath: Map<string, string>
}

export function deriveMovScriptWorkspaceDomainIndex(documents: MovScriptWorkspaceDocument[]): MovScriptWorkspaceDomainIndex {
  const entities = documents.flatMap((document) => indexedEntitiesFromDocument(document))
  const byKind = new Map<SemanticEntityKind, MovScriptWorkspaceIndexedEntity[]>()
  for (const entity of entities) {
    byKind.set(entity.entityKind, [...(byKind.get(entity.entityKind) ?? []), entity])
  }
  const namespaceVocabulary = normalizeNamespaceVocabulary(byKind.get('project')?.[0]?.record)
  const domainNodes = deriveMovScriptDomainNodes(entities)
  const domainEdges = deriveMovScriptDomainEdges(entities, domainNodes)
  return { documents, entities, byKind, namespaceVocabulary, domainNodes, domainEdges }
}

export function queryMovScriptWorkspaceEntities(
  index: MovScriptWorkspaceDomainIndex,
  query: MovScriptWorkspaceEntityQuery = {},
): MovScriptWorkspaceIndexedEntity[] {
  const source = query.entityKind ? index.byKind.get(query.entityKind) ?? [] : index.entities
  const queryContext = createEntityQueryContext(index)
  const out = source.filter((entity) => {
    const record = entity.record
    if (query.kind && !entityKindMatches(entity, query.kind)) return false
    if (query.productionId !== undefined && !entityMatchesScope(entity, 'production', query.productionId, queryContext)) return false
    if (query.segmentId !== undefined && !entityMatchesScope(entity, 'segment', query.segmentId, queryContext)) return false
    if (query.sceneMomentId !== undefined && !entityMatchesScope(entity, 'scene_moment', query.sceneMomentId, queryContext)) return false
    if (query.storyboardId !== undefined && !entityMatchesStoryboard(entity, query.storyboardId, queryContext)) return false
    if (query.contentUnitId !== undefined && !entityPathMatchesContentUnit(entity.path, query.contentUnitId)) return false
    if (query.settingId !== undefined && !entityMatchesScope(entity, 'setting', query.settingId, queryContext)) return false
    if (query.settingStateId !== undefined && !entityMatchesScope(entity, 'setting_state', query.settingStateId, queryContext)) return false
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
  const include = new Set(query.include ?? ['productions', 'segments', 'scene_moments', 'storyboards', 'audio_cues', 'expression_units', 'content_units', 'keyframes'])
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
  if (include.has('storyboards')) {
    result.storyboards = queryMovScriptWorkspaceEntities(index, {
      entityKind: 'storyboard',
      productionId: query.productionId,
      segmentId: query.segmentId,
      sceneMomentId: query.sceneMomentId,
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

function deriveMovScriptDomainNodes(entities: MovScriptWorkspaceIndexedEntity[]): MovScriptDomainNode[] {
  return entities.flatMap((entity) => {
    const category = classifyMovScriptEntityKind(entity.entityKind)
    if (!category) return []
    return [pruneUndefined({
      category,
      kind: projectMovScriptDomainNodeKind(entity.entityKind, entity.record),
      ...(entity.id !== undefined ? { id: entity.id } : {}),
      path: entity.path,
      title: stringField(entity.record.title) ?? stringField(entity.record.label),
      order: finiteNumber(entity.record.order),
      metadata: {
        entityKind: entity.entityKind,
      },
    }) as MovScriptDomainNode]
  })
}

function deriveMovScriptDomainPathParentEdges(nodes: MovScriptDomainNode[]): MovScriptDomainEdge[] {
  const nodeByDir = new Map<string, MovScriptDomainNode>()
  for (const node of nodes) {
    if (!node.path) continue
    nodeByDir.set(entityDir(node.path), node)
  }
  const edges: MovScriptDomainEdge[] = []
  for (const node of nodes) {
    if (!node.path) continue
    const parentPath = nearestParentPath(entityDir(node.path), nodeByDir.keys())
    if (!parentPath) continue
    const parent = nodeByDir.get(parentPath)
    const normalized = normalizePathParentEdge(domainRefFromNode(node), parent ? domainRefFromNode(parent) : undefined)
    if (normalized.edge) edges.push(normalized.edge)
  }
  return dedupeDomainEdges(edges)
}

function deriveMovScriptDomainEdges(
  entities: MovScriptWorkspaceIndexedEntity[],
  nodes: MovScriptDomainNode[],
): MovScriptDomainEdge[] {
  return dedupeDomainEdges([
    ...deriveMovScriptDomainPathParentEdges(nodes),
    ...deriveMovScriptContentUnitTargetEdges(entities, nodes),
  ])
}

function deriveMovScriptContentUnitTargetEdges(
  entities: MovScriptWorkspaceIndexedEntity[],
  nodes: MovScriptDomainNode[],
): MovScriptDomainEdge[] {
  const nodeByPath = new Map(nodes.flatMap((node) => node.path ? [[node.path, node] as const] : []))
  const timelineNamespaceNodes = nodes.filter((node) => node.category === 'timeline_namespace')
  const edges: MovScriptDomainEdge[] = []
  for (const entity of entities) {
    if (entity.entityKind !== 'content_unit') continue
    const sourceNode = nodeByPath.get(entity.path)
    if (!sourceNode) continue
    edges.push(...normalizeContentUnitTargetEdges({
      source: domainRefFromNode(sourceNode),
      record: entity.record,
      scopeTarget(scope) {
        return domainRefFromTimelineScope(scope.kind, scope.ref, timelineNamespaceNodes)
      },
    }))
  }
  return edges
}

function domainRefFromTimelineScope(
  scopeKind: string,
  scopeRef: string,
  timelineNamespaceNodes: MovScriptDomainNode[],
): MovScriptDomainRef {
  const node = timelineNamespaceNodes.find((candidate) =>
    String(candidate.id ?? '') === scopeRef
    && (candidate.kind === scopeKind || candidate.metadata?.entityKind === scopeKind),
  )
  return node
    ? domainRefFromNode(node)
    : { category: 'timeline_namespace', kind: scopeKind, id: scopeRef }
}

function domainRefFromNode(node: MovScriptDomainNode): MovScriptDomainRef {
  return {
    category: node.category,
    kind: node.kind,
    ...(node.id !== undefined ? { id: node.id } : {}),
    ...(node.path ? { path: node.path } : {}),
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

function entityPathMatchesStoryboard(path: string, storyboardId: string | number): boolean {
  return pathSegmentAfter(path, 'storyboards') !== undefined && sameEntityRef(pathSegmentAfter(path, 'storyboards'), storyboardId, 'storyboard')
}

function entityMatchesStoryboard(
  entity: MovScriptWorkspaceIndexedEntity,
  storyboardId: string | number,
  context: MovScriptWorkspaceEntityQueryContext,
): boolean {
  if (entityMatchesScope(entity, 'storyboard', storyboardId, context)) return true
  if (entityPathMatchesStoryboard(entity.path, storyboardId)) return true
  const storyboardRef = stringField(entity.record.storyboard_ref)
  return storyboardRef !== undefined && (
    entityPathMatchesStoryboard(storyboardRef, storyboardId)
    || sameNormalizedEntityPath(storyboardRef, storyboardId, 'storyboard')
  )
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

function createEntityQueryContext(index: MovScriptWorkspaceDomainIndex): MovScriptWorkspaceEntityQueryContext {
  const entityByPath = new Map(index.entities.map((entity) => [entity.path, entity] as const))
  const entityByDir = new Map(index.entities.map((entity) => [entityDir(entity.path), entity] as const))
  const parentPathByPath = new Map<string, string>()

  for (const edge of index.domainEdges) {
    if (edge.relation !== 'parent' || edge.origin !== 'path') continue
    if (!edge.source.path || !edge.target.path) continue
    parentPathByPath.set(edge.source.path, edge.target.path)
  }

  for (const entity of index.entities) {
    if (parentPathByPath.has(entity.path)) continue
    const parentDir = nearestParentPath(entityDir(entity.path), entityByDir.keys())
    const parent = parentDir ? entityByDir.get(parentDir) : undefined
    if (parent) parentPathByPath.set(entity.path, parent.path)
  }

  return { entityByPath, parentPathByPath }
}

function entityMatchesScope(
  entity: MovScriptWorkspaceIndexedEntity,
  scopeKind: SemanticEntityKind,
  scopeRef: string | number,
  context: MovScriptWorkspaceEntityQueryContext,
): boolean {
  if (entityRefMatchesScope(entity, scopeKind, scopeRef)) return true
  for (const ancestor of ancestorEntities(entity, context)) {
    if (entityRefMatchesScope(ancestor, scopeKind, scopeRef)) return true
  }
  return legacyEntityPathMatchesScope(entity.path, scopeKind, scopeRef)
}

function ancestorEntities(
  entity: MovScriptWorkspaceIndexedEntity,
  context: MovScriptWorkspaceEntityQueryContext,
): MovScriptWorkspaceIndexedEntity[] {
  const ancestors: MovScriptWorkspaceIndexedEntity[] = []
  const seen = new Set<string>([entity.path])
  let currentPath = entity.path
  while (true) {
    const parentPath = context.parentPathByPath.get(currentPath)
    if (!parentPath || seen.has(parentPath)) break
    seen.add(parentPath)
    const parent = context.entityByPath.get(parentPath)
    if (!parent) break
    ancestors.push(parent)
    currentPath = parent.path
  }
  return ancestors
}

function entityRefMatchesScope(
  entity: MovScriptWorkspaceIndexedEntity,
  scopeKind: SemanticEntityKind,
  scopeRef: string | number,
): boolean {
  if (entity.entityKind !== scopeKind) return false
  if (entity.id !== undefined && sameEntityRef(entity.id, scopeRef, scopeKind)) return true
  return sameNormalizedEntityPath(entity.path, scopeRef, scopeKind)
    || sameNormalizedEntityPath(entityDir(entity.path), scopeRef, scopeKind)
}

function legacyEntityPathMatchesScope(path: string, scopeKind: SemanticEntityKind, scopeRef: string | number): boolean {
  if (scopeKind === 'production') return entityPathMatchesProduction(path, scopeRef)
  if (scopeKind === 'segment') return entityPathMatchesSegment(path, scopeRef)
  if (scopeKind === 'scene_moment') return entityPathMatchesSceneMoment(path, scopeRef)
  if (scopeKind === 'storyboard') return entityPathMatchesStoryboard(path, scopeRef)
  if (scopeKind === 'setting') return entityPathMatchesSetting(path, scopeRef)
  if (scopeKind === 'setting_state') return entityPathMatchesSettingState(path, scopeRef)
  return false
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

function entityKindMatches(entity: MovScriptWorkspaceIndexedEntity, kind: string): boolean {
  return projectMovScriptDomainNodeKind(entity.entityKind, entity.record) === kind
    || recordKindMatches(entity.record, kind)
}

function recordKindMatches(record: Record<string, unknown>, kind: string): boolean {
  return [
    record.kind,
    record.namespace_kind,
    record.namespaceKind,
    record.timeline_namespace_kind,
    record.timelineNamespaceKind,
    record.setting_namespace_kind,
    record.settingNamespaceKind,
    record.setting_kind,
    record.settingKind,
    record.content_unit_type,
    record.contentUnitType,
    record.asset_kind,
    record.assetKind,
    record.shot_kind,
    record.shotKind,
    record.segment_kind,
    record.segmentKind,
    record.slot_kind,
    record.slotKind,
    record.expression_kind,
    record.expressionKind,
    record.cue_kind,
    record.cueKind,
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
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function finiteNumber(value: unknown): number | undefined {
  const next = Number(value)
  return Number.isFinite(next) ? next : undefined
}

function pathSegmentAfter(path: string, segment: string): string | undefined {
  const parts = path.split('/')
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

function sameNormalizedEntityPath(pathOrDir: string, ref: string | number, entityKind: string): boolean {
  const left = normalizeWorkspacePath(pathOrDir)
  const right = normalizeWorkspacePath(String(ref))
  if (!left || !right) return false
  if (left === right) return true
  if (left.endsWith('.json') && entityDir(left) === right) return true
  if (right.endsWith('.json') && left === entityDir(right)) return true
  return sameEntityRef(left, right, entityKind)
}

function normalizeIndexedDocumentPath(path: string): string {
  return normalizeWorkspacePath(path).replace(/^\.movscript\//, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item
  }
  return output as T
}

function dedupeDomainEdges(edges: MovScriptDomainEdge[]): MovScriptDomainEdge[] {
  const seen = new Set<string>()
  const out: MovScriptDomainEdge[] = []
  for (const edge of edges) {
    const key = JSON.stringify(edge)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(edge)
  }
  return out
}
