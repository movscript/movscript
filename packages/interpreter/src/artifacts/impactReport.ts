import type { MovScriptWorkspaceDomainIndex } from '@movscript/workspace/indexer'
import type { MovScriptSemanticChange } from '../semanticChanges/index.js'
import { hasSpecializedContentUnitAdapter } from './contentProduction.js'
import type {
  MovScriptDomainEntityRef,
  MovScriptDomainRelation,
  MovScriptImpactReportArtifact,
  MovScriptRelationGraphArtifact,
  MovScriptWorkspaceArtifactsInput,
} from './derivedArtifactTypes.js'
import {
  canonicalEntities,
  entityRef,
  entityRefKey,
  entityRefMatches,
} from './derivedArtifactHelpers.js'

export function deriveImpactReport(
  changedEntities: MovScriptWorkspaceArtifactsInput['changedEntities'],
  interpretationId: string,
  createdAt: string,
  index: MovScriptWorkspaceDomainIndex,
  relationGraph: MovScriptRelationGraphArtifact,
  semanticChanges: readonly MovScriptSemanticChange[] = [],
): MovScriptImpactReportArtifact {
  const semanticChangesByEntity = groupSemanticChangesByEntity(semanticChanges)
  return {
    schema: 'movscript.impact-report.v1',
    interpretationId,
    createdAt,
    changedEntities: changedEntities.map((entity) => {
      const affectedContentUnits = affectedContentUnitsForChangedEntity(entity, index, relationGraph)
      return {
        entityKind: entity.entityKind,
        ...(entity.id !== undefined ? { id: entity.id } : {}),
        path: entity.path,
        state: entity.state,
        businessImpacts: businessImpactsForChangedEntity(entity, semanticChangesByEntity),
        editorImpacts: editorImpactsForChangedEntity(entity, affectedContentUnits),
        affectedContentUnits,
        staleMarkers: staleMarkersForChangedEntity(entity, affectedContentUnits),
      }
    }),
  }
}

function groupSemanticChangesByEntity(
  semanticChanges: readonly MovScriptSemanticChange[],
): Map<string, MovScriptSemanticChange[]> {
  const groups = new Map<string, MovScriptSemanticChange[]>()
  for (const change of semanticChanges) {
    const key = entitySemanticKey(change.entity.kind, change.entity.id)
    groups.set(key, [...(groups.get(key) ?? []), change])
  }
  return groups
}

function businessImpactsForChangedEntity(
  entity: MovScriptWorkspaceArtifactsInput['changedEntities'][number],
  semanticChangesByEntity: Map<string, MovScriptSemanticChange[]>,
): string[] {
  const changes = semanticChangesByEntity.get(entitySemanticKey(entity.entityKind, entity.id)) ?? []
  const labels = changes.map((change) => businessImpactLabel(change.businessKind))
  return [...new Set(labels)].sort()
}

function businessImpactLabel(businessKind: MovScriptSemanticChange['businessKind']): string {
  const labels: Record<MovScriptSemanticChange['businessKind'], string> = {
    metadata_changed: 'Metadata changed',
    semantic_input_changed: 'Semantic input changed',
    reference_changed: 'Reference changed',
    selection_changed: 'Selection changed',
    sequence_reordered: 'Sequence reordered',
    expression_unit_changed: 'Expression unit changed',
    storyboard_changed: 'Storyboard changed',
    keyframe_changed: 'Keyframe changed',
    content_unit_changed: 'Content unit changed',
    project_context_changed: 'Project context changed',
    production_structure_changed: 'Production structure changed',
    domain_entity_changed: 'Domain entity changed',
  }
  return labels[businessKind]
}

function entitySemanticKey(entityKind: string, id: string | number | undefined): string {
  return `${entityKind}:${String(id ?? '')}`
}

function editorImpactsForChangedEntity(
  entity: MovScriptWorkspaceArtifactsInput['changedEntities'][number],
  affectedContentUnits: MovScriptDomainEntityRef[] = [],
): string[] {
  switch (entity.entityKind) {
    case 'project_standards':
      return ['Generation prompt bundles may need reinterpretation.']
    case 'setting':
    case 'setting_state':
    case 'asset':
      return [
        'Setting asset index should be refreshed.',
        affectedContentUnits.length > 0
          ? `${affectedContentUnits.length} content production context(s) using this setting may be stale.`
          : 'Generation contexts using this setting may be stale.',
      ]
    case 'production':
    case 'segment':
    case 'scene_moment':
    case 'storyboard':
    case 'audio_cue':
    case 'expression_unit':
      return [
        'Production planning tree should be refreshed.',
        'Preview timeline may need reinterpretation.',
        ...(affectedContentUnits.length > 0 ? [`${affectedContentUnits.length} content production prompt bundle(s) may need reinterpretation.`] : []),
      ]
    case 'content_unit':
      return ['Content production context should be refreshed.', 'Preview timeline items using this content unit may be stale.']
    case 'keyframe':
      return [
        'Visual anchors and generation reference bundles may need reinterpretation.',
        ...(affectedContentUnits.length > 0 ? [`${affectedContentUnits.length} content production prompt bundle(s) may need reinterpretation.`] : []),
      ]
    default:
      return ['Domain index should be refreshed.']
  }
}

