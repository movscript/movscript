import type {
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceIndexedEntity,
} from '@movscript/workspace/indexer'
import {
  type MovScriptDomainEdge,
  type MovScriptDomainRef,
  normalizeContentUnitTargetEdges,
} from '@movscript/domain'
import { hasSpecializedContentUnitAdapter } from './contentProduction.js'
import {
  parseContentUnitEditPromptRefs,
  primaryContentUnitRefs,
  primaryRefFieldNameForKind,
  primaryRefKindForContentUnitType,
} from './contentProductionHelpers.js'
import type {
  MovScriptDomainEntityRef,
  MovScriptDomainRelation,
  MovScriptRelationGraphArtifact,
} from './derivedArtifactTypes.js'
import {
  arrayField,
  canonicalEntities,
  dedupeRelations,
  entityDir,
  entityKey,
  entityRef,
  findEntityByRef,
  isRecord,
  nearestParentEntity,
  normalizedRefDir,
  parentExpressionUnitForEntity,
  recordField,
  relationTypeForParent,
} from './derivedArtifactHelpers.js'
export function deriveRelationGraph(index: MovScriptWorkspaceDomainIndex): MovScriptRelationGraphArtifact {
  const relations: MovScriptDomainRelation[] = []
  const sourceEntities = canonicalEntities(index)
  const entities = sourceEntities.filter((entity) => entity.id !== undefined)
  const entityByPathDir = new Map(sourceEntities.map((entity) => [entityDir(entity.path), entity]))
  const entityByPath = new Map(sourceEntities.map((entity) => [entity.path, entity]))
  const entityById = new Map(entities.map((entity) => [entityKey(entity.entityKind, entity.id), entity]))
  const normalizedParentRelationKeys = new Set<string>()
  const normalizedContentUnitRelationKeys = new Set<string>()

  for (const edge of index.domainEdges ?? []) {
    if (edge.relation === 'parent' && edge.origin === 'path') {
      const parent = edge.target.path ? entityByPath.get(edge.target.path) : undefined
      const child = edge.source.path ? entityByPath.get(edge.source.path) : undefined
      if (!parent || !child) continue
      const relation = {
        type: relationTypeForParent(parent.entityKind, child.entityKind),
        from: entityRef(parent),
        to: entityRef(child),
      }
      normalizedParentRelationKeys.add(parentRelationKey(parent, child))
      relations.push(relation)
      continue
    }

    const contentUnitRelation = contentUnitRelationFromDomainEdge(edge, entities, entityByPath)
    if (!contentUnitRelation) continue
    if (edge.source.path) normalizedContentUnitRelationKeys.add(contentUnitDomainEdgeKey(edge.source.path, edge.relation))
    relations.push(contentUnitRelation)
  }

  for (const entity of sourceEntities) {
    const parent = nearestParentEntity(entity.path, entityByPathDir)
    if (parent && !normalizedParentRelationKeys.has(parentRelationKey(parent, entity))) {
      relations.push({
        type: relationTypeForParent(parent.entityKind, entity.entityKind),
        from: entityRef(parent),
        to: entityRef(entity),
      })
    }

    if (entity.entityKind === 'content_unit' && hasSpecializedContentUnitAdapter(entity.record.content_unit_type)) {
      for (const edge of normalizeContentUnitTargetEdges({
        source: domainRefFromContentUnit(entity),
        record: entity.record,
        scopeTarget(scope) {
          return domainRefFromTimelineScope(scope.kind, scope.ref, index, entities, entityByPath)
        },
      })) {
        if (normalizedContentUnitRelationKeys.has(contentUnitDomainEdgeKey(entity.path, edge.relation))) continue
        const relation = contentUnitRelationFromDomainEdge(edge, entities, entityByPath)
        if (relation) {
          normalizedContentUnitRelationKeys.add(contentUnitDomainEdgeKey(entity.path, edge.relation))
          relations.push(relation)
        }
      }
      const targetKind = typeof entity.record.target_kind === 'string' ? entity.record.target_kind : undefined
      const targetRef = entity.record.target_ref
      if (targetKind && targetRef !== undefined) {
        const target = targetKind === 'content_unit'
          ? entities.find((candidate) => candidate.entityKind === 'content_unit' && String(candidate.id ?? '') === String(targetRef))
          : findEntityByRef(entities, targetKind, targetRef) ?? entityByPathDir.get(normalizedRefDir(targetRef))
        if (target) {
          relations.push({
            type: targetKind === 'content_unit' ? 'references' : 'uses',
            from: entityRef(entity),
            to: entityRef(target),
            field: 'target_ref',
          })
        }
      }
      const contentUnitType = String(entity.record.content_unit_type ?? '')
      const primaryKind = primaryRefKindForContentUnitType(contentUnitType)
      if (primaryKind) {
        for (const ref of primaryContentUnitRefs(entity, primaryKind)) {
          const target = ref.kind === 'content_unit'
            ? entities.find((candidate) => candidate.entityKind === 'content_unit' && String(candidate.id ?? '') === ref.id)
            : findEntityByRef(entities, ref.kind, ref.id) ?? entityByPathDir.get(normalizedRefDir(ref.id))
          if (target) {
            relations.push({
              type: ref.kind === 'content_unit' ? 'references' : 'uses',
              from: entityRef(entity),
              to: entityRef(target),
              field: primaryRefFieldNameForKind(primaryKind),
            })
          }
        }
      }
      for (const ref of parseContentUnitEditPromptRefs(entity.record.edit_prompt)) {
        const target = ref.kind === 'content_unit'
          ? entities.find((candidate) => candidate.entityKind === 'content_unit' && String(candidate.id ?? '') === ref.id)
          : findEntityByRef(entities, ref.kind, ref.id) ?? entityByPathDir.get(normalizedRefDir(ref.id))
        if (target) {
          relations.push({
            type: ref.kind === 'content_unit' ? 'references' : 'uses',
            from: entityRef(entity),
            to: entityRef(target),
            field: ref.source.field,
          })
        }
      }
    }

    if (entity.entityKind === 'expression_unit') {
      const sourceExpression = findEntityByRef(entities, 'expression_unit', entity.record.source_expression_ref)
        ?? entityByPathDir.get(normalizedRefDir(entity.record.source_expression_ref))
      const speaker = findEntityByRef(entities, 'setting', entity.record.speaker_ref)
        ?? entityByPathDir.get(normalizedRefDir(entity.record.speaker_ref))
      if (sourceExpression) relations.push({ type: 'references', from: entityRef(entity), to: entityRef(sourceExpression), field: 'source_expression_ref' })
      if (speaker) relations.push({ type: 'uses', from: entityRef(entity), to: entityRef(speaker), field: 'speaker_ref' })
      for (const expressionRef of arrayField(recordField(entity.record.span)?.expression_refs)) {
        const expression = findEntityByRef(entities, 'expression_unit', expressionRef) ?? entityByPathDir.get(normalizedRefDir(expressionRef))
        if (expression) relations.push({ type: 'references', from: entityRef(entity), to: entityRef(expression), field: 'span.expression_refs' })
      }
    }

    if (entity.entityKind === 'audio_cue') {
      const scope = entityByPathDir.get(normalizedRefDir(entity.record.scope_ref))
      const storyboard = entityByPathDir.get(normalizedRefDir(entity.record.storyboard_ref))
      if (scope) relations.push({ type: 'references', from: entityRef(entity), to: entityRef(scope), field: 'scope_ref' })
      if (storyboard) relations.push({ type: 'references', from: entityRef(entity), to: entityRef(storyboard), field: 'storyboard_ref' })
      for (const assetRef of arrayField(entity.record.asset_refs)) {
        const asset = findEntityByRef(entities, 'asset', assetRef) ?? entityByPathDir.get(normalizedRefDir(assetRef))
        if (asset) relations.push({ type: 'uses', from: entityRef(entity), to: entityRef(asset), field: 'asset_refs' })
      }
    }

    if (entity.entityKind === 'storyboard') {
      const expressionUnit = parentExpressionUnitForEntity(entity, entityByPathDir, entityById)
      if (expressionUnit) relations.push({ type: 'references', from: entityRef(entity), to: entityRef(expressionUnit), field: 'expression_unit_ref' })
      for (const settingRef of arrayField(entity.record.setting_refs).filter(isRecord)) {
        const setting = findEntityByRef(entities, 'setting', settingRef.setting_id)
        const settingState = findEntityByRef(entities, 'setting_state', settingRef.setting_state_id)
        if (setting) relations.push({ type: 'uses', from: entityRef(entity), to: entityRef(setting), field: 'setting_refs.setting_id' })
        if (settingState) relations.push({ type: 'uses', from: entityRef(entity), to: entityRef(settingState), field: 'setting_refs.setting_state_id' })
      }
    }

    if (entity.entityKind === 'keyframe') {
      const expressionUnit = parentExpressionUnitForEntity(entity, entityByPathDir, entityById)
      if (expressionUnit) relations.push({ type: 'references', from: entityRef(entity), to: entityRef(expressionUnit), field: 'expression_unit_ref' })
      for (const assetRef of arrayField(entity.record.reference_asset_refs)) {
        const asset = findEntityByRef(entities, 'asset', assetRef) ?? entityByPathDir.get(normalizedRefDir(assetRef))
        if (asset) relations.push({ type: 'uses', from: entityRef(entity), to: entityRef(asset), field: 'reference_asset_refs' })
      }
    }
  }

  return { schema: 'movscript.relation-graph.v1', relations: dedupeRelations(relations) }
}

