import {
  Boxes,
  Image,
  PackageCheck,
  Route,
  ScrollText,
  ShieldCheck,
  Target,
  Users,
} from 'lucide-react'

import { listSemanticEntities, semanticEntityConfig, type GenerationContext, type SemanticEntityRecord } from '@/api/semanticEntities'
import { api } from '@/lib/api'
import { isGeneratedKeyframeCandidateRecord } from '@/lib/agentGeneratedResourceBinding'
import { normalizeAssetSlotStatus } from '@/lib/contentWorkbenchStatus'
import {
  byOrder,
  clampProgress,
  dedupeRecords,
  firstText,
  titleOfRecord,
} from '@/lib/contentWorkbenchRecordUtils'
import type { WorkbenchGate, WorkbenchLinkRow } from '@/components/workbench/WorkbenchChrome'
import type { WorkbenchScenarioPriority as Priority, WorkbenchScenarioStatus as WorkStatus } from '@/lib/workbenchScenarios'
import type { Job, RawResource } from '@/types'

export type ContentWorkbenchRecord = SemanticEntityRecord & {
  alias?: string
  description?: string
  content?: string
  prompt?: string
  prompt_hint?: string
  visual_intent?: string
  summary?: string
  action_text?: string
  condition_text?: string
  time_text?: string
  location_text?: string
  mood?: string
  emotion?: string
  costume?: string
  visual_notes?: string
  props?: string
  duration_sec?: number
  production_id?: number
  segment_id?: number
  scene_moment_id?: number
  content_unit_id?: number
  script_block_id?: number
  preview_timeline_id?: number
  is_primary?: boolean
  speaker?: string
  start_line?: number
  end_line?: number
  owner_type?: string
  owner_id?: number
  creative_reference_id?: number
  creative_reference_state_id?: number
  kind?: string
  name?: string
  priority?: string
  resource_id?: number
  resource?: RawResource
  locked_asset_slot_id?: number
  slot_key?: string
  source_type?: string
  source_id?: number
  scope_type?: string
  scope_id?: number
  score?: number
  note?: string
  start_sec?: number
  candidate_asset_slot_id?: number
  asset_slot_id?: number
  candidate_asset_slot?: ContentWorkbenchRecord
  scene_code?: string
  unit_code?: string
  shot_size?: string
  camera_angle?: string
  camera_motion?: string
  importance?: string
  profile_json?: string
  tags_json?: string
  role?: string
  evidence?: string
}

export interface ProductionWorkbenchData {
  productions: ContentWorkbenchRecord[]
  segments: ContentWorkbenchRecord[]
  sceneMoments: ContentWorkbenchRecord[]
  creativeReferences: ContentWorkbenchRecord[]
  creativeReferenceUsages: ContentWorkbenchRecord[]
  contentUnits: ContentWorkbenchRecord[]
  assetSlots: ContentWorkbenchRecord[]
  keyframes: ContentWorkbenchRecord[]
  scriptBlocks: ContentWorkbenchRecord[]
  previewTimelines: ContentWorkbenchRecord[]
  previewTimelineItems: ContentWorkbenchRecord[]
  deliveryVersions: ContentWorkbenchRecord[]
  jobs: Job[]
}

export interface ContentGenerationMomentRow {
  id: string
  title: string
  scope: string
  status: WorkStatus
  priority: Priority
  progress: number
  moment: ContentWorkbenchRecord
  productionIds: number[]
  segment?: ContentWorkbenchRecord
  references: ContentWorkbenchRecord[]
  referenceUsages: ContentWorkbenchRecord[]
  units: ContentWorkbenchRecord[]
  assetSlots: ContentWorkbenchRecord[]
  missingSlots: ContentWorkbenchRecord[]
  keyframes: ContentWorkbenchRecord[]
  scriptBlocks: ContentWorkbenchRecord[]
  previewTimelineItems: ContentWorkbenchRecord[]
}

