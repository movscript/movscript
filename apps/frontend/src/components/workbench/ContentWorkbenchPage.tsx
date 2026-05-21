import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Clock3,
  ClipboardCheck,
  FileText,
  Film,
  Image,
  PackageCheck,
  Plus,
  Route,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Wand2,
} from 'lucide-react'

import { api } from '@/lib/api'
import { RESOURCE_UPLOAD_ACCEPT } from '@/lib/mediaTypes'
import { buildCommandFirstClientInput } from '@/lib/agentCommandInput'
import { openAgentPanelDraft } from '@/lib/agentPanelBridge'
import { isGeneratedKeyframeCandidateRecord } from '@/lib/agentGeneratedResourceBinding'
import { invalidateAssetCandidateConsumers } from '@/lib/assetCandidateQueryInvalidation'
import { localAgentClient, type AgentDraft } from '@/lib/localAgentClient'
import { buildContentWorkbenchAiSuggestPrompt, buildContentWorkbenchVisualPlanPrompt } from '@/lib/contentWorkbenchAiPrompt'
import { pickContentWorkbenchFirstUsableUnit } from '@/lib/contentWorkbenchCandidateFocus'
import { contentWorkbenchProposalDefaults } from '@/lib/contentWorkbenchDraftProposal'
import { buildContentDraftReviewModel, dedupeDrafts, draftEntityId, type ContentDraftReviewModel } from '@/lib/contentWorkbenchDraftReviewModel'
import {
  keyframeFrameRoleLabel,
  keyframeOrderForRole,
  nextKeyframeFrameRole,
} from '@/lib/contentWorkbenchEditModel'
import { buildContentWorkbenchCanvasPayload, findContentWorkbenchCanvas } from '@/lib/contentWorkbenchCanvas'
import { pickContentWorkbenchRelevantJobs } from '@/lib/contentWorkbenchJobScope'
import { trackKindLabel } from '@/lib/contentWorkbenchLabels'
import { buildContentWorkbenchReviewQueueSummary } from '@/lib/contentWorkbenchReviewQueue'
import { buildContentWorkbenchRouteSearch, pickContentWorkbenchRowIdForDeepLink } from '@/lib/contentWorkbenchRoute'
import { apiErrorMessage, contentUnitWorkStatus, normalizeAssetSlotStatus } from '@/lib/contentWorkbenchStatus'
import { scriptBlockCue, unitSoundCue } from '@/lib/contentWorkbenchScriptCues'
import {
  byOrder,
  clampProgress,
  dedupeRecords,
  firstText,
  formatDuration,
  normalizeEntityTitleKey,
  numberOf,
  titleOfRecord,
} from '@/lib/contentWorkbenchRecordUtils'
import {
  buildContentWorkbenchTimelineBoundaries,
  buildTrackTimeTicks,
  contentUnitTimelineKindRank,
  contentWorkbenchLocalTimelineSec,
  contentWorkbenchTimelineOriginSec,
  contentWorkbenchTimelinePxPerSec,
  contentWorkbenchTimelineRulerWidth,
  formatTrackClock,
  formatTrackTimeRange,
  pickPreviewTimelineItemForUnit,
  previewTimelineItemRank,
  reorderContentWorkbenchUnits,
  snapContentWorkbenchTimelineStartSec,
  trackTimelinePx,
  trackTimelineWidthPx,
  type ContentWorkbenchDropPosition,
} from '@/lib/contentWorkbenchTimeline'
import { buildContentWorkbenchUnitTrack, contentWorkbenchUnitRequiresKeyframe } from '@/lib/contentWorkbenchUnitTrack'
import { pickContentWorkbenchUploadTarget } from '@/lib/contentWorkbenchUploadTarget'
import {
  contentUnitGenerationCanvasDescription,
  contentUnitStoryboardBriefPromptText,
  contentUnitVisualPlanPromptText,
  mergeMetadataJSON,
  parseMetadataJSON,
} from '@/lib/contentUnitPlanningMetadata'
import { sceneIdentifier, unitIdentifier } from '@/lib/productionIdentifiers'
import { cn } from '@/lib/utils'
import type { WorkbenchScenarioPriority as Priority, WorkbenchScenarioStatus as WorkStatus } from '@/lib/workbenchScenarios'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import type { Canvas, Job, RawResource } from '@/types'
import { Badge, Button, Card, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@movscript/ui'
import { SemanticEntityInlineEditor } from '@/components/shared/SemanticEntityInlineEditor'
import { ContentUnitEditCards } from './ContentUnitEditCards'
import { CreateContentUnitQuickCard, CreateKeyframeQuickCard } from './ContentUnitQuickCreateCards'
import { ContentGenerationReviewPanel } from './ContentGenerationReviewPanel'
import {
  ContentWorkbenchFilterSidebar,
  contentWorkbenchRowMatchesSearch,
  type HierarchyFilterOption,
} from './ContentWorkbenchFilterSidebar'
import { ContentWorkbenchScenePreview } from './ContentWorkbenchScenePreview'
import { ScenarioWorkspace } from './ScenarioWorkspace'
import {
  ContextStack,
  GateChecklist,
  MetricStrip,
  QueueMiniMetric,
  SpecializedWorkbenchHeader,
  SpecializedQueue,
  type WorkbenchGate,
  type WorkbenchLinkRow,
  type WorkbenchMetric,
} from './WorkbenchChrome'
import { WorkbenchPanel } from './WorkbenchPanel'
import {
  buildContentUnitGenerationContext,
  createSemanticEntity,
  deleteSemanticEntity,
  listSemanticEntities,
  semanticEntityConfig,
  updateSemanticEntity,
  type GenerationContext,
  type SemanticEntityPayload,
  type SemanticEntityRecord,
} from '@/api/semanticEntities'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'

type ContentWorkbenchScopeLevel = 'production' | 'segment' | 'scene_moment'

type WorkbenchRecord = SemanticEntityRecord & {
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
  candidate_asset_slot?: WorkbenchRecord
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

interface ProductionWorkbenchData {
  productions: WorkbenchRecord[]
  segments: WorkbenchRecord[]
  sceneMoments: WorkbenchRecord[]
  creativeReferences: WorkbenchRecord[]
  creativeReferenceUsages: WorkbenchRecord[]
  contentUnits: WorkbenchRecord[]
  assetSlots: WorkbenchRecord[]
  keyframes: WorkbenchRecord[]
  scriptBlocks: WorkbenchRecord[]
  previewTimelines: WorkbenchRecord[]
  previewTimelineItems: WorkbenchRecord[]
  deliveryVersions: WorkbenchRecord[]
  jobs: Job[]
}

interface ContentGenerationMomentRow {
  id: string
  title: string
  scope: string
  status: WorkStatus
  priority: Priority
  progress: number
  moment: WorkbenchRecord
  productionIds: number[]
  segment?: WorkbenchRecord
  references: WorkbenchRecord[]
  referenceUsages: WorkbenchRecord[]
  units: WorkbenchRecord[]
  assetSlots: WorkbenchRecord[]
  missingSlots: WorkbenchRecord[]
  keyframes: WorkbenchRecord[]
  scriptBlocks: WorkbenchRecord[]
  previewTimelineItems: WorkbenchRecord[]
}

async function loadProductionWorkbenchData(projectId: number): Promise<ProductionWorkbenchData> {
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
    loadWorkbenchJobs(projectId, ['image', 'image_edit', 'video', 'video_i2v', 'video_v2v']),
  ])
  return {
    productions: productions as WorkbenchRecord[],
    segments: segments as WorkbenchRecord[],
    sceneMoments: sceneMoments as WorkbenchRecord[],
    creativeReferences: creativeReferences as WorkbenchRecord[],
    creativeReferenceUsages: creativeReferenceUsages as WorkbenchRecord[],
    contentUnits: contentUnits as WorkbenchRecord[],
    assetSlots: assetSlots as WorkbenchRecord[],
    keyframes: keyframes as WorkbenchRecord[],
    scriptBlocks: scriptBlocks as WorkbenchRecord[],
    previewTimelines: previewTimelines as WorkbenchRecord[],
    previewTimelineItems: previewTimelineItems as WorkbenchRecord[],
    deliveryVersions: deliveryVersions as WorkbenchRecord[],
    jobs,
  }
}