function parentRelationKey(parent: { entityKind: string; path: string }, child: { entityKind: string; path: string }): string {
  return `${parent.entityKind}:${parent.path}->${child.entityKind}:${child.path}`
}

function contentUnitRelationFromDomainEdge(
  edge: MovScriptDomainEdge,
  entities: MovScriptWorkspaceIndexedEntity[],
  entityByPath: Map<string, MovScriptWorkspaceIndexedEntity>,
): MovScriptDomainRelation | undefined {
  if (edge.relation !== 'target' && edge.relation !== 'scope') return undefined
  const source = sourceContentUnitFromDomainEdge(edge, entities, entityByPath)
  if (!source) return undefined
  return {
    type: edge.relation === 'target' ? 'targets' : 'uses',
    from: entityRef(source),
    to: entityRefFromDomainEdgeTarget(edge, entities, entityByPath),
    ...(edge.field ? { field: edge.field } : {}),
  }
}

function sourceContentUnitFromDomainEdge(
  edge: MovScriptDomainEdge,
  entities: MovScriptWorkspaceIndexedEntity[],
  entityByPath: Map<string, MovScriptWorkspaceIndexedEntity>,
): MovScriptWorkspaceIndexedEntity | undefined {
  const source = edge.source.path
    ? entityByPath.get(edge.source.path)
    : findEntityByRef(entities, 'content_unit', edge.source.id)
  return source?.entityKind === 'content_unit' ? source : undefined
}

