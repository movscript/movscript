import {
  pickPreviewTimelineItemForUnit,
  previewTimelineRank,
  reorderContentWorkbenchUnits,
  type ContentWorkbenchDropPosition,
  type ContentWorkbenchTimelineRecord,
} from './workbenchTimeline.js'
import {
  implicitTimelineAssemblyRef,
  parseImplicitTimelineAssemblyRef,
} from '@movscript/domain'

export type ContentWorkbenchWritePayloadValue = string | number | boolean | null
export type ContentWorkbenchWritePayload = Record<string, ContentWorkbenchWritePayloadValue>

export interface ContentUnitOrderPatch {
  unitId: number
  payload: ContentWorkbenchWritePayload
}

export interface ContentUnitReorderPatchTaskGraph {
  draggedUnitId: number
  patches: ContentUnitOrderPatch[]
}

export type ContentUnitTimelineMoveTaskGraph =
  | {
    kind: 'update_item'
    unitId: number
    itemId: number
    payload: ContentWorkbenchWritePayload
  }
  | {
    kind: 'create_item'
    unitId: number
    productionId?: number
    timelineScope?: ContentWorkbenchTimelineScope
    timelineId?: number
    timelinePayload?: ContentWorkbenchWritePayload
    itemPayload: ContentWorkbenchWritePayload
  }

export interface ContentWorkbenchTimelineScope {
  targetKind: 'timeline_assembly'
  targetRef: string
  scopeKind: string
  scopeRef: string | number
  scopePath?: string
}

export interface ContentWorkbenchWriteUnitRecord extends ContentWorkbenchTimelineRecord {
  duration_sec?: unknown
  production_id?: unknown
  target_kind?: unknown
  target_ref?: unknown
  scope_kind?: unknown
  scope_ref?: unknown
  scope_path?: unknown
}

export interface ContentWorkbenchWriteMomentRecord {
  ID: number
}

export interface ContentWorkbenchWriteRow {
  moment: ContentWorkbenchWriteMomentRecord
  productionIds: number[]
  timelineScope?: ContentWorkbenchTimelineScope
  units: ContentWorkbenchWriteUnitRecord[]
  previewTimelineItems: ContentWorkbenchTimelineItemRecord[]
}

export interface ContentWorkbenchTimelineItemRecord extends ContentWorkbenchTimelineRecord {
  preview_timeline_id?: unknown
  duration_sec?: unknown
  target_kind?: unknown
  target_ref?: unknown
  scope_kind?: unknown
  scope_ref?: unknown
}

export interface ContentUnitTimelineMovePlanInput {
  row: ContentWorkbenchWriteRow
  unitId: number
  startSec: number
  previewTimelines: ContentWorkbenchTimelineRecord[]
  unitTitle?: string
  timelineName?: string
  itemLabel?: string
}

export interface ContentCandidateAttachmentResource {
  ID: number
}

export function buildContentUnitReorderPatchTaskGraph(
  row: { units: ContentWorkbenchTimelineRecord[] },
  draggedUnitId: number,
  targetUnitId: number,
  position: ContentWorkbenchDropPosition,
): ContentUnitReorderPatchTaskGraph {
  const reorderedUnits = reorderContentWorkbenchUnits(row.units, draggedUnitId, targetUnitId, position)
  const originalIds = row.units.slice().sort(byOrder).map((unit) => unit.ID).join(',')
  const nextIds = reorderedUnits.map((unit) => unit.ID).join(',')
  if (originalIds === nextIds) return { draggedUnitId, patches: [] }

  return {
    draggedUnitId,
    patches: reorderedUnits
      .map((unit, index) => ({ unit, order: index + 1 }))
      .filter(({ unit, order }) => numberOf(unit.order) !== order)
      .map(({ unit, order }) => ({ unitId: unit.ID, payload: { order } })),
  }
}

