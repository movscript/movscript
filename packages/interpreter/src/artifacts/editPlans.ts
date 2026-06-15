import type {
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceIndexedEntity,
} from '@movscript/workspace/indexer'
import { queryMovScriptWorkspaceEntities } from '@movscript/workspace/indexer'
import { sameEntityRef } from '@movscript/workspace/layout'
import {
  canonicalEntities,
  entityDir,
  recordField,
  stringField,
} from './contentProductionHelpers.js'
import type { ContentUnitDerivedArtifactBundle } from './contentProduction.js'
import type {
  MovScriptEditPlanArtifact,
  MovScriptEditPlanTrack,
  MovScriptEditPlanTrackItem,
} from './derivedArtifactTypes.js'

type EditPlanBlocker = NonNullable<MovScriptEditPlanArtifact['blockers']>[number]

export function deriveEditPlans(
  index: MovScriptWorkspaceDomainIndex,
  contentUnitArtifacts: readonly ContentUnitDerivedArtifactBundle[],
): MovScriptEditPlanArtifact[] {
  const contentUnitArtifactByPath = new Map(contentUnitArtifacts.map((artifact) => [artifact.contentUnitPath, artifact]))
  const expressionUnits = queryMovScriptWorkspaceEntities(index, { entityKind: 'expression_unit' })
  const expressionByRef = new Map<string, MovScriptWorkspaceIndexedEntity>()
  for (const expressionUnit of expressionUnits) {
    expressionByRef.set(entityDir(expressionUnit.path), expressionUnit)
    if (expressionUnit.id !== undefined) expressionByRef.set(String(expressionUnit.id), expressionUnit)
  }

  return canonicalEntities(index)
    .filter((entity): entity is MovScriptWorkspaceIndexedEntity & { id: string | number } => entity.entityKind === 'scene_moment' && entity.id !== undefined)
    .flatMap((sceneMoment) => {
      const units = contentUnitsForSceneMoment(index, sceneMoment, expressionUnits)
      if (units.length === 0) return []
      const production = productionForSceneMoment(index, sceneMoment)
      if (!production?.id) return []
      const items = units.flatMap((contentUnit, index) => {
        const artifact = contentUnitArtifactByPath.get(contentUnit.path)
        if (!artifact) return []
        return [trackItemFor(contentUnit, artifact, sceneMoment, expressionByRef, index)]
      }).sort((left, right) => left.order - right.order)
      const tracks = groupTrackItems(items)
      const blockers: EditPlanBlocker[] = items.flatMap((item): EditPlanBlocker[] => {
        if (!item.selected) {
          return [{
            code: 'selection_missing' as const,
            content_unit_id: item.content_unit_id,
            message: `content unit ${String(item.content_unit_id)} has no selected candidate`,
          }]
        }
        if (item.stale) {
          return [{
            code: 'selection_stale' as const,
            content_unit_id: item.content_unit_id,
            message: `content unit ${String(item.content_unit_id)} selected candidate is stale`,
          }]
        }
        if (item.resource_id === undefined) {
          return [{
            code: 'resource_missing' as const,
            content_unit_id: item.content_unit_id,
            message: `content unit ${String(item.content_unit_id)} selected candidate has no resource_id`,
          }]
        }
        return []
      })
      return [{
        schema: 'movscript.edit_plan.v1' as const,
        productionId: production.id,
        productionPath: entityDir(production.path),
        sceneMomentId: sceneMoment.id,
        sceneMomentPath: entityDir(sceneMoment.path),
        target_ref: entityDir(sceneMoment.path),
        status: blockers.length > 0 ? 'missing_selection' as const : 'ready_to_compose' as const,
        tracks,
        compose_inputs: items
          .filter((item) => item.resource_id !== undefined)
          .map((item) => ({
            content_unit_id: item.content_unit_id,
            resource_id: item.resource_id as number,
            output_kind: item.output_kind,
            track_type: trackTypeFor(item),
          })),
        ...(blockers.length > 0 ? { blockers } : {}),
      }]
    })
}

function contentUnitsForSceneMoment(
  index: MovScriptWorkspaceDomainIndex,
  sceneMoment: MovScriptWorkspaceIndexedEntity,
  expressionUnits: readonly MovScriptWorkspaceIndexedEntity[],
): MovScriptWorkspaceIndexedEntity[] {
  const sceneMomentDir = entityDir(sceneMoment.path)
  const expressions = expressionUnits.filter((expressionUnit) => entityDir(expressionUnit.path).startsWith(`${sceneMomentDir}/expression_units/`))
  return queryMovScriptWorkspaceEntities(index, { entityKind: 'content_unit' })
    .filter((contentUnit) => {
      const targetKind = stringField(contentUnit.record.target_kind)
      const targetRef = stringField(contentUnit.record.target_ref)
      if (targetKind === 'scene_moment' && refMatches(sceneMoment, targetRef)) return true
      if (String(contentUnit.record.content_unit_type ?? '') === 'scene_moment_ref' && refMatches(sceneMoment, contentUnit.record.scene_moment_ref)) return true
      if (String(contentUnit.record.content_unit_type ?? '') === 'scence_moment_ref' && refMatches(sceneMoment, contentUnit.record.scene_moment_ref ?? contentUnit.record.scence_moment_ref)) return true
      if (targetKind === 'expression_unit' || String(contentUnit.record.content_unit_type ?? '') === 'expression_unit_ref') {
        const expressionRef = targetRef ?? stringField(contentUnit.record.expression_unit_ref)
        return expressions.some((expressionUnit) => refMatches(expressionUnit, expressionRef))
      }
      return false
    })
}

