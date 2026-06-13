import type { SemanticEntityKind } from '@movscript/language/domain'
import type {
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceIndexedEntity,
} from './indexer/index.js'

export interface MovScriptWorkspacePreviewTimelineEntityRef {
  entityKind: SemanticEntityKind | string
  id?: string | number
  path?: string
}

export interface MovScriptWorkspacePreviewTimelineItem {
  id: string
  itemType: 'segment' | 'scene_moment' | 'shot' | 'storyboard' | 'keyframe' | 'audio_cue' | 'expression_unit' | 'content_unit'
  entity: MovScriptWorkspacePreviewTimelineEntityRef
  order: number
  parentId?: string
  title?: string
  caption?: string
  gapAfterSec?: number
  cueKind?: string
  timing?: Record<string, unknown>
  transition?: Record<string, unknown>
  contentUnitIds?: Array<string | number>
}

export interface MovScriptWorkspacePreviewTimelineArtifact {
  schema: 'movscript.preview_timeline.v1'
  productionId: string | number
  productionPath: string
  items: MovScriptWorkspacePreviewTimelineItem[]
}

export function deriveMovScriptWorkspacePreviewTimelines(index: MovScriptWorkspaceDomainIndex): MovScriptWorkspacePreviewTimelineArtifact[] {
  const sourceEntities = canonicalEntities(index)
  const contentUnitsByPrimaryRef = groupContentUnitsByPrimaryRef(index)
  return sourceEntities
    .filter(isProductionWithId)
    .map((production) => {
      const productionDir = entityDir(production.path)
      const segments = childEntities(index, productionDir, 'segment')
      const items: MovScriptWorkspacePreviewTimelineItem[] = []
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
          const sceneMomentContentUnits = contentUnitsForEntity(contentUnitsByPrimaryRef, 'scene_moment', sceneMoment)
          items.push({
            ...timelineItem(sceneMomentItemId, 'scene_moment', sceneMoment, order++),
            parentId: segmentItemId,
            transition: recordField(sceneMoment.record.transition),
            contentUnitIds: sceneMomentContentUnits.map((contentUnit) => contentUnit.id).filter(isDefined),
          })
          for (const contentUnit of sortEntities(sceneMomentContentUnits)) {
            items.push({
              ...timelineItem(timelineItemId(contentUnit), 'content_unit', contentUnit, order++),
              parentId: sceneMomentItemId,
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
            for (const storyboard of sortEntities(childEntities(index, entityDir(shot.path), 'storyboard'))) {
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
            for (const keyframe of sortEntities(childEntities(index, entityDir(shot.path), 'keyframe'))) {
              const keyframeItemId = timelineItemId(keyframe)
              const contentUnits = contentUnitsForEntity(contentUnitsByPrimaryRef, 'keyframe', keyframe)
              items.push({
                ...timelineItem(keyframeItemId, 'keyframe', keyframe, order++),
                parentId: shotItemId,
                timing: recordField(keyframe.record.timing),
                contentUnitIds: contentUnits.map((contentUnit) => contentUnit.id).filter(isDefined),
              })
              for (const contentUnit of sortEntities(contentUnits)) {
                items.push({
                  ...timelineItem(timelineItemId(contentUnit), 'content_unit', contentUnit, order++),
                  parentId: keyframeItemId,
                })
              }
            }
          }
          for (const expressionUnit of sortEntities(childEntities(index, entityDir(sceneMoment.path), 'expression_unit'))) {
            items.push({
              ...timelineItem(timelineItemId(expressionUnit), 'expression_unit', expressionUnit, order++),
              parentId: sceneMomentItemId,
            })
          }
          for (const audioCue of sortEntities(childEntities(index, entityDir(sceneMoment.path), 'audio_cue'))) {
            items.push({
              ...timelineItem(timelineItemId(audioCue), 'audio_cue', audioCue, order++),
              parentId: sceneMomentItemId,
              cueKind: stringField(audioCue.record.cue_kind),
              timing: recordField(audioCue.record.timing),
            })
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
    const contentUnitType = stringField(entity.record.content_unit_type)
    if (!contentUnitType || !hasSpecializedContentUnitAdapter(contentUnitType)) continue
    const primaryKind = primaryRefKindForContentUnitType(contentUnitType)
    if (!primaryKind) continue
    const primaryRefs = primaryRefIdsForContentUnitRecord(entity.record, primaryKind)
    if (primaryRefs.length !== 1) continue
    const primaryRef = primaryRefs[0]
    if (!primaryRef) continue
    for (const key of primaryRefKeys(primaryKind, primaryRef)) {
      out.set(key, [...(out.get(key) ?? []), entity])
    }
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

function hasSpecializedContentUnitAdapter(contentUnitType: string): boolean {
  return primaryRefKindForContentUnitType(contentUnitType) !== undefined
}

function primaryRefKindForContentUnitType(contentUnitType: string): 'asset' | 'keyframe' | 'storyboard' | 'scene_moment' | 'shot' | undefined {
  switch (contentUnitType) {
    case 'asset_ref':
      return 'asset'
    case 'keyframe_ref':
      return 'keyframe'
    case 'storyboard_ref':
      return 'storyboard'
    case 'scence_moment_ref':
    case 'scene_moment_ref':
      return 'scene_moment'
    case 'shot_ref':
      return 'shot'
    default:
      return undefined
  }
}

function primaryRefKey(kind: string, id: string | number): string {
  return `${kind}:${String(id)}`
}

function primaryRefKeys(kind: string, ref: string | number): string[] {
  const value = String(ref)
  const keys = [primaryRefKey(kind, value)]
  const lastSegment = value.split('/').filter(Boolean).at(-1)
  if (lastSegment && lastSegment !== value) keys.push(primaryRefKey(kind, lastSegment))
  return keys
}

function primaryRefIdsForContentUnitRecord(record: Record<string, unknown>, kind: string): string[] {
  switch (kind) {
    case 'asset':
      return compactStrings(record.asset_ref)
    case 'keyframe':
      return compactStrings(record.keyframe_ref)
    case 'storyboard':
      return compactStrings(record.storyboard_ref)
    case 'scene_moment':
      return compactStrings(record.scene_moment_ref, record.scence_moment_ref)
    case 'shot':
      return compactStrings(record.shot_ref)
    default:
      return []
  }
}

function compactStrings(...values: unknown[]): string[] {
  return values.flatMap((value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return [String(value)]
    if (typeof value === 'string' && value.trim()) return [value.trim()]
    return []
  })
}

function timelineItem(
  id: string,
  itemType: MovScriptWorkspacePreviewTimelineItem['itemType'],
  entity: MovScriptWorkspaceIndexedEntity,
  order: number,
): MovScriptWorkspacePreviewTimelineItem {
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

function entityRef(entity: MovScriptWorkspaceIndexedEntity): MovScriptWorkspacePreviewTimelineEntityRef {
  return {
    entityKind: entity.entityKind,
    ...(entity.id !== undefined ? { id: entity.id } : {}),
    path: entity.path,
  }
}

function childEntities(
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
  if (entityKind === 'keyframe') return 'keyframes'
  if (entityKind === 'audio_cue') return 'audio_cues'
  if (entityKind === 'expression_unit') return 'expression_units'
  return undefined
}

function canonicalEntities(index: MovScriptWorkspaceDomainIndex): MovScriptWorkspaceIndexedEntity[] {
  return index.entities
}

function isProductionWithId(entity: MovScriptWorkspaceIndexedEntity): entity is MovScriptWorkspaceIndexedEntity & { id: string | number } {
  return entity.entityKind === 'production' && entity.id !== undefined
}

function sortEntities(entities: MovScriptWorkspaceIndexedEntity[]): MovScriptWorkspaceIndexedEntity[] {
  return [...entities].sort((left, right) => {
    const leftOrder = numberField(left.record.order) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = numberField(right.record.order) ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return left.path.localeCompare(right.path)
  })
}

function entityDir(path: string): string {
  return path.replace(/\/[^/]+$/, '')
}

function recordField(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
