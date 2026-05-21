import type { SemanticEntityPayload } from '@/api/semanticEntities'
import { contentWorkbenchProposalDefaults } from '@/lib/contentWorkbenchDraftProposal'
import { mergeMetadataJSON, parseMetadataJSON } from '@/lib/contentUnitPlanningMetadata'
import { type ContentWorkbenchDropPosition, pickPreviewTimelineItemForUnit, reorderContentWorkbenchUnits } from '@/lib/contentWorkbenchTimeline'
import { byOrder, numberOf, titleOfRecord } from '@/lib/contentWorkbenchRecordUtils'
import {
  previewTimelineRank,
  type ContentGenerationMomentRow,
  type ContentWorkbenchRecord,
} from '@/lib/contentWorkbenchModel'

export interface ContentUnitOrderPatch {
  unitId: number
  payload: SemanticEntityPayload
}

export interface ContentUnitReorderPatchPlan {
  draggedUnitId: number
  patches: ContentUnitOrderPatch[]
}

export type ContentUnitTimelineMovePlan =
  | {
    kind: 'update_item'
    unitId: number
    itemId: number
    payload: SemanticEntityPayload
  }
  | {
    kind: 'create_item'
    unitId: number
    productionId: number
    timelineId?: number
    timelinePayload?: SemanticEntityPayload
    itemPayload: SemanticEntityPayload
  }

export interface ContentUnitTimelineMovePlanInput {
  row: ContentGenerationMomentRow
  unitId: number
  startSec: number
  previewTimelines: ContentWorkbenchRecord[]
}

export interface ContentCandidateAttachmentResource {
  ID: number
  name?: unknown
}

export function buildContentUnitProposalPatch(current: ContentWorkbenchRecord | undefined, proposal: Record<string, unknown>): SemanticEntityPayload {
  const defaults = contentWorkbenchProposalDefaults(proposal)
  const { status: _status, metadata_json, ...basePayload } = defaults
  const payload: SemanticEntityPayload = { ...basePayload }
  if (metadata_json) {
    payload.metadata_json = JSON.stringify(mergeMetadataJSON(current?.metadata_json, parseMetadataJSON(metadata_json)))
  }
  return payload
}

export function buildContentUnitReorderPatchPlan(
  row: ContentGenerationMomentRow,
  draggedUnitId: number,
  targetUnitId: number,
  position: ContentWorkbenchDropPosition,
): ContentUnitReorderPatchPlan {
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

export function buildContentUnitTimelineMovePlan({
  row,
  unitId,
  startSec,
  previewTimelines,
}: ContentUnitTimelineMovePlanInput): ContentUnitTimelineMovePlan {
  const unit = row.units.find((item) => item.ID === unitId)
  if (!unit) throw new Error('未找到制作项')
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
  if (!productionId) throw new Error('当前制作项未绑定制作，无法写入时间轴')
  const timeline = previewTimelines
    .filter((item) => Number(item.production_id) === productionId)
    .slice()
    .sort((a, b) => previewTimelineRank(a) - previewTimelineRank(b) || byOrder(a, b))[0]
  return {
    kind: 'create_item',
    unitId,
    productionId,
    timelineId: timeline?.ID,
    timelinePayload: timeline ? undefined : {
      production_id: productionId,
      name: `${titleOfRecord(unit)} 时间轴`,
      duration_sec: Math.max(normalizedStartSec + durationSec, durationSec, 1),
      is_primary: true,
      status: 'draft',
    },
    itemPayload: {
      production_id: productionId,
      scene_moment_id: row.moment.ID,
      content_unit_id: unit.ID,
      kind: 'content_unit',
      label: titleOfRecord(unit),
      start_sec: normalizedStartSec,
      duration_sec: durationSec,
      order: numberOf(unit.order) || row.units.findIndex((item) => item.ID === unit.ID) + 1,
      status: 'draft',
    },
  }
}

export function buildContentCandidateAttachmentPayload(slot: ContentWorkbenchRecord, resource: ContentCandidateAttachmentResource): SemanticEntityPayload {
  return {
    asset_slot_id: slot.ID,
    resource_id: resource.ID,
    source_type: 'upload',
    source_id: resource.ID,
    score: 0.75,
    status: 'candidate',
    note: `内容编排主动上传：${String(resource.name ?? '')}`,
  }
}