export function buildContentUnitTimelineMoveTaskGraph({
  row,
  unitId,
  startSec,
  previewTimelines,
  unitTitle,
  timelineName,
  itemLabel,
}: ContentUnitTimelineMovePlanInput): ContentUnitTimelineMoveTaskGraph {
  const unit = row.units.find((item) => item.ID === unitId)
  if (!unit) throw new Error('content_unit_not_found')
  const normalizedStartSec = Math.max(0, Math.round(Number(startSec) * 10) / 10)
  const durationSec = Math.max(0, numberOf(unit.duration_sec))
  const timelineItem = pickPreviewTimelineItemForUnit(row.previewTimelineItems, unitId)
  if (timelineItem) {
    return {
      kind: 'update_item',
      unitId,
      itemId: timelineItem.ID,
      payload: {
        preview_timeline_id: numberOf(timelineItem.preview_timeline_id),
        start_sec: normalizedStartSec,
        duration_sec: numberOf(timelineItem.duration_sec) || durationSec,
        order: numberOf(timelineItem.order) || numberOf(unit.order),
      },
    }
  }

  const productionId = numberOf(unit.production_id) || row.productionIds[0]
  const timelineScope = productionId ? undefined : timelineScopeForMove(unit, row)
  if (!productionId && !timelineScope) throw new Error('content_unit_missing_timeline_scope')
  const timeline = previewTimelines
    .filter((item) => productionId
      ? Number(item.production_id) === productionId
      : timelineScopeMatches(item, timelineScope))
    .slice()
    .sort((a, b) => previewTimelineRank(a) - previewTimelineRank(b) || byOrder(a, b))[0]
  const title = firstText(unitTitle, String(unit.ID))
  const timelinePayloadBase = timelineContextPayload(productionId, timelineScope)
  return {
    kind: 'create_item',
    unitId,
    ...(productionId ? { productionId } : {}),
    ...(timelineScope ? { timelineScope } : {}),
    timelineId: timeline?.ID,
    timelinePayload: timeline ? undefined : {
      ...timelinePayloadBase,
      name: firstText(timelineName, title),
      duration_sec: Math.max(normalizedStartSec + durationSec, durationSec, 1),
      is_primary: true,
      status: 'workspace',
    },
    itemPayload: {
      ...timelinePayloadBase,
      scene_moment_id: row.moment.ID,
      content_unit_id: unit.ID,
      kind: 'content_unit',
      label: firstText(itemLabel, title),
      start_sec: normalizedStartSec,
      duration_sec: durationSec,
      order: numberOf(unit.order) || row.units.findIndex((item) => item.ID === unit.ID) + 1,
      status: 'workspace',
    },
  }
}

function timelineScopeForMove(
  unit: ContentWorkbenchWriteUnitRecord,
  row: ContentWorkbenchWriteRow,
): ContentWorkbenchTimelineScope | undefined {
  const explicitTargetKind = textOf(unit.target_kind)
  const explicitTargetRef = textOf(unit.target_ref)
  const rowScope = row.timelineScope
  const parsedTarget = parseImplicitTimelineAssemblyRef(explicitTargetRef)
  const scopeKind = textOf(unit.scope_kind)
    ?? rowScope?.scopeKind
    ?? parsedTarget?.scopeKind
  const scopeRef = idOf(unit.scope_ref)
    ?? rowScope?.scopeRef
    ?? parsedTarget?.scopeRef
  if (
    explicitTargetKind !== 'timeline_assembly'
    && !explicitTargetRef?.startsWith('timeline_assembly:')
    && !rowScope
  ) {
    return undefined
  }
  if (!scopeKind || scopeRef === undefined) return undefined
  return {
    targetKind: 'timeline_assembly',
    targetRef: explicitTargetRef ?? rowScope?.targetRef ?? implicitTimelineAssemblyRef(scopeKind, String(scopeRef)),
    scopeKind,
    scopeRef,
    ...(textOf(unit.scope_path) ? { scopePath: textOf(unit.scope_path) } : rowScope?.scopePath ? { scopePath: rowScope.scopePath } : {}),
  }
}

function timelineScopeMatches(
  item: ContentWorkbenchTimelineRecord,
  scope: ContentWorkbenchTimelineScope | undefined,
): boolean {
  if (!scope) return false
  const targetRef = textOf(item.target_ref)
  if (targetRef && targetRef === scope.targetRef) return true
  return textOf(item.scope_kind) === scope.scopeKind
    && String(idOf(item.scope_ref) ?? '') === String(scope.scopeRef)
}

function timelineContextPayload(
  productionId: number,
  timelineScope: ContentWorkbenchTimelineScope | undefined,
): ContentWorkbenchWritePayload {
  if (productionId) return { production_id: productionId }
  if (!timelineScope) return {}
  return {
    target_kind: timelineScope.targetKind,
    target_ref: timelineScope.targetRef,
    scope_kind: timelineScope.scopeKind,
    scope_ref: timelineScope.scopeRef,
    ...(timelineScope.scopePath ? { scope_path: timelineScope.scopePath } : {}),
  }
}

export function buildContentCandidateAttachmentPayload(
  slot: { ID: number },
  resource: ContentCandidateAttachmentResource,
  note?: string,
): ContentWorkbenchWritePayload {
  return {
    asset_slot_id: slot.ID,
    resource_id: resource.ID,
    source_type: 'upload',
    source_id: resource.ID,
    score: 0.75,
    status: 'candidate',
    ...(firstText(note) ? { note: firstText(note) } : {}),
  }
}

function byOrder<T extends { order?: unknown; ID: number }>(a: T, b: T) {
  return numberOf(a.order) - numberOf(b.order) || a.ID - b.ID
}

function firstText(...values: Array<unknown>) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function textOf(value: unknown): string | undefined {
  const text = String(value ?? '').trim()
  return text ? text : undefined
}

function idOf(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return textOf(value)
}

function numberOf(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}
