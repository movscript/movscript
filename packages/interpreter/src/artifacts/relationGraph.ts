import type { MovScriptWorkspaceDomainIndex } from '@movscript/workspace/indexer'
import { hasSpecializedContentUnitAdapter } from './contentProduction.js'
import {
  parseContentUnitEditPromptRefs,
} from './contentProductionHelpers.js'
import type { MovScriptDomainRelation, MovScriptRelationGraphArtifact } from './derivedArtifactTypes.js'
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
  parentShotForEntity,
  relationTypeForParent,
} from './derivedArtifactHelpers.js'

export function deriveRelationGraph(index: MovScriptWorkspaceDomainIndex): MovScriptRelationGraphArtifact {
  const relations: MovScriptDomainRelation[] = []
  const sourceEntities = canonicalEntities(index)
  const entities = sourceEntities.filter((entity) => entity.id !== undefined)
  const entityByPathDir = new Map(sourceEntities.map((entity) => [entityDir(entity.path), entity]))
  const entityById = new Map(entities.map((entity) => [entityKey(entity.entityKind, entity.id), entity]))

  for (const entity of sourceEntities) {
    const parent = nearestParentEntity(entity.path, entityByPathDir)
    if (parent) {
      relations.push({
        type: relationTypeForParent(parent.entityKind, entity.entityKind),
        from: entityRef(parent),
        to: entityRef(entity),
      })
    }

    if (entity.entityKind === 'content_unit' && hasSpecializedContentUnitAdapter(entity.record.content_unit_type)) {
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
      const shot = parentShotForEntity(entity, entityByPathDir, entityById)
      if (shot) relations.push({ type: 'references', from: entityRef(entity), to: entityRef(shot), field: 'shot_ref' })
      for (const settingRef of arrayField(entity.record.setting_refs).filter(isRecord)) {
        const setting = findEntityByRef(entities, 'setting', settingRef.setting_id)
        const settingState = findEntityByRef(entities, 'setting_state', settingRef.setting_state_id)
        if (setting) relations.push({ type: 'uses', from: entityRef(entity), to: entityRef(setting), field: 'setting_refs.setting_id' })
        if (settingState) relations.push({ type: 'uses', from: entityRef(entity), to: entityRef(settingState), field: 'setting_refs.setting_state_id' })
      }
    }

    if (entity.entityKind === 'keyframe') {
      const shot = parentShotForEntity(entity, entityByPathDir, entityById)
      if (shot) relations.push({ type: 'references', from: entityRef(entity), to: entityRef(shot), field: 'shot_ref' })
      for (const assetRef of arrayField(entity.record.reference_asset_refs)) {
        const asset = findEntityByRef(entities, 'asset', assetRef) ?? entityByPathDir.get(normalizedRefDir(assetRef))
        if (asset) relations.push({ type: 'uses', from: entityRef(entity), to: entityRef(asset), field: 'reference_asset_refs' })
      }
    }
  }

  return { schema: 'movscript.relation-graph.v1', relations: dedupeRelations(relations) }
}