export async function loadContentWorkbenchData(projectId: number): Promise<ProductionWorkbenchData> {
  const [productions, segments, sceneMoments, creativeReferences, creativeReferenceUsages, contentUnits, assetSlots, keyframes, scriptBlocks, previewTimelines, previewTimelineItems, deliveryVersions, jobs] = await Promise.all([
    listSemanticEntities(projectId, semanticEntityConfig('productions')),
    listSemanticEntities(projectId, semanticEntityConfig('segments')),
    listSemanticEntities(projectId, semanticEntityConfig('sceneMoments')),
    listSemanticEntities(projectId, semanticEntityConfig('creativeReferences')),
    listSemanticEntities(projectId, semanticEntityConfig('creativeReferenceUsages')),
    listSemanticEntities(projectId, semanticEntityConfig('contentUnits')),
    listSemanticEntities(projectId, semanticEntityConfig('assetSlots')),
    listSemanticEntities(projectId, semanticEntityConfig('keyframes')),
    listSemanticEntities(projectId, semanticEntityConfig('scriptBlocks')),
    listSemanticEntities(projectId, semanticEntityConfig('previewTimelines')),
    listSemanticEntities(projectId, semanticEntityConfig('previewTimelineItems')),
    listSemanticEntities(projectId, semanticEntityConfig('deliveryVersions')),
    loadContentWorkbenchJobs(projectId, ['image', 'image_edit', 'video', 'video_i2v', 'video_v2v']),
  ])
  return {
    productions: productions as ContentWorkbenchRecord[],
    segments: segments as ContentWorkbenchRecord[],
    sceneMoments: sceneMoments as ContentWorkbenchRecord[],
    creativeReferences: creativeReferences as ContentWorkbenchRecord[],
    creativeReferenceUsages: creativeReferenceUsages as ContentWorkbenchRecord[],
    contentUnits: contentUnits as ContentWorkbenchRecord[],
    assetSlots: assetSlots as ContentWorkbenchRecord[],
    keyframes: keyframes as ContentWorkbenchRecord[],
    scriptBlocks: scriptBlocks as ContentWorkbenchRecord[],
    previewTimelines: previewTimelines as ContentWorkbenchRecord[],
    previewTimelineItems: previewTimelineItems as ContentWorkbenchRecord[],
    deliveryVersions: deliveryVersions as ContentWorkbenchRecord[],
    jobs,
  }
}

export async function loadContentWorkbenchJobs(projectId: number, types: string[]) {
  const batches = await Promise.all(types.map((type) => (
    api.get<Job[]>('/jobs', {
      params: {
        project_id: projectId,
        type,
        exact_type: 1,
        limit: 100,
      },
    }).then((r) => r.data)
  )))
  return batches.flat().sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime())
}

