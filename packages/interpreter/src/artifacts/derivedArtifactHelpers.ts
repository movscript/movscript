import type { SemanticEntityKind } from '@movscript/language/domain'
import type {
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceIndexedEntity,
} from '@movscript/workspace/indexer'
import { sameEntityRef } from '@movscript/workspace/layout'
import type {
  MovScriptDomainEntityRef,
  MovScriptDomainRelation,
  MovScriptDomainRelationType,
} from './derivedArtifactTypes.js'

export function canonicalEntities(index: MovScriptWorkspaceDomainIndex): MovScriptWorkspaceIndexedEntity[] {
  return index.entities
}

export function entityRef(entity: MovScriptWorkspaceIndexedEntity): MovScriptDomainEntityRef {
  return {
    entityKind: entity.entityKind,
    ...(entity.id !== undefined ? { id: entity.id } : {}),
    path: entity.path,
  }
}

export function entityRefKey(ref: MovScriptDomainEntityRef): string {
  return `${ref.entityKind}:${String(ref.id ?? ref.path ?? '')}`
}

export function entityRefMatches(left: MovScriptDomainEntityRef, right: MovScriptDomainEntityRef): boolean {
  if (left.entityKind !== right.entityKind) return false
  if (left.id !== undefined && right.id !== undefined && String(left.id) === String(right.id)) return true
  if (left.path && right.path && left.path === right.path) return true
  return false
}

export function nearestParentEntity(
  path: string,
  entitiesByDir: Map<string, MovScriptWorkspaceIndexedEntity>,
): MovScriptWorkspaceIndexedEntity | undefined {
  const parent = nearestParentPath(entityDir(path), new Set(entitiesByDir.keys()))
  return parent ? entitiesByDir.get(parent) : undefined
}

export function nearestParentPath(path: string, candidates: Set<string>): string | undefined {
  const parts = path.split('/')
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const candidate = parts.slice(0, index).join('/')
    if (candidates.has(candidate)) return candidate
  }
  return undefined
}

export function relationTypeForParent(parentType: string, childType: string): MovScriptDomainRelationType {
  if (parentType === 'setting_state' && childType === 'asset') return 'owns'
  return 'contains'
}

export function dedupeRelations(relations: MovScriptDomainRelation[]): MovScriptDomainRelation[] {
  const seen = new Set<string>()
  const out: MovScriptDomainRelation[] = []
  for (const relation of relations) {
    const key = JSON.stringify(relation)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(relation)
  }
  return out
}

export function entityDir(path: string): string {
  return path.replace(/\/[^/]+$/, '')
}

export function normalizedRefDir(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\/+$/, '') : ''
}

export function entityKey(entityKind: string, id: unknown): string {
  return `${entityKind}:${String(id ?? '')}`
}

export function findEntityByRef(
  entities: MovScriptWorkspaceIndexedEntity[],
  entityKind: string,
  ref: unknown,
): MovScriptWorkspaceIndexedEntity | undefined {
  if (ref === undefined || ref === null || String(ref).trim() === '') return undefined
  return entities.find((entity) => entity.entityKind === entityKind && sameEntityRef(entity.id, ref, entityKind))
}

export function parentShotForEntity(
  entity: MovScriptWorkspaceIndexedEntity,
  entityByPathDir: Map<string, MovScriptWorkspaceIndexedEntity>,
  entityById: Map<string, MovScriptWorkspaceIndexedEntity>,
): MovScriptWorkspaceIndexedEntity | undefined {
  const shotRef = normalizedRefDir(entity.record.shot_ref)
  if (shotRef) return entityByPathDir.get(shotRef) ?? entityById.get(entityKey('shot', shotRef))
  const shotId = pathSegmentAfter(entity.path, 'shots')
  return shotId ? entityById.get(entityKey('shot', shotId)) : undefined
}

export function pathSegmentAfter(path: string, segment: string): string | undefined {
  const parts = path.split('/')
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

export function recordField(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

export function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

export function isProductionWithId(entity: MovScriptWorkspaceIndexedEntity): entity is MovScriptWorkspaceIndexedEntity & { id: string | number } {
  return entity.entityKind === 'production' && entity.id !== undefined
}

export function childEntities(
  index: MovScriptWorkspaceDomainIndex,
  parentDir: string,
  entityKind: SemanticEntityKind,
): MovScriptWorkspaceIndexedEntity[] {
  const collectionName = collectionDirForEntityKind(entityKind)
  if (!collectionName) return []
  return canonicalEntities(index).filter((entity) => entity.entityKind === entityKind
    && entity.path.startsWith(`${parentDir}/${collectionName}/`)
    && entityDir(entity.path).replace(`${parentDir}/${collectionName}/`, '').split('/').length === 1)
}

function collectionDirForEntityKind(entityKind: SemanticEntityKind): string | undefined {
  if (entityKind === 'segment') return 'segments'
  if (entityKind === 'scene_moment') return 'scene_moments'
  if (entityKind === 'shot') return 'shots'
  if (entityKind === 'storyboard') return 'storyboards'
  if (entityKind === 'audio_cue') return 'audio_cues'
  if (entityKind === 'expression_unit') return 'expression_units'
  return undefined
}
