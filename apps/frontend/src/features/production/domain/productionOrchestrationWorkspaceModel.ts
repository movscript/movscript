import type { SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import { sceneIdentifier } from '@/features/content/domain/productionIdentifiers'
import type { ProductionOrchestrationLookup } from '@/features/production/domain/productionOrchestrationEntityModel'
import type {
  AssetSlotRecord,
  ContentUnitRecord,
  CreativeReferenceRecord,
  SceneMomentRecord,
  ScriptBlockRecord,
  SegmentRecord,
  WritingExpressionRecord,
} from '@/features/production/domain/productionOrchestrationData'
import {
  buildWritingExpressionLines,
  type ProductionWritingExpressionLine,
} from '@/features/production/domain/productionWritingExpressions'

export interface ProductionSegmentNavigatorMoment {
  id: number
  identifier: string
  title: string
  description: string
  lineCount: number
  active: boolean
}

export interface ProductionSegmentNavigatorItem {
  id: number
  indexLabel: string
  title: string
  summary: string
  status: string
  statusLabel: string
  kindLabel: string
  active: boolean
  moments: ProductionSegmentNavigatorMoment[]
  rawRecord: SemanticEntityRecord
}

export type ProductionOrchestrationDropPosition = 'before' | 'after'

export interface ProductionSegmentOrderPatch {
  segmentId: number
  payload: { order: number }
}

export interface ProductionSceneMomentOrderPatch {
  momentId: number
  payload: {
    order: number
    segment_id?: number
  }
}

export type ProductionWorkspaceLookup = ProductionOrchestrationLookup<
  SegmentRecord,
  SceneMomentRecord,
  CreativeReferenceRecord,
  SemanticEntityRecord,
  AssetSlotRecord,
  ContentUnitRecord
>

export interface ProductionOrchestrationWorkspaceView {
  selectedMoment: SceneMomentRecord | null
  selectedSegment: SegmentRecord | null
  selectedMomentScriptBlock: ScriptBlockRecord | null
  selectedMomentContentUnits: ContentUnitRecord[]
  selectedMomentExpressions: WritingExpressionRecord[]
  expressionLines: ProductionWritingExpressionLine[]
  selectedSegmentMoments: SceneMomentRecord[]
  selectedSegmentLineCount: number
  writingProgressLabel: string
  segmentNavigatorItems: ProductionSegmentNavigatorItem[]
}

const statusLabel: Record<string, string> = {
  confirmed: '已确认',
  locked: '已锁定',
  accepted: '已采纳',
  active: '进行中',
  draft: '草稿',
  candidate: '候选',
  missing: '缺素材需求',
  ignored: '已忽略',
  removed: '已移除',
  abandoned: '已废弃',
  rejected: '已拒绝',
  blocked: '阻塞',
  in_production: '生产中',
  low: '低',
  normal: '普通',
  high: '高',
  critical: '紧急',
}

const segmentKindLabel: Record<string, string> = {
  emotional_function: '情绪功能',
  rhythm_shift: '节奏变化',
  dramatic_function: '戏剧功能',
  setup: '铺垫',
  escalation: '升级',
  release: '释放',
  reversal: '反转',
  transition: '转场',
}

export function compareProductionOrchestrationOrder<T extends { order?: number; ID: number }>(a: T, b: T) {
  const ao = typeof a.order === 'number' ? a.order : a.ID
  const bo = typeof b.order === 'number' ? b.order : b.ID
  return ao - bo
}

export function buildProductionSegmentReorderPatches(
  segments: SegmentRecord[],
  draggedSegmentId: number,
  targetSegmentId: number,
  position: ProductionOrchestrationDropPosition,
): ProductionSegmentOrderPatch[] {
  if (draggedSegmentId === targetSegmentId) return []
  if (!segments.some((segment) => segment.ID === draggedSegmentId) || !segments.some((segment) => segment.ID === targetSegmentId)) {
    return []
  }
  const reordered = reorderProductionOrchestrationRecords(segments, draggedSegmentId, targetSegmentId, position)
  const originalOrders = new Map(segments.map((segment) => [segment.ID, normalizedOrder(segment, segments.indexOf(segment))]))
  return reordered
    .map((segment, index) => ({ segmentId: segment.ID, payload: { order: index + 1 } }))
    .filter((patch) => originalOrders.get(patch.segmentId) !== patch.payload.order)
}

export function buildProductionSceneMomentReorderPatches({
  sceneMoments,
  draggedMomentId,
  targetSegmentId,
  targetMomentId,
  position = 'after',
}: {
  sceneMoments: SceneMomentRecord[]
  draggedMomentId: number
  targetSegmentId: number
  targetMomentId?: number | null
  position?: ProductionOrchestrationDropPosition
}): ProductionSceneMomentOrderPatch[] {
  const dragged = sceneMoments.find((moment) => moment.ID === draggedMomentId)
  if (!dragged || !targetSegmentId) return []
  const sourceSegmentId = Number(dragged.segment_id) || 0
  if (!sourceSegmentId) return []
  if (targetMomentId && draggedMomentId === targetMomentId) return []

  const sourceMoments = orderedSceneMomentsForSegment(sceneMoments, sourceSegmentId)
    .filter((moment) => moment.ID !== draggedMomentId)
  const targetMoments = sourceSegmentId === targetSegmentId
    ? sourceMoments
    : orderedSceneMomentsForSegment(sceneMoments, targetSegmentId).filter((moment) => moment.ID !== draggedMomentId)
  const targetIndex = targetMomentId
    ? targetMoments.findIndex((moment) => moment.ID === targetMomentId)
    : targetMoments.length - 1
  if (targetMomentId && targetIndex < 0) return []

  const insertIndex = targetMomentId
    ? position === 'after' ? targetIndex + 1 : targetIndex
    : targetMoments.length
  const reorderedTargetMoments = [
    ...targetMoments.slice(0, insertIndex),
    { ...dragged, segment_id: targetSegmentId },
    ...targetMoments.slice(insertIndex),
  ]

  const patches = new Map<number, ProductionSceneMomentOrderPatch>()
  if (sourceSegmentId !== targetSegmentId) {
    sourceMoments.forEach((moment, index) => {
      const nextOrder = index + 1
      if (normalizedOrder(moment, index) !== nextOrder) {
        patches.set(moment.ID, { momentId: moment.ID, payload: { order: nextOrder } })
      }
    })
  }

  reorderedTargetMoments.forEach((moment, index) => {
    const nextOrder = index + 1
    const movedToSegment = moment.ID === draggedMomentId && sourceSegmentId !== targetSegmentId
    if (movedToSegment || normalizedOrder(moment, index) !== nextOrder) {
      patches.set(moment.ID, {
        momentId: moment.ID,
        payload: {
          order: nextOrder,
          ...(movedToSegment ? { segment_id: targetSegmentId } : {}),
        },
      })
    }
  })

  return Array.from(patches.values())
}

export function productionOrchestrationRecordTitle(record: SemanticEntityRecord | null | undefined) {
  return String(record?.title ?? record?.name ?? record?.label ?? `#${record?.ID ?? '-'}`)
}

export function filterProductionSegmentsForProduction(segments: SegmentRecord[], productionId: number) {
  if (!productionId) return segments.slice()
  return segments.filter((segment) => Number(segment.production_id) === productionId)
}

export function filterProductionSceneMomentsForSegments(sceneMoments: SceneMomentRecord[], segmentIds: Set<number>) {
  return sceneMoments.filter((moment) => segmentIds.has(Number(moment.segment_id)))
}

export function filterProductionContentUnitsForProduction(
  contentUnits: ContentUnitRecord[],
  productionId: number,
  segmentIds: Set<number>,
  sceneMomentIds: Set<number>,
) {
  if (!productionId) return contentUnits.slice()
  return contentUnits.filter((unit) => (
    Number(unit.production_id) === productionId ||
    segmentIds.has(Number(unit.segment_id)) ||
    sceneMomentIds.has(Number(unit.scene_moment_id))
  ))
}

export function buildProductionOrchestrationWorkspaceView({
  segments,
  sceneMoments,
  writingExpressions,
  scriptBlocks,
  selectedMomentId,
  lookup,
}: {
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  writingExpressions: WritingExpressionRecord[]
  scriptBlocks: ScriptBlockRecord[]
  selectedMomentId: number | null
  lookup: ProductionWorkspaceLookup
}): ProductionOrchestrationWorkspaceView {
  const selectedMoment = selectedMomentId ? sceneMoments.find((moment) => moment.ID === selectedMomentId) ?? null : null
  const selectedSegment = selectedMoment?.segment_id ? segments.find((segment) => segment.ID === Number(selectedMoment.segment_id)) ?? null : null
  const selectedMomentScriptBlock = selectedMoment?.script_block_id ? scriptBlocks.find((block) => block.ID === Number(selectedMoment.script_block_id)) ?? null : null
  const selectedMomentContentUnits = selectedMoment
    ? Array.from(lookup.contentUnitById.values()).filter((unit) => Number(unit.scene_moment_id) === selectedMoment.ID)
    : []
  const selectedMomentExpressions = selectedMoment
    ? writingExpressions.filter((item) => Number(item.scene_moment_id) === selectedMoment.ID)
    : []
  const expressionLines = buildWritingExpressionLines(selectedMoment, selectedMomentScriptBlock, selectedMomentContentUnits, selectedMomentExpressions)
  const selectedSegmentMoments = selectedSegment ? sceneMoments.filter((moment) => Number(moment.segment_id) === selectedSegment.ID) : []
  const selectedSegmentLineCount = selectedSegmentMoments.reduce((sum, moment) => {
    const block = moment.script_block_id ? scriptBlocks.find((item) => item.ID === Number(moment.script_block_id)) ?? null : null
    const units = Array.from(lookup.contentUnitById.values()).filter((unit) => Number(unit.scene_moment_id) === moment.ID)
    const expressions = writingExpressions.filter((item) => Number(item.scene_moment_id) === moment.ID)
    return sum + buildWritingExpressionLines(moment, block, units, expressions).length
  }, 0)
  const writingProgressLabel = expressionLines.length === 0 ? '待补表达' : `${expressionLines.length} 条表达`
  const segmentNavigatorItems = buildProductionSegmentNavigatorItems({
    segments,
    sceneMoments,
    writingExpressions,
    scriptBlocks,
    selectedSegment,
    selectedMoment,
    lookup,
  })

  return {
    selectedMoment,
    selectedSegment,
    selectedMomentScriptBlock,
    selectedMomentContentUnits,
    selectedMomentExpressions,
    expressionLines,
    selectedSegmentMoments,
    selectedSegmentLineCount,
    writingProgressLabel,
    segmentNavigatorItems,
  }
}

function buildProductionSegmentNavigatorItems({
  segments,
  sceneMoments,
  writingExpressions,
  scriptBlocks,
  selectedSegment,
  selectedMoment,
  lookup,
}: {
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  writingExpressions: WritingExpressionRecord[]
  scriptBlocks: ScriptBlockRecord[]
  selectedSegment: SegmentRecord | null
  selectedMoment: SceneMomentRecord | null
  lookup: ProductionWorkspaceLookup
}): ProductionSegmentNavigatorItem[] {
  return segments.map((segment, index) => {
    const moments = sceneMoments.filter((moment) => Number(moment.segment_id) === segment.ID)
    return {
      id: segment.ID,
      indexLabel: String(index + 1).padStart(2, '0'),
      title: productionOrchestrationRecordTitle(segment),
      summary: String(segment.summary ?? segment.content ?? '这一段还没有说明情绪功能。'),
      status: String(segment.status ?? 'draft'),
      statusLabel: statusLabel[String(segment.status ?? '')] ?? String(segment.status ?? '草稿'),
      kindLabel: segmentKindLabel[String(segment.kind ?? '')] ?? '编排段',
      active: selectedSegment?.ID === segment.ID,
      rawRecord: segment,
      moments: moments.map((moment) => {
        const block = moment.script_block_id ? scriptBlocks.find((item) => item.ID === Number(moment.script_block_id)) ?? null : null
        const units = Array.from(lookup.contentUnitById.values()).filter((unit) => Number(unit.scene_moment_id) === moment.ID)
        const expressions = writingExpressions.filter((item) => Number(item.scene_moment_id) === moment.ID)
        return {
          id: moment.ID,
          identifier: sceneIdentifier(moment) || `#${moment.ID}`,
          title: productionOrchestrationRecordTitle(moment),
          description: moment.action_text || moment.description || '还没有写具体发生什么。',
          lineCount: buildWritingExpressionLines(moment, block, units, expressions).length,
          active: selectedMoment?.ID === moment.ID,
        }
      }),
    }
  })
}

function reorderProductionOrchestrationRecords<T extends { ID: number; order?: number }>(
  records: T[],
  draggedId: number,
  targetId: number,
  position: ProductionOrchestrationDropPosition,
) {
  const orderedRecords = records.slice().sort(compareProductionOrchestrationOrder)
  const dragged = orderedRecords.find((record) => record.ID === draggedId)
  if (!dragged || draggedId === targetId) return orderedRecords
  const withoutDragged = orderedRecords.filter((record) => record.ID !== draggedId)
  const targetIndex = withoutDragged.findIndex((record) => record.ID === targetId)
  if (targetIndex < 0) return orderedRecords
  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
  return [
    ...withoutDragged.slice(0, insertIndex),
    dragged,
    ...withoutDragged.slice(insertIndex),
  ]
}

function orderedSceneMomentsForSegment(sceneMoments: SceneMomentRecord[], segmentId: number) {
  return sceneMoments
    .filter((moment) => Number(moment.segment_id) === segmentId)
    .slice()
    .sort(compareProductionOrchestrationOrder)
}

function normalizedOrder(record: { ID: number; order?: unknown }, index: number) {
  const order = Number(record.order)
  return Number.isFinite(order) && order > 0 ? order : index + 1
}