export function buildContentGenerationMomentRows(data?: ProductionWorkbenchData): ContentGenerationMomentRow[] {
  if (!data) return []
  const productions = data.productions ?? []
  const segments = data.segments ?? []
  const sceneMoments = data.sceneMoments ?? []
  const contentUnits = data.contentUnits ?? []
  const assetSlotsData = data.assetSlots ?? []
  const keyframesData = (data.keyframes ?? []).filter((keyframe) => !isGeneratedKeyframeCandidateRecord(keyframe))
  const scriptBlocksData = data.scriptBlocks ?? []
  const creativeReferences = (data.creativeReferences ?? []).filter(isVisibleContentWorkbenchRecord)
  const creativeReferenceUsages = (data.creativeReferenceUsages ?? []).filter(isVisibleContentWorkbenchRecord)
  const visibleAssetSlots = assetSlotsData.filter((slot) => slot.owner_type !== 'asset_slot' && isVisibleContentWorkbenchRecord(slot))
  return sceneMoments
    .slice()
    .sort(byOrder)
    .map((moment) => {
      const segment = moment.segment_id ? segments.find((item) => item.ID === Number(moment.segment_id)) : undefined
      const units = contentUnits
        .filter((unit) => Number(unit.scene_moment_id) === moment.ID)
        .slice()
        .sort(byOrder)
      const unitIds = new Set(units.map((unit) => unit.ID))
      const productionIds = new Set<number>()
      if (Number.isFinite(Number(moment.production_id)) && Number(moment.production_id) > 0) productionIds.add(Number(moment.production_id))
      if (segment?.production_id) productionIds.add(Number(segment.production_id))
      units.forEach((unit) => {
        if (unit.production_id) productionIds.add(Number(unit.production_id))
      })
      const referenceUsages = creativeReferenceUsages
        .filter((usage) => (
          (usage.owner_type === 'scene_moment' && Number(usage.owner_id) === moment.ID) ||
          (usage.owner_type === 'content_unit' && usage.owner_id ? unitIds.has(Number(usage.owner_id)) : false)
        ))
      const usageReferenceIds = referenceUsages
        .map((usage) => Number(usage.creative_reference_id))
        .filter((id) => Number.isFinite(id) && id > 0)
      const scriptBlockIds = new Set([
        Number(moment.script_block_id) || 0,
        ...units.map((unit) => Number(unit.script_block_id) || 0),
      ].filter((id) => id > 0))
      const scriptBlocks = scriptBlocksData.filter((block) => scriptBlockIds.has(block.ID)).slice().sort(byOrder)
      const keyframes = keyframesData.filter((keyframe) => Number(keyframe.scene_moment_id) === moment.ID || (keyframe.content_unit_id ? unitIds.has(Number(keyframe.content_unit_id)) : false)).slice().sort(byOrder)
      const keyframeIds = new Set(keyframes.map((keyframe) => keyframe.ID))
      const assetSlots = visibleAssetSlots.filter((slot) => (
        (slot.owner_type === 'scene_moment' && Number(slot.owner_id) === moment.ID) ||
        (slot.owner_type === 'content_unit' && slot.owner_id ? unitIds.has(Number(slot.owner_id)) : false) ||
        (slot.owner_type === 'keyframe' && slot.owner_id ? keyframeIds.has(Number(slot.owner_id)) : false)
      ))
      const scopedReferenceIds = new Set(usageReferenceIds)
      for (const slot of assetSlots) addRecordId(scopedReferenceIds, slot.creative_reference_id)
      const scopedReferences = creativeReferences.filter((reference) => scopedReferenceIds.has(reference.ID))
      const references = dedupeRecords(scopedReferences.length > 0 ? scopedReferences : creativeReferences)
      const referenceIds = new Set(references.map((reference) => reference.ID))
      const referenceAssetSlots = visibleAssetSlots.filter((slot) => (
        (slot.creative_reference_id && referenceIds.has(Number(slot.creative_reference_id))) ||
        (slot.owner_type === 'creative_reference' && slot.owner_id && referenceIds.has(Number(slot.owner_id)))
      ))
      const projectAssetSlots = assetSlots.length > 0 || referenceAssetSlots.length > 0
        ? []
        : visibleAssetSlots.filter((slot) => !slot.owner_type || slot.owner_type === 'creative_reference')
      const effectiveAssetSlots = dedupeRecords([...assetSlots, ...referenceAssetSlots, ...projectAssetSlots])
      const missingSlots = effectiveAssetSlots.filter((slot) => normalizeAssetSlotStatus(slot.status) === 'missing')
      const previewTimelineIds = bestPreviewTimelineIdsForProductionIds(productionIds, data)
      const previewTimelineItems = scopedPreviewTimelineItems(
        data.previewTimelineItems,
        previewTimelineIds,
        (item) => (
          Number(item.scene_moment_id) === moment.ID ||
          (item.content_unit_id ? unitIds.has(Number(item.content_unit_id)) : false)
        ),
      )
      const hasUnitPrompt = units.some((unit) => firstText(unit.description, unit.prompt))
      const status = momentWorkStatus(moment, units, missingSlots)
      const priority: Priority = units.length === 0 || missingSlots.length > 0 ? 'high' : status === 'running' ? 'medium' : 'low'
      return {
        id: String(moment.ID),
        title: titleOfRecord(moment),
        scope: momentScopeLabel(moment, segment, units, keyframes, missingSlots, productions, Array.from(productionIds)),
        status,
        priority,
        progress: momentProgress(moment, units, missingSlots, keyframes, hasUnitPrompt),
        moment,
        productionIds: Array.from(productionIds),
        segment,
        references,
        referenceUsages,
        units,
        assetSlots: effectiveAssetSlots,
        missingSlots,
        keyframes,
        scriptBlocks,
        previewTimelineItems,
      }
    })
}