async function loadWorkbenchJobs(projectId: number, types: string[]) {
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

function buildContentGenerationMomentRows(data?: ProductionWorkbenchData): ContentGenerationMomentRow[] {
  if (!data) return []
  const productions = data.productions ?? []
  const segments = data.segments ?? []
  const sceneMoments = data.sceneMoments ?? []
  const contentUnits = data.contentUnits ?? []
  const assetSlotsData = data.assetSlots ?? []
  const keyframesData = (data.keyframes ?? []).filter((keyframe) => !isGeneratedKeyframeCandidateRecord(keyframe))
  const scriptBlocksData = data.scriptBlocks ?? []
  const creativeReferences = (data.creativeReferences ?? []).filter(isVisibleWorkbenchRecord)
  const creativeReferenceUsages = (data.creativeReferenceUsages ?? []).filter(isVisibleWorkbenchRecord)
  const visibleAssetSlots = assetSlotsData.filter((slot) => slot.owner_type !== 'asset_slot' && isVisibleWorkbenchRecord(slot))
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

function isVisibleWorkbenchRecord(record: WorkbenchRecord) {
  return !['ignored', 'merged'].includes(String(record.status ?? '').toLowerCase())
}

function buildMomentContext(row: ContentGenerationMomentRow | null): WorkbenchLinkRow[] {
  if (!row) return []
  const moment = row.moment
  return [
    { label: '情节目标', value: firstText(moment.description, moment.action_text, titleOfRecord(moment)), icon: Target },
    { label: '时空条件', value: [moment.time_text, moment.location_text].filter(Boolean).join(' / ') || '未填写时间或地点', icon: Route },
    { label: '动作与情绪', value: [moment.condition_text, moment.action_text, moment.mood].filter(Boolean).join(' / ') || '未填写条件、动作或情绪', icon: Film },
    { label: '设定资料', value: summarizeRecordNames(row.references, '尚未关联设定资料'), icon: Users },
    { label: '素材输入', value: summarizeAssetSlots(row.assetSlots, '尚未关联素材输入'), icon: PackageCheck },
    { label: '制作项', value: row.units.length > 0 ? `${row.units.length} 个，${row.units.slice(0, 2).map(titleOfRecord).join('、')}` : '尚未拆出制作项', icon: Boxes },
  ]
}

function buildMomentStandards(row: ContentGenerationMomentRow | null, jobs: Job[]): WorkbenchGate[] {
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

function appendReviewGate(rows: WorkbenchGate[], pendingDraftCount: number): WorkbenchGate[] {
  if (rows.length === 0) return rows
  return [
    ...rows,
    {
      label: 'AI 草案已处理',
      detail: pendingDraftCount > 0 ? `${pendingDraftCount} 个制作项草案仍需人工审阅` : '没有待处理的制作项草案',
      done: pendingDraftCount === 0,
      tone: pendingDraftCount === 0 ? 'success' : 'warning',
    },
  ]
}

function buildGenerationContextStandards(context?: GenerationContext): WorkbenchGate[] {
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

function buildGenerationContextRows(context?: GenerationContext): WorkbenchLinkRow[] {
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

function assetSlotProgress(slot: WorkbenchRecord, candidates: WorkbenchRecord[], lockedSlot?: WorkbenchRecord) {
  if (normalizeAssetSlotStatus(slot.status) === 'locked' || lockedSlot || slot.resource_id) return 100
  if (normalizeAssetSlotStatus(slot.status) === 'waived') return 100
  if (candidates.length > 0) return 65
  if (firstText(slot.description, slot.prompt_hint)) return 35
  return 15
}

function momentWorkStatus(moment: WorkbenchRecord, units: WorkbenchRecord[], missingSlots: WorkbenchRecord[]): WorkStatus {
  if (units.length === 0) return 'blocked'
  if (missingSlots.length > 0) return 'blocked'
  if (units.some((unit) => unit.status === 'in_production')) return 'running'
  if (moment.status === 'confirmed' && units.some((unit) => unit.status === 'confirmed' || unit.status === 'locked')) return 'ready'
  return 'review'
}

function momentProgress(
  moment: WorkbenchRecord,
  units: WorkbenchRecord[],
  missingSlots: WorkbenchRecord[],
  keyframes: WorkbenchRecord[],
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
  moment: WorkbenchRecord,
  segment: WorkbenchRecord | undefined,
  units: WorkbenchRecord[],
  keyframes: WorkbenchRecord[],
  missingSlots: WorkbenchRecord[],
  productions: WorkbenchRecord[],
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

function summarizeRecordNames(records: WorkbenchRecord[], empty = '暂无') {
  if (records.length === 0) return empty
  return records.slice(0, 4).map((record) => titleOfRecord(record)).join('、')
}

function summarizeAssetSlots(records: WorkbenchRecord[], empty = '暂无素材输入') {
  if (records.length === 0) return empty
  return records
    .slice(0, 4)
    .map((record) => firstText(record.name, record.slot_key, record.kind, titleOfRecord(record)))
    .join('、')
}

function nullableNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
}

function ContentWorkbenchUnitInspector({
  projectId,
  queryKey,
  jobs = [],
  row,
  unit,
  onSelectUnit,
  onCreateUnit,
  onAiSuggest,
  onAiVisualPlan,
  onCreateAssetSlot,
  onCreateKeyframe,
  onOpenCanvas,
  onUploadMissingAssets,
  onDeleteUnit,
}: {
  projectId?: number
  queryKey?: readonly unknown[]
  jobs?: Job[]
  row: ContentGenerationMomentRow | null
  unit: WorkbenchRecord | null
  onSelectUnit: (unitId: number) => void
  onCreateUnit: () => void
  onAiSuggest?: () => void
  onAiVisualPlan?: () => void
  onCreateAssetSlot?: () => void
  onCreateKeyframe?: () => void
  onOpenCanvas?: () => void
  onUploadMissingAssets?: () => void
  onDeleteUnit?: (unit: WorkbenchRecord) => void
}) {
  return (
    <aside
      className="min-w-0 overflow-hidden rounded-lg border border-border bg-background 2xl:sticky 2xl:top-0"
      data-testid="content-workbench-unit-inspector"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border bg-muted/25 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <FileText size={14} />
            当前制作项
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold text-foreground">
            {unit ? titleOfRecord(unit) : row ? '选择或创建制作项' : '等待选择情节'}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {unit
              ? '生成目标、关键帧、故事板和调度输入都在这里补齐。'
              : row
                ? '先在时间轴选择一个制作项，或新建一个制作项。'
                : '选择情节后再开始内容编排。'}
          </p>
        </div>
        {unit ? <Badge variant="outline">{trackKindLabel(String(unit.kind || 'shot'))}</Badge> : null}
      </div>
      <ContentUnitEditCards
        projectId={projectId}
        queryKey={queryKey}
        jobs={jobs}
        row={row}
        unit={unit}
        compact
        onSelectUnit={onSelectUnit}
        onCreateUnit={onCreateUnit}
        onAiSuggest={onAiSuggest}
        onAiVisualPlan={onAiVisualPlan}
        onCreateAssetSlot={onCreateAssetSlot}
        onCreateKeyframe={onCreateKeyframe}
        onOpenCanvas={onOpenCanvas}
        onUploadMissingAssets={onUploadMissingAssets}
        onDeleteUnit={onDeleteUnit}
      />
    </aside>
  )
}

function formatTrackDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '未设时长'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
}

function UnitProductionTrack({
  row,
  selectedUnitId,
  showInlineEditor = true,
  onSelectUnit,
  onCreateUnit,
  onAiSuggest,
  onSelectFirstMoment,
  onCreateAssetSlot,
  onCreateKeyframe,
  onOpenCanvas,
  onUploadMissingAssets,
  onReorderUnit,
  onMoveUnitOnTimeline,
  onDeleteUnit,
  projectId,
  queryKey,
  jobs = [],
  isReordering,
}: {
  row: ContentGenerationMomentRow | null
  selectedUnitId?: number
  showInlineEditor?: boolean
  onSelectUnit: (unitId: number | null) => void
  onCreateUnit: () => void
  onAiSuggest?: () => void
  onSelectFirstMoment: () => void
  onCreateAssetSlot?: () => void
  onCreateKeyframe?: () => void
  onOpenCanvas?: () => void
  onUploadMissingAssets?: () => void
  onReorderUnit: (draggedUnitId: number, targetUnitId: number, position: ContentWorkbenchDropPosition) => void
  onMoveUnitOnTimeline: (unitId: number, startSec: number) => void
  onDeleteUnit?: (unit: WorkbenchRecord) => void
  projectId?: number
  queryKey?: readonly unknown[]
  jobs?: Job[]
  isReordering?: boolean
}) {
  const selectedUnit = row?.units.find((unit) => unit.ID === selectedUnitId) ?? null
  const [draggedUnitId, setDraggedUnitId] = useState<number | null>(null)
  const [timelineZoom, setTimelineZoom] = useState(1)
  const [unitKindFilter, setUnitKindFilter] = useState('all')
  const [schedulePanel, setSchedulePanel] = useState<'timeline' | 'edit'>('timeline')
  const summary = buildContentWorkbenchUnitTrack((row?.units ?? []).slice().sort(byOrder).map((unit) => {
    const unitSlots = row?.assetSlots.filter((slot) => slot.owner_type === 'content_unit' && Number(slot.owner_id) === unit.ID) ?? []
    const missingSlots = unitSlots.filter((slot) => normalizeAssetSlotStatus(slot.status) === 'missing')
    const audioSlots = unitSlots.filter((slot) => slot.kind === 'audio')
    const keyframes = row?.keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === unit.ID) ?? []
    const scriptBlock = row?.scriptBlocks.find((block) => block.ID === Number(unit.script_block_id)) ?? null
    const previewTimelineItem = pickPreviewTimelineItemForUnit(row?.previewTimelineItems ?? [], unit.ID)
    return {
      id: unit.ID,
      title: titleOfRecord(unit),
      kind: unit.kind,
      identifier: unitIdentifier(unit),
      startSec: previewTimelineItem ? numberOf(previewTimelineItem.start_sec) : undefined,
      durationSec: numberOf(previewTimelineItem?.duration_sec) || numberOf(unit.duration_sec),
      status: unit.status,
      summary: firstText(unit.description, unit.prompt),
      sceneMomentTitle: firstText(unit.__scene_moment_title, row?.title),
      segmentTitle: firstText(unit.__segment_title, row?.segment ? titleOfRecord(row.segment) : ''),
      scriptCue: scriptBlockCue(scriptBlock),
      soundCue: unitSoundCue(unit, scriptBlock, audioSlots),
      keyframeTitles: keyframes.map(titleOfRecord),
      missingAssetTitles: missingSlots.map(titleOfRecord),
      requiresKeyframe: contentWorkbenchUnitRequiresKeyframe(unit.kind),
      timeSource: previewTimelineItem ? 'preview' as const : 'estimated' as const,
      hasPrompt: Boolean(firstText(unit.prompt, unit.description)),
      assetSlotCount: unitSlots.length,
      missingSlotCount: missingSlots.length,
      keyframeCount: keyframes.length,
      selected: selectedUnitId === unit.ID,
    }
  }))
  const unitKindOptions = Array.from(new Set(summary.items.map((item) => String(item.kind || 'shot'))))
    .sort((a, b) => contentUnitTimelineKindRank(a) - contentUnitTimelineKindRank(b) || trackKindLabel(a).localeCompare(trackKindLabel(b), 'zh-Hans-CN'))
    .map((kind) => ({
      kind,
      label: trackKindLabel(kind),
      count: summary.items.filter((item) => String(item.kind || 'shot') === kind).length,
    }))
  const filteredItems = unitKindFilter === 'all'
    ? summary.items
    : summary.items.filter((item) => String(item.kind || 'shot') === unitKindFilter)
  const visibleSummary = {
    ...summary,
    items: filteredItems,
    total: filteredItems.length,
    durationSec: filteredItems.reduce((max, item) => Math.max(max, item.endSec), 0),
    keyframeCount: filteredItems.reduce((sum, item) => sum + item.keyframeTitles.length, 0),
    selectedId: filteredItems.find((item) => item.selected)?.id,
  }

  if (!row || summary.total === 0) {
    return (
      <div className="rounded-md border border-border bg-background p-2.5" data-testid="content-workbench-unit-track">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Route size={15} className="text-muted-foreground" />
              {summary.title}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{summary.detail}</p>
          </div>
          <Badge variant="outline">{row ? '待制作项' : '待情节'}</Badge>
        </div>
        <div className="mt-3 overflow-hidden rounded-md border border-dashed border-border bg-card" data-testid="content-workbench-unit-schedule">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-2.5 py-2">
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
              <Clock3 size={15} className="shrink-0 text-muted-foreground" />
              <span className="truncate">制作项时间表</span>
            </div>
            <Badge variant="outline">等待输入</Badge>
          </div>
          <div className="px-3 py-5 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{row ? '当前情节还没有制作项' : '先选择一个情节'}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {row
                ? '添加或采纳制作项后，这里会显示时间位置、对白/声音、关键帧和素材缺口。'
                : '选择情节后，这里会显示该情节的制作项时间表和右侧可编辑卡片。'}
            </p>
            {row ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" className="h-8 gap-1.5" onClick={onCreateUnit}>
                  <Plus size={13} />
                  添加制作项
                </Button>
                {onAiSuggest ? (
                  <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={onAiSuggest}>
                    <Sparkles size={13} />
                    让 AI 规划制作项
                  </Button>
                ) : null}
              </div>
            ) : (
              <Button size="sm" variant="outline" className="mt-3 h-8 gap-1.5" onClick={onSelectFirstMoment}>
                <Route size={13} />
                选择第一个情节
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const timelineMemberItems = summary.items
  const timelineOriginSec = contentWorkbenchTimelineOriginSec(timelineMemberItems)
  const timelineContentDurationSec = Math.max(1, summary.items.reduce((max, item) => Math.max(max, item.endSec - timelineOriginSec), 0))
  const timelinePxPerSec = contentWorkbenchTimelinePxPerSec(timelineZoom)
  const timelineRulerWidth = contentWorkbenchTimelineRulerWidth(timelineMemberItems, timelineOriginSec, timelinePxPerSec)
  const timelineCanvasWidth = timelineRulerWidth + 124
  const timelineDurationSec = timelineRulerWidth / timelinePxPerSec
  const timelineTicks = buildTrackTimeTicks(timelineDurationSec, timelinePxPerSec)
  const timelineBoundaries = buildContentWorkbenchTimelineBoundaries(timelineMemberItems, timelineOriginSec, timelinePxPerSec)
  const selectedTimelineItem = timelineMemberItems.find((item) => item.selected) ?? null
  const selectedTimelineItemStartSec = selectedTimelineItem ? contentWorkbenchLocalTimelineSec(selectedTimelineItem.startSec, timelineOriginSec) : 0
  const focusedTimeline = timelineOriginSec > 0
  const canDragUnits = Boolean(row && visibleSummary.total > 0 && !isReordering)
  useEffect(() => {
    if ((!selectedUnit || !showInlineEditor) && schedulePanel === 'edit') setSchedulePanel('timeline')
  }, [schedulePanel, selectedUnit, showInlineEditor])
  function selectOrClearUnit(unitId: number) {
    if (selectedUnitId === unitId) {
      onSelectUnit(null)
      return
    }
    onSelectUnit(unitId)
  }
  function handleUnitDragStart(event: DragEvent<HTMLElement>, unitId: number, source: 'card' | 'timeline' = 'card') {
    if (!canDragUnits) return
    setDraggedUnitId(unitId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-movscript-content-unit-id', String(unitId))
    const item = visibleSummary.items.find((entry) => Number(entry.id) === unitId)
    const box = event.currentTarget.getBoundingClientRect()
    const pointerRatio = box.width > 0 ? Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) : 0
    const offsetSec = source === 'timeline' && item ? pointerRatio * item.durationSec : 0
    event.dataTransfer.setData('application/x-movscript-timeline-drag-offset-sec', String(offsetSec))
  }
  function handleUnitDrop(event: DragEvent<HTMLElement>, targetUnitId: number) {
    event.preventDefault()
    event.stopPropagation()
    const rawUnitId = event.dataTransfer.getData('application/x-movscript-content-unit-id')
    const sourceUnitId = Number(rawUnitId || draggedUnitId || 0)
    setDraggedUnitId(null)
    if (!sourceUnitId || sourceUnitId === targetUnitId) return
    const box = event.currentTarget.getBoundingClientRect()
    const position: ContentWorkbenchDropPosition = event.clientX > box.left + box.width / 2 ? 'after' : 'before'
    onReorderUnit(sourceUnitId, targetUnitId, position)
  }
  function handleTimelineLaneDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    const rawUnitId = event.dataTransfer.getData('application/x-movscript-content-unit-id')
    const sourceUnitId = Number(rawUnitId || draggedUnitId || 0)
    const dragOffsetSec = Number(event.dataTransfer.getData('application/x-movscript-timeline-drag-offset-sec')) || 0
    setDraggedUnitId(null)
    if (!sourceUnitId) return
    const box = event.currentTarget.getBoundingClientRect()
    const unit = visibleSummary.items.find((item) => Number(item.id) === sourceUnitId)
    if (!unit) return
    const rawStartSec = Math.max(0, (event.clientX - box.left) / timelinePxPerSec - dragOffsetSec)
    const localStartSec = snapContentWorkbenchTimelineStartSec(rawStartSec, timelinePxPerSec, timelineMemberItems.map((item) => ({
      id: item.id,
      startSec: contentWorkbenchLocalTimelineSec(item.startSec, timelineOriginSec),
      endSec: contentWorkbenchLocalTimelineSec(item.endSec, timelineOriginSec),
    })), sourceUnitId)
    onMoveUnitOnTimeline(sourceUnitId, Math.round((localStartSec + timelineOriginSec) * 10) / 10)
  }
  const timelineKinds = Array.from(new Set(summary.items.map((item) => String(item.kind || 'shot'))))
    .sort((a, b) => contentUnitTimelineKindRank(a) - contentUnitTimelineKindRank(b) || trackKindLabel(a).localeCompare(trackKindLabel(b), 'zh-Hans-CN'))
  const timelineLanes = timelineKinds.map((kind) => {
    const laneItems = timelineMemberItems.filter((item) => String(item.kind || 'shot') === kind)
    return {
      key: kind,
      label: trackKindLabel(kind),
      detail: kind === 'shot' ? '镜头 · 关键帧挂载' : '制作项',
      rawItems: laneItems,
      items: laneItems.map((item) => {
        const keyframeText = item.requiresKeyframe
          ? item.keyframeTitles.length > 0
            ? `关键帧：${item.keyframeTitles.slice(0, 2).join('、')}`
            : '关键帧：未设置'
          : item.scriptCue || item.soundCue || item.summary || '未补内容'
        const localStartSec = contentWorkbenchLocalTimelineSec(item.startSec, timelineOriginSec)
        const gapText = item.missingAssetTitles[0] ? `缺口：${item.missingAssetTitles[0]}` : formatTrackTimeRange(localStartSec, localStartSec + item.durationSec, item.durationSec)
        const sceneText = item.sceneMomentTitle ? `情节：${item.sceneMomentTitle}` : ''
        return {
          item,
          title: `${String(item.order).padStart(2, '0')} ${item.title}`,
          detail: kind === 'shot' ? [sceneText, keyframeText, gapText].filter(Boolean).join(' · ') : firstText(sceneText, item.scriptCue, item.soundCue, item.summary, gapText),
          muted: kind === 'shot' ? item.requiresKeyframe && item.keyframeTitles.length === 0 : !item.scriptCue && !item.soundCue && !item.summary,
        }
      }),
    }
  })

  return (
    <div className="rounded-md border border-border bg-background p-2.5" data-testid="content-workbench-unit-track">
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Route size={15} className="text-muted-foreground" />
            {summary.title}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{summary.detail}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" data-testid="content-workbench-unit-track-summary">
          <span>{summary.total} 内容单元</span>
          <span className="text-border">/</span>
          <span>{formatTrackDuration(summary.durationSec)}</span>
          <span className="text-border">/</span>
          <span className={summary.keyframeCount > 0 ? undefined : 'text-amber-700 dark:text-amber-300'}>{summary.keyframeCount} 关键帧</span>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1" data-testid="content-workbench-unit-kind-filter">
          <button
            type="button"
            className={cn(
              'h-7 rounded border px-2 text-xs transition-colors',
              unitKindFilter === 'all' ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground',
            )}
            onClick={() => setUnitKindFilter('all')}
          >
            全部 {summary.items.length}
          </button>
          {unitKindOptions.map((option) => (
            <button
              key={option.kind}
              type="button"
              className={cn(
                'h-7 rounded border px-2 text-xs transition-colors',
                unitKindFilter === option.kind ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground',
              )}
              onClick={() => setUnitKindFilter(option.kind)}
            >
              {option.label} {option.count}
            </button>
          ))}
        </div>
        <Button size="sm" className="h-8 gap-1.5" onClick={onCreateUnit} data-testid="content-workbench-create-unit-from-track">
          <Plus size={13} />
          新建
        </Button>
      </div>

      <div className="mt-2.5 pb-1">
        {visibleSummary.items.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleSummary.items.map((item, index) => {
            const previousItem = visibleSummary.items[index - 1]
            const nextItem = visibleSummary.items[index + 1]
            return (
            <div
              key={item.id}
              draggable={canDragUnits}
              data-testid="content-workbench-unit-card"
              data-track-item-id={item.id}
              aria-grabbed={draggedUnitId === Number(item.id)}
              title={canDragUnits ? '拖动到下方时间轴调整开始时间' : undefined}
              onDragStart={(event) => handleUnitDragStart(event, Number(item.id))}
              onDragOver={(event) => {
                if (!canDragUnits) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(event) => handleUnitDrop(event, Number(item.id))}
              onDragEnd={() => setDraggedUnitId(null)}
              className={cn(
                'min-w-0 rounded-md border px-2 py-1.5 text-left transition-colors',
                canDragUnits ? 'cursor-grab active:cursor-grabbing' : '',
                item.selected
                  ? 'border-primary/60 bg-primary/5'
                  : item.tone === 'blocked'
                    ? 'border-amber-200 bg-amber-50/60 hover:border-primary/50 hover:bg-primary/5 dark:border-amber-900/60 dark:bg-amber-950/20'
                    : 'border-border bg-card hover:border-primary/50 hover:bg-primary/5',
              )}
            >
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  onClick={() => selectOrClearUnit(Number(item.id))}
                >
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{item.identifier || String(index + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.title}</span>
                </button>
                {canDragUnits ? (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      data-testid="content-workbench-unit-move-earlier"
                      aria-label={`前移 ${item.title}`}
                      title="前移"
                      disabled={!previousItem || isReordering}
                      onClick={() => {
                        if (!previousItem) return
                        onReorderUnit(Number(item.id), Number(previousItem.id), 'before')
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                    >
                      <ArrowLeft size={12} />
                    </button>
                    <button
                      type="button"
                      data-testid="content-workbench-unit-move-later"
                      aria-label={`后移 ${item.title}`}
                      title="后移"
                      disabled={!nextItem || isReordering}
                      onClick={() => {
                        if (!nextItem) return
                        onReorderUnit(Number(item.id), Number(nextItem.id), 'after')
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                    >
                      <ArrowRight size={12} />
                    </button>
                  </span>
                ) : null}
              </div>
              <button type="button" className="mt-1 block w-full text-left" onClick={() => selectOrClearUnit(Number(item.id))}>
                <span className="block truncate text-[11px] text-muted-foreground">{trackKindLabel(item.kind)} · {item.labels.slice(0, 2).join(' · ') || '待补输入'}</span>
                {item.sceneMomentTitle ? (
                  <span className="mt-1 block truncate text-[11px] text-muted-foreground">情节：{item.sceneMomentTitle}</span>
                ) : null}
                <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                  {item.summary || item.scriptCue || item.soundCue || '待补输入'}
                </span>
              </button>
            </div>
            )
          })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
            当前类型下没有内容单元。
          </div>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-md border border-border bg-card" data-testid="content-workbench-unit-schedule">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-2.5 py-2">
          <div className="flex overflow-hidden rounded-md border border-border bg-background" data-testid="content-workbench-schedule-panel-switcher">
            <button
              type="button"
              className={cn(
                'inline-flex h-8 items-center gap-1.5 px-2.5 text-xs transition-colors',
                schedulePanel === 'timeline' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground',
              )}
              onClick={() => setSchedulePanel('timeline')}
            >
              <Clock3 size={13} />
              制作项时间轴
            </button>
            {selectedUnit && showInlineEditor ? (
              <button
                type="button"
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 border-l border-border px-2.5 text-xs transition-colors',
                  schedulePanel === 'edit' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground',
                )}
                onClick={() => setSchedulePanel('edit')}
              >
                <FileText size={13} />
                内容编辑
              </button>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {schedulePanel === 'timeline' ? (
              <>
                <div className="flex items-center overflow-hidden rounded-md border border-border bg-background" data-testid="content-workbench-timeline-zoom">
                  <button
                    type="button"
                    className="h-7 px-2 text-xs text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                    onClick={() => setTimelineZoom((value) => Math.max(0.05, Math.round((value / 1.25) * 1000) / 1000))}
                    aria-label="缩小时间轴"
                  >
                    -
                  </button>
                  <span className="border-x border-border px-2 text-[11px] tabular-nums text-muted-foreground">{Math.round(timelineZoom * 100)}%</span>
                  <button
                    type="button"
                    className="h-7 px-2 text-xs text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                    onClick={() => setTimelineZoom((value) => Math.round((value * 1.25) * 1000) / 1000)}
                    aria-label="放大时间轴"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="h-7 border-l border-border px-2 text-[11px] text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                    onClick={() => setTimelineZoom(1)}
                    aria-label="重置时间轴缩放"
                  >
                    1:1
                  </button>
                </div>
                {selectedTimelineItem ? (
                  <Badge variant="secondary" data-testid="content-workbench-timeline-playhead-label">播放头 {formatTrackClock(selectedTimelineItemStartSec)}</Badge>
                ) : null}
                {focusedTimeline ? (
                  <Badge variant="outline" data-testid="content-workbench-timeline-focus-label">关注段 0:00 = 全局 {formatTrackClock(timelineOriginSec)}</Badge>
                ) : null}
              </>
            ) : null}
            <Badge variant="outline">{formatTrackDuration(timelineContentDurationSec)}</Badge>
          </div>
        </div>
        {schedulePanel === 'timeline' || !showInlineEditor ? (<>
        <div className="overflow-x-auto">
          <div style={{ minWidth: timelineCanvasWidth }}>
            <div className="border-b border-border bg-background px-2.5 py-2.5" data-testid="content-workbench-unit-timeline">
              <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
                <div className="text-[11px] font-medium text-muted-foreground">时间尺</div>
                <div className="relative h-8 rounded bg-muted/40">
                  {selectedTimelineItem ? (
                    <div
                      className="absolute top-0 z-10 h-full border-l-2 border-primary"
                      data-testid="content-workbench-timeline-playhead"
                      style={{ left: trackTimelinePx(selectedTimelineItemStartSec, timelinePxPerSec) }}
                    >
                      <span className="ml-1 mt-1 block rounded bg-primary px-1 py-0.5 text-[10px] leading-none text-primary-foreground shadow-sm">
                        {formatTrackClock(selectedTimelineItemStartSec)}
                      </span>
                    </div>
                  ) : null}
                  {timelineTicks.map((tick) => (
                    <div
                      key={tick.seconds}
                      className="absolute top-0 h-full border-l border-border/80 pl-1"
                      style={{ left: trackTimelinePx(tick.seconds, timelinePxPerSec) }}
                    >
                      <span className="absolute bottom-0 text-[10px] leading-4 text-muted-foreground">{tick.label}</span>
                    </div>
                  ))}
                  {timelineBoundaries.map((boundary) => (
                    <div
                      key={`ruler-boundary-${boundary.key}`}
                      className="absolute top-0 h-full border-l border-dashed border-primary/50 pl-1"
                      data-testid="content-workbench-timeline-boundary"
                      style={{ left: boundary.leftPx }}
                    >
                      <span className="absolute top-0 max-w-[160px] truncate rounded bg-background/95 px-1 text-[10px] leading-4 text-primary shadow-sm">
                        {boundary.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-2 space-y-1.5">
                {timelineLanes.map((lane) => (
                  <div key={lane.key} className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
                    <div className="min-w-0 rounded bg-muted/30 px-2 py-1.5">
                      <p className="truncate text-[11px] font-medium text-foreground">{lane.label}</p>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{lane.detail}</p>
                    </div>
                    <div
                      className="relative h-[46px] rounded border border-border bg-muted/20"
                      data-testid="content-workbench-timeline-lane"
                      data-lane-kind={lane.key}
                      onDragOver={(event) => {
                        if (!canDragUnits) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={(event) => handleTimelineLaneDrop(event)}
                    >
                      {selectedTimelineItem ? (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute top-0 z-10 h-full border-l-2 border-primary/70"
                          style={{ left: trackTimelinePx(selectedTimelineItemStartSec, timelinePxPerSec) }}
                        />
                      ) : null}
                      {timelineTicks.map((tick) => (
                        <span
                          key={`${lane.key}-${tick.seconds}`}
                          className="pointer-events-none absolute top-0 h-full border-l border-border/50"
                          style={{ left: trackTimelinePx(tick.seconds, timelinePxPerSec) }}
                        />
                      ))}
                      {timelineBoundaries.map((boundary) => (
                        <span
                          key={`${lane.key}-boundary-${boundary.key}`}
                          className="pointer-events-none absolute top-0 h-full border-l border-dashed border-primary/40"
                          style={{ left: boundary.leftPx }}
                        />
                      ))}
                      {lane.items.map(({ item, title, detail, muted }) => (
                        <button
                          key={`${lane.key}-${item.id}`}
                          type="button"
                          data-testid="content-workbench-timeline-block"
                          data-lane-key={lane.key}
                          data-track-item-id={item.id}
                          draggable={canDragUnits}
                          aria-grabbed={draggedUnitId === Number(item.id)}
                          title={canDragUnits ? '拖动到时间轴空白处调整开始时间' : undefined}
                          onDragStart={(event) => handleUnitDragStart(event, Number(item.id), 'timeline')}
                          onDragOver={(event) => {
                            if (!canDragUnits) return
                            event.preventDefault()
                            event.dataTransfer.dropEffect = 'move'
                          }}
                          onDragEnd={() => setDraggedUnitId(null)}
                          onClick={() => selectOrClearUnit(Number(item.id))}
                          className={cn(
                            'absolute top-1 h-9 min-w-0 overflow-hidden rounded border px-1.5 py-1 text-left text-[11px] shadow-sm transition-colors hover:border-primary/60 hover:bg-primary/5',
                            canDragUnits ? 'cursor-grab active:cursor-grabbing' : '',
                            item.selected ? 'border-primary/70 bg-primary/10' : item.tone === 'blocked' ? 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/20' : 'border-border bg-card',
                            muted ? 'opacity-60' : '',
                          )}
                          style={{
                            left: trackTimelinePx(contentWorkbenchLocalTimelineSec(item.startSec, timelineOriginSec), timelinePxPerSec),
                            width: trackTimelineWidthPx(item.durationSec, timelinePxPerSec),
                          }}
                        >
                          <span className="block truncate font-medium text-foreground">{title}</span>
                          <span className={cn('block truncate text-[10px]', item.tone === 'blocked' && !muted ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>{detail}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <details className="border-t border-border bg-background" data-testid="content-workbench-shot-list">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 text-xs font-medium text-muted-foreground marker:text-muted-foreground">
            <span>镜头明细</span>
            <Badge variant="outline">{visibleSummary.items.length} 项</Badge>
          </summary>
          <div className="overflow-x-auto">
          <div className="min-w-[820px] divide-y divide-border">
            <div className="grid grid-cols-[56px_96px_minmax(220px,1fr)_150px_150px_130px] gap-2 bg-muted/30 px-2.5 py-2 text-[11px] font-medium text-muted-foreground">
              <span>顺序</span>
              <span>类型/时间</span>
              <span>镜头内容</span>
              <span>关键帧</span>
              <span>素材</span>
              <span>状态</span>
            </div>
            {visibleSummary.items.map((item, index) => {
              const previousItem = visibleSummary.items[index - 1]
              const nextItem = visibleSummary.items[index + 1]
              return (
                <div
                  key={item.id}
                  className={cn(
                    'grid grid-cols-[56px_96px_minmax(220px,1fr)_150px_150px_130px] gap-2 px-2.5 py-2.5 text-left text-xs transition-colors',
                    item.selected ? 'bg-primary/5' : 'bg-card hover:bg-primary/5',
                  )}
                  data-testid="content-workbench-shot-list-row"
                  data-track-item-id={item.id}
                >
                  <div className="flex items-center gap-1">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                  </div>
                  <button type="button" className="min-w-0 text-left" onClick={() => selectOrClearUnit(Number(item.id))}>
                    <span className="block truncate font-medium text-foreground">{trackKindLabel(item.kind)}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{formatTrackTimeRange(contentWorkbenchLocalTimelineSec(item.startSec, timelineOriginSec), contentWorkbenchLocalTimelineSec(item.endSec, timelineOriginSec), item.durationSec)}</span>
                  </button>
                  <button type="button" className="min-w-0 text-left" onClick={() => selectOrClearUnit(Number(item.id))}>
                    <span className="block truncate font-medium text-foreground">{item.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{item.summary || item.scriptCue || item.soundCue || '待补输入'}</span>
                  </button>
                  <button type="button" className="min-w-0 text-left" onClick={() => selectOrClearUnit(Number(item.id))}>
                    <span className={cn('block truncate text-[11px]', item.requiresKeyframe && item.keyframeTitles.length === 0 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
                      {item.requiresKeyframe
                        ? item.keyframeTitles.length > 0 ? item.keyframeTitles.slice(0, 2).join('、') : '未设置'
                        : '非必需'}
                    </span>
                  </button>
                  <button type="button" className="min-w-0 text-left" onClick={() => selectOrClearUnit(Number(item.id))}>
                    <span className={cn('block truncate text-[11px]', item.missingAssetTitles.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
                      {item.missingAssetTitles.length > 0 ? item.missingAssetTitles.slice(0, 2).join('、') : '无显性缺口'}
                    </span>
                  </button>
                  <div className="flex min-w-0 items-center justify-between gap-1.5">
                    <Badge variant={item.tone === 'blocked' ? 'warning' : item.tone === 'ready' ? 'success' : 'outline'}>{item.tone === 'blocked' ? '待补齐' : item.tone === 'ready' ? '可生成' : '处理中'}</Badge>
                    {canDragUnits ? (
                      <span className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          data-testid="content-workbench-shot-list-move-earlier"
                          aria-label={`前移 ${item.title}`}
                          title="前移"
                          disabled={!previousItem || isReordering}
                          onClick={() => {
                            if (!previousItem) return
                            onReorderUnit(Number(item.id), Number(previousItem.id), 'before')
                          }}
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                        >
                          <ArrowLeft size={12} />
                        </button>
                        <button
                          type="button"
                          data-testid="content-workbench-shot-list-move-later"
                          aria-label={`后移 ${item.title}`}
                          title="后移"
                          disabled={!nextItem || isReordering}
                          onClick={() => {
                            if (!nextItem) return
                            onReorderUnit(Number(item.id), Number(nextItem.id), 'after')
                          }}
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                        >
                          <ArrowRight size={12} />
                        </button>
                      </span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
          </div>
        </details>
        </>) : (
        <ContentUnitEditCards
          projectId={projectId}
          queryKey={queryKey}
          jobs={jobs}
          row={row}
          unit={selectedUnit}
          onSelectUnit={onSelectUnit}
          onCreateUnit={onCreateUnit}
          onAiSuggest={onAiSuggest}
          onCreateAssetSlot={onCreateAssetSlot}
          onCreateKeyframe={onCreateKeyframe}
          onOpenCanvas={onOpenCanvas}
          onUploadMissingAssets={onUploadMissingAssets}
          onDeleteUnit={onDeleteUnit}
        />
        )}
      </div>
    </div>
  )
}

export function ContentWorkbenchPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workbench', 'production', projectId],
    queryFn: () => loadProductionWorkbenchData(projectId!),
    enabled: !!projectId,
  })
  const rows = useMemo(() => buildContentGenerationMomentRows(data), [data])
  const [productionFilter, setProductionFilter] = useState('')
  const [segmentFilter, setSegmentFilter] = useState('')
  const [sidebarQuery, setSidebarQuery] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [scopeLevel, setScopeLevel] = useState<ContentWorkbenchScopeLevel>('production')
  const [selectedId, setSelectedId] = useState('')
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [candidateUploadTargetSlot, setCandidateUploadTargetSlot] = useState<WorkbenchRecord | null>(null)
  const [creatingUnit, setCreatingUnit] = useState(false)
  const [unitDraftDefaults, setUnitDraftDefaults] = useState<Partial<SemanticEntityPayload> | null>(null)
  const [optimisticSelectedUnit, setOptimisticSelectedUnit] = useState<WorkbenchRecord | null>(null)
  const [editingUnit, setEditingUnit] = useState(false)
  const [creatingAssetSlot, setCreatingAssetSlot] = useState(false)
  const [reviewPanelCollapsed, setReviewPanelCollapsed] = useState(false)
  const [creatingKeyframe, setCreatingKeyframe] = useState(false)
  const linkedProductionId = numberOf(searchParams.get('productionId'))
  const linkedSceneMomentId = numberOf(searchParams.get('scene_moment_id'))
  const linkedContentUnitId = numberOf(searchParams.get('content_unit_id'))
  const reviewDraftId = searchParams.get('draftId')?.trim() ?? ''
  const reviewMode = searchParams.get('view') === 'review' || reviewDraftId.length > 0
  useEffect(() => {
    if (reviewMode) setReviewPanelCollapsed(false)
  }, [reviewMode])
  const productionFilteredRows = useMemo(() => {
    if (!productionFilter) return rows
    if (productionFilter === 'unassigned') return rows.filter((row) => row.productionIds.length === 0)
    const productionId = Number(productionFilter)
    if (!Number.isFinite(productionId) || productionId <= 0) return rows
    return rows.filter((row) => row.productionIds.includes(productionId))
  }, [productionFilter, rows])
  const filteredRows = useMemo(() => {
    if (!segmentFilter) return productionFilteredRows
    if (segmentFilter === 'unassigned') return productionFilteredRows.filter((row) => !row.segment?.ID)
    const segmentId = Number(segmentFilter)
    if (!Number.isFinite(segmentId) || segmentId <= 0) return productionFilteredRows
    return productionFilteredRows.filter((row) => row.segment?.ID === segmentId)
  }, [productionFilteredRows, segmentFilter])
  const visibleRows = useMemo(() => {
    const query = sidebarQuery.trim()
    if (!query) return filteredRows
    return filteredRows.filter((row) => contentWorkbenchRowMatchesSearch(row, query))
  }, [filteredRows, sidebarQuery])
  const productionFilterOptions = useMemo(() => {
    const productions = data?.productions ?? []
    const unassignedCount = rows.filter((row) => row.productionIds.length === 0).length
    return [
      ...(unassignedCount > 0 ? [{ value: 'unassigned', label: '未绑定制作', count: unassignedCount }] : []),
      ...productions.map((production) => ({
        value: String(production.ID),
        label: titleOfRecord(production),
        count: rows.filter((row) => row.productionIds.includes(production.ID)).length,
      })),
    ]
  }, [data?.productions, rows])
  useEffect(() => {
    const target = linkedProductionId > 0 ? String(linkedProductionId) : ''
    if (target && productionFilter !== target && productionFilterOptions.some((option) => option.value === target)) {
      setProductionFilter(target)
    }
  }, [linkedProductionId, productionFilter, productionFilterOptions])
  const segmentFilterOptions = useMemo(() => {
    const segmentMap = new Map<string, { value: string; label: string; count: number }>()
    let unassignedCount = 0
    for (const row of productionFilteredRows) {
      if (!row.segment?.ID) {
        unassignedCount += 1
        continue
      }
      const key = String(row.segment.ID)
      const existing = segmentMap.get(key)
      if (existing) existing.count += 1
      else segmentMap.set(key, { value: key, label: titleOfRecord(row.segment), count: 1 })
    }
    return [
      ...(unassignedCount > 0 ? [{ value: 'unassigned', label: '未绑定情绪段', count: unassignedCount }] : []),
      ...Array.from(segmentMap.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-Hans-CN')),
    ]
  }, [productionFilteredRows])
  const sceneMomentFilterOptions = useMemo(() => visibleRows.map((row) => ({
    value: row.id,
    label: row.title,
    identifier: sceneIdentifier(row.moment) || `#${row.moment.ID}`,
    count: row.units.length,
  })), [visibleRows])

  useEffect(() => {
    if (segmentFilter && segmentFilter !== 'unassigned' && !segmentFilterOptions.some((option) => option.value === segmentFilter)) {
      setSegmentFilter('')
    }
  }, [segmentFilter, segmentFilterOptions])

  useEffect(() => {
    if (visibleRows.length === 0) {
      if (selectedId) setSelectedId('')
      return
    }
    const linkedRowId = pickContentWorkbenchRowIdForDeepLink(visibleRows, { sceneMomentId: linkedSceneMomentId, contentUnitId: linkedContentUnitId })
    if (linkedRowId && selectedId !== linkedRowId) {
      setSelectedId(linkedRowId)
      setScopeLevel('scene_moment')
      return
    }
    if (scopeLevel === 'scene_moment' && (!selectedId || !visibleRows.some((row) => row.id === selectedId))) {
      setSelectedId(visibleRows[0].id)
      return
    }
    if (scopeLevel !== 'scene_moment' && selectedId && !visibleRows.some((row) => row.id === selectedId)) {
      setSelectedId('')
    }
  }, [linkedContentUnitId, linkedSceneMomentId, scopeLevel, selectedId, visibleRows])

  const selected = visibleRows.find((item) => item.id === selectedId) ?? (scopeLevel === 'scene_moment' ? visibleRows[0] ?? null : null)

  useEffect(() => {
    if (!selected) {
      if (selectedUnitId !== null) setSelectedUnitId(null)
      if (editingUnit) setEditingUnit(false)
      return
    }
    const linkedUnit = linkedContentUnitId > 0 ? selected.units.find((unit) => unit.ID === linkedContentUnitId) : undefined
    if (linkedUnit && selectedUnitId !== linkedUnit.ID) {
      setSelectedUnitId(linkedUnit.ID)
      return
    }
    if (selectedUnitId !== null && !selected.units.some((unit) => unit.ID === selectedUnitId)) {
      setSelectedUnitId(null)
      if (editingUnit) setEditingUnit(false)
    }
  }, [editingUnit, linkedContentUnitId, selected, selectedUnitId])

  useEffect(() => {
    if (!selected || linkedSceneMomentId > 0 || linkedContentUnitId <= 0) return
    if (!selected.units.some((unit) => unit.ID === linkedContentUnitId)) return
    setSearchParams((current) => {
      if (current.get('scene_moment_id')) return current
      const next = new URLSearchParams(current)
      next.set('scene_moment_id', String(selected.moment.ID))
      return next
    }, { replace: true })
  }, [linkedContentUnitId, linkedSceneMomentId, selected, setSearchParams])

  const selectedUnitFromRows = selected?.units.find((unit) => unit.ID === selectedUnitId) ?? null
  const optimisticUnitForSelection = optimisticSelectedUnit && selectedUnitId === optimisticSelectedUnit.ID && selected?.moment.ID === Number(optimisticSelectedUnit.scene_moment_id)
    ? optimisticSelectedUnit
    : null
  const selectedUnit = selectedUnitFromRows ?? optimisticUnitForSelection ?? null
  const selectedProduction = selected?.productionIds[0]
    ? data?.productions.find((production) => production.ID === selected.productionIds[0])
    : null
  function selectSceneMoment(rowId: string, options: { replace?: boolean } = {}) {
    const row = visibleRows.find((item) => item.id === rowId) ?? filteredRows.find((item) => item.id === rowId) ?? rows.find((item) => item.id === rowId)
    if (scopeLevel === 'scene_moment' && selectedId === rowId) {
      setScopeLevel(segmentFilter ? 'segment' : 'production')
      setOptimisticSelectedUnit(null)
      setSelectedUnitId(null)
      setSelectedId('')
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        next.delete('scene_moment_id')
        next.delete('content_unit_id')
        return next
      }, { replace: options.replace ?? true })
      return
    }
    setScopeLevel('scene_moment')
    setOptimisticSelectedUnit(null)
    setSelectedId(rowId)
    if (!row) return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('scene_moment_id', String(row.moment.ID))
      next.delete('content_unit_id')
      return next
    }, { replace: options.replace ?? true })
  }

  function selectContentUnit(unitId: number | null, options: { replace?: boolean } = {}) {
    if (!unitId || optimisticSelectedUnit?.ID !== unitId) setOptimisticSelectedUnit(null)
    setSelectedUnitId(unitId)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (selected?.moment.ID) next.set('scene_moment_id', String(selected.moment.ID))
      if (unitId && unitId > 0) next.set('content_unit_id', String(unitId))
      else next.delete('content_unit_id')
      return next
    }, { replace: options.replace ?? true })
  }

  function selectContentUnitFromRow(row: ContentGenerationMomentRow, unitId: number | null, options: { replace?: boolean; preserveScopeLevel?: boolean } = {}) {
    if (!unitId || optimisticSelectedUnit?.ID !== unitId) setOptimisticSelectedUnit(null)
    if (!options.preserveScopeLevel) setScopeLevel('scene_moment')
    setSelectedId(row.id)
    setSelectedUnitId(unitId)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (options.preserveScopeLevel) {
        next.delete('scene_moment_id')
        next.delete('content_unit_id')
        return next
      }
      next.set('scene_moment_id', String(row.moment.ID))
      if (unitId && unitId > 0) next.set('content_unit_id', String(unitId))
      else next.delete('content_unit_id')
      return next
    }, { replace: options.replace ?? true })
  }

  function selectProductionFilter(value: string) {
    const nextValue = value === productionFilter ? '' : value
    setScopeLevel('production')
    setOptimisticSelectedUnit(null)
    setSelectedUnitId(null)
    setSelectedId('')
    setProductionFilter(nextValue)
    setSegmentFilter('')
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (nextValue !== 'unassigned' && Number(nextValue) > 0) next.set('productionId', nextValue)
      else next.delete('productionId')
      next.delete('scene_moment_id')
      next.delete('content_unit_id')
      return next
    }, { replace: true })
  }

  function selectSegmentFilter(value: string) {
    const nextValue = value === segmentFilter ? '' : value
    setScopeLevel(nextValue ? 'segment' : 'production')
    setOptimisticSelectedUnit(null)
    setSelectedUnitId(null)
    setSelectedId('')
    setSegmentFilter(nextValue)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('scene_moment_id')
      next.delete('content_unit_id')
      return next
    }, { replace: true })
  }

  useEffect(() => {
    if (!optimisticSelectedUnit) return
    if (!selected || Number(optimisticSelectedUnit.scene_moment_id) !== selected.moment.ID || selected.units.some((unit) => unit.ID === optimisticSelectedUnit.ID)) {
      setOptimisticSelectedUnit(null)
    }
  }, [optimisticSelectedUnit, selected])

  const generationContextQuery = useQuery({
    queryKey: ['workbench', 'production', 'generation-context', projectId, selectedUnit?.ID],
    queryFn: () => buildContentUnitGenerationContext(projectId!, selectedUnit!.ID, 'video'),
    enabled: !!projectId && !!selectedUnit?.ID,
  })
  const uploadCandidate = useMutation({
    mutationFn: async ({ file, slot }: { file: File; slot: WorkbenchRecord }) => {
      if (!projectId) throw new Error('请先选择项目')
      const fd = new FormData()
      fd.append('file', file)
      const resource = await api.post('/resources/upload', fd).then((r) => r.data as RawResource)
      await api.post(`/projects/${projectId}/entities/asset-slot-candidates`, {
        asset_slot_id: slot.ID,
        resource_id: resource.ID,
        source_type: 'upload',
        source_id: resource.ID,
        score: 0.75,
        status: 'candidate',
        note: `内容编排主动上传：${resource.name}`,
      })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['resources'] }),
      ])
      invalidateAssetCandidateConsumers(queryClient, projectId)
      toast.success('候选已上传')
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '上传候选失败'))
    },
    onSettled: () => {
      setUploading(false)
      setCandidateUploadTargetSlot(null)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
    },
  })
  const openUnitCanvas = useMutation({
    mutationFn: async (unit: WorkbenchRecord) => {
      if (!projectId) throw new Error('请先选择项目')
      const canvases = await api.get('/canvases', {
        params: {
          project_id: projectId,
          type: 'workflow',
          stage: 'generation',
          ref_type: 'content_unit',
          ref_id: unit.ID,
        },
      }).then((r) => r.data as Canvas[])
      const existingCanvas = findContentWorkbenchCanvas(canvases, unit.ID)
      if (existingCanvas) return existingCanvas
      return api.post('/canvases', buildContentWorkbenchCanvasPayload({
        projectId,
        contentUnitId: unit.ID,
        title: titleOfRecord(unit),
        description: contentUnitGenerationCanvasDescription(unit),
      })).then((r) => r.data as Canvas)
    },
    onSuccess: (canvas) => navigate(`/canvases/${canvas.ID}`),
    onError: (error) => {
      toast.error(apiErrorMessage(error, '打开生成画布失败'))
    },
  })
  const baseStandards = generationContextQuery.data
    ? buildGenerationContextStandards(generationContextQuery.data)
    : buildMomentStandards(selected, data?.jobs ?? [])
  const generationContextRows = buildGenerationContextRows(generationContextQuery.data)
  const selectedUnitKeyframes = selected && selectedUnit
    ? selected.keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === selectedUnit.ID).slice().sort(byOrder)
    : []
  const selectedUnitAssetSlots = selected && selectedUnit
    ? selected.assetSlots.filter((slot) => slot.owner_type === 'content_unit' && Number(slot.owner_id) === selectedUnit.ID)
    : []
  const selectedUnitMissingSlots = selectedUnitAssetSlots.filter((slot) => normalizeAssetSlotStatus(slot.status) === 'missing')
  const uploadTargetSlot = pickContentWorkbenchUploadTarget({
    selectedUnitAssetSlots,
    momentAssetSlots: selected?.assetSlots ?? [],
  })
  const selectedUnitResourceIds = [
    ...selectedUnitAssetSlots.map((slot) => numberOf(slot.resource_id)),
    ...selectedUnitKeyframes.map((keyframe) => numberOf(keyframe.resource_id)),
  ].filter((id) => id > 0)
  const selectedUnitJobs = pickContentWorkbenchRelevantJobs({
    jobs: data?.jobs ?? [],
    contentUnitId: selectedUnit?.ID,
    contentUnitTitle: selectedUnit ? titleOfRecord(selectedUnit) : undefined,
    resourceIds: selectedUnitResourceIds,
  })
  const selectedUnitRunningJobCount = selectedUnitJobs.filter((job) => job.status === 'pending' || job.status === 'running').length
  const selectedUnitCompletedJobCount = selectedUnitJobs.filter((job) => job.status === 'succeeded').length
  const selectedUnitRequiresKeyframe = selectedUnit ? contentWorkbenchUnitRequiresKeyframe(selectedUnit.kind) : true
  const selectedUnitStatus = selectedUnit ? contentUnitWorkStatus(selectedUnit, selectedUnitMissingSlots) : 'blocked'
  const keyframeConfig = useMemo(() => semanticEntityConfig('keyframes'), [])
  const assetSlotConfig = useMemo(() => semanticEntityConfig('assetSlots'), [])
  const nextKeyframeRole = nextKeyframeFrameRole(selectedUnitKeyframes)
  const keyframeDefaults = useMemo<Partial<SemanticEntityPayload> | undefined>(() => {
    if (!selected || !selectedUnit) return undefined
    return {
      production_id: nullableNumber(selectedUnit.production_id ?? selected.segment?.production_id ?? selected.moment.production_id ?? selected.productionIds[0]),
      scene_moment_id: selected.moment.ID,
      content_unit_id: selectedUnit.ID,
      order: keyframeOrderForRole(nextKeyframeRole, selectedUnitKeyframes),
      status: 'candidate',
      metadata_json: JSON.stringify({
        frame_role: nextKeyframeRole,
        frame_role_label: keyframeFrameRoleLabel(nextKeyframeRole),
      }),
    }
  }, [nextKeyframeRole, selected, selectedUnit, selectedUnitKeyframes])
  const assetSlotDefaults = useMemo<Partial<SemanticEntityPayload> | undefined>(() => {
    if (!selected || !selectedUnit) return undefined
    return {
      production_id: nullableNumber(selectedUnit.production_id ?? selected.moment.production_id ?? selected.segment?.production_id ?? selected.productionIds[0]),
      owner_type: 'content_unit',
      owner_id: selectedUnit.ID,
      kind: 'image',
      name: `${titleOfRecord(selectedUnit)}参考素材`,
      slot_key: `content_unit_${selectedUnit.ID}_asset_${selectedUnitAssetSlots.length + 1}`,
      description: firstText(selectedUnit.description, selectedUnit.prompt, ''),
      prompt_hint: firstText(selectedUnit.prompt, selectedUnit.description, ''),
      priority: selectedUnitAssetSlots.length === 0 ? 'high' : 'normal',
      status: 'missing',
    }
  }, [selected, selectedUnit, selectedUnitAssetSlots.length])
  const missingGenerationContext = generationContextQuery.data
    ? buildGenerationContextStandards(generationContextQuery.data).filter((item) => !item.done)
    : []

  function triggerCandidateUpload() {
    if (!uploadTargetSlot || uploading || uploadCandidate.isPending) return
    setCandidateUploadTargetSlot(uploadTargetSlot)
    uploadInputRef.current?.click()
  }

  function handleCandidateUpload(file?: File) {
    const slot = candidateUploadTargetSlot ?? uploadTargetSlot
    if (!file) {
      setCandidateUploadTargetSlot(null)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
      return
    }
    if (!slot) {
      setCandidateUploadTargetSlot(null)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
      return
    }
    if (uploadCandidate.isPending) return
    setUploading(true)
    uploadCandidate.mutate({ file, slot })
  }

  function openCreateKeyframe() {
    if (!selectedUnit) return
    setCreatingKeyframe(true)
  }

  function openCreateAssetSlot() {
    if (!selectedUnit) return
    setCreatingAssetSlot(true)
  }

  const contentUnitConfig = useMemo(() => semanticEntityConfig('contentUnits'), [])
  const previewTimelineItemConfig = useMemo(() => semanticEntityConfig('previewTimelineItems'), [])
  const productionWorkbenchQueryKey = ['workbench', 'production', projectId] as const
  const reviewDraftsQuery = useQuery<AgentDraft[]>({
    queryKey: ['workbench', 'production', 'content-drafts', projectId],
    queryFn: async () => {
      if (!projectId) return []
      const contentUnitProposals = await localAgentClient.listDrafts({ projectId, kind: 'content_unit_proposal', status: ['draft', 'accepted'], limit: 20 })
      return dedupeDrafts(contentUnitProposals.drafts)
    },
    enabled: !!projectId,
    retry: false,
  })
  const reviewDrafts = reviewDraftsQuery.data ?? []
  const reviewDraftsById = useMemo(() => new Map(reviewDrafts.map((draft) => [draft.id, draft] as const)), [reviewDrafts])
  const selectedReviewDraft = reviewDraftId ? reviewDraftsById.get(reviewDraftId) ?? null : reviewDrafts[0] ?? null
  const contentDraftReview = useMemo(() => {
    if (!selectedReviewDraft) return null
    return buildContentDraftReviewModel(selectedReviewDraft, {
      rowByMomentId: new Map(rows.map((row) => [row.moment.ID, row] as const)),
      rowByUnitId: new Map(rows.flatMap((row) => row.units.map((unit) => [unit.ID, row] as const))),
    })
  }, [rows, selectedReviewDraft])
  const reviewQueueSummary = useMemo(() => buildContentWorkbenchReviewQueueSummary({
    drafts: reviewDrafts,
    selectedReview: contentDraftReview ? {
      warningCount: contentDraftReview.warnings.length,
      diffCount: contentDraftReview.diffs.length,
      addedCount: contentDraftReview.diffs.filter((diff) => diff.state === 'added').length,
      changedCount: contentDraftReview.diffs.filter((diff) => diff.state === 'changed').length,
    } : null,
  }), [contentDraftReview, reviewDrafts])
  const standards = useMemo(() => appendReviewGate(baseStandards, reviewQueueSummary.pending), [baseStandards, reviewQueueSummary.pending])

  function selectReviewDraft(draftId: string) {
    setReviewPanelCollapsed(false)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('view', 'review')
      next.set('draftId', draftId)
      return next
    }, { replace: true })
  }

  function closeReview() {
    setReviewPanelCollapsed(true)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('view')
      next.delete('draftId')
      return next
    }, { replace: true })
  }

  const rejectContentDraft = useMutation({
    mutationFn: async (draft: AgentDraft) => localAgentClient.rejectDraft(draft.id, '用户在内容编排工作台退回该制作项草案'),
    onSuccess: async () => {
      toast.success('AI 草案已退回')
      await reviewDraftsQuery.refetch()
      closeReview()
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, 'AI 草案退回失败'))
    },
  })
  const markContentDraftReviewed = useMutation({
    mutationFn: async (draft: AgentDraft) => localAgentClient.updateDraft(draft.id, {
      status: 'applied',
      target: {
        ...(isRecord(draft.target) ? draft.target : {}),
        projectId,
        entityType: 'scene_moment',
        entityId: selected?.moment.ID ?? draftEntityId(draft.target) ?? draftEntityId(draft.source),
        field: 'content_unit_proposal_review',
      },
      metadata: {
        ...(isRecord(draft.metadata) ? draft.metadata : {}),
        reviewedFrom: 'content-workbench',
        reviewedAt: new Date().toISOString(),
        backendWritePerformed: false,
        reviewDisposition: 'manual_review_completed',
      },
    }),
    onSuccess: async () => {
      toast.success('AI 草案已标记为处理完成')
      await reviewDraftsQuery.refetch()
      closeReview()
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, 'AI 草案状态更新失败'))
    },
  })
  const applyContentUnitProposal = useMutation({
    mutationFn: async ({ unitId, proposal }: { unitId: number; proposal: Record<string, unknown> }) => {
      if (!projectId) throw new Error('缺少项目')
      const current = data?.contentUnits.find((unit) => unit.ID === unitId)
      const defaults = contentWorkbenchProposalDefaults(proposal)
      const { status: _status, metadata_json, ...basePayload } = defaults
      const payload: SemanticEntityPayload = { ...basePayload }
      if (metadata_json) {
        payload.metadata_json = JSON.stringify(mergeMetadataJSON(current?.metadata_json, parseMetadataJSON(metadata_json)))
      }
      return updateSemanticEntity(projectId, contentUnitConfig, unitId, payload)
    },
    onSuccess: async (saved) => {
      selectContentUnit(saved.ID)
      setOptimisticSelectedUnit(saved)
      await queryClient.invalidateQueries({ queryKey: productionWorkbenchQueryKey })
      await queryClient.invalidateQueries({ queryKey: [contentUnitConfig.kind, projectId] })
      toast.success('已采纳草案字段')
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '采纳草案失败'))
    },
  })

  const totalUnitCount = visibleRows.reduce((sum, row) => sum + row.units.length, 0)
  const totalKeyframeCount = visibleRows.reduce((sum, row) => sum + row.keyframes.length, 0)
  const totalMissingSlotCount = visibleRows.reduce((sum, row) => sum + row.missingSlots.length, 0)
  const projectReferenceCount = (data?.creativeReferences ?? []).filter(isVisibleWorkbenchRecord).length
  const projectAssetSlotCount = (data?.assetSlots ?? []).filter((slot) => slot.owner_type !== 'asset_slot' && isVisibleWorkbenchRecord(slot)).length
  const runningJobCount = data?.jobs.filter((job) => job.status === 'pending' || job.status === 'running').length ?? 0
  const completedJobCount = data?.jobs.filter((job) => job.status === 'succeeded').length ?? 0
  const selectedProductionIdSet = new Set(selected?.productionIds ?? [])
  const selectedPreviewItemCount = data?.previewTimelineItems.filter((item) => (
    selectedProductionIdSet.has(numberOf(item.production_id)) ||
    (selected?.moment.ID && numberOf(item.scene_moment_id) === selected.moment.ID) ||
    (selectedUnit?.ID && numberOf(item.content_unit_id) === selectedUnit.ID)
  )).length ?? 0
  const reorderContentUnits = useMutation({
    mutationFn: async ({ row, draggedUnitId, targetUnitId, position }: {
      row: ContentGenerationMomentRow
      draggedUnitId: number
      targetUnitId: number
      position: ContentWorkbenchDropPosition
    }) => {
      if (!projectId) throw new Error('请先选择项目')
      const reorderedUnits = reorderContentWorkbenchUnits(row.units, draggedUnitId, targetUnitId, position)
      const originalIds = row.units.slice().sort(byOrder).map((unit) => unit.ID).join(',')
      const nextIds = reorderedUnits.map((unit) => unit.ID).join(',')
      if (originalIds === nextIds) return { draggedUnitId }

      const unitUpdates = reorderedUnits
        .map((unit, index) => ({ unit, order: index + 1 }))
        .filter(({ unit, order }) => numberOf(unit.order) !== order)
        .map(({ unit, order }) => updateSemanticEntity(projectId, contentUnitConfig, unit.ID, { order }))

      await Promise.all(unitUpdates)
      return { draggedUnitId }
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: productionWorkbenchQueryKey })
      selectContentUnitFromRow(variables.row, variables.draggedUnitId)
      toast.success('制作项顺序已更新')
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '制作项顺序更新失败'))
    },
  })
  const moveContentUnitOnTimeline = useMutation({
    mutationFn: async ({ row, unitId, startSec }: {
      row: ContentGenerationMomentRow
      unitId: number
      startSec: number
    }) => {
      if (!projectId) throw new Error('请先选择项目')
      const unit = row.units.find((item) => item.ID === unitId)
      if (!unit) throw new Error('未找到制作项')
      const normalizedStartSec = Math.max(0, Math.round(Number(startSec) * 10) / 10)
      const durationSec = Math.max(0, numberOf(unit.duration_sec))
      const timelineItem = pickPreviewTimelineItemForUnit(row.previewTimelineItems, unitId)
      if (timelineItem) {
        await updateSemanticEntity(projectId, previewTimelineItemConfig, timelineItem.ID, {
          preview_timeline_id: numberOf(timelineItem.preview_timeline_id),
          start_sec: normalizedStartSec,
          duration_sec: numberOf(timelineItem.duration_sec) || durationSec,
          order: numberOf(timelineItem.order) || numberOf(unit.order),
        })
        return { unitId }
      }

      const productionId = numberOf(unit.production_id) || row.productionIds[0]
      if (!productionId) throw new Error('当前制作项未绑定制作，无法写入时间轴')
      let timeline = data?.previewTimelines
        .filter((item) => Number(item.production_id) === productionId)
        .slice()
        .sort((a, b) => previewTimelineRank(a) - previewTimelineRank(b) || byOrder(a, b))[0]
      if (!timeline) {
        timeline = await createSemanticEntity(projectId, semanticEntityConfig('previewTimelines'), {
          production_id: productionId,
          name: `${titleOfRecord(unit)} 时间轴`,
          duration_sec: Math.max(normalizedStartSec + durationSec, durationSec, 1),
          is_primary: true,
          status: 'draft',
        })
      }
      await createSemanticEntity(projectId, previewTimelineItemConfig, {
        preview_timeline_id: timeline.ID,
        production_id: productionId,
        scene_moment_id: row.moment.ID,
        content_unit_id: unit.ID,
        kind: 'content_unit',
        label: titleOfRecord(unit),
        start_sec: normalizedStartSec,
        duration_sec: durationSec,
        order: numberOf(unit.order) || row.units.findIndex((item) => item.ID === unit.ID) + 1,
        status: 'draft',
      })
      return { unitId }
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: productionWorkbenchQueryKey })
      selectContentUnit(variables.unitId)
      toast.success('制作项时间已更新')
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '制作项时间更新失败'))
    },
  })

  function openAiSuggest(rowOverride?: ContentGenerationMomentRow) {
    const targetRow = rowOverride ?? selected
    const targetProduction = targetRow?.productionIds[0]
      ? data?.productions.find((production) => production.ID === targetRow.productionIds[0])
      : null
    if (!projectId || !targetRow) {
      toast.info('请先选择情节')
      return
    }
    const prompt = buildContentWorkbenchAiSuggestPrompt({
      momentTitle: targetRow.title,
      sceneMomentId: targetRow.moment.ID,
      momentScope: targetRow.scope,
      existingUnits: targetRow.units.map((unit) => ({
        title: titleOfRecord(unit),
        kind: unit.kind,
        status: unit.status,
        prompt: unit.prompt,
        description: unit.description,
      })),
    })
    const requestId = `content_unit_suggest_${targetRow.moment.ID}_${Date.now().toString(36)}`
    openAgentPanelDraft({
      requestId,
      taskType: 'content_unit_suggest',
      message: prompt,
      title: `制作项 AI 建议: ${targetRow.title}`,
      newConversation: true,
      autoSend: false,
      projectId,
      clientInput: buildCommandFirstClientInput({
        message: prompt,
        labels: ['workbench', 'content-unit-suggest'],
        hints: {
          projectId,
          productionId: targetProduction?.ID,
          route: {
            pathname: ROUTES.project.contentUnitWorkbench,
            search: buildContentWorkbenchRouteSearch({ sceneMomentId: targetRow.moment.ID }),
          },
          selection: {
            entityType: 'scene_moment',
            entityId: targetRow.moment.ID,
            label: targetRow.title,
          },
        },
      }),
      timeoutMs: 90_000,
    })
    toast.success('已打开 AI 助手，可在输入框补充需求后发送')
  }

  function openAiVisualPlan(unitOverride?: WorkbenchRecord | null) {
    const targetRow = selected
    const targetUnit = unitOverride ?? selectedUnit
    const targetProduction = targetRow?.productionIds[0]
      ? data?.productions.find((production) => production.ID === targetRow.productionIds[0])
      : null
    if (!projectId || !targetRow || !targetUnit) {
      toast.info('请先选择情节和制作项')
      return
    }
    const prompt = buildContentWorkbenchVisualPlanPrompt({
      momentTitle: targetRow.title,
      sceneMomentId: targetRow.moment.ID,
      momentScope: targetRow.scope,
      selectedUnitId: targetUnit.ID,
      selectedUnitTitle: titleOfRecord(targetUnit),
      existingUnits: targetRow.units.map((unit) => ({
        id: unit.ID,
        unit_code: firstText(unit.unit_code),
        title: titleOfRecord(unit),
        kind: unit.kind,
        status: unit.status,
        prompt: unit.prompt,
        description: unit.description,
        visualPlan: contentUnitVisualPlanPromptText(unit),
        storyboardBrief: contentUnitStoryboardBriefPromptText(unit),
      })),
    })
    const requestId = `content_unit_visual_plan_${targetUnit.ID}_${Date.now().toString(36)}`
    openAgentPanelDraft({
      requestId,
      taskType: 'content_unit_visual_plan_proposal',
      message: prompt,
      title: `视觉计划 AI 草案: ${titleOfRecord(targetUnit)}`,
      newConversation: true,
      autoSend: false,
      projectId,
      clientInput: buildCommandFirstClientInput({
        message: prompt,
        labels: ['workbench', 'content-unit-visual-plan'],
        hints: {
          projectId,
          productionId: targetProduction?.ID,
          route: {
            pathname: ROUTES.project.contentUnitWorkbench,
            search: buildContentWorkbenchRouteSearch({ sceneMomentId: targetRow.moment.ID, contentUnitId: targetUnit.ID }),
          },
          selection: {
            entityType: 'content_unit',
            entityId: targetUnit.ID,
            label: titleOfRecord(targetUnit),
          },
        },
      }),
      timeoutMs: 90_000,
    })
    toast.success('已打开 AI 助手，可起草当前制作项的视觉计划')
  }

  function openReviewQueue() {
    setReviewPanelCollapsed(false)
    const draft = selectedReviewDraft ?? reviewDrafts[0]
    if (!draft) {
      openAiSuggest()
      return
    }
    selectReviewDraft(draft.id)
  }

  function openEditSelectedUnit(unitId?: number) {
    const targetUnit = unitId && selected?.units.some((unit) => unit.ID === unitId)
      ? selected.units.find((unit) => unit.ID === unitId) ?? null
      : selectedUnit
    if (!targetUnit) {
      setCreatingUnit(true)
      return
    }
    selectContentUnit(targetUnit.ID)
    setEditingUnit(true)
  }

  function openCreateUnitFromProposal(proposal: Record<string, unknown>) {
    setUnitDraftDefaults(contentWorkbenchProposalDefaults(proposal))
    setCreatingUnit(true)
  }

  function openCreateUnit() {
    if (!selected) return
    setUnitDraftDefaults(null)
    setCreatingUnit(true)
  }

  function openCreateUnitForRow(row: ContentGenerationMomentRow) {
    setScopeLevel('scene_moment')
    setOptimisticSelectedUnit(null)
    setSelectedId(row.id)
    setSelectedUnitId(null)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('scene_moment_id', String(row.moment.ID))
      next.delete('content_unit_id')
      return next
    }, { replace: true })
    setUnitDraftDefaults(null)
    setCreatingUnit(true)
  }

  function openSelectedUnitCanvas() {
    if (openUnitCanvas.isPending) return
    if (!selectedUnit) {
      setCreatingUnit(true)
      return
    }
    openUnitCanvas.mutate(selectedUnit)
  }

  function selectFirstSceneMoment() {
    const firstRow = visibleRows[0]
    if (!firstRow) {
      toast.info('暂无可选择的情节')
      return
    }
    selectSceneMoment(firstRow.id)
  }

  function selectFirstContentUnit() {
    if (!selected) {
      selectFirstSceneMoment()
      return
    }
    const targetUnitId = pickContentWorkbenchFirstUsableUnit(selected.units.map((unit) => ({ id: unit.ID, status: unit.status })))
    if (!targetUnitId) {
      setCreatingUnit(true)
      return
    }
    selectContentUnit(targetUnitId)
  }

  const showReviewPanel = reviewMode || reviewDraftsQuery.isLoading || (reviewDrafts.length > 0 && !reviewPanelCollapsed)
  const activeProductionFilter = productionFilterOptions.find((option) => option.value === productionFilter)
  const activeSegmentFilter = segmentFilterOptions.find((option) => option.value === segmentFilter)
  const contentWorkbenchViewTitle = scopeLevel === 'production'
    ? activeProductionFilter?.label ?? '全部内容'
    : scopeLevel === 'segment'
      ? activeSegmentFilter?.label ?? '情绪段筛选'
      : selected ? selected.title : '暂无情节'
  const contentWorkbenchViewDetail = scopeLevel === 'scene_moment' && selected
    ? selected.scope
    : `${visibleRows.length} 个情节 · ${totalUnitCount} 个制作项 · ${projectReferenceCount} 个设定 · ${projectAssetSlotCount} 个素材 · ${totalKeyframeCount} 个关键帧 · ${totalMissingSlotCount} 个缺口`

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <SpecializedWorkbenchHeader
        category="production"
        kicker="内容编排"
        title="内容编排工作台"
        description="把情节拆成制作项，用时间轴管理顺序、对白、声音和关键帧。"
      />
      <main className="min-h-0 flex-1 overflow-hidden p-4">
        {!projectId ? (
          <EmptyWorkbenchState title="请先选择项目" text="当前没有可用的项目信息，无法拉取情节、制作项、素材需求和生成任务。" />
        ) : isLoading ? (
          <Card className="rounded-lg border-border bg-card p-8 text-center text-sm text-muted-foreground">正在加载内容编排数据...</Card>
        ) : isError ? (
          <EmptyWorkbenchState title="内容编排数据加载失败" text="后端语义实体接口未返回可用数据，稍后重试。" />
        ) : (
          <div className="production-workbench h-full min-h-0">
            <div
              className={cn(
                'grid h-full min-h-0 gap-3 transition-[grid-template-columns]',
                sidebarCollapsed ? 'xl:grid-cols-[64px_minmax(0,1fr)]' : 'xl:grid-cols-[280px_minmax(0,1fr)]',
              )}
              data-testid="content-workbench-command-center"
              data-sidebar-collapsed={sidebarCollapsed ? 'true' : undefined}
            >
              <ContentWorkbenchFilterSidebar
                productionOptions={productionFilterOptions}
                productionValue={productionFilter}
                segmentOptions={segmentFilterOptions}
                segmentValue={segmentFilter}
                sceneOptions={sceneMomentFilterOptions}
                sceneValue={scopeLevel === 'scene_moment' ? selected?.id ?? '' : ''}
                query={sidebarQuery}
                resultCount={visibleRows.length}
                unitCount={totalUnitCount}
                collapsed={sidebarCollapsed}
                onQueryChange={setSidebarQuery}
                onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
                onSelectProduction={selectProductionFilter}
                onSelectSegment={selectSegmentFilter}
                onSelectScene={selectSceneMoment}
              />

              <div className="min-h-0 min-w-0 space-y-3 overflow-auto pr-1" data-testid="content-workbench-main-scroll">
                <section className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/25 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <Wand2 size={14} />
                        编排视图
                      </div>
                      <h2 className="mt-1 truncate text-lg font-semibold text-foreground">{contentWorkbenchViewTitle}</h2>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{contentWorkbenchViewDetail}</p>
                    </div>
                    <div className="shrink-0" data-testid="content-workbench-review-action">
                      <button
                        type="button"
                        data-action-key="review_ai_drafts"
                        className={cn(
                          'inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-primary/5',
                          reviewQueueSummary.pending > 0
                            ? 'border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100'
                            : 'border-border bg-background text-muted-foreground',
                        )}
                        onClick={openReviewQueue}
                      >
                        <ClipboardCheck size={14} />
                        <span>待审草案</span>
                        <Badge variant={reviewQueueSummary.pending > 0 ? 'warning' : 'outline'}>{reviewQueueSummary.pending}</Badge>
                      </button>
                    </div>
                  </div>
                  {visibleRows.length === 0 ? (
                    <div className="p-2.5">
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                        <p>{filteredRows.length === 0 ? '当前项目还没有情节入口，先完成制作编排后再进入内容编排。' : '没有匹配当前搜索条件的情节。'}</p>
                        {filteredRows.length === 0 ? (
                          <Button size="sm" variant="outline" className="mt-2 h-8 gap-1.5" onClick={() => navigate(ROUTES.project.productionOrchestration)}>
                            <Route size={13} />
                            进入制作编排
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </section>

                {!selected ? (
                  <div className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center" data-testid="content-workbench-select-scene-empty">
                    <Route size={20} className="mx-auto text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium text-foreground">请先选择情节</p>
                    <p className="mt-1 text-xs text-muted-foreground">在左侧情节卡片中选择一个情节后，再编辑画面预览和内容单元。</p>
                  </div>
                ) : (
                  <>
                    {showReviewPanel ? (
                      <ContentGenerationReviewPanel
                        reviewMode={reviewMode}
                        drafts={reviewDrafts}
                        selectedDraft={selectedReviewDraft}
                        reviewModel={contentDraftReview}
                        queueSummary={reviewQueueSummary}
                        rejectingDraft={rejectContentDraft.isPending}
                        markingDraftReviewed={markContentDraftReviewed.isPending}
                        onOpenAiSuggest={openAiSuggest}
                        onSelectDraft={selectReviewDraft}
                        onCreateUnitFromProposal={openCreateUnitFromProposal}
                        onEditCurrentUnit={openEditSelectedUnit}
                        onApplyUnitProposal={(unitId, proposal) => applyContentUnitProposal.mutate({ unitId, proposal })}
                        onMarkDraftReviewed={(draft) => markContentDraftReviewed.mutate(draft)}
                        onRejectDraft={(draft) => rejectContentDraft.mutate(draft)}
                        onCloseReview={closeReview}
                      />
                    ) : null}

                    <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_400px] 2xl:items-start" data-testid="content-workbench-production-grid">
                      <div className="min-w-0 space-y-3">
                        <ContentWorkbenchScenePreview
                          row={selected}
                          selectedUnit={selectedUnit}
                          keyframes={selectedUnitKeyframes}
                          previewItemCount={selectedPreviewItemCount}
                          runningJobCount={selectedUnitRunningJobCount}
                          onSelectUnit={(unitId) => selectContentUnitFromRow(selected, selectedUnit?.ID === unitId ? null : unitId)}
                        />

                        <UnitProductionTrack
                          row={selected}
                          selectedUnitId={selectedUnit?.ID}
                          showInlineEditor={false}
                          onSelectUnit={(unitId) => selectContentUnitFromRow(selected, unitId)}
                          onCreateUnit={() => openCreateUnitForRow(selected)}
                          onAiSuggest={() => openAiSuggest(selected)}
                          onSelectFirstMoment={selectFirstSceneMoment}
                          onCreateAssetSlot={openCreateAssetSlot}
                          onCreateKeyframe={openCreateKeyframe}
                          onOpenCanvas={openSelectedUnitCanvas}
                          onUploadMissingAssets={triggerCandidateUpload}
                          onReorderUnit={(draggedUnitId, targetUnitId, position) => {
                            if (reorderContentUnits.isPending) return
                            reorderContentUnits.mutate({ row: selected, draggedUnitId, targetUnitId, position })
                          }}
                          onMoveUnitOnTimeline={(unitId, startSec) => {
                            if (moveContentUnitOnTimeline.isPending) return
                            moveContentUnitOnTimeline.mutate({ row: selected, unitId, startSec })
                          }}
                          onDeleteUnit={(unit) => {
                            selectContentUnitFromRow(selected, null, { replace: true })
                          }}
                          projectId={projectId}
                          queryKey={productionWorkbenchQueryKey}
                          jobs={data?.jobs ?? []}
                          isReordering={reorderContentUnits.isPending || moveContentUnitOnTimeline.isPending}
                        />
                      </div>

                      <ContentWorkbenchUnitInspector
                        projectId={projectId}
                        queryKey={productionWorkbenchQueryKey}
                        jobs={data?.jobs ?? []}
                        row={selected}
                        unit={selectedUnit}
                        onSelectUnit={(unitId) => selectContentUnitFromRow(selected, unitId)}
                        onCreateUnit={() => openCreateUnitForRow(selected)}
                        onAiSuggest={() => openAiSuggest(selected)}
                        onAiVisualPlan={() => openAiVisualPlan(selectedUnit)}
                        onCreateAssetSlot={openCreateAssetSlot}
                        onCreateKeyframe={openCreateKeyframe}
                        onOpenCanvas={openSelectedUnitCanvas}
                        onUploadMissingAssets={triggerCandidateUpload}
                        onDeleteUnit={(unit) => {
                          selectContentUnitFromRow(selected, null, { replace: true })
                        }}
                      />
                    </div>
                  </>
                )}
            </div>
            </div>
            <input ref={uploadInputRef} type="file" className="hidden" accept={RESOURCE_UPLOAD_ACCEPT} onChange={(e) => handleCandidateUpload(e.target.files?.[0])} />
          </div>
        )}
      </main>

      <Dialog open={creatingUnit} onOpenChange={(open) => { if (!open) { setCreatingUnit(false); setUnitDraftDefaults(null) } }}>
        <DialogContent className="max-h-[88vh] w-[min(760px,calc(100vw-32px))] overflow-auto p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>添加制作项</DialogTitle>
            <DialogDescription>
              {selected ? `将作为候选草稿加入当前情节：${selected.title}` : '请先选择情节再添加制作项。'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-5">
            {selected ? (
              <CreateContentUnitQuickCard
                projectId={projectId}
                contentUnitConfig={contentUnitConfig}
                selected={selected}
                selectedUnit={selectedUnit}
                defaults={{
                  kind: 'shot',
                  ...unitDraftDefaults,
                }}
                queryKey={productionWorkbenchQueryKey}
                onSaved={(record) => {
                  selectContentUnit(record.ID)
                  setOptimisticSelectedUnit(record)
                  setCreatingUnit(false)
                  setUnitDraftDefaults(null)
                }}
                onCancel={() => {
                  setCreatingUnit(false)
                  setUnitDraftDefaults(null)
                }}
              />
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                请先在筛选区选择情节。
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editingUnit} onOpenChange={(open) => { if (!open) setEditingUnit(false) }}>
        <DialogContent className="max-h-[88vh] w-[min(820px,calc(100vw-32px))] overflow-auto p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>编辑制作项</DialogTitle>
            <DialogDescription>
              {selectedUnit ? `补齐生成目标、提示词和镜头参数：${titleOfRecord(selectedUnit)}` : '请先选择制作项。'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-5">
            {selectedUnit ? (
              <SemanticEntityInlineEditor
                projectId={projectId}
                config={contentUnitConfig}
                record={selectedUnit}
                queryKey={productionWorkbenchQueryKey}
                idScope={`content-workbench-edit-unit-${selectedUnit.ID}`}
                editKey={selectedUnit.ID}
                title="编辑制作项"
                description="保存后会刷新制作项轨道和画面预览。"
                onSaved={(record) => {
                  selectContentUnit(record.ID)
                  setEditingUnit(false)
                }}
              />
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                请先在制作项轨道中选择一个制作项。
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={creatingAssetSlot} onOpenChange={(open) => { if (!open) setCreatingAssetSlot(false) }}>
        <DialogContent className="max-h-[88vh] w-[min(760px,calc(100vw-32px))] overflow-auto p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>添加素材需求</DialogTitle>
            <DialogDescription>
              {selectedUnit ? `将写入当前制作项：${titleOfRecord(selectedUnit)}` : '请先选择制作项再添加素材需求。'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-5">
            {selected && selectedUnit && assetSlotDefaults ? (
              <SemanticEntityInlineEditor
                projectId={projectId}
                config={assetSlotConfig}
                record={null}
                defaults={assetSlotDefaults}
                queryKey={productionWorkbenchQueryKey}
                idScope={`content-workbench-create-asset-slot-${selectedUnit.ID}`}
                title="新建素材需求"
                description="保存后会作为当前制作项的素材缺口出现，可以继续上传候选或绑定资源。"
                onSaved={() => {
                  setCreatingAssetSlot(false)
                }}
              />
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                请先在制作项轨道中选择一个制作项；如果当前情节还没有制作项，请先添加制作项。
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={creatingKeyframe} onOpenChange={(open) => { if (!open) setCreatingKeyframe(false) }}>
        <DialogContent className="max-h-[88vh] w-[min(760px,calc(100vw-32px))] overflow-auto p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>添加关键帧</DialogTitle>
            <DialogDescription>
              {selectedUnit ? `将写入当前制作项：${titleOfRecord(selectedUnit)}` : '请先选择制作项再添加关键帧。'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-5">
            {selected && selectedUnit && keyframeDefaults ? (
              <CreateKeyframeQuickCard
                projectId={projectId}
                keyframeConfig={keyframeConfig}
                selectedUnit={selectedUnit}
                defaults={keyframeDefaults}
                existingKeyframes={selectedUnitKeyframes}
                queryKey={productionWorkbenchQueryKey}
                onSaved={(record) => {
                  setCreatingKeyframe(false)
                  selectContentUnit(Number(record.content_unit_id) || selectedUnit.ID)
                }}
                onCancel={() => setCreatingKeyframe(false)}
              />
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                请先在制作项轨道中选择一个制作项；如果当前情节还没有制作项，请先添加制作项。
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
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

function scopedPreviewTimelineItems(items: WorkbenchRecord[], timelineIds: Set<number> | null, predicate: (item: WorkbenchRecord) => boolean) {
  const relatedItems = items.filter(predicate).slice().sort(byOrder)
  if (!timelineIds?.size) return relatedItems
  const scopedItems = relatedItems.filter((item) => timelineIds.has(Number(item.preview_timeline_id)))
  return scopedItems.length > 0 ? scopedItems : relatedItems
}

function previewTimelineRank(item: WorkbenchRecord) {
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

function EmptyWorkbenchState({ title, text }: { title: string; text: string }) {
  return (
    <Card className="rounded-lg border-dashed border-border bg-card p-8 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{text}</p>
    </Card>
  )
}
