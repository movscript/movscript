import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  BookOpenText,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  Eye,
  Film,
  FileText,
  GitBranch,
  Image,
  Layers3,
  MapPin,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import { listV2Entities, v2EntityConfig, type V2EntityRecord } from '@/api/v2Entities'
import { V2EntityCrudDialog } from '@/components/shared/V2EntityCrudDialog'
import { ContentFilterBar } from '@/pages/contents/components/ContentFilterBar'
import { readNumberParam, readStringParam, updateContentFilterParams, type ContentFilterKey } from '@/pages/contents/lib/contentFilters'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { Badge, Button, Progress as ProgressBar } from '@movscript/ui'

type StatusFilter = 'all' | 'ready' | 'attention' | 'confirmed'

type SegmentRecord = V2EntityRecord & {
  script_id?: number
  script_version_id?: number
  title?: string
  kind?: string
  summary?: string
  content?: string
  source_range?: string
  order?: number
  status?: string
}

type SceneMomentRecord = V2EntityRecord & {
  segment_id?: number
  title?: string
  description?: string
  time_text?: string
  location_text?: string
  condition_text?: string
  action_text?: string
  mood?: string
  order?: number
  status?: string
}

type RelatedRecord = V2EntityRecord & {
  segment_id?: number
  scene_moment_id?: number
  content_unit_id?: number
  owner_type?: string
  owner_id?: number
  creative_reference_id?: number
  title?: string
  name?: string
  label?: string
  description?: string
  content?: string
  visual_intent?: string
  prompt?: string
  prompt_hint?: string
  kind?: string
  status?: string
  priority?: string
  duration_sec?: number
  order?: number
}

type SegmentWorkspace = {
  segment: SegmentRecord
  sceneMoments: SceneMomentRecord[]
  storyboardLines: RelatedRecord[]
  contentUnits: RelatedRecord[]
  keyframes: RelatedRecord[]
  assetSlots: RelatedRecord[]
  references: RelatedRecord[]
  readiness: number
  totalDuration: number
}

const statusTone: Record<string, string> = {
  confirmed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  locked: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  accepted: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  attached: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  draft: 'bg-muted text-muted-foreground',
  candidate: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  generated: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  missing: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  review: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  ignored: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  rejected: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  blocked: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
}

const statusLabels: Record<string, string> = {
  confirmed: '已确认',
  active: '进行中',
  locked: '已锁定',
  accepted: '已采纳',
  attached: '已关联',
  draft: '草稿',
  candidate: '候选',
  generated: '已生成',
  missing: '缺素材',
  review: '待审',
  ignored: '忽略',
  rejected: '拒绝',
  blocked: '阻塞',
}

const sectionKinds: Record<string, string> = {
  section: '片段',
  scene: '场次',
  montage: '蒙太奇',
  narration: '旁白',
  product_showcase: '产品展示',
  title_card: '标题卡',
  transition: '转场',
}

function matchesStatus(status: StatusFilter, item: SegmentWorkspace) {
  const value = String(item.segment.status ?? '')
  if (status === 'all') return true
  if (status === 'ready') return item.readiness >= 70 && item.assetSlots.every((slot) => !isAssetGap(slot))
  if (status === 'attention') return item.readiness < 70 || item.assetSlots.some(isAssetGap) || ['draft', 'candidate', 'review', 'blocked'].includes(value)
  return value === status
}

function normalizeStatusFilter(value: string): StatusFilter {
  return ['ready', 'attention', 'confirmed'].includes(value) ? value as StatusFilter : 'all'
}

function titleOf(record?: RelatedRecord | SceneMomentRecord | SegmentRecord | null) {
  if (!record) return '未命名'
  return String(record.title ?? record.name ?? record.label ?? `#${record.ID}`)
}

function orderOf(record: { order?: number; ID: number }) {
  return typeof record.order === 'number' ? record.order : record.ID
}

function compareByOrder<T extends { order?: number; ID: number }>(a: T, b: T) {
  return orderOf(a) - orderOf(b)
}

function formatDuration(value?: number) {
  if (!value) return '-'
  return `${value}s`
}