export function isVisibleContentWorkbenchRecord(record: ContentWorkbenchRecord) {
  return !['ignored', 'merged'].includes(String(record.status ?? '').toLowerCase())
}

export function buildMomentStandards(row: ContentGenerationMomentRow | null, jobs: Job[]): WorkbenchGate[] {
  if (!row) return []
  const hasStoryContext = Boolean(firstText(row.moment.description, row.moment.action_text) || row.moment.time_text || row.moment.location_text)
  const hasUnits = row.units.length > 0
  const hasUnitPrompt = row.units.some((unit) => firstText(unit.description, unit.prompt))
  const assetsReady = row.units.length > 0 && row.missingSlots.length === 0
  const hasJob = jobs.length > 0
  return [
    { label: '情节上下文明确', detail: hasStoryContext ? '已有情节描述、动作或时空条件' : '需要补齐情节描述、动作、时间或地点', done: hasStoryContext, tone: hasStoryContext ? 'success' : 'warning' },
    { label: '制作项存在', detail: hasUnits ? `${row.units.length} 个制作项可继续拆分` : '还没有制作项，先手动创建或让 AI 规划制作项', done: hasUnits, tone: hasUnits ? 'success' : 'warning' },
    { label: '制作项提示可用', detail: hasUnitPrompt ? '已有描述或创作提示，可驱动后续执行' : '需要为制作项补上创作提示或用途说明', done: hasUnitPrompt, tone: hasUnitPrompt ? 'success' : 'warning' },
    { label: '素材输入就绪', detail: assetsReady ? '没有未处理的素材缺口' : `${row.missingSlots.length} 个素材缺口仍在阻塞`, done: assetsReady, tone: assetsReady ? 'success' : 'warning' },
    { label: '生成记录可追溯', detail: hasJob ? '已有项目生成任务记录' : '当前项目还没有生成任务记录', done: hasJob, tone: hasJob ? 'success' : 'warning' },
  ]
}

export function buildGenerationContextStandards(context?: GenerationContext): WorkbenchGate[] {
  if (!context) return []
  const target = context.target?.content_unit
  if (!target) {
    return [
      { label: '目标提示可读', detail: '后端生成上下文缺少制作项目标，请重新检查生成上下文接口。', done: false, tone: 'warning' },
    ]
  }
  const assetSlots = Array.isArray(context.asset_slots) ? context.asset_slots : []
  const keyframes = Array.isArray(context.keyframes) ? context.keyframes : []
  const creativeReferences = Array.isArray(context.creative_references) ? context.creative_references : []
  const lockedAssets = assetSlots.filter((slot) => isGenerationAssetUsable(slot)).length
  const missingAssets = assetSlots.filter((slot) => normalizeAssetSlotStatus(String(slot.status ?? '')) === 'missing').length
  const hasTargetPrompt = Boolean(firstText(target.prompt, target.description))
  const hasScriptSource = Boolean(context.script_block)
  const hasStoryContext = Boolean(context.scene_moment || context.segment)
  const hasContinuity = creativeReferences.length > 0
  const assetsReady = assetSlots.length > 0 && missingAssets === 0 && lockedAssets > 0
  const hasKeyframe = keyframes.length > 0
  return [
    { label: '目标提示可读', detail: hasTargetPrompt ? firstText(target.prompt, target.description) : '制作项缺少 prompt 或 description，Agent 难以判断画面目标', done: hasTargetPrompt, tone: hasTargetPrompt ? 'success' : 'warning' },
    { label: '剧本来源稳定', detail: hasScriptSource ? scriptBlockContextLabel(context.script_block) : '未绑定不可变剧本块，生成缺少可追溯的剧本行文', done: hasScriptSource, tone: hasScriptSource ? 'success' : 'warning' },
    { label: '情景上下文存在', detail: hasStoryContext ? [context.segment ? `编排段：${titleOfRecord(context.segment)}` : null, context.scene_moment ? `情景：${titleOfRecord(context.scene_moment)}` : null].filter(Boolean).join(' / ') : '未绑定情景或编排段，生成会缺少时空、动作和情绪约束', done: hasStoryContext, tone: hasStoryContext ? 'success' : 'warning' },
    { label: '连续性资料可用', detail: hasContinuity ? `${creativeReferences.length} 个设定引用会进入生成上下文` : '未找到人物、地点、风格或道具设定引用', done: hasContinuity, tone: hasContinuity ? 'success' : 'warning' },
    { label: '素材输入可用', detail: assetSlots.length === 0 ? '未找到素材需求或参考素材' : `${assetSlots.length} 个素材输入，${lockedAssets} 个可用，${missingAssets} 个缺失`, done: assetsReady, tone: assetsReady ? 'success' : 'warning' },
    { label: '首帧/画面锚点', detail: hasKeyframe ? `${keyframes.length} 个画面锚点可作为视频生成锚点` : '视频生成前建议先创建或采纳开头、结尾等画面锚点', done: hasKeyframe, tone: hasKeyframe ? 'success' : 'warning' },
  ]
}

