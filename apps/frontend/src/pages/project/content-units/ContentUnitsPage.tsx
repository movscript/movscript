import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  Clock3,
  Captions,
  Database,
  Eye,
  FileAudio,
  Film,
  Image,
  LockKeyhole,
  PackageCheck,
  Play,
  Plus,
  RefreshCcw,
  Route,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react'

import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/api/semanticEntities'
import { ContentWorkspaceLayout } from '@/components/layout/ContentWorkspaceLayout'
import { PreviewDrawer } from '@/components/preview/PreviewDrawer'
import { SemanticEntityInlineEditor } from '@/components/shared/SemanticEntityInlineEditor'
import { ContentFilterBar } from '@/pages/contents/components/ContentFilterBar'
import { readNumberParam, readStringParam, updateContentFilterParams, type ContentFilterKey } from '@/pages/contents/lib/contentFilters'
import { buildContentWorkbenchRouteSearch } from '@/lib/contentWorkbenchRoute'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { Badge, Button, Progress } from '@movscript/ui'
import { ROUTES } from '@/routes/projectRoutes'

type StatusFilter = 'all' | 'ready' | 'attention' | 'locked'

type ContentUnitRecord = SemanticEntityRecord & {
  production_id?: number
  segment_id?: number
  scene_moment_id?: number
  script_block_id?: number
  title?: string
  kind?: string
  order?: number
  duration_sec?: number
  description?: string
  prompt?: string
  shot_size?: string
  camera_angle?: string
  camera_height?: string
  camera_motion?: string
  motion_intensity?: string
  camera_speed?: string
  lens?: string
  focal_length?: string
  focus_subject?: string
  composition_start?: string
  composition_end?: string
  stabilization?: string
  camera_params_json?: string
  camera_notes?: string
  status?: string
}

type SceneMomentRecord = SemanticEntityRecord & {
  title?: string
  description?: string
  time_text?: string
  location_text?: string
  condition_text?: string
  action_text?: string
  mood?: string
  status?: string
}

type SegmentRecord = SemanticEntityRecord & {
  production_id?: number
  title?: string
  summary?: string
  content?: string
  status?: string
}

type KeyframeRecord = SemanticEntityRecord & {
  scene_moment_id?: number
  content_unit_id?: number
  title?: string
  description?: string
  prompt?: string
  status?: string
}

type CreativeReferenceRecord = SemanticEntityRecord & {
  name?: string
  kind?: string
  description?: string
  content?: string
  status?: string
}

type CreativeReferenceUsageRecord = SemanticEntityRecord & {
  owner_type?: string
  owner_id?: number
  creative_reference_id?: number
  role?: string
  evidence?: string
  status?: string
}

type AssetSlotRecord = SemanticEntityRecord & {
  owner_type?: string
  owner_id?: number
  creative_reference_id?: number
  kind?: string
  name?: string
  description?: string
  slot_key?: string
  prompt_hint?: string
  priority?: string
  resource_id?: number
  locked_asset_slot_id?: number
  status?: string
}

type AssetSlotCandidateRecord = SemanticEntityRecord & {
  asset_slot_id?: number
  candidate_asset_slot_id?: number
  score?: number
  status?: string
  note?: string
}

type ScriptBlockRecord = SemanticEntityRecord & {
  script_id?: number
  script_version_id?: number
  kind?: string
  speaker?: string
  content?: string
  start_line?: number
  end_line?: number
  start_char?: number
  end_char?: number
  status?: string
}

type ContentTargetKind = 'keyframe' | 'visual' | 'voice' | 'subtitle'

interface ContentTargetViewModel {
  kind: ContentTargetKind
  label: string
  description: string
  icon: LucideIcon
  slots: AssetSlotRecord[]
  keyframes: KeyframeRecord[]
  candidateCount: number
  lockedCount: number
  missingCount: number
  status: 'ready' | 'candidate' | 'missing'
}

interface ContentUnitViewModel {
  unit: ContentUnitRecord
  sceneMoment?: SceneMomentRecord
  section?: SegmentRecord
  scriptBlock?: ScriptBlockRecord
  usages: CreativeReferenceUsageRecord[]
  references: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
  keyframes: KeyframeRecord[]
  targets: ContentTargetViewModel[]
  missingAssets: AssetSlotRecord[]
  readiness: number
}