function affectedContentUnitsForChangedEntity(
  changedEntity: MovScriptWorkspaceArtifactsInput['changedEntities'][number],
  index: MovScriptWorkspaceDomainIndex,
  relationGraph: MovScriptRelationGraphArtifact,
): MovScriptDomainEntityRef[] {
  if (changedEntity.entityKind === 'content_unit') {
    const sourceEntity = normalizeChangedEntityRef(changedEntity, index)
    const contentUnit = canonicalEntities(index).find((entity) => entity.entityKind === 'content_unit' && entityRefMatches(entityRef(entity), sourceEntity))
    return changedEntity.id !== undefined && hasSpecializedContentUnitAdapter(contentUnit?.record.content_unit_type)
      ? [{ entityKind: 'content_unit', id: changedEntity.id, path: changedEntity.path }]
      : []
  }

  const changedRef = normalizeChangedEntityRef(changedEntity, index)
  return canonicalEntities(index)
    .filter((entity) => entity.entityKind === 'content_unit' && entity.id !== undefined && hasSpecializedContentUnitAdapter(entity.record.content_unit_type))
    .filter((contentUnit) => contentUnitReferencesChangedEntity(entityRef(contentUnit), changedRef, relationGraph))
    .map(entityRef)
}

function contentUnitReferencesChangedEntity(
  contentUnit: MovScriptDomainEntityRef,
  changedRef: MovScriptDomainEntityRef,
  relationGraph: MovScriptRelationGraphArtifact,
): boolean {
  const visited = new Set<string>()
  const queue: MovScriptDomainEntityRef[] = [contentUnit]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    const currentKey = entityRefKey(current)
    if (visited.has(currentKey)) continue
    visited.add(currentKey)
    if (entityRefMatches(current, changedRef)) return true
    for (const relation of relationGraph.relations) {
      if (!isRelevantDependencyRelation(relation, changedRef)) continue
      if (!entityRefMatches(relation.from, current)) continue
      queue.push(relation.to)
    }
  }
  return false
}

function isRelevantDependencyRelation(
  relation: MovScriptDomainRelation,
  changedRef: MovScriptDomainEntityRef,
): boolean {
  if (relation.type === 'references' || relation.type === 'uses') return true
  if (relation.type === 'owns') return changedRef.entityKind === 'asset'
  if (relation.type === 'contains') {
    return changedRef.entityKind === 'keyframe'
      || changedRef.entityKind === 'expression_unit'
      || changedRef.entityKind === 'audio_cue'
      || changedRef.entityKind === 'storyboard'
      || changedRef.entityKind === 'scene_moment'
  }
  return false
}

function normalizeChangedEntityRef(
  changedEntity: MovScriptWorkspaceArtifactsInput['changedEntities'][number],
  index: MovScriptWorkspaceDomainIndex,
): MovScriptDomainEntityRef {
  const existing = canonicalEntities(index).find((entity) => {
    return entity.entityKind === changedEntity.entityKind
      && (entity.path === changedEntity.path || entity.id !== undefined && changedEntity.id !== undefined && String(entity.id) === String(changedEntity.id))
  })
  return existing ? entityRef(existing) : {
    entityKind: changedEntity.entityKind,
    ...(changedEntity.id !== undefined ? { id: changedEntity.id } : {}),
    path: changedEntity.path,
  }
}

function staleMarkersForChangedEntity(
  entity: MovScriptWorkspaceArtifactsInput['changedEntities'][number],
  affectedContentUnits: MovScriptDomainEntityRef[],
): string[] {
  if (affectedContentUnits.length === 0) return []
  if (entity.entityKind === 'content_unit') {
    return affectedContentUnits.map((contentUnit) => `content_unit:${String(contentUnit.id ?? contentUnit.path)}:self_changed`)
  }
  const reason = entity.entityKind === 'asset' || entity.entityKind === 'setting' || entity.entityKind === 'setting_state'
    ? 'setting_context_changed'
    : entity.entityKind === 'keyframe'
      ? 'visual_anchor_changed'
      : 'planning_context_changed'
  return affectedContentUnits.map((contentUnit) => `content_unit:${String(contentUnit.id ?? contentUnit.path)}:${reason}`)
}