export function buildGenerationContextRows(context?: GenerationContext): WorkbenchLinkRow[] {
  if (!context) return []
  const target = context.target?.content_unit
  if (!target) return []
  const creativeReferences = Array.isArray(context.creative_references) ? context.creative_references : []
  const assetSlots = Array.isArray(context.asset_slots) ? context.asset_slots : []
  const keyframes = Array.isArray(context.keyframes) ? context.keyframes : []
  const writeTargets = Array.isArray(context.constraints?.write_targets) ? context.constraints.write_targets : []
  const referenceNames = creativeReferences
    .map((item) => titleOfRecord(item.state ?? item.reference))
    .filter(Boolean)
  const assetSummary = summarizeGenerationAssets(assetSlots)
  return [
    { label: '后端目标', value: firstText(target.prompt, target.description, titleOfRecord(target)), icon: Target },
    { label: '剧本来源', value: context.script_block ? firstText(context.script_block.content, scriptBlockContextLabel(context.script_block)) : '未绑定剧本块', icon: ScrollText },
    { label: '情景', value: context.scene_moment ? firstText(context.scene_moment.description, context.scene_moment.action_text, titleOfRecord(context.scene_moment)) : '未绑定情景', icon: Route },
    { label: '设定引用', value: referenceNames.length > 0 ? referenceNames.slice(0, 4).join('、') : '未找到设定引用', icon: Users },
    { label: '素材输入', value: assetSummary, icon: PackageCheck },
    { label: '画面锚点', value: keyframes.length > 0 ? keyframes.slice(0, 3).map(titleOfRecord).join('、') : '未找到画面锚点', icon: Image },
    { label: '写回范围', value: writeTargets.join('、') || '未声明写回范围', icon: ShieldCheck },
  ]
}

export function contentWorkbenchNullableNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
}

function scriptBlockContextLabel(block?: SemanticEntityRecord) {
  if (!block) return '未绑定剧本块'
  const lines = Number(block.start_line) > 0 && Number(block.end_line) > 0
    ? `行 ${block.start_line}-${block.end_line}`
    : `剧本块 #${block.ID}`
  const kind = String(block.kind ?? '').trim()
  const speaker = String(block.speaker ?? '').trim()
  return [lines, kind, speaker].filter(Boolean).join(' · ')
}

function summarizeGenerationAssets(slots: SemanticEntityRecord[]) {
  if (slots.length === 0) return '未找到素材输入'
  const usable = slots.filter((slot) => isGenerationAssetUsable(slot)).length
  const missing = slots.filter((slot) => normalizeAssetSlotStatus(String(slot.status ?? '')) === 'missing').length
  return `${slots.length} 个素材输入，${usable} 个可用，${missing} 个缺失`
}