const statusMeta: Record<string, { label: string; className: string; dot: string }> = {
  draft: { label: '草稿', className: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
  confirmed: { label: '已确认', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  in_production: { label: '生成中', className: 'bg-blue-500/10 text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  locked: { label: '已锁定', className: 'bg-violet-500/10 text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
  candidate: { label: '候选', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
  missing: { label: '缺素材需求', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  blocked: { label: '阻塞', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
}

const kindLabels: Record<string, string> = {
  shot: '镜头',
  visual_segment: '视觉编排段',
  product_showcase: '产品展示',
  caption_card: '字幕卡',
  narration: '旁白',
  transition: '转场',
  music_beat: '音乐节拍',
}

const kindOptions = ['all', 'shot', 'visual_segment', 'product_showcase', 'caption_card', 'narration', 'transition', 'music_beat']

const contentTargetMeta: Record<ContentTargetKind, { label: string; description: string; icon: LucideIcon; slotKeys: string[]; assetKinds: string[] }> = {
  keyframe: {
    label: '关键帧',
    description: '构图、状态和视觉锚点',
    icon: Image,
    slotKeys: ['keyframe', 'frame', 'anchor'],
    assetKinds: [],
  },
  visual: {
    label: '画面',
    description: '图片、视频或最终画面候选',
    icon: Film,
    slotKeys: ['visual', 'picture', 'image', 'video', 'shot', 'screen'],
    assetKinds: ['image', 'video'],
  },
  voice: {
    label: '语音',
    description: '配音、旁白和声音候选',
    icon: FileAudio,
    slotKeys: ['voice', 'audio', 'voiceover', 'narration', 'sound'],
    assetKinds: ['audio'],
  },
  subtitle: {
    label: '字幕',
    description: '字幕、口播文本和屏幕文案',
    icon: Captions,
    slotKeys: ['subtitle', 'caption', 'text', 'copy'],
    assetKinds: ['text'],
  },
}

function normalizeStatusFilter(value: string): StatusFilter {
  return ['ready', 'attention', 'locked'].includes(value) ? value as StatusFilter : 'all'
}

export default function ContentUnitsPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const contentUnitConfig = semanticEntityConfig('contentUnits')
  const [creatingContentUnit, setCreatingContentUnit] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = readNumberParam(searchParams, 'content_unit_id') ?? readNumberParam(searchParams, 'selected')
  const segmentFilterId = readNumberParam(searchParams, 'segment_id')
  const sceneMomentFilterId = readNumberParam(searchParams, 'scene_moment_id')
  const referenceFilterId = readNumberParam(searchParams, 'reference_id')
  const assetSlotFilterId = readNumberParam(searchParams, 'asset_slot_id')
  const productionFilterId = readNumberParam(searchParams, 'production_id')
  const kindFilter = readStringParam(searchParams, 'kind', 'all')
  const statusFilter = normalizeStatusFilter(readStringParam(searchParams, 'status'))
  const query = readStringParam(searchParams, 'q')

  const contentUnitsQuery = useQuery({
    queryKey: ['semantic-content-positioning', projectId, 'content-units'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('contentUnits')) as Promise<ContentUnitRecord[]>,
    enabled: !!projectId,
  })
  const scriptBlocksQuery = useQuery({
    queryKey: ['semantic-content-positioning', projectId, 'script-blocks'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('scriptBlocks')) as Promise<ScriptBlockRecord[]>,
    enabled: !!projectId,
  })
  const sceneMomentsQuery = useQuery({
    queryKey: ['semantic-content-positioning', projectId, 'sceneMoments'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('sceneMoments')) as Promise<SceneMomentRecord[]>,
    enabled: !!projectId,
  })
  const sectionsQuery = useQuery({
    queryKey: ['semantic-content-positioning', projectId, 'segments'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('segments')) as Promise<SegmentRecord[]>,
    enabled: !!projectId,
  })
  const keyframesQuery = useQuery({
    queryKey: ['semantic-content-positioning', projectId, 'keyframes'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('keyframes')) as Promise<KeyframeRecord[]>,
    enabled: !!projectId,
  })
  const referencesQuery = useQuery({
    queryKey: ['semantic-content-positioning', projectId, 'creative-references'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('creativeReferences')) as Promise<CreativeReferenceRecord[]>,
    enabled: !!projectId,
  })
  const usagesQuery = useQuery({
    queryKey: ['semantic-content-positioning', projectId, 'creative-reference-usages'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('creativeReferenceUsages')) as Promise<CreativeReferenceUsageRecord[]>,
    enabled: !!projectId,
  })
  const assetSlotsQuery = useQuery({
    queryKey: ['semantic-content-positioning', projectId, 'asset-slots'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('assetSlots')) as Promise<AssetSlotRecord[]>,
    enabled: !!projectId,
  })
  const assetSlotCandidatesQuery = useQuery({
    queryKey: ['semantic-content-positioning', projectId, 'asset-slot-candidates'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('assetSlotCandidates')) as Promise<AssetSlotCandidateRecord[]>,
    enabled: !!projectId,
  })

  const contentUnits = useMemo(() => (contentUnitsQuery.data ?? []).slice().sort(compareByOrder), [contentUnitsQuery.data])
  const scriptBlocks = scriptBlocksQuery.data ?? []
  const sceneMoments = sceneMomentsQuery.data ?? []
  const sections = sectionsQuery.data ?? []
  const keyframes = keyframesQuery.data ?? []
  const references = referencesQuery.data ?? []
  const usages = usagesQuery.data ?? []
  const assetSlots = assetSlotsQuery.data ?? []
  const assetSlotCandidates = assetSlotCandidatesQuery.data ?? []

  const referencesById = useMemo(() => new Map(references.map((item) => [item.ID, item])), [references])
  const scriptBlocksById = useMemo(() => new Map(scriptBlocks.map((item) => [item.ID, item])), [scriptBlocks])
  const sceneMomentById = useMemo(() => new Map(sceneMoments.map((item) => [item.ID, item])), [sceneMoments])
  const sectionById = useMemo(() => new Map(sections.map((item) => [item.ID, item])), [sections])
  const assetCandidatesBySlotId = useMemo(() => {
    const map = new Map<number, AssetSlotCandidateRecord[]>()
    assetSlotCandidates.forEach((candidate) => {
      if (!candidate.asset_slot_id) return
      const current = map.get(candidate.asset_slot_id) ?? []
      current.push(candidate)
      map.set(candidate.asset_slot_id, current)
    })
    return map
  }, [assetSlotCandidates])

  const unitViewModels = useMemo(() => contentUnits.map((unit) => {
    const sceneMoment = unit.scene_moment_id ? sceneMomentById.get(unit.scene_moment_id) : undefined
    const section = unit.segment_id ? sectionById.get(unit.segment_id) : undefined
    const scriptBlock = unit.script_block_id ? scriptBlocksById.get(unit.script_block_id) : undefined
    const unitUsages = usages.filter((item) => item.owner_type === 'content_unit' && item.owner_id === unit.ID)
    const inheritedUsages = sceneMoment ? usages.filter((item) => item.owner_type === 'scene_moment' && item.owner_id === sceneMoment.ID) : []
    const relatedUsages = dedupeUsages([...unitUsages, ...inheritedUsages])
    const relatedReferences = relatedUsages
      .map((usage) => usage.creative_reference_id ? referencesById.get(usage.creative_reference_id) : undefined)
      .filter(Boolean) as CreativeReferenceRecord[]
    const unitAssetSlots = assetSlots.filter((item) => item.owner_type === 'content_unit' && item.owner_id === unit.ID)
    const inheritedAssetSlots = sceneMoment ? assetSlots.filter((item) => item.owner_type === 'scene_moment' && item.owner_id === sceneMoment.ID) : []
    const relatedAssetSlots = [...unitAssetSlots, ...inheritedAssetSlots]
    const relatedKeyframes = keyframes.filter((item) => item.content_unit_id === unit.ID || (unit.scene_moment_id && item.scene_moment_id === unit.scene_moment_id))
    const targets = buildContentTargets(relatedAssetSlots, relatedKeyframes, assetCandidatesBySlotId)
    const missingAssets = relatedAssetSlots.filter((item) => ['missing', 'blocked'].includes(String(item.status ?? '')))
    const readiness = calculateReadiness({ unit, sceneMoment, references: relatedReferences, assetSlots: relatedAssetSlots, keyframes: relatedKeyframes })

    return {
      unit,
      sceneMoment,
      section,
      scriptBlock,
      usages: relatedUsages,
      references: relatedReferences,
      assetSlots: relatedAssetSlots,
      keyframes: relatedKeyframes,
      targets,
      missingAssets,
      readiness,
    }
  }), [assetCandidatesBySlotId, assetSlots, contentUnits, keyframes, referencesById, scriptBlocksById, sectionById, sceneMomentById, usages])

  const filteredUnits = useMemo(() => {
    const q = query.trim().toLowerCase()
    return unitViewModels.filter((item) => {
      const status = String(item.unit.status ?? 'draft')
      const matchesKind = kindFilter === 'all' || item.unit.kind === kindFilter
      const matchesSegment = !segmentFilterId || item.unit.segment_id === segmentFilterId || item.section?.ID === segmentFilterId
      const matchesSceneMoment = !sceneMomentFilterId || item.unit.scene_moment_id === sceneMomentFilterId
      const matchesReference = !referenceFilterId || item.references.some((reference) => reference.ID === referenceFilterId)
      const matchesAssetSlot = !assetSlotFilterId || item.assetSlots.some((slot) => slot.ID === assetSlotFilterId)
      const matchesProduction = !productionFilterId || item.unit.production_id === productionFilterId || item.section?.production_id === productionFilterId
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'ready' && item.readiness >= 70 && item.missingAssets.length === 0) ||
        (statusFilter === 'attention' && (item.readiness < 70 || item.missingAssets.length > 0 || ['draft', 'candidate'].includes(status))) ||
        (statusFilter === 'locked' && status === 'locked')
      const haystack = [
        titleOf(item.unit),
        item.unit.description,
        item.unit.prompt,
        item.scriptBlock?.content,
        item.scriptBlock ? scriptBlockSourceLabel(item.scriptBlock) : '',
        titleOf(item.sceneMoment),
        item.sceneMoment?.description,
        item.sceneMoment?.action_text,
        item.references.map((ref) => ref.name).join(' '),
        item.assetSlots.map((slot) => slot.name).join(' '),
        cameraSummary(item.unit),
      ].filter(Boolean).join(' ').toLowerCase()
      return matchesKind && matchesSegment && matchesSceneMoment && matchesReference && matchesAssetSlot && matchesProduction && matchesStatus && (!q || haystack.includes(q))
    })
  }, [assetSlotFilterId, kindFilter, productionFilterId, query, referenceFilterId, sceneMomentFilterId, segmentFilterId, statusFilter, unitViewModels])

  const selected = useMemo(() => {
    if (selectedId) {
      const matched = unitViewModels.find((item) => item.unit.ID === selectedId)
      if (matched) return matched
    }
    return filteredUnits[0] ?? unitViewModels[0] ?? null
  }, [filteredUnits, selectedId, unitViewModels])

  const readyCount = unitViewModels.filter((item) => item.readiness >= 70 && item.missingAssets.length === 0).length
  const lockedCount = unitViewModels.filter((item) => item.unit.status === 'locked').length
  const attentionCount = unitViewModels.filter((item) => item.readiness < 70 || item.missingAssets.length > 0).length
  const contentTargetCount = unitViewModels.reduce((sum, item) => sum + item.targets.filter((target) => target.status !== 'missing').length, 0)
  const averageReadiness = unitViewModels.length
    ? Math.round(unitViewModels.reduce((sum, item) => sum + item.readiness, 0) / unitViewModels.length)
    : 0
  const isLoading = contentUnitsQuery.isLoading || sceneMomentsQuery.isLoading
  const isFetching = contentUnitsQuery.isFetching || scriptBlocksQuery.isFetching || sceneMomentsQuery.isFetching || sectionsQuery.isFetching || keyframesQuery.isFetching || referencesQuery.isFetching || usagesQuery.isFetching || assetSlotsQuery.isFetching || assetSlotCandidatesQuery.isFetching

  function refreshAll() {
    contentUnitsQuery.refetch()
    scriptBlocksQuery.refetch()
    sceneMomentsQuery.refetch()
    sectionsQuery.refetch()
    keyframesQuery.refetch()
    referencesQuery.refetch()
    usagesQuery.refetch()
    assetSlotsQuery.refetch()
    assetSlotCandidatesQuery.refetch()
  }

  function setFilter(updates: Partial<Record<ContentFilterKey, string | number | null | undefined>>) {
    setSearchParams(updateContentFilterParams(searchParams, updates), { replace: true })
  }

  function startCreateContentUnit() {
    setCreatingContentUnit(true)
  }

  return (
    <>
      <ContentWorkspaceLayout
        header={(
          <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Database size={14} />
              <span>{project?.name ?? '当前项目'}</span>
              <ChevronRight size={13} />
              <span>生产对象</span>
              <ChevronRight size={13} />
              <span>制作项</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">制作项</h1>
            <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
              集中查看制作项的来源、输入缺口和关联对象；拆解、关键帧、素材补齐和生成决策统一在内容编排工作台完成。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button className="gap-2" asChild>
              <Link to={ROUTES.project.contentUnitWorkbench}>
                <Wand2 size={15} />
                进入内容编排
              </Link>
            </Button>
            <Button variant="outline" className="gap-2" onClick={startCreateContentUnit}>
              <Plus size={15} />
              新建制作项
            </Button>
            <Button variant="outline" className="h-9 w-9 p-0" onClick={refreshAll} loading={isFetching} aria-label="刷新制作项" title="刷新制作项">
              <RefreshCcw size={15} />
            </Button>
          </div>
          </header>
        )}
        overview={(
          <section className="grid grid-cols-2 overflow-hidden rounded-md border border-border bg-card md:grid-cols-4" data-testid="content-units-summary-strip">
          <MetricCard icon={Boxes} label="制作项" value={unitViewModels.length} detail="从候选收敛到最终目标" tone="text-indigo-600" />
          <MetricCard icon={ShieldCheck} label="可编排" value={readyCount} detail="情景、设定资料和素材需求输入已满足" tone="text-emerald-600" />
          <MetricCard icon={Play} label="候选目标" value={contentTargetCount} detail="关键帧、画面、语音和字幕" tone="text-sky-600" />
          <MetricCard icon={LockKeyhole} label="已锁定" value={lockedCount} detail={`${averageReadiness}% 平均编排准备度`} tone="text-violet-600" />
          </section>
        )}
        filters={(
          <ContentFilterBar
            query={query}
            onQueryChange={(value) => setFilter({ q: value })}
            queryPlaceholder="搜索标题、提示词、设定资料或素材需求"
            filters={[
              {
                id: 'status',
                label: '状态',
                value: statusFilter,
                onChange: (value) => setFilter({ status: value }),
                options: [
                  { value: 'all', label: '全部', count: unitViewModels.length },
                  { value: 'ready', label: '可编排', count: readyCount },
                  { value: 'attention', label: '待补齐', count: attentionCount },
                  { value: 'locked', label: '已锁定', count: lockedCount },
                ],
              },
              {
                id: 'kind',
                label: '类型',
                value: kindFilter,
                onChange: (value) => setFilter({ kind: value }),
                options: kindOptions.map((kind) => ({
                  value: kind,
                  label: kind === 'all' ? '全部类型' : kindLabel(kind),
                  count: kind === 'all' ? unitViewModels.length : unitViewModels.filter((item) => item.unit.kind === kind).length,
                })),
              },
            ]}
            chips={[
              segmentFilterId ? { id: 'segment', label: `编排段 #${segmentFilterId}`, onRemove: () => setFilter({ segment_id: null }) } : null,
              sceneMomentFilterId ? { id: 'scene', label: `情景 #${sceneMomentFilterId}`, onRemove: () => setFilter({ scene_moment_id: null }) } : null,
              selectedId ? { id: 'content', label: `制作项 #${selectedId}`, onRemove: () => setFilter({ content_unit_id: null, selected: null }) } : null,
              referenceFilterId ? { id: 'reference', label: `设定资料 #${referenceFilterId}`, onRemove: () => setFilter({ reference_id: null }) } : null,
              assetSlotFilterId ? { id: 'asset', label: `素材需求 #${assetSlotFilterId}`, onRemove: () => setFilter({ asset_slot_id: null }) } : null,
              productionFilterId ? { id: 'production', label: `制作 #${productionFilterId}`, onRemove: () => setFilter({ production_id: null }) } : null,
            ].filter(Boolean) as Array<{ id: string; label: string; onRemove: () => void }>}
            resultCount={filteredUnits.length}
            totalCount={unitViewModels.length}
          />
        )}
        list={(
          <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">制作项清单</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">每一项都是可被内容编排工作台检查、复核和锁定的生产颗粒。</p>
                </div>
              </div>

              <div className="max-h-[760px] overflow-auto">
                {isLoading ? (
                  <EmptyState title="正在加载制作项" detail="读取制作项、情景和创作输入关系" />
                ) : filteredUnits.length === 0 ? (
                  <EmptyState title="暂无制作项" detail="可先进入内容编排工作台拆解制作项骨架，再回到这里查看清单和关联对象。" />
                ) : (
                <div className="grid grid-cols-1 gap-3 p-4">
                  {filteredUnits.map((item) => (
                    <ContentUnitCard
                      key={item.unit.ID}
                      item={item}
                      selected={selected?.unit.ID === item.unit.ID}
                      onSelect={() => setFilter({ content_unit_id: item.unit.ID, segment_id: item.unit.segment_id ?? null, scene_moment_id: item.unit.scene_moment_id ?? null })}
                    />
                  ))}
                </div>
                )}
              </div>
          </section>
        )}
        detail={(
          <>
            <SemanticEntityInlineEditor
              projectId={projectId}
              config={contentUnitConfig}
              record={creatingContentUnit ? null : selected?.unit}
              defaults={creatingContentUnit ? {
                segment_id: selected?.unit.segment_id ?? segmentFilterId ?? null,
                scene_moment_id: selected?.unit.scene_moment_id ?? sceneMomentFilterId ?? null,
                script_block_id: selected?.unit.script_block_id ?? null,
                order: unitViewModels.length + 1,
                kind: 'shot',
                status: 'draft',
              } : undefined}
              queryKey={['semantic-content-positioning', projectId]}
              title={creatingContentUnit ? '新建制作项' : '卡片内编辑制作项'}
              description="直接维护制作项、创作提示、时长和状态。"
              hero={{
                icon: <Boxes size={19} />,
                eyebrow: selected?.sceneMoment ? titleOf(selected.sceneMoment) : '未绑定情景',
                title: creatingContentUnit ? '新建制作项' : selected ? titleOf(selected.unit) : '新建制作项',
                subtitle: creatingContentUnit ? '制作项' : selected ? `${kindLabel(selected.unit.kind)} · 制作项 #${selected.unit.ID}` : '制作项',
                summary: creatingContentUnit ? '创建后可继续补充创作提示、运镜参数，并收拢关键帧、画面、语音和字幕候选。' : selected?.unit.description || selected?.unit.prompt || '暂无内容描述或创作提示。',
                compact: true,
                status: <StatusBadge status={creatingContentUnit ? 'draft' : selected?.unit.status ?? 'draft'} />,
                stats: selected && !creatingContentUnit ? [
                  { label: '类型', value: kindLabel(selected.unit.kind) },
                  { label: '时长', value: formatDuration(selected.unit.duration_sec) },
                  { label: '剧本来源', value: selected.scriptBlock ? scriptBlockSourceLabel(selected.scriptBlock) : selected.unit.script_block_id ? `剧本块 #${selected.unit.script_block_id}` : '未绑定' },
                  { label: '准备度', value: `${selected.readiness}%` },
                ] : [
                  { label: '默认类型', value: '镜头' },
                  { label: '所属情景', value: selected?.sceneMoment ? titleOf(selected.sceneMoment) : '未绑定' },
                  { label: '顺序', value: unitViewModels.length + 1 },
                  { label: '准备度', value: '0%' },
                ],
              }}
              onSaved={(record) => {
                setCreatingContentUnit(false)
                setFilter({ content_unit_id: record.ID, scene_moment_id: record.scene_moment_id as number | undefined, segment_id: record.segment_id as number | undefined })
              }}
              onDeleted={() => {
                setCreatingContentUnit(false)
                setFilter({ content_unit_id: null, selected: null })
              }}
            />
            <ContentUnitDetail item={selected} projectId={projectId} />
            <ContentTargetPanel targets={selected?.targets ?? []} />
          </>
        )}
        preview={(
          <>
            <RelatedPanel
              title="设定资料"
              icon={Sparkles}
              empty="暂无设定资料引用"
              records={selected?.references.map((item) => ({
                id: item.ID,
                title: item.name || titleOf(item),
                subtitle: `${item.kind ?? 'reference'} · ${statusLabel(item.status)}`,
                status: item.status,
              })) ?? []}
            />
            <RelatedPanel
              title="素材需求"
              icon={PackageCheck}
              empty="暂无素材需求"
              records={selected?.assetSlots.map((item) => ({
                id: item.ID,
                title: item.name || titleOf(item),
                subtitle: `${item.kind ?? 'asset'} · ${item.prompt_hint || item.description || '等待补充创作输入'}`,
                status: item.status,
              })) ?? []}
            />
            <RelatedPanel
              title="关键帧"
              icon={Image}
              empty="暂无关键帧"
              records={selected?.keyframes.map((item) => ({
                id: item.ID,
                title: item.title || titleOf(item),
                subtitle: item.prompt || item.description || '视觉锚点',
                status: item.status,
              })) ?? []}
            />
          </>
        )}
        upstream={<div />}
        downstream={<div />}
        bottom={(
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <RelatedPanel
              title="来源剧本块"
              icon={ScrollText}
              empty="当前制作项暂无剧本块来源"
              records={selected?.scriptBlock ? [{
                id: selected.scriptBlock.ID,
                title: scriptBlockSourceLabel(selected.scriptBlock),
                subtitle: selected.scriptBlock.content || selected.scriptBlock.kind || '剧本块来源',
                status: selected.scriptBlock.status,
              }] : []}
            />
            <RelatedPanel
              title="涉及到的编排段"
              icon={Route}
              empty="当前制作项暂无编排段引用"
              records={selected?.section ? [{
                id: selected.section.ID,
                title: titleOf(selected.section),
                subtitle: selected.section.summary || selected.section.content || '编排段上下文',
                status: selected.section.status,
              }] : []}
            />
            <RelatedPanel
              title="涉及的情景"
              icon={Film}
              empty="当前制作项暂无情景引用"
              records={selected?.sceneMoment ? [{
                id: selected.sceneMoment.ID,
                title: titleOf(selected.sceneMoment),
                subtitle: selected.sceneMoment.description || selected.sceneMoment.action_text || '情景上下文',
                status: selected.sceneMoment.status,
              }] : []}
            />
          </div>
        )}
      />
    </>
  )
}

function ContentUnitCard({
  item,
  selected,
  onSelect,
}: {
  item: ContentUnitViewModel
  selected: boolean
  onSelect: () => void
}) {
  const status = String(item.unit.status ?? 'draft')
  const sceneMomentTitle = item.sceneMoment ? titleOf(item.sceneMoment) : '未绑定情景'

  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid="content-unit-list-card"
      className={cn(
        'rounded-md border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold leading-5 text-foreground">{titleOf(item.unit)}</h3>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{kindLabel(item.unit.kind)} · {formatDuration(item.unit.duration_sec)} · {sceneMomentTitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusBadge status={status} compact />
          <Badge variant={item.readiness >= 70 ? 'success' : item.readiness > 0 ? 'secondary' : 'outline'} className="text-[10px]">{item.readiness}%</Badge>
        </div>
      </div>
      <p className="mt-1.5 truncate text-xs text-muted-foreground">{item.unit.description || item.unit.prompt || '暂无内容描述或创作提示'}</p>
      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span className="truncate">来源 {item.scriptBlock ? scriptBlockSourceLabel(item.scriptBlock) : item.unit.script_block_id ? `剧本块 #${item.unit.script_block_id}` : '待补'}</span>
        <span>设定 {item.references.length}</span>
        <span>素材 {item.assetSlots.length}</span>
        <span>目标 {item.targets.filter((target) => target.status !== 'missing').length}/4</span>
        <span>候选 {candidateTotal(item.targets)}</span>
        {item.missingAssets.length > 0 ? <span className="text-amber-700 dark:text-amber-300">缺口 {item.missingAssets.length}</span> : null}
      </div>
    </button>
  )
}

function ContentUnitDetail({
  item,
  projectId,
}: {
  item: ContentUnitViewModel | null
  projectId?: number
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  if (!item) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <EmptyState title="未选择制作项" detail="从中间清单选择一个制作项查看上下文" compact />
      </section>
    )
  }

  const workbenchSearch = buildContentWorkbenchRouteSearch({
    sceneMomentId: item.unit.scene_moment_id ?? item.sceneMoment?.ID,
    contentUnitId: item.unit.ID,
  })

  return (
    <>
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-3">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Eye size={16} />
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge status={item.unit.status ?? 'draft'} />
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPreviewOpen(true)}>
              <Clapperboard size={13} />
              预览
            </Button>
            <Button size="sm" asChild>
              <Link to={`${ROUTES.project.contentUnitWorkbench}${workbenchSearch}`}>
              <Wand2 size={13} />
              进入编排
              </Link>
            </Button>
          </div>
        </div>
        <h2 className="mt-2.5 text-base font-semibold text-foreground">{titleOf(item.unit)}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{kindLabel(item.unit.kind)} · {formatDuration(item.unit.duration_sec)}</p>
      </div>
      <div className="space-y-3 p-3">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">编排准备度</span>
            <span className="font-medium tabular-nums text-foreground">{item.readiness}%</span>
          </div>
          <Progress value={item.readiness} className="h-2" />
        </div>
        <CheckRow ok={Boolean(item.sceneMoment)} label="已绑定情景" detail={item.sceneMoment ? titleOf(item.sceneMoment) : '缺少时间、地点、动作上下文'} />
        <CheckRow ok={Boolean(item.scriptBlock)} label="已绑定剧本来源" detail={item.scriptBlock ? scriptBlockSourceLabel(item.scriptBlock) : item.unit.script_block_id ? `剧本块 #${item.unit.script_block_id} 暂未加载` : '缺少稳定剧本块来源'} />
        <CheckRow ok={Boolean(item.unit.prompt || item.unit.description)} label="有创作意图" detail={item.unit.prompt || item.unit.description || '需要补充描述或提示词'} />
        <CheckRow ok={item.references.length > 0} label="有设定资料" detail={`${item.references.length} 个设定资料约束`} />
        <CheckRow ok={item.missingAssets.length === 0} label="素材需求可收敛" detail={item.missingAssets.length ? `${item.missingAssets.length} 个素材需求待补齐` : `${item.assetSlots.length} 个素材需求可用或未要求`} />
        <CheckRow ok={item.targets.some((target) => target.status !== 'missing')} label="有候选目标" detail={targetSummary(item.targets)} />
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="设定资料" value={item.references.length} />
          <MiniStat label="素材需求" value={item.assetSlots.length} />
          <MiniStat label="候选目标" value={`${item.targets.filter((target) => target.status !== 'missing').length}/4`} />
          <MiniStat label="候选总数" value={candidateTotal(item.targets)} />
        </div>
        <details className="rounded-md border border-border bg-background" data-testid="content-unit-detail-context">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 text-sm font-medium text-foreground">
            <span>详细上下文</span>
            <Badge variant="outline" className="text-[10px]">文本 / 运镜</Badge>
          </summary>
          <div className="space-y-3 border-t border-border p-2.5">
            <InfoBlock label="情景" value={item.sceneMoment?.description || item.sceneMoment?.action_text || '暂无情景描述'} />
            <InfoBlock label="来源剧本块" value={item.scriptBlock ? scriptBlockSourceLabel(item.scriptBlock) : item.unit.script_block_id ? `剧本块 #${item.unit.script_block_id}` : '未绑定剧本块'} />
            {item.scriptBlock ? <InfoBlock label="来源文本" value={String(item.scriptBlock.content ?? '').trim() || '暂无剧本块正文'} /> : null}
            <InfoBlock label="创作提示" value={item.unit.prompt || item.unit.description || '暂无提示词'} />
            <InfoBlock label="运镜设计" value={cameraSummary(item.unit) || '暂无运镜参数'} />
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="景别" value={cameraOptionLabel('shot_size', item.unit.shot_size)} />
              <MiniStat label="机位" value={cameraOptionLabel('camera_angle', item.unit.camera_angle)} />
              <MiniStat label="运镜" value={cameraOptionLabel('camera_motion', item.unit.camera_motion)} />
              <MiniStat label="速度" value={cameraOptionLabel('camera_speed', item.unit.camera_speed)} />
            </div>
            <InfoBlock label="起始构图" value={item.unit.composition_start || '-'} />
            <InfoBlock label="结束构图" value={item.unit.composition_end || '-'} />
            <InfoBlock label="运镜备注" value={item.unit.camera_notes || '-'} />
          </div>
        </details>
      </div>
    </section>
    {projectId && (
      <PreviewDrawer
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        projectId={projectId}
        scope="content_unit"
        entityId={item.unit.ID}
        entityTitle={titleOf(item.unit)}
      />
    )}
    </>
  )
}

function MetricCard({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: string | number; detail: string; tone: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-b border-r border-border px-3 py-2 last:border-r-0 md:border-b-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon size={14} className={tone} />
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <p className="text-sm font-semibold tabular-nums text-foreground">{value}</p>
          <p className="truncate text-[11px] text-muted-foreground">{label}</p>
        </div>
        <p className="truncate text-[11px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

function RelatedPanel({ title, icon: Icon, records, empty }: { title: string; icon: LucideIcon; records: Array<{ id: number; title: string; subtitle: string; status?: string }>; empty: string }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">{title}</p>
        </div>
        <Badge variant="outline" className="text-[10px]">{records.length}</Badge>
      </div>
      <div className="space-y-2 p-3">
        {records.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">{empty}</p>
        ) : (
          records.slice(0, 6).map((record) => (
            <div key={record.id} className="rounded-md border border-border bg-background p-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-foreground">{record.title}</p>
                <StatusBadge status={record.status ?? 'draft'} compact />
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{record.subtitle}</p>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function ContentTargetPanel({ targets }: { targets: ContentTargetViewModel[] }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Play size={14} className="text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">候选目标</p>
        </div>
        <Badge variant="outline" className="text-[10px]">{targets.filter((target) => target.status !== 'missing').length}/4</Badge>
      </div>
      <div className="space-y-2 p-3">
        {targets.map((target) => {
          const Icon = target.icon
          return (
            <div key={target.kind} className="rounded-md border border-border bg-background p-2.5">
              <div className="flex items-start gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{target.label}</p>
                    <StatusBadge status={target.status === 'ready' ? 'locked' : target.status} compact />
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{target.description}</p>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <MiniStat label="槽" value={target.slots.length + target.keyframes.length} />
                    <MiniStat label="候选" value={target.candidateCount} />
                    <MiniStat label="锁定" value={target.lockedCount} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex gap-2 rounded-md border border-border bg-background p-2.5">
      {ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />}
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{value}</p>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

function StatusBadge({ status, compact = false }: { status: string; compact?: boolean }) {
  const meta = statusMeta[status] ?? { label: status || '未知', className: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' }
  return (
    <Badge variant="secondary" className={cn('shrink-0', compact ? 'text-[9px]' : 'text-[10px]', meta.className)}>
      {meta.label}
    </Badge>
  )
}

function EmptyState({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'min-h-32 p-4' : 'min-h-72 p-8')}>
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Boxes size={18} />
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  )
}

function calculateReadiness(input: {
  unit: ContentUnitRecord
  sceneMoment?: SceneMomentRecord
  references: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
  keyframes: KeyframeRecord[]
}) {
  let score = 0
  if (input.sceneMoment) score += 25
  if (input.unit.prompt || input.unit.description) score += 25
  if (input.references.length > 0) score += 20
  if (input.keyframes.length > 0) score += 10
  const missingAssets = input.assetSlots.filter((item) => ['missing', 'blocked'].includes(String(item.status ?? ''))).length
  if (input.assetSlots.length === 0 || missingAssets === 0) score += 20
  else score += Math.max(0, 20 - missingAssets * 8)
  return Math.max(0, Math.min(100, score))
}

function buildContentTargets(
  slots: AssetSlotRecord[],
  keyframes: KeyframeRecord[],
  candidatesBySlotId: Map<number, AssetSlotCandidateRecord[]>,
): ContentTargetViewModel[] {
  return (Object.keys(contentTargetMeta) as ContentTargetKind[]).map((kind) => {
    const meta = contentTargetMeta[kind]
    const targetSlots = slots.filter((slot) => matchesContentTarget(slot, kind))
    const targetKeyframes = kind === 'keyframe' ? keyframes : []
    const candidateCount = targetSlots.reduce((sum, slot) => {
      const candidates = candidatesBySlotId.get(slot.ID) ?? []
      return sum + candidates.filter((candidate) => candidate.status !== 'rejected').length
    }, targetKeyframes.filter((keyframe) => ['candidate', 'generated'].includes(String(keyframe.status ?? ''))).length)
    const lockedCount = targetSlots.filter((slot) => (
      ['locked', 'waived'].includes(String(slot.status ?? '')) ||
      Boolean(slot.resource_id || slot.locked_asset_slot_id)
    )).length + targetKeyframes.filter((keyframe) => ['accepted', 'attached'].includes(String(keyframe.status ?? '')) || Boolean(keyframe.resource_id)).length
    const missingCount = targetSlots.filter((slot) => ['missing', 'blocked'].includes(String(slot.status ?? ''))).length
    const hasAny = targetSlots.length > 0 || targetKeyframes.length > 0
    const status: ContentTargetViewModel['status'] = lockedCount > 0
      ? 'ready'
      : candidateCount > 0 || hasAny
        ? 'candidate'
        : 'missing'

    return {
      kind,
      label: meta.label,
      description: describeTargetState(meta.description, targetSlots.length + targetKeyframes.length, candidateCount, lockedCount, missingCount),
      icon: meta.icon,
      slots: targetSlots,
      keyframes: targetKeyframes,
      candidateCount,
      lockedCount,
      missingCount,
      status,
    }
  })
}

function matchesContentTarget(slot: AssetSlotRecord, kind: ContentTargetKind) {
  const meta = contentTargetMeta[kind]
  const haystack = [
    slot.kind,
    slot.name,
    slot.description,
    slot.prompt_hint,
    String(slot.slot_key ?? ''),
  ].filter(Boolean).join(' ').toLowerCase()
  if (meta.assetKinds.includes(String(slot.kind ?? '').toLowerCase())) return true
  return meta.slotKeys.some((key) => haystack.includes(key))
}

function describeTargetState(base: string, slotCount: number, candidateCount: number, lockedCount: number, missingCount: number) {
  if (lockedCount > 0) return `${base} · ${lockedCount} 个已锁定`
  if (candidateCount > 0) return `${base} · ${candidateCount} 个候选`
  if (slotCount > 0 || missingCount > 0) return `${base} · 等待候选`
  return `${base} · 尚未建槽`
}

function candidateTotal(targets: ContentTargetViewModel[]) {
  return targets.reduce((sum, target) => sum + target.candidateCount, 0)
}

function targetSummary(targets: ContentTargetViewModel[]) {
  const active = targets.filter((target) => target.status !== 'missing').map((target) => target.label)
  return active.length ? active.join('、') : '需要建立关键帧、画面、语音或字幕目标'
}

const cameraLabels: Record<string, Record<string, string>> = {
  shot_size: {
    extreme_wide: '大远景',
    wide: '远景',
    full: '全景',
    medium: '中景',
    medium_close: '中近景',
    close_up: '近景',
    extreme_close_up: '特写',
    detail: '细节',
  },
  camera_angle: {
    eye_level: '平视',
    high_angle: '俯拍',
    low_angle: '仰拍',
    top_down: '顶拍',
    dutch_angle: '倾斜角',
    over_shoulder: '过肩',
    pov: '主观视角',
  },
  camera_height: {
    ground: '贴地',
    low: '低机位',
    eye: '视平线',
    high: '高机位',
    overhead: '俯视高位',
  },
  camera_motion: {
    static: '固定镜头',
    pan: '摇镜',
    tilt: '俯仰',
    dolly_in: '推进',
    dolly_out: '拉远',
    truck_left: '左移',
    truck_right: '右移',
    tracking: '跟拍',
    orbit: '环绕',
    crane: '升降',
    handheld: '手持',
    zoom: '变焦',
  },
  motion_intensity: {
    subtle: '轻微',
    moderate: '适中',
    strong: '强烈',
    dynamic: '高动态',
  },
  camera_speed: {
    slow: '慢',
    normal: '正常',
    fast: '快',
    ramp: '变速',
  },
  stabilization: {
    locked: '锁定稳定',
    smooth: '平滑稳定',
    handheld: '手持抖动',
    intentional_shake: '刻意晃动',
  },
}

function cameraOptionLabel(kind: keyof typeof cameraLabels, value?: string) {
  if (!value) return '-'
  return cameraLabels[kind]?.[value] ?? value
}

function cameraSummary(unit: ContentUnitRecord) {
  return [
    cameraOptionLabel('shot_size', unit.shot_size),
    cameraOptionLabel('camera_angle', unit.camera_angle),
    cameraOptionLabel('camera_motion', unit.camera_motion),
    cameraOptionLabel('motion_intensity', unit.motion_intensity),
    cameraOptionLabel('camera_speed', unit.camera_speed),
    unit.lens,
    unit.focal_length,
    unit.focus_subject ? `焦点 ${unit.focus_subject}` : '',
  ].filter((value) => value && value !== '-').join(' · ')
}

function dedupeUsages(usages: CreativeReferenceUsageRecord[]) {
  const seen = new Set<string>()
  return usages.filter((usage) => {
    const key = `${usage.owner_type}:${usage.owner_id}:${usage.creative_reference_id}:${usage.role ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function compareByOrder<T extends { order?: number; ID: number }>(a: T, b: T) {
  return orderOf(a) - orderOf(b)
}

function orderOf(record: { order?: number; ID: number }) {
  return typeof record.order === 'number' ? record.order : record.ID
}

function titleOf(record?: { ID?: number; title?: string; name?: string; label?: string } | null) {
  if (!record) return '未命名'
  return String(record.title ?? record.name ?? record.label ?? `#${record.ID}`)
}

function kindLabel(kind?: string) {
  return kindLabels[String(kind ?? '')] ?? kind ?? '制作项'
}

function statusLabel(status?: string) {
  return statusMeta[String(status ?? '')]?.label ?? status ?? '未知'
}

function scriptBlockSourceLabel(block: ScriptBlockRecord) {
  const startLine = block.start_line || '?'
  const endLine = block.end_line || '?'
  return `剧本块 #${block.ID} · 行 ${startLine}-${endLine}`
}

function formatDuration(value?: number) {
  if (!value) return '时长未定'
  return `${value}s`
}