function entityRefFromDomainEdgeTarget(
  edge: MovScriptDomainEdge,
  entities: MovScriptWorkspaceIndexedEntity[],
  entityByPath: Map<string, MovScriptWorkspaceIndexedEntity>,
): MovScriptDomainEntityRef {
  const target = edge.target.path
    ? entityByPath.get(edge.target.path)
    : edge.target.kind && edge.target.id !== undefined
      ? findEntityByRef(entities, edge.target.kind, edge.target.id)
      : undefined
  if (target) return entityRef(target)
  return {
    entityKind: edge.target.kind,
    ...(edge.target.id !== undefined ? { id: edge.target.id } : {}),
    ...(edge.target.path ? { path: edge.target.path } : {}),
  }
}

function contentUnitDomainEdgeKey(path: string, relation: string): string {
  return `${relation}:${path}`
}

function domainRefFromContentUnit(entity: MovScriptWorkspaceIndexedEntity): MovScriptDomainRef {
  return {
    category: 'content_unit',
    kind: 'content_unit',
    ...(entity.id !== undefined ? { id: entity.id } : {}),
    path: entity.path,
  }
}

function domainRefFromTimelineScope(
  scopeKind: string,
  scopeRef: string,
  index: MovScriptWorkspaceDomainIndex,
  entities: MovScriptWorkspaceIndexedEntity[],
  entityByPath: Map<string, MovScriptWorkspaceIndexedEntity>,
): MovScriptDomainRef {
  const entity = findEntityByRef(entities, scopeKind, scopeRef)
  if (entity) {
    return {
      category: 'timeline_namespace',
      kind: entity.entityKind,
      ...(entity.id !== undefined ? { id: entity.id } : {}),
      path: entity.path,
    }
  }
  const node = index.domainNodes
    .find((candidate) =>
      candidate.category === 'timeline_namespace'
      && candidate.kind === scopeKind
      && String(candidate.id ?? '') === scopeRef,
    )
  if (node) {
    return {
      category: node.category,
      kind: node.kind,
      ...(node.id !== undefined ? { id: node.id } : {}),
      ...(node.path ? { path: node.path } : {}),
    }
  }
  const pathEntity = entityByPath.get(normalizedRefDir(scopeRef))
  if (pathEntity) {
    return {
      category: 'timeline_namespace',
      kind: pathEntity.entityKind,
      ...(pathEntity.id !== undefined ? { id: pathEntity.id } : {}),
      path: pathEntity.path,
    }
  }
  return { category: 'timeline_namespace', kind: scopeKind, id: scopeRef }
}
