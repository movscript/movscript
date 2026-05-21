import type { SemanticEntityRecord } from '@/api/semanticEntities'
import { sceneIdentifier } from '@/lib/productionIdentifiers'
import type { ProductionOrchestrationLookup } from '@/lib/productionOrchestrationEntityModel'
import type {
  AssetSlotRecord,
  ContentUnitRecord,
  CreativeReferenceRecord,
  SceneMomentRecord,
  ScriptBlockRecord,
  SegmentRecord,
  WritingExpressionRecord,
} from '@/lib/productionOrchestrationData'
import {
  buildWritingExpressionLines,
  type ProductionWritingExpressionLine,
} from '@/lib/productionWritingExpressions'
import type { ProductionSegmentNavigatorItem } from '@/components/workbench/ProductionOrchestrationStructure'

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

const statusTone: Record<string, string> = {
  confirmed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  locked: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  accepted: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  active: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  draft: 'bg-muted text-muted-foreground',
  candidate: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  missing: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  ignored: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  rejected: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  blocked: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  in_production: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
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
  const selectedMoment = selectedMomentId ? sceneMoments.find((moment) => moment.ID === selectedMomentId) ?? null : sceneMoments[0] ?? null
  const selectedSegment = selectedMoment?.segment_id ? segments.find((segment) => segment.ID === Number(selectedMoment.segment_id)) ?? null : segments[0] ?? null
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
      statusClassName: statusTone[String(segment.status ?? '')] ?? 'bg-muted text-muted-foreground',
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