function isGenerationAssetUsable(slot: SemanticEntityRecord) {
  const status = normalizeAssetSlotStatus(String(slot.status ?? ''))
  return status === 'locked' || status === 'waived' || Boolean(slot.resource_id || slot.locked_asset_slot_id)
}

function momentWorkStatus(moment: ContentWorkbenchRecord, units: ContentWorkbenchRecord[], missingSlots: ContentWorkbenchRecord[]): WorkStatus {
  if (units.length === 0) return 'blocked'
  if (missingSlots.length > 0) return 'blocked'
  if (units.some((unit) => unit.status === 'in_production')) return 'running'
  if (moment.status === 'confirmed' && units.some((unit) => unit.status === 'confirmed' || unit.status === 'locked')) return 'ready'
  return 'review'
}

function momentProgress(
  moment: ContentWorkbenchRecord,
  units: ContentWorkbenchRecord[],
  missingSlots: ContentWorkbenchRecord[],
  keyframes: ContentWorkbenchRecord[],
  hasUnitPrompt: boolean,
) {
  let score = 15
  if (firstText(moment.description, moment.action_text) || moment.time_text || moment.location_text) score += 25
  if (units.length > 0) score += 25
  if (hasUnitPrompt) score += 15
  if (missingSlots.length === 0 && units.length > 0) score += 10
  if (keyframes.length > 0) score += 10
  return clampProgress(score)
}

function momentScopeLabel(
  moment: ContentWorkbenchRecord,
  segment: ContentWorkbenchRecord | undefined,
  units: ContentWorkbenchRecord[],
  keyframes: ContentWorkbenchRecord[],
  missingSlots: ContentWorkbenchRecord[],
  productions: ContentWorkbenchRecord[],
  productionIds: number[],
) {
  const productionNames = productionIds
    .map((id) => productions.find((production) => production.ID === id))
    .filter(Boolean)
    .map((production) => titleOfRecord(production))
  const parts = [
    productionNames.length > 0 ? `制作 · ${productionNames.slice(0, 2).join('、')}` : '未绑定制作',
    segment ? `编排段 · ${titleOfRecord(segment)}` : '未绑定编排段',
    moment.mood || '情绪未定',
    units.length > 0 ? `${units.length} 制作项` : '待拆制作项',
    keyframes.length > 0 ? `${keyframes.length} 预览画面` : '无预览画面',
    missingSlots.length > 0 ? `${missingSlots.length} 缺口` : null,
  ].filter(Boolean)
  return parts.join(' / ')
}

function bestPreviewTimelineIdsForProductionIds(productionIds: Set<number>, data: ProductionWorkbenchData) {
  if (productionIds.size === 0) return null
  const ids = new Set<number>()
  for (const productionId of productionIds) {
    const timeline = data.previewTimelines
      .filter((item) => Number(item.production_id) === productionId)
      .slice()
      .sort((a, b) => previewTimelineRank(a) - previewTimelineRank(b) || byOrder(a, b))[0]
    if (timeline) ids.add(timeline.ID)
  }
  return ids.size > 0 ? ids : null
}

function scopedPreviewTimelineItems(items: ContentWorkbenchRecord[], timelineIds: Set<number> | null, predicate: (item: ContentWorkbenchRecord) => boolean) {
  const relatedItems = items.filter(predicate).slice().sort(byOrder)
  if (!timelineIds?.size) return relatedItems
  const scopedItems = relatedItems.filter((item) => timelineIds.has(Number(item.preview_timeline_id)))
  return scopedItems.length > 0 ? scopedItems : relatedItems
}

export function previewTimelineRank(item: ContentWorkbenchRecord) {
  const status = String(item.status ?? '').toLowerCase()
  if (Boolean(item.is_primary)) return 0
  if (status === 'confirmed') return 1
  if (status === 'playable') return 2
  if (status === 'draft') return 3
  return 4
}

function addRecordId(target: Set<number>, value: unknown) {
  const id = Number(value)
  if (Number.isFinite(id) && id > 0) target.add(id)
}
