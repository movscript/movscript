import type {
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceIndexedEntity,
} from '@movscript/workspace/indexer'
import { hasSpecializedContentUnitAdapter } from './contentProduction.js'
import {
  parseContentUnitEditPromptRefs,
  primaryRefKindForContentUnitType,
} from './contentProductionHelpers.js'
import type { MovScriptPreviewTimelineArtifact, MovScriptPreviewTimelineItem } from './derivedArtifactTypes.js'
import {
  canonicalEntities,
  childEntities,
  entityDir,
  entityRef,
  isDefined,
  isProductionWithId,
  numberField,
  recordField,
  stringField,
} from './derivedArtifactHelpers.js'

export function derivePreviewTimelines(index: MovScriptWorkspaceDomainIndex): MovScriptPreviewTimelineArtifact[] {
  const sourceEntities = canonicalEntities(index)
  const contentUnitsByPrimaryRef = groupContentUnitsByPrimaryRef(index)
  return sourceEntities
    .filter(isProductionWithId)
    .map((production) => {
      const productionDir = entityDir(production.path)
      const segments = childEntities(index, productionDir, 'segment')
      const items: MovScriptPreviewTimelineItem[] = []
      let order = 0
      for (const segment of sortEntities(segments)) {
        const segmentItemId = timelineItemId(segment)
        items.push({
          ...timelineItem(segmentItemId, 'segment', segment, order++),
          transition: recordField(segment.record.transition),
        })
        const sceneMoments = childEntities(index, entityDir(segment.path), 'scene_moment')
        for (const sceneMoment of sortEntities(sceneMoments)) {
          const sceneMomentItemId = timelineItemId(sceneMoment)
          items.push({
            ...timelineItem(sceneMomentItemId, 'scene_moment', sceneMoment, order++),
            parentId: segmentItemId,
            transition: recordField(sceneMoment.record.transition),
          })
          const audioCues = childEntities(index, entityDir(sceneMoment.path), 'audio_cue')
          for (const audioCue of sortEntities(audioCues)) {
            items.push({
              ...timelineItem(timelineItemId(audioCue), 'audio_cue', audioCue, order++),
              parentId: sceneMomentItemId,
              cueKind: stringField(audioCue.record.cue_kind),
              timing: recordField(audioCue.record.timing),
            })
          }
          const shots = childEntities(index, entityDir(sceneMoment.path), 'shot')
          for (const shot of sortEntities(shots)) {
            const shotItemId = timelineItemId(shot)
            const shotContentUnits = contentUnitsForEntity(contentUnitsByPrimaryRef, 'shot', shot)
            items.push({
              ...timelineItem(shotItemId, 'shot', shot, order++),
              parentId: sceneMomentItemId,
              timing: recordField(shot.record.timing),
              transition: recordField(shot.record.transition),
              contentUnitIds: shotContentUnits.map((contentUnit) => contentUnit.id).filter(isDefined),
            })
            for (const contentUnit of sortEntities(shotContentUnits)) {
              items.push({
                ...timelineItem(timelineItemId(contentUnit), 'content_unit', contentUnit, order++),
                parentId: shotItemId,
              })
            }
            for (const storyboard of childEntities(index, entityDir(shot.path), 'storyboard')) {
              const storyboardItemId = timelineItemId(storyboard)
              const contentUnits = contentUnitsForEntity(contentUnitsByPrimaryRef, 'storyboard', storyboard)
              const timeline = recordField(storyboard.record.timeline)
              items.push({
                ...timelineItem(storyboardItemId, 'storyboard', storyboard, order++),
                parentId: shotItemId,
                caption: stringField(timeline?.caption),
                gapAfterSec: numberField(timeline?.gap_after_sec),
                timing: timeline,
                transition: recordField(storyboard.record.transition),
                contentUnitIds: contentUnits.map((contentUnit) => contentUnit.id).filter(isDefined),
              })
              for (const contentUnit of sortEntities(contentUnits)) {
                items.push({
                  ...timelineItem(timelineItemId(contentUnit), 'content_unit', contentUnit, order++),
                  parentId: storyboardItemId,
                })
              }
            }
          }
        }
      }
      return {
        schema: 'movscript.preview_timeline.v1',
        productionId: production.id,
        productionPath: productionDir,
        items,
      }
    })
}

function groupContentUnitsByPrimaryRef(index: MovScriptWorkspaceDomainIndex): Map<string, MovScriptWorkspaceIndexedEntity[]> {
  const out = new Map<string, MovScriptWorkspaceIndexedEntity[]>()
  for (const entity of canonicalEntities(index)) {
    if (entity.entityKind !== 'content_unit') continue
    if (!hasSpecializedContentUnitAdapter(entity.record.content_unit_type)) continue
    const contentUnitType = stringField(entity.record.content_unit_type)
    if (!contentUnitType) continue
    const primaryKind = primaryRefKindForContentUnitType(contentUnitType)
    if (!primaryKind) continue
    const primaryRefs = parseContentUnitEditPromptRefs(entity.record.edit_prompt).filter((ref) => ref.kind === primaryKind)
    if (primaryRefs.length !== 1) continue
    const primaryRef = primaryRefs[0]
    if (!primaryRef) continue
    const key = primaryRefKey(primaryKind, primaryRef.id)
    out.set(key, [...(out.get(key) ?? []), entity])
  }
  return out
}

function contentUnitsForEntity(
  contentUnitsByPrimaryRef: Map<string, MovScriptWorkspaceIndexedEntity[]>,
  entityKind: string,
  entity: MovScriptWorkspaceIndexedEntity,
): MovScriptWorkspaceIndexedEntity[] {
  if (entity.id === undefined) return []
  return contentUnitsByPrimaryRef.get(primaryRefKey(entityKind, entity.id)) ?? []
}

function primaryRefKey(kind: string, id: string | number): string {
  return `${kind}:${String(id)}`
}

function timelineItem(
  id: string,
  itemType: MovScriptPreviewTimelineItem['itemType'],
  entity: MovScriptWorkspaceIndexedEntity,
  order: number,
): MovScriptPreviewTimelineItem {
  return {
    id,
    itemType,
    entity: entityRef(entity),
    order,
    title: stringField(entity.record.title) ?? String(entity.id ?? entity.path),
  }
}

function timelineItemId(entity: MovScriptWorkspaceIndexedEntity): string {
  return `${entity.entityKind}:${String(entity.id ?? entity.path)}`
}

function sortEntities(entities: MovScriptWorkspaceIndexedEntity[]): MovScriptWorkspaceIndexedEntity[] {
  return [...entities].sort((left, right) => {
    const leftOrder = numberField(left.record.order) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = numberField(right.record.order) ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return left.path.localeCompare(right.path)
  })
}