function productionForSceneMoment(
  index: MovScriptWorkspaceDomainIndex,
  sceneMoment: MovScriptWorkspaceIndexedEntity,
): MovScriptWorkspaceIndexedEntity | undefined {
  const productionId = sceneMoment.path.split('/')[1]
  return queryMovScriptWorkspaceEntities(index, { entityKind: 'production' })
    .find((entity) => sameEntityRef(entity.id, productionId, 'production') || entityDir(entity.path) === `productions/${productionId}`)
}

function trackItemFor(
  contentUnit: MovScriptWorkspaceIndexedEntity,
  artifact: ContentUnitDerivedArtifactBundle,
  sceneMoment: MovScriptWorkspaceIndexedEntity,
  expressionByRef: ReadonlyMap<string, MovScriptWorkspaceIndexedEntity>,
  fallbackOrder: number,
): MovScriptEditPlanTrackItem {
  const targetKind = stringField(contentUnit.record.target_kind) ?? primaryTargetKind(contentUnit)
  const targetRef = stringField(contentUnit.record.target_ref) ?? primaryTargetRef(contentUnit) ?? entityDir(sceneMoment.path)
  const expressionUnit = targetKind === 'expression_unit' ? expressionByRef.get(targetRef) ?? expressionByRef.get(lastPathSegment(targetRef) ?? '') : undefined
  return {
    id: `edit_item_${String(contentUnit.id ?? fallbackOrder)}`,
    content_unit_id: contentUnit.id ?? contentUnit.path,
    content_unit_ref: entityDir(contentUnit.path),
    output_kind: artifact.runtimePanel.output_kind,
    target_kind: targetKind,
    target_ref: targetRef,
    ...(expressionUnit ? { expression_unit_ref: entityDir(expressionUnit.path) } : {}),
    ...(expressionUnit ? { expression_modality: stringField(expressionUnit.record.modality) ?? legacyExpressionModality(expressionUnit) } : {}),
    ...(expressionUnit ? { expression_role: stringField(expressionUnit.record.role) ?? stringField(expressionUnit.record.expression_kind) } : {}),
    ...(artifact.selectionValidity.candidate_id !== undefined ? { candidate_id: artifact.selectionValidity.candidate_id } : {}),
    ...(artifact.selectionValidity.resource_id !== undefined ? { resource_id: artifact.selectionValidity.resource_id } : {}),
    selected: artifact.selectionValidity.selected,
    stale: artifact.selectionValidity.stale,
    timing_intent: recordField(expressionUnit?.record.timing_intent),
    generation_role: stringField(contentUnit.record.generation_role),
    order: numberField(contentUnit.record.order) ?? numberField(expressionUnit?.record.order) ?? fallbackOrder,
  }
}

function groupTrackItems(items: readonly MovScriptEditPlanTrackItem[]): MovScriptEditPlanTrack[] {
  const byType = new Map<MovScriptEditPlanTrack['type'], MovScriptEditPlanTrackItem[]>()
  for (const item of items) {
    const type = trackTypeFor(item)
    byType.set(type, [...(byType.get(type) ?? []), item])
  }
  return [...byType.entries()].map(([type, trackItems]) => ({ type, items: trackItems }))
}

function trackTypeFor(item: Pick<MovScriptEditPlanTrackItem, 'output_kind' | 'expression_modality' | 'expression_role'>): MovScriptEditPlanTrack['type'] {
  if (item.output_kind === 'video') return 'video'
  if (item.output_kind === 'audio') return item.expression_role === 'dialogue' || item.expression_role === 'narration' ? 'voice' : 'audio'
  if (item.output_kind === 'text') return 'subtitle'
  if (item.output_kind === 'image') return 'image'
  return 'metadata'
}

function primaryTargetKind(contentUnit: MovScriptWorkspaceIndexedEntity): string {
  const type = String(contentUnit.record.content_unit_type ?? '')
  if (type === 'scene_moment_ref' || type === 'scence_moment_ref') return 'scene_moment'
  if (type === 'expression_unit_ref') return 'expression_unit'
  if (type === 'content_unit_ref') return 'content_unit'
  return 'metadata'
}

function primaryTargetRef(contentUnit: MovScriptWorkspaceIndexedEntity): string | undefined {
  return stringField(contentUnit.record.expression_unit_ref)
    ?? stringField(contentUnit.record.scene_moment_ref)
    ?? stringField(contentUnit.record.scence_moment_ref)
    ?? stringField(contentUnit.record.content_unit_ref)
}

function legacyExpressionModality(expressionUnit: MovScriptWorkspaceIndexedEntity): string | undefined {
  const kind = stringField(expressionUnit.record.expression_kind)
  if (kind === 'dialogue' || kind === 'narration') return 'verbal'
  if (kind === 'subtitle' || kind === 'caption') return 'text'
  if (kind === 'visual_note' || kind === 'action') return 'visual'
  return undefined
}

function refMatches(entity: MovScriptWorkspaceIndexedEntity, ref: unknown): boolean {
  if (typeof ref !== 'string' && typeof ref !== 'number') return false
  return sameEntityRef(entity.id, ref, entity.entityKind) || entityDir(entity.path) === String(ref).replace(/\/+$/, '') || lastPathSegment(ref) === String(entity.id)
}

function lastPathSegment(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.split('/').filter(Boolean).at(-1)
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