export default function ScenesPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const segmentConfig = v2EntityConfig('segments')
  const [segmentDialogOpen, setSegmentDialogOpen] = useState(false)
  const [segmentDialogMode, setSegmentDialogMode] = useState<'create' | 'edit'>('create')
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedSegmentId = readNumberParam(searchParams, 'segment_id')
  const selectedSceneMomentId = readNumberParam(searchParams, 'scene_moment_id')
  const selectedContentUnitId = readNumberParam(searchParams, 'content_unit_id')
  const referenceFilterId = readNumberParam(searchParams, 'reference_id')
  const assetSlotFilterId = readNumberParam(searchParams, 'asset_slot_id')
  const query = readStringParam(searchParams, 'q')
  const statusFilter = normalizeStatusFilter(readStringParam(searchParams, 'status'))

  const segmentsQuery = useQuery({
    queryKey: ['v2-segment-workspace', projectId, 'segments'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('segments')) as Promise<SegmentRecord[]>,
    enabled: !!projectId,
  })
  const sceneMomentsQuery = useQuery({
    queryKey: ['v2-segment-workspace', projectId, 'sceneMoments'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('sceneMoments')) as Promise<SceneMomentRecord[]>,
    enabled: !!projectId,
  })
  const storyboardLinesQuery = useQuery({
    queryKey: ['v2-segment-workspace', projectId, 'storyboard-lines'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('storyboardLines')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const contentUnitsQuery = useQuery({
    queryKey: ['v2-segment-workspace', projectId, 'content-units'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('contentUnits')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const keyframesQuery = useQuery({
    queryKey: ['v2-segment-workspace', projectId, 'keyframes'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('keyframes')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const referencesQuery = useQuery({
    queryKey: ['v2-segment-workspace', projectId, 'creative-references'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('creativeReferences')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const usagesQuery = useQuery({
    queryKey: ['v2-segment-workspace', projectId, 'creative-reference-usages'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('creativeReferenceUsages')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const assetSlotsQuery = useQuery({
    queryKey: ['v2-segment-workspace', projectId, 'asset-slots'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('assetSlots')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })

  const segments = useMemo(() => (segmentsQuery.data ?? []).slice().sort(compareByOrder), [segmentsQuery.data])
  const sceneMoments = useMemo(() => (sceneMomentsQuery.data ?? []).slice().sort(compareByOrder), [sceneMomentsQuery.data])
  const storyboardLines = storyboardLinesQuery.data ?? []
  const contentUnits = contentUnitsQuery.data ?? []
  const keyframes = keyframesQuery.data ?? []
  const references = referencesQuery.data ?? []
  const usages = usagesQuery.data ?? []
  const assetSlots = assetSlotsQuery.data ?? []

  const referencesById = useMemo(() => new Map(references.map((item) => [item.ID, item])), [references])

  const segmentWorkspaces = useMemo(() => segments.map((segment) => {
    const segmentSceneMoments = sceneMoments.filter((item) => item.segment_id === segment.ID).sort(compareByOrder)
    const sceneMomentIds = new Set(segmentSceneMoments.map((item) => item.ID))
    const segmentContentUnits = contentUnits.filter((item) => (
      item.segment_id === segment.ID ||
      Boolean(item.scene_moment_id && sceneMomentIds.has(item.scene_moment_id))
    )).sort(compareByOrder)
    const contentUnitIds = new Set(segmentContentUnits.map((item) => item.ID))
    const segmentStoryboardLines = storyboardLines.filter((item) => (
      item.segment_id === segment.ID ||
      Boolean(item.scene_moment_id && sceneMomentIds.has(item.scene_moment_id))
    )).sort(compareByOrder)
    const segmentKeyframes = keyframes.filter((item) => (
      Boolean(item.scene_moment_id && sceneMomentIds.has(item.scene_moment_id)) ||
      Boolean(item.content_unit_id && contentUnitIds.has(item.content_unit_id))
    )).sort(compareByOrder)
    const segmentAssetSlots = assetSlots.filter((item) => (
      (item.owner_type === 'segment' && item.owner_id === segment.ID) ||
      Boolean(item.owner_type === 'scene_moment' && item.owner_id && sceneMomentIds.has(item.owner_id)) ||
      Boolean(item.owner_type === 'content_unit' && item.owner_id && contentUnitIds.has(item.owner_id))
    )).sort(compareByOrder)
    const segmentUsages = usages.filter((item) => (
      (item.owner_type === 'segment' && item.owner_id === segment.ID) ||
      Boolean(item.owner_type === 'scene_moment' && item.owner_id && sceneMomentIds.has(item.owner_id)) ||
      Boolean(item.owner_type === 'content_unit' && item.owner_id && contentUnitIds.has(item.owner_id))
    ))
    const segmentReferences = dedupeRecords(segmentUsages
      .map((usage) => usage.creative_reference_id ? referencesById.get(usage.creative_reference_id) : undefined)
      .filter(Boolean) as RelatedRecord[])
    const totalDuration = segmentContentUnits.reduce((sum, item) => sum + (item.duration_sec ?? 0), 0)

    return {
      segment,
      sceneMoments: segmentSceneMoments,
      storyboardLines: segmentStoryboardLines,
      contentUnits: segmentContentUnits,
      keyframes: segmentKeyframes,
      assetSlots: segmentAssetSlots,
      references: segmentReferences,
      readiness: calculateReadiness(segment, segmentSceneMoments, segmentContentUnits, segmentReferences, segmentAssetSlots),
      totalDuration,
    }
  }), [assetSlots, contentUnits, keyframes, referencesById, sceneMoments, segments, storyboardLines, usages])

  const visibleSegments = useMemo(() => {
    const q = query.trim().toLowerCase()
    return segmentWorkspaces.filter((item) => {
      if (selectedSegmentId && item.segment.ID !== selectedSegmentId) return false
      if (selectedSceneMomentId && !item.sceneMoments.some((sceneMoment) => sceneMoment.ID === selectedSceneMomentId)) return false
      if (selectedContentUnitId && !item.contentUnits.some((unit) => unit.ID === selectedContentUnitId)) return false
      if (referenceFilterId && !item.references.some((reference) => reference.ID === referenceFilterId)) return false
      if (assetSlotFilterId && !item.assetSlots.some((slot) => slot.ID === assetSlotFilterId)) return false
      const haystack = [
        titleOf(item.segment),
        item.segment.summary,
        item.segment.content,
        item.sceneMoments.map((sceneMoment) => [titleOf(sceneMoment), sceneMoment.description, sceneMoment.action_text, sceneMoment.location_text, sceneMoment.mood].join(' ')).join(' '),
        item.contentUnits.map((unit) => [titleOf(unit), unit.description, unit.prompt].join(' ')).join(' '),
        item.references.map((reference) => titleOf(reference)).join(' '),
        item.assetSlots.map((slot) => titleOf(slot)).join(' '),
      ].filter(Boolean).join(' ').toLowerCase()
      return matchesStatus(statusFilter, item) && (!q || haystack.includes(q))
    })
  }, [assetSlotFilterId, query, referenceFilterId, segmentWorkspaces, selectedContentUnitId, selectedSceneMomentId, selectedSegmentId, statusFilter])

  const selectedSegment = useMemo(() => {
    if (selectedSegmentId) {
      const selected = segmentWorkspaces.find((item) => item.segment.ID === selectedSegmentId)
      if (selected) return selected
    }
    return visibleSegments[0] ?? segmentWorkspaces[0] ?? null
  }, [segmentWorkspaces, selectedSegmentId, visibleSegments])

  const selectedSceneMoment = useMemo(() => {
    if (!selectedSegment) return null
    if (selectedSceneMomentId) {
      const selected = selectedSegment.sceneMoments.find((item) => item.ID === selectedSceneMomentId)
      if (selected) return selected
    }
    return selectedSegment.sceneMoments[0] ?? null
  }, [selectedSceneMomentId, selectedSegment])

  const selectedContentUnit = useMemo(() => {
    if (!selectedSegment) return null
    if (selectedContentUnitId) {
      const selected = selectedSegment.contentUnits.find((item) => item.ID === selectedContentUnitId)
      if (selected) return selected
    }
    if (selectedSceneMoment) {
      return selectedSegment.contentUnits.find((item) => item.scene_moment_id === selectedSceneMoment.ID) ?? selectedSegment.contentUnits[0] ?? null
    }
    return selectedSegment.contentUnits[0] ?? null
  }, [selectedContentUnitId, selectedSceneMoment, selectedSegment])

  const selectedSceneMomentKey = selectedSceneMoment?.ID
  const selectedMomentStoryboardLines = selectedSegment?.storyboardLines.filter((item) => item.scene_moment_id === selectedSceneMomentKey) ?? []
  const selectedMomentContentUnits = selectedSegment?.contentUnits.filter((item) => item.scene_moment_id === selectedSceneMomentKey) ?? []
  const selectedMomentKeyframes = selectedSegment?.keyframes.filter((item) => item.scene_moment_id === selectedSceneMomentKey) ?? []
  const selectedMomentAssetSlots = selectedSegment?.assetSlots.filter((item) => item.owner_type === 'scene_moment' && item.owner_id === selectedSceneMomentKey) ?? []
  const readyCount = segmentWorkspaces.filter((item) => item.readiness >= 70 && item.assetSlots.every((slot) => !isAssetGap(slot))).length
  const attentionCount = segmentWorkspaces.filter((item) => item.readiness < 70 || item.assetSlots.some(isAssetGap)).length
  const averageReadiness = segmentWorkspaces.length
    ? Math.round(segmentWorkspaces.reduce((sum, item) => sum + item.readiness, 0) / segmentWorkspaces.length)
    : 0
  const totalDuration = segmentWorkspaces.reduce((sum, item) => sum + item.totalDuration, 0)
  const isLoading = segmentsQuery.isLoading || sceneMomentsQuery.isLoading
  const isFetching = segmentsQuery.isFetching || sceneMomentsQuery.isFetching || storyboardLinesQuery.isFetching || contentUnitsQuery.isFetching || keyframesQuery.isFetching || referencesQuery.isFetching || usagesQuery.isFetching || assetSlotsQuery.isFetching

  function refreshAll() {
    segmentsQuery.refetch()
    sceneMomentsQuery.refetch()
    storyboardLinesQuery.refetch()
    contentUnitsQuery.refetch()
    keyframesQuery.refetch()
    referencesQuery.refetch()
    usagesQuery.refetch()
    assetSlotsQuery.refetch()
  }

  function setFilter(updates: Partial<Record<ContentFilterKey, string | number | null | undefined>>) {
    setSearchParams(updateContentFilterParams(searchParams, updates), { replace: true })
  }

  function selectSegment(segmentId: number) {
    setFilter({ segment_id: segmentId, scene_moment_id: null, content_unit_id: null })
  }

  function selectSceneMoment(sceneMomentId: number) {
    const nextContentUnit = selectedSegment?.contentUnits.find((item) => item.scene_moment_id === sceneMomentId)
    setFilter({
      segment_id: selectedSegment?.segment.ID,
      scene_moment_id: sceneMomentId,
      content_unit_id: nextContentUnit?.ID ?? null,
    })
  }

  function startCreateSegment() {
    setSegmentDialogMode('create')
    setSegmentDialogOpen(true)
  }

  function startEditSegment() {
    if (!selectedSegment) return
    setSegmentDialogMode('edit')
    setSegmentDialogOpen(true)
  }

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="min-w-[1240px] space-y-5 p-5">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Database size={14} />
              <span>{project?.name ?? '当前项目'}</span>
              <ChevronRight size={13} />
              <span>内容区</span>
              <ChevronRight size={13} />
              <span>片段</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">片段</h1>
            <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
              片段属于一个项目，是内容设计的上层容器；一个片段持有多个情节，并汇总内容单元、创作资料、素材位和关键帧。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={startEditSegment} disabled={!selectedSegment}>
              <Pencil size={15} />
              编辑片段
            </Button>
            <Button className="gap-2" onClick={startCreateSegment}>
              <Plus size={15} />
              新建片段
            </Button>
            <Button variant="outline" className="gap-2" onClick={refreshAll} loading={isFetching}>
              <RefreshCcw size={15} />
              刷新
            </Button>
            <Button variant="outline" className="gap-2">
              <GitBranch size={15} />
              查看关系
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-4 gap-3">
          <MetricCard icon={BookOpenText} label="片段" value={segmentWorkspaces.length} detail={`${visibleSegments.length} 个符合当前筛选`} tone="text-cyan-600" />
          <MetricCard icon={Film} label="情节" value={sceneMoments.length} detail="片段内部的叙事上下文" tone="text-teal-600" />
          <MetricCard icon={ShieldCheck} label="可推进" value={readyCount} detail={`${averageReadiness}% 平均准备度`} tone="text-emerald-600" />
          <MetricCard icon={AlertTriangle} label="待处理" value={attentionCount} detail={`估算总时长 ${formatDuration(totalDuration)}`} tone="text-amber-600" />
        </section>

        <section className="grid grid-cols-[250px_minmax(0,1fr)_350px] gap-4">
          <aside className="space-y-4">
            <Panel title="片段状态" icon={Layers3}>
              <div className="space-y-2">
                <CheckRow ok={readyCount > 0} label="可推进片段" detail={`${readyCount} 个片段准备度较高`} />
                <CheckRow ok={attentionCount === 0} label="待处理片段" detail={attentionCount > 0 ? `${attentionCount} 个片段需要补内容或素材` : '当前没有待处理片段'} />
                <CheckRow ok={segmentWorkspaces.some((item) => !item.segment.script_version_id)} label="支持独立片段" detail="片段可不绑定剧本版本，后续按需补引用" />
              </div>
            </Panel>
          </aside>

          <main className="min-w-0 space-y-4">
            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">片段清单</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">以卡片方式管理项目片段；片段可独立创建，也可选填剧本版本作为来源引用。</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{visibleSegments.length} / {segmentWorkspaces.length}</Badge>
              </div>

              <div className="border-b border-border p-4">
                <ContentFilterBar
                  query={query}
                  onQueryChange={(value) => setFilter({ q: value })}
                  queryPlaceholder="搜索片段、情节、内容或素材"
                  filters={[{
                    id: 'status',
                    label: '状态',
                    value: statusFilter,
                    onChange: (value) => setFilter({ status: value }),
                    options: [
                      { value: 'all', label: '全部片段', count: segmentWorkspaces.length },
                      { value: 'ready', label: '可推进', count: readyCount },
                      { value: 'attention', label: '待处理', count: attentionCount },
                      { value: 'confirmed', label: '已确认', count: segmentWorkspaces.filter((item) => item.segment.status === 'confirmed').length },
                    ],
                  }]}
                  chips={[
                    selectedSegmentId ? { id: 'segment', label: `片段 #${selectedSegmentId}`, onRemove: () => setFilter({ segment_id: null }) } : null,
                    selectedSceneMomentId ? { id: 'scene', label: `情节 #${selectedSceneMomentId}`, onRemove: () => setFilter({ scene_moment_id: null }) } : null,
                    selectedContentUnitId ? { id: 'content', label: `内容 #${selectedContentUnitId}`, onRemove: () => setFilter({ content_unit_id: null }) } : null,
                    referenceFilterId ? { id: 'reference', label: `资料 #${referenceFilterId}`, onRemove: () => setFilter({ reference_id: null }) } : null,
                    assetSlotFilterId ? { id: 'asset', label: `素材位 #${assetSlotFilterId}`, onRemove: () => setFilter({ asset_slot_id: null }) } : null,
                  ].filter(Boolean) as Array<{ id: string; label: string; onRemove: () => void }>}
                  resultCount={visibleSegments.length}
                  totalCount={segmentWorkspaces.length}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 p-4">
                {isLoading ? (
                  <div className="col-span-2">
                    <EmptyState title="正在加载片段" detail="读取片段和关联对象" compact />
                  </div>
                ) : visibleSegments.length === 0 ? (
                  <div className="col-span-2">
                    <EmptyState title="暂无片段" detail="可以直接新建片段，剧本版本只是可选来源引用" compact />
                  </div>
                ) : (
                  visibleSegments.map((item) => (
                    <SegmentButton
                      key={item.segment.ID}
                      item={item}
                      selected={selectedSegment?.segment.ID === item.segment.ID}
                      onClick={() => selectSegment(item.segment.ID)}
                    />
                  ))
                )}
              </div>
            </section>

            <SegmentHero item={selectedSegment} />

            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">情节与内容设计</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">选择片段后，在这里查看它持有的多个情节，以及每个情节关联的内容设计。</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{selectedSegment ? `${selectedSegment.sceneMoments.length} 情节 / ${selectedSegment.contentUnits.length} 内容` : '-'}</Badge>
              </div>

              {!selectedSegment ? (
                <EmptyState title="未选择片段" detail="从片段清单选择一个片段查看内容设计" />
              ) : (
                <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-4 p-4">
                  <div className="space-y-3">
                    <SectionTitle icon={Film} title="片段持有的情节" count={selectedSegment.sceneMoments.length} />
                    {selectedSegment.sceneMoments.length === 0 ? (
                      <EmptyState title="暂无情节" detail="片段还没有拆分出情节" compact />
                    ) : (
                      selectedSegment.sceneMoments.map((sceneMoment) => (
                        <SceneMomentRow
                          key={sceneMoment.ID}
                          sceneMoment={sceneMoment}
                          selected={selectedSceneMoment?.ID === sceneMoment.ID}
                          contentCount={selectedSegment.contentUnits.filter((item) => item.scene_moment_id === sceneMoment.ID).length}
                          assetGapCount={selectedSegment.assetSlots.filter((item) => item.owner_type === 'scene_moment' && item.owner_id === sceneMoment.ID && isAssetGap(item)).length}
                          onSelect={() => selectSceneMoment(sceneMoment.ID)}
                        />
                      ))
                    )}
                  </div>

                  <div className="space-y-3">
                    <SectionTitle icon={Boxes} title="内容设计" count={selectedSegment.contentUnits.length} />
                    {selectedSegment.contentUnits.length === 0 ? (
                      <EmptyState title="暂无内容设计" detail="确认情节后可生成镜头、字幕卡、旁白或转场内容" compact />
                    ) : (
                      selectedSegment.contentUnits.map((item) => (
                        <ContentUnitRow
                          key={item.ID}
                          item={item}
                          selected={selectedContentUnit?.ID === item.ID}
                          sceneMoment={selectedSegment.sceneMoments.find((sceneMoment) => sceneMoment.ID === item.scene_moment_id)}
                          assetCount={selectedSegment.assetSlots.filter((slot) => slot.owner_type === 'content_unit' && slot.owner_id === item.ID).length}
                          keyframeCount={selectedSegment.keyframes.filter((keyframe) => keyframe.content_unit_id === item.ID).length}
                          onSelect={() => setFilter({ segment_id: selectedSegment.segment.ID, scene_moment_id: item.scene_moment_id ?? null, content_unit_id: item.ID })}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}
            </section>
          </main>

          <aside className="space-y-4">
            <SegmentDetail item={selectedSegment} />
            <SceneMomentDetail sceneMoment={selectedSceneMoment} segment={selectedSegment?.segment ?? null} />
            <ContentUnitDetail contentUnit={selectedContentUnit} sceneMoment={selectedSceneMoment} />
            <RelatedPanel title="资料引用" icon={Sparkles} records={selectedSegment?.references ?? []} empty="当前片段暂无资料引用" />
            <RelatedPanel title="素材需求" icon={PackageCheck} records={selectedSegment?.assetSlots ?? []} empty="当前片段暂无素材位" />
            <RelatedPanel title="关键帧" icon={Image} records={selectedMomentKeyframes} empty="当前情节暂无关键帧" />
            <RelatedPanel title="情节素材" icon={PackageCheck} records={selectedMomentAssetSlots} empty="当前情节暂无素材位" />
            <RelatedPanel title="情节分镜" icon={FileText} records={selectedMomentStoryboardLines} empty="当前情节暂无分镜行" />
            <RelatedPanel title="情节内容" icon={Boxes} records={selectedMomentContentUnits} empty="当前情节暂无内容单元" />
          </aside>
        </section>
      </div>
      <V2EntityCrudDialog
        open={segmentDialogOpen}
        mode={segmentDialogMode}
        projectId={projectId}
        config={segmentConfig}
        record={segmentDialogMode === 'edit' ? selectedSegment?.segment : null}
        defaults={{ order: segmentWorkspaces.length + 1, status: 'draft', kind: 'section' }}
        queryKey={['v2-segment-workspace', projectId]}
        onOpenChange={setSegmentDialogOpen}
        onSaved={(record) => setFilter({ segment_id: record.ID })}
        onDeleted={() => setFilter({ segment_id: null, scene_moment_id: null, content_unit_id: null })}
      />
    </div>
  )
}

function SegmentButton({ item, selected, onClick }: { item: SegmentWorkspace; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-lg border bg-background p-3 text-left transition-all hover:border-primary/50 hover:shadow-sm',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
              <BookOpenText size={15} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{titleOf(item.segment)}</p>
              <p className="truncate text-[11px] text-muted-foreground">{sectionKinds[String(item.segment.kind ?? '')] ?? item.segment.kind ?? '片段'}</p>
            </div>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.segment.summary || item.segment.content || '暂无片段摘要'}</p>
        </div>
        <StatusBadge status={item.segment.status ?? 'draft'} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat label="情节" value={item.sceneMoments.length} />
        <MiniStat label="内容" value={item.contentUnits.length} />
        <MiniStat label="素材" value={item.assetSlots.length} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <ProgressBar value={item.readiness} className="h-1.5 flex-1" />
        <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">{item.readiness}%</span>
      </div>
    </button>
  )
}

function SegmentHero({ item }: { item: SegmentWorkspace | null }) {
  if (!item) {
    return (
      <section className="rounded-lg border border-border bg-card">
        <EmptyState title="未选择片段" detail="从左侧片段列表选择一个内容容器" />
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border bg-gradient-to-br from-cyan-500/15 via-teal-500/10 to-indigo-500/10 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
                <BookOpenText size={19} />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{sectionKinds[String(item.segment.kind ?? '')] ?? item.segment.kind ?? '片段'} · {item.segment.source_range || '项目片段'}</p>
                <h2 className="mt-1 truncate text-xl font-semibold text-foreground">{titleOf(item.segment)}</h2>
              </div>
            </div>
            <p className="mt-4 max-w-4xl text-sm leading-6 text-muted-foreground">{item.segment.summary || item.segment.content || '暂无片段摘要。'}</p>
          </div>
          <div className="shrink-0 text-right">
            <StatusBadge status={item.segment.status ?? 'draft'} />
            <p className="mt-3 text-3xl font-semibold tabular-nums text-foreground">{item.readiness}%</p>
            <p className="text-xs text-muted-foreground">片段准备度</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-3 p-4">
        <HeroStat icon={Film} label="情节" value={item.sceneMoments.length} />
        <HeroStat icon={Boxes} label="内容设计" value={item.contentUnits.length} />
        <HeroStat icon={Sparkles} label="资料引用" value={item.references.length} />
        <HeroStat icon={PackageCheck} label="素材缺口" value={item.assetSlots.filter(isAssetGap).length} tone={item.assetSlots.some(isAssetGap) ? 'text-amber-600' : 'text-emerald-600'} />
        <HeroStat icon={Clock3} label="估算时长" value={formatDuration(item.totalDuration)} />
      </div>
    </section>
  )
}

function SceneMomentRow({
  sceneMoment,
  selected,
  contentCount,
  assetGapCount,
  onSelect,
}: {
  sceneMoment: SceneMomentRecord
  selected: boolean
  contentCount: number
  assetGapCount: number
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border bg-background p-3 text-left transition-colors hover:border-primary/50',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{titleOf(sceneMoment)}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{sceneMoment.description || sceneMoment.action_text || sceneMoment.condition_text || '暂无情节描述'}</p>
        </div>
        <StatusBadge status={sceneMoment.status ?? 'draft'} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <InfoChip icon={Clock3} label={sceneMoment.time_text || '时间未定'} />
        <InfoChip icon={MapPin} label={sceneMoment.location_text || '地点未定'} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline" className="text-[10px]">内容 {contentCount}</Badge>
        {sceneMoment.mood ? <Badge variant="outline" className="text-[10px]">{sceneMoment.mood}</Badge> : null}
        {assetGapCount > 0 ? <Badge variant="warning" className="text-[10px]">缺口 {assetGapCount}</Badge> : null}
      </div>
    </button>
  )
}

function ContentUnitRow({
  item,
  selected,
  sceneMoment,
  assetCount,
  keyframeCount,
  onSelect,
}: {
  item: RelatedRecord
  selected: boolean
  sceneMoment?: SceneMomentRecord
  assetCount: number
  keyframeCount: number
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border bg-background p-3 text-left transition-colors hover:border-primary/50',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{titleOf(item)}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.description || item.prompt || '暂无内容描述或提示词'}</p>
        </div>
        <StatusBadge status={item.status ?? 'draft'} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline" className="text-[10px]">{item.kind ?? '内容单元'}</Badge>
        <Badge variant="outline" className="text-[10px]">情节 {sceneMoment ? titleOf(sceneMoment) : '未绑定'}</Badge>
        <Badge variant="outline" className="text-[10px]">素材 {assetCount}</Badge>
        <Badge variant="outline" className="text-[10px]">关键帧 {keyframeCount}</Badge>
        {item.duration_sec ? <Badge variant="outline" className="text-[10px]">{formatDuration(item.duration_sec)}</Badge> : null}
      </div>
    </button>
  )
}

function SegmentDetail({ item }: { item: SegmentWorkspace | null }) {
  if (!item) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <EmptyState title="未选择片段" detail="选择片段后查看容器状态" compact />
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border bg-gradient-to-br from-cyan-500/15 to-teal-500/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
            <Eye size={19} />
          </span>
          <StatusBadge status={item.segment.status ?? 'draft'} />
        </div>
        <h2 className="mt-3 text-lg font-semibold text-foreground">{titleOf(item.segment)}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{sectionKinds[String(item.segment.kind ?? '')] ?? item.segment.kind ?? '片段'} · {formatDuration(item.totalDuration)}</p>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">片段准备度</span>
            <span className="font-medium tabular-nums text-foreground">{item.readiness}%</span>
          </div>
          <ProgressBar value={item.readiness} className="h-2" />
        </div>
        <CheckRow ok={Boolean(item.segment.summary || item.segment.content)} label="片段内容明确" detail={item.segment.summary || item.segment.content || '需要片段摘要或原文内容'} />
        <CheckRow ok={item.sceneMoments.length > 0} label="持有情节" detail={`${item.sceneMoments.length} 个情节`} />
        <CheckRow ok={item.contentUnits.length > 0} label="已有内容设计" detail={`${item.contentUnits.length} 个内容单元`} />
        <CheckRow ok={item.references.length > 0} label="已引用资料" detail={`${item.references.length} 个创作资料`} />
        <CheckRow ok={!item.assetSlots.some(isAssetGap)} label="素材缺口可控" detail={item.assetSlots.some(isAssetGap) ? `${item.assetSlots.filter(isAssetGap).length} 个缺口待补齐` : `${item.assetSlots.length} 个素材位`} />
      </div>
    </section>
  )
}

function SceneMomentDetail({ sceneMoment, segment }: { sceneMoment: SceneMomentRecord | null; segment: SegmentRecord | null }) {
  if (!sceneMoment) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <EmptyState title="未选择情节" detail="从中间情节列表选择一个对象" compact />
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Film size={14} className="text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">当前情节</p>
        </div>
        <StatusBadge status={sceneMoment.status ?? 'draft'} />
      </div>
      <div className="space-y-3 p-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{titleOf(sceneMoment)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{segment ? `来自 ${titleOf(segment)}` : '未绑定片段'}</p>
        </div>
        <InfoBlock label="描述" value={sceneMoment.description || '暂无描述'} />
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="时间" value={sceneMoment.time_text || '-'} />
          <MiniStat label="地点" value={sceneMoment.location_text || '-'} />
        </div>
        <InfoBlock label="条件" value={sceneMoment.condition_text || '-'} />
        <InfoBlock label="动作" value={sceneMoment.action_text || '-'} />
        <InfoBlock label="情绪" value={sceneMoment.mood || '-'} />
      </div>
    </section>
  )
}

function ContentUnitDetail({ contentUnit, sceneMoment }: { contentUnit: RelatedRecord | null; sceneMoment: SceneMomentRecord | null }) {
  if (!contentUnit) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <EmptyState title="未选择内容" detail="从内容设计列表选择一个对象" compact />
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Boxes size={14} className="text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">当前内容设计</p>
        </div>
        <StatusBadge status={contentUnit.status ?? 'draft'} />
      </div>
      <div className="space-y-3 p-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{titleOf(contentUnit)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{contentUnit.kind ?? '内容单元'} · {formatDuration(contentUnit.duration_sec)}</p>
        </div>
        <InfoBlock label="所属情节" value={sceneMoment ? titleOf(sceneMoment) : '未绑定情节'} />
        <InfoBlock label="生成提示" value={contentUnit.prompt || contentUnit.description || '暂无提示词'} />
      </div>
    </section>
  )
}

function MetricCard({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: string | number; detail: string; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
          <Icon size={18} className={tone} />
        </span>
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Icon size={14} className="text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <div className="p-3">{children}</div>
    </section>
  )
}

function RelatedPanel({ title, icon: Icon, records, empty }: { title: string; icon: LucideIcon; records: RelatedRecord[]; empty: string }) {
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
          records.slice(0, 5).map((record) => <RelatedRow key={record.ID} record={record} />)
        )}
      </div>
    </section>
  )
}

function RelatedRow({ record }: { record: RelatedRecord }) {
  const detail = record.description || record.content || record.visual_intent || record.prompt || record.prompt_hint || record.kind || `ID ${record.ID}`
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">{titleOf(record)}</p>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{detail}</p>
        </div>
        <StatusBadge status={record.status ?? record.priority ?? 'draft'} />
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {record.kind ? <span>{record.kind}</span> : null}
        {record.duration_sec ? <span>{formatDuration(record.duration_sec)}</span> : null}
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-foreground">{value}</p>
    </div>
  )
}

function HeroStat({ icon: Icon, label, value, tone = 'text-foreground' }: { icon: LucideIcon; label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon size={14} />
        <span>{label}</span>
      </div>
      <p className={cn('mt-2 truncate text-lg font-semibold tabular-nums', tone)}>{value}</p>
    </div>
  )
}

function SectionTitle({ icon: Icon, title, count }: { icon: LucideIcon; title: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <Badge variant="outline" className="text-[10px]">{count}</Badge>
    </div>
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

function InfoChip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5">
      <Icon size={12} className="shrink-0 text-muted-foreground" />
      <span className="truncate text-[11px] text-muted-foreground">{label}</span>
    </div>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant="secondary" className={cn('shrink-0 text-[10px]', statusTone[status] ?? 'bg-muted text-muted-foreground')}>{statusLabel(status)}</Badge>
}

function EmptyState({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'min-h-32 p-4' : 'min-h-[320px] p-8')}>
      <Film size={24} className="text-muted-foreground" />
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function calculateReadiness(
  segment: SegmentRecord,
  sceneMoments: SceneMomentRecord[],
  contentUnits: RelatedRecord[],
  references: RelatedRecord[],
  assetSlots: RelatedRecord[],
) {
  let score = 0
  if (segment.summary || segment.content) score += 20
  if (sceneMoments.length > 0) score += 25
  if (contentUnits.length > 0) score += 25
  if (references.length > 0) score += 15
  const gapCount = assetSlots.filter(isAssetGap).length
  if (assetSlots.length === 0 || gapCount === 0) score += 15
  else score += Math.max(0, 15 - gapCount * 5)
  return Math.max(0, Math.min(100, Math.round(score)))
}

function dedupeRecords<T extends { ID: number }>(records: T[]) {
  const seen = new Set<number>()
  return records.filter((record) => {
    if (seen.has(record.ID)) return false
    seen.add(record.ID)
    return true
  })
}

function isAssetGap(record: RelatedRecord) {
  return ['missing', 'blocked'].includes(String(record.status ?? ''))
}

function statusLabel(status?: string) {
  return statusLabels[String(status ?? '')] ?? status ?? '未知'
}
