import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  BookOpenText,
  Boxes,
  ChevronRight,
  Clapperboard,
  Clock3,
  Database,
  Film,
  GitBranch,
  MapPin,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  ShieldCheck,
  Sparkles,
  ScrollText,
  Trash2,
  X,
} from 'lucide-react'

import {
  createSemanticEntity,
  deleteSemanticEntity,
  getSourceLockStatus,
  listSemanticEntities,
  semanticEntityConfig,
  updateSemanticEntity,
  type SemanticEntityConfig,
  type SemanticEntityField,
  type SemanticEntityPayload,
  type SemanticEntityRecord,
  type SourceLockStatus,
} from '@/api/semanticEntities'
import { ContentWorkspaceLayout } from '@/components/layout/ContentWorkspaceLayout'
import { PreviewDrawer } from '@/components/preview/PreviewDrawer'
import { AppEmptyState, AppMetricCard } from '@/components/app/AppPage'
import { SemanticStatusBadge } from '@/components/app/SemanticStatusBadge'
import { ContentFilterBar } from '@/pages/contents/components/ContentFilterBar'
import { readNumberParam, readStringParam, updateContentFilterParams, type ContentFilterKey } from '@/pages/contents/lib/contentFilters'
import { isGeneratedKeyframeCandidateRecord } from '@/lib/agentGeneratedResourceBinding'
import { productionIdentifier, sceneIdentifier, unitIdentifier } from '@/lib/productionIdentifiers'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import { Badge, Button, Input, Label, Progress as ProgressBar, Textarea } from '@movscript/ui'

type StatusFilter = 'all' | 'ready' | 'attention' | 'confirmed'

type SegmentRecord = SemanticEntityRecord & {
  production_id?: number
  text_block_id?: number
  script_block_id?: number
  title?: string
  kind?: string
  summary?: string
  content?: string
  order?: number
  status?: string
}

type SceneMomentRecord = SemanticEntityRecord & {
  production_id?: number
  segment_id?: number
  scene_code?: string
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

type RelatedRecord = SemanticEntityRecord & {
  segment_id?: number
  scene_moment_id?: number
  content_unit_id?: number
  unit_code?: string
  script_block_id?: number
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

type SegmentWorkspace = {
  segment: SegmentRecord
  scriptBlock: ScriptBlockRecord | null
  sceneMoments: SceneMomentRecord[]
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
  missing: '缺素材需求',
  review: '待审',
  ignored: '忽略',
  rejected: '拒绝',
  blocked: '阻塞',
}

const sectionKinds: Record<string, string> = {
  emotional_function: '情绪功能',
  rhythm_shift: '节奏变化',
  dramatic_function: '戏剧功能',
  setup: '铺垫',
  escalation: '升级',
  release: '释放',
  reversal: '反转',
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

export default function SegmentsPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const segmentConfig = semanticEntityConfig('segments')
  const [creatingSegment, setCreatingSegment] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedSegmentId = readNumberParam(searchParams, 'segment_id')
  const selectedSceneMomentId = readNumberParam(searchParams, 'scene_moment_id')
  const selectedContentUnitId = readNumberParam(searchParams, 'content_unit_id')
  const referenceFilterId = readNumberParam(searchParams, 'reference_id')
  const assetSlotFilterId = readNumberParam(searchParams, 'asset_slot_id')
  const query = readStringParam(searchParams, 'q')
  const statusFilter = normalizeStatusFilter(readStringParam(searchParams, 'status'))

  const segmentsQuery = useQuery({
    queryKey: ['semantic-segment-workspace', projectId, 'segments'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('segments')) as Promise<SegmentRecord[]>,
    enabled: !!projectId,
  })
  const scriptBlocksQuery = useQuery({
    queryKey: ['semantic-segment-workspace', projectId, 'script-blocks'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('scriptBlocks')) as Promise<ScriptBlockRecord[]>,
    enabled: !!projectId,
  })
  const sceneMomentsQuery = useQuery({
    queryKey: ['semantic-segment-workspace', projectId, 'sceneMoments'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('sceneMoments')) as Promise<SceneMomentRecord[]>,
    enabled: !!projectId,
  })
  const contentUnitsQuery = useQuery({
    queryKey: ['semantic-segment-workspace', projectId, 'content-units'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('contentUnits')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const keyframesQuery = useQuery({
    queryKey: ['semantic-segment-workspace', projectId, 'keyframes'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('keyframes')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const referencesQuery = useQuery({
    queryKey: ['semantic-segment-workspace', projectId, 'creative-references'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('creativeReferences')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const usagesQuery = useQuery({
    queryKey: ['semantic-segment-workspace', projectId, 'creative-reference-usages'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('creativeReferenceUsages')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const assetSlotsQuery = useQuery({
    queryKey: ['semantic-segment-workspace', projectId, 'asset-slots'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('assetSlots')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })

  const segments = useMemo(() => (segmentsQuery.data ?? []).slice().sort(compareByOrder), [segmentsQuery.data])
  const scriptBlocks = scriptBlocksQuery.data ?? []
  const sceneMoments = useMemo(() => (sceneMomentsQuery.data ?? []).slice().sort(compareByOrder), [sceneMomentsQuery.data])
  const contentUnits = contentUnitsQuery.data ?? []
  const keyframes = useMemo(
    () => (keyframesQuery.data ?? []).filter((item) => !isGeneratedKeyframeCandidateRecord(item)),
    [keyframesQuery.data],
  )
  const references = referencesQuery.data ?? []
  const usages = usagesQuery.data ?? []
  const assetSlots = assetSlotsQuery.data ?? []

  const referencesById = useMemo(() => new Map(references.map((item) => [item.ID, item])), [references])
  const scriptBlocksById = useMemo(() => new Map(scriptBlocks.map((item) => [item.ID, item])), [scriptBlocks])

  const segmentWorkspaces = useMemo(() => segments.map((segment) => {
    const scriptBlock = segment.script_block_id ? scriptBlocksById.get(segment.script_block_id) ?? null : null
    const segmentSceneMoments = sceneMoments.filter((item) => item.segment_id === segment.ID).sort(compareByOrder)
    const sceneMomentIds = new Set(segmentSceneMoments.map((item) => item.ID))
    const segmentContentUnits = contentUnits.filter((item) => (
      item.segment_id === segment.ID ||
      Boolean(item.scene_moment_id && sceneMomentIds.has(item.scene_moment_id))
    )).sort(compareByOrder)
    const contentUnitIds = new Set(segmentContentUnits.map((item) => item.ID))
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
      scriptBlock,
      sceneMoments: segmentSceneMoments,
      contentUnits: segmentContentUnits,
      keyframes: segmentKeyframes,
      assetSlots: segmentAssetSlots,
      references: segmentReferences,
      readiness: calculateReadiness(segment, segmentSceneMoments, segmentContentUnits, segmentReferences, segmentAssetSlots),
      totalDuration,
    }
  }), [assetSlots, contentUnits, keyframes, referencesById, sceneMoments, scriptBlocksById, segments, usages])

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
        item.scriptBlock?.content,
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
  const selectedContentUnitScriptBlock = selectedContentUnit?.script_block_id
    ? scriptBlocksById.get(selectedContentUnit.script_block_id) ?? null
    : null

  const readyCount = segmentWorkspaces.filter((item) => item.readiness >= 70 && item.assetSlots.every((slot) => !isAssetGap(slot))).length
  const attentionCount = segmentWorkspaces.filter((item) => item.readiness < 70 || item.assetSlots.some(isAssetGap)).length
  const averageReadiness = segmentWorkspaces.length
    ? Math.round(segmentWorkspaces.reduce((sum, item) => sum + item.readiness, 0) / segmentWorkspaces.length)
    : 0
  const totalDuration = segmentWorkspaces.reduce((sum, item) => sum + item.totalDuration, 0)
  const isLoading = segmentsQuery.isLoading || sceneMomentsQuery.isLoading
  const isFetching = segmentsQuery.isFetching || scriptBlocksQuery.isFetching || sceneMomentsQuery.isFetching || contentUnitsQuery.isFetching || keyframesQuery.isFetching || referencesQuery.isFetching || usagesQuery.isFetching || assetSlotsQuery.isFetching

  function refreshAll() {
    segmentsQuery.refetch()
    scriptBlocksQuery.refetch()
    sceneMomentsQuery.refetch()
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
    setCreatingSegment(true)
  }

  return (
    <>
      <ContentWorkspaceLayout
        header={(
          <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 type-label text-muted-foreground">
              <Database size={14} />
              <span>{project?.name ?? '当前项目'}</span>
              <ChevronRight size={13} />
              <span>生产对象</span>
              <ChevronRight size={13} />
              <span>编排段</span>
            </div>
            <h1 className="mt-2 type-page-title font-semibold tracking-normal text-foreground">编排段</h1>
            <p className="mt-1 max-w-4xl type-body leading-relaxed text-muted-foreground">
              编排段定义本集内部的情绪、节奏和戏剧功能；一个编排段持有多个情景，并汇总制作项、设定资料、素材需求和预览画面。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button className="gap-2" onClick={startCreateSegment}>
              <Plus size={15} />
              新建编排段
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
        )}
        overview={(
          <section className="grid grid-cols-4 gap-3">
          <MetricCard icon={BookOpenText} label="编排段" value={segmentWorkspaces.length} detail={`${visibleSegments.length} 个符合当前筛选`} tone="text-cyan-600" />
          <MetricCard icon={Film} label="情景" value={sceneMoments.length} detail="编排段内部的具体时空与动作上下文" tone="text-teal-600" />
          <MetricCard icon={ShieldCheck} label="可推进" value={readyCount} detail={`${averageReadiness}% 平均准备度`} tone="text-emerald-600" />
          <MetricCard icon={AlertTriangle} label="待处理" value={attentionCount} detail={`估算总时长 ${formatDuration(totalDuration)}`} tone="text-amber-600" />
          </section>
        )}
        filters={(
          <ContentFilterBar
            query={query}
            onQueryChange={(value) => setFilter({ q: value })}
            queryPlaceholder="搜索编排段、情景、制作项或素材需求"
            filters={[{
              id: 'status',
              label: '状态',
              value: statusFilter,
              onChange: (value) => setFilter({ status: value }),
              options: [
                { value: 'all', label: '全部编排段', count: segmentWorkspaces.length },
                { value: 'ready', label: '可推进', count: readyCount },
                { value: 'attention', label: '待处理', count: attentionCount },
                { value: 'confirmed', label: '已确认', count: segmentWorkspaces.filter((item) => item.segment.status === 'confirmed').length },
              ],
            }]}
            chips={[
              selectedSegmentId ? { id: 'segment', label: `编排段 #${selectedSegmentId}`, onRemove: () => setFilter({ segment_id: null }) } : null,
              selectedSceneMomentId ? { id: 'scene', label: sceneIdentifier(selectedSceneMoment) || `情景 #${selectedSceneMomentId}`, onRemove: () => setFilter({ scene_moment_id: null }) } : null,
              selectedContentUnitId ? { id: 'content', label: productionIdentifier(selectedSceneMoment, selectedContentUnit) || `制作项 #${selectedContentUnitId}`, onRemove: () => setFilter({ content_unit_id: null }) } : null,
              referenceFilterId ? { id: 'reference', label: `设定资料 #${referenceFilterId}`, onRemove: () => setFilter({ reference_id: null }) } : null,
              assetSlotFilterId ? { id: 'asset', label: `素材需求 #${assetSlotFilterId}`, onRemove: () => setFilter({ asset_slot_id: null }) } : null,
            ].filter(Boolean) as Array<{ id: string; label: string; onRemove: () => void }>}
            resultCount={visibleSegments.length}
            totalCount={segmentWorkspaces.length}
          />
        )}
        list={(
            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <p className="type-body font-semibold text-foreground">编排段清单</p>
                  <p className="mt-0.5 type-label text-muted-foreground">以卡片方式管理本集的情绪、节奏和戏剧功能段；可选填剧本版本作为来源引用。</p>
                </div>
                <Badge variant="outline" className="type-tiny">{visibleSegments.length} / {segmentWorkspaces.length}</Badge>
              </div>

              <div className="grid grid-cols-1 gap-3 p-4">
                {isLoading ? (
                  <div>
                    <EmptyState title="正在加载编排段" detail="读取编排段和关联对象" compact />
                  </div>
                ) : visibleSegments.length === 0 ? (
                  <div>
                    <EmptyState title="暂无编排段" detail="可以直接新建编排段，剧本版本只是可选来源引用" compact />
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
        )}
        preview={(
          <>
            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <p className="type-body font-semibold text-foreground">情景与制作项设计</p>
                  <p className="mt-0.5 type-label text-muted-foreground">选择编排段后，在这里查看它持有的多个情景，以及每个情景关联的制作项设计。</p>
                </div>
                <Badge variant="outline" className="type-tiny">{selectedSegment ? `${selectedSegment.sceneMoments.length} 情景 / ${selectedSegment.contentUnits.length} 制作项` : '-'}</Badge>
              </div>

              {!selectedSegment ? (
                <EmptyState title="未选择编排段" detail="从编排段清单选择一个编排段查看制作项设计" />
              ) : (
                <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-4 p-4">
                  <div className="space-y-3">
                    <SectionTitle icon={Film} title="编排段持有的情景" count={selectedSegment.sceneMoments.length} />
                    {selectedSegment.sceneMoments.length === 0 ? (
                      <EmptyState title="暂无情景" detail="编排段还没有拆分出情景" compact />
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
                    <SectionTitle icon={Boxes} title="制作项设计" count={selectedSegment.contentUnits.length} />
                    {selectedSegment.contentUnits.length === 0 ? (
                      <EmptyState title="暂无制作项设计" detail="确认情景后可生成镜头、字幕卡、旁白或转场制作项" compact />
                    ) : (
                      selectedSegment.contentUnits.map((item) => (
                        <ContentUnitRow
                          key={item.ID}
                          item={item}
                          selected={selectedContentUnit?.ID === item.ID}
                          sceneMoment={selectedSegment.sceneMoments.find((sceneMoment) => sceneMoment.ID === item.scene_moment_id)}
                          scriptBlock={item.script_block_id ? scriptBlocksById.get(item.script_block_id) ?? null : null}
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
          </>
        )}
        detail={(
          <>
            <SegmentDetailCard
              projectId={projectId}
              config={segmentConfig}
              item={creatingSegment ? null : selectedSegment}
              defaults={creatingSegment ? { order: segmentWorkspaces.length + 1, status: 'draft', kind: 'emotional_function' } : undefined}
              queryKey={['semantic-segment-workspace', projectId]}
              onSaved={(record) => {
                setCreatingSegment(false)
                setFilter({ segment_id: record.ID })
              }}
              onDeleted={() => {
                setCreatingSegment(false)
                setFilter({ segment_id: null, scene_moment_id: null, content_unit_id: null })
              }}
            />
            <SceneMomentDetail sceneMoment={selectedSceneMoment} segment={selectedSegment?.segment ?? null} />
            <ContentUnitDetail contentUnit={selectedContentUnit} sceneMoment={selectedSceneMoment} scriptBlock={selectedContentUnitScriptBlock} />
          </>
        )}
        upstream={<div />}
        downstream={<div />}
        bottom={(
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-5">
            <RelatedPanel title="拥有的情景" icon={Film} records={selectedSegment?.sceneMoments ?? []} empty="当前编排段暂无情景" />
            <RelatedPanel title="来源剧本块" icon={ScrollText} records={selectedSegment?.scriptBlock ? [selectedSegment.scriptBlock] : []} empty="当前编排段暂无剧本块来源" />
            <RelatedPanel title="涉及到的设定资料" icon={Sparkles} records={selectedSegment?.references ?? []} empty="当前编排段暂无设定资料引用" />
            <RelatedPanel title="所需要的素材需求" icon={PackageCheck} records={selectedSegment?.assetSlots ?? []} empty="当前编排段暂无素材需求" />
            <RelatedPanel title="需要产出的制作项" icon={Boxes} records={selectedSegment?.contentUnits ?? []} empty="当前编排段暂无制作项" />
          </div>
        )}
      />
    </>
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
              <p className="truncate type-body font-semibold text-foreground">{titleOf(item.segment)}</p>
              <p className="truncate type-caption text-muted-foreground">{sectionKinds[String(item.segment.kind ?? '')] ?? item.segment.kind ?? '编排段'}</p>
            </div>
          </div>
          <p className="mt-2 line-clamp-2 type-label leading-5 text-muted-foreground">{item.segment.summary || item.segment.content || '暂无情绪、节奏或戏剧功能说明'}</p>
          {item.scriptBlock ? (
            <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 type-caption text-muted-foreground">
              <ScrollText size={12} className="shrink-0" />
              <span className="truncate">{scriptBlockSourceLabel(item.scriptBlock)}</span>
            </div>
          ) : null}
        </div>
        <StatusBadge status={item.segment.status ?? 'draft'} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat label="情景" value={item.sceneMoments.length} />
        <MiniStat label="内容" value={item.contentUnits.length} />
        <MiniStat label="素材需求" value={item.assetSlots.length} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <ProgressBar value={item.readiness} className="h-1.5 flex-1" />
        <span className="w-9 text-right type-caption tabular-nums text-muted-foreground">{item.readiness}%</span>
      </div>
    </button>
  )
}

type SegmentFormState = Record<string, string | boolean>

function SegmentDetailCard({
  projectId,
  config,
  item,
  defaults,
  queryKey,
  onSaved,
  onDeleted,
}: {
  projectId?: number
  config: SemanticEntityConfig
  item: SegmentWorkspace | null
  defaults?: Partial<SemanticEntityPayload>
  queryKey?: readonly unknown[]
  onSaved?: (record: SegmentRecord) => void
  onDeleted?: (record: SegmentRecord) => void
}) {
  const queryClient = useQueryClient()
  const fields = useMemo(() => config.fields.filter((field) => !field.createOnly), [config.fields])
  const record: SegmentRecord | null = item?.segment ?? null
  const [form, setForm] = useState<SegmentFormState>(() => buildSegmentInitialForm(fields, record, defaults))
  const [isEditing, setIsEditing] = useState(Boolean(defaults || !record))
  const [previewOpen, setPreviewOpen] = useState(false)
  const sourceLockEnabled = Boolean(projectId && record?.ID)

  useEffect(() => {
    setForm(buildSegmentInitialForm(fields, record, defaults))
    setIsEditing(Boolean(defaults || !record))
  }, [defaults, fields, record])

  const { data: sourceLock } = useQuery<SourceLockStatus>({
    queryKey: ['semantic-source-lock', projectId, config.kind, record?.ID],
    queryFn: () => getSourceLockStatus(projectId!, config, record!.ID),
    enabled: sourceLockEnabled,
  })

  const missingRequiredFields = useMemo(() => fields.filter((field) => field.required && !isSegmentFieldFilled(form[field.key], field.type)), [fields, form])
  const canSave = Boolean(projectId) && missingRequiredFields.length === 0 && (isEditing || !record)
  const primaryFields = fields.filter((field) => ['title', 'kind', 'status', 'summary', 'content'].includes(field.key))
  const advancedFields = fields.filter((field) => !primaryFields.includes(field))
  const compactEditFields = ['kind', 'order', 'production_id', 'text_block_id', 'script_block_id']
  const fieldByKey = useMemo(() => new Map(fields.map((field) => [field.key, field])), [fields])
  const formId = `segment-detail-${record?.ID ?? 'new'}`
  const lockedFields = useMemo(() => new Set(sourceLock?.locked_fields ?? []), [sourceLock])
  const canDeleteRecord = !sourceLock?.locked
  const sourceLockReason = sourceLockReasonText(sourceLock)

  const saveMutation = useMutation({
    mutationFn: (payload: SemanticEntityPayload) => {
      if (!projectId) throw new Error('missing project id')
      return record
        ? updateSemanticEntity(projectId, config, record.ID, payload)
        : createSemanticEntity(projectId, config, payload)
    },
    onSuccess: (saved) => {
      if (queryKey) queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: [config.kind, projectId] })
      toast.success('编排段已保存')
      setIsEditing(false)
      onSaved?.(saved as SegmentRecord)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!projectId || !record) throw new Error('missing record')
      return deleteSemanticEntity(projectId, config, record.ID)
    },
    onSuccess: () => {
      if (queryKey) queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: [config.kind, projectId] })
      toast.success('编排段已删除')
      if (record) onDeleted?.(record)
    },
  })

  function updateField(key: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!projectId || !canSave) return
    saveMutation.mutate(buildSegmentPayload(fields, form))
  }

  function removeRecord() {
    if (!projectId || !record) return
    if (!window.confirm('确定删除这个编排段吗？')) return
    deleteMutation.mutate()
  }

  if (!record && !defaults) {
    return (
      <section className="rounded-lg border border-border bg-card">
        <EmptyState title="未选择编排段" detail="从左侧编排段列表选择一个情绪、节奏或戏剧功能段，或新建编排段后直接编辑详情" />
      </section>
    )
  }

  const title = isEditing ? String(form.title ?? '') : record ? titleOf(record as SegmentRecord) : '新建编排段'
  const kind = isEditing ? String(form.kind ?? '') : String(record?.kind ?? '')
  const status = isEditing ? String(form.status ?? 'draft') : String(record?.status ?? 'draft')
  const summary = isEditing ? String(form.summary ?? '') : String(record?.summary || record?.content || '')
  const isNew = !record
  const sourceLabel = item?.scriptBlock
    ? scriptBlockSourceLabel(item.scriptBlock)
    : record?.script_block_id
      ? `剧本块 #${record.script_block_id}`
      : record?.text_block_id
        ? `文本块 #${record.text_block_id}`
        : '项目编排段'

  return (
    <>
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <form id={formId} onSubmit={submit}>
        <div className="border-b border-border bg-gradient-to-br from-cyan-500/15 via-teal-500/10 to-indigo-500/10 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
                <BookOpenText size={19} />
              </span>
              <div className="min-w-0">
                <p className="type-label text-muted-foreground">{sectionKinds[kind] ?? (kind || '编排段')} · {isNew ? '新建编排段' : sourceLabel}</p>
                {isEditing && fieldByKey.get('title') ? (
                  <SegmentInlineField
                    field={fieldByKey.get('title')!}
                    value={form.title}
                    invalid={missingRequiredFields.some((field) => field.key === 'title')}
                    onChange={(value) => updateField('title', value)}
                    surface="plain"
                    inputClassName="mt-1 h-10 bg-background/90 type-body-lg font-semibold"
                  />
                ) : (
                  <h2 className="mt-1 truncate type-title font-semibold text-foreground">{title}</h2>
                )}
              </div>
            </div>
            <div className="mt-4 max-w-4xl">
              {isEditing && fieldByKey.get('summary') ? (
                <SegmentInlineField
                  field={fieldByKey.get('summary')!}
                  value={form.summary}
                  onChange={(value) => updateField('summary', value)}
                  textareaRows={3}
                  label="情绪/节奏/戏剧功能"
                />
              ) : (
                <p className="type-body leading-6 text-muted-foreground">{summary || '暂无情绪、节奏或戏剧功能说明。'}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2 text-right">
            {isEditing && fieldByKey.get('status') ? (
              <SegmentInlineField
                field={fieldByKey.get('status')!}
                value={form.status}
                onChange={(value) => updateField('status', value)}
                hideLabel
                compact
                surface="plain"
              />
            ) : (
              <StatusBadge status={status} />
            )}
            {record && !isEditing ? (
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" className="gap-2 bg-background/80" onClick={() => setPreviewOpen(true)}>
                  <Clapperboard size={14} />
                  预览
                </Button>
                <Button type="button" size="sm" variant="outline" className="gap-2 bg-background/80" onClick={() => setIsEditing(true)} disabled={deleteMutation.isPending}>
                  <Pencil size={14} />
                  编辑
                </Button>
                {canDeleteRecord ? <Button type="button" size="sm" variant="destructive" className="gap-2" onClick={removeRecord} loading={deleteMutation.isPending}>
                  <Trash2 size={14} />
                  删除
                </Button> : null}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {record && canDeleteRecord ? (
                  <Button type="button" size="sm" variant="destructive" className="gap-2" onClick={removeRecord} loading={deleteMutation.isPending}>
                    <Trash2 size={14} />
                    删除
                  </Button>
                ) : null}
                {record ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-2 bg-background/80"
                    disabled={saveMutation.isPending || deleteMutation.isPending}
                    onClick={() => {
                      setForm(buildSegmentInitialForm(fields, record, defaults))
                      setIsEditing(false)
                    }}
                  >
                    <X size={14} />
                    取消
                  </Button>
                ) : null}
                <Button type="submit" size="sm" className="gap-2" loading={saveMutation.isPending} disabled={!canSave || deleteMutation.isPending}>
                  <Save size={14} />
                  保存
                </Button>
              </div>
            )}
          </div>
        </div>
        {isEditing ? (
          <div className="mt-4 rounded-lg border border-white/50 bg-background/70 p-3 shadow-sm backdrop-blur">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="type-label font-semibold text-foreground">核心信息</p>
              <p className="type-caption text-muted-foreground">用于列表、筛选和来源追溯</p>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {compactEditFields.map((key) => fieldByKey.get(key) ? (
                <SegmentInlineField key={key} field={fieldByKey.get(key)!} value={form[key]} disabled={lockedFields.has(key)} lockReason={lockedFields.has(key) ? sourceLockReason : undefined} onChange={(value) => updateField(key, value)} />
              ) : null)}
            </div>
          </div>
        ) : null}
        </div>
        {item ? (
          <div className="grid grid-cols-5 gap-3 p-4">
            <HeroStat icon={Film} label="情景" value={item.sceneMoments.length} />
            <HeroStat icon={Boxes} label="制作项设计" value={item.contentUnits.length} />
            <HeroStat icon={Sparkles} label="设定资料引用" value={item.references.length} />
            <HeroStat icon={PackageCheck} label="素材需求缺口" value={item.assetSlots.filter(isAssetGap).length} tone={item.assetSlots.some(isAssetGap) ? 'text-amber-600' : 'text-emerald-600'} />
            <HeroStat icon={Clock3} label="估算时长" value={formatDuration(item.totalDuration)} />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 p-4">
            <HeroStat icon={BookOpenText} label="类型" value={sectionKinds[kind] ?? (kind || '编排段')} />
            <HeroStat icon={ShieldCheck} label="状态" value={statusLabel(status)} />
            <HeroStat icon={Clock3} label="顺序" value={String(form.order || '-')} />
          </div>
        )}
        {isEditing ? (
          <div className="space-y-4 border-t border-border p-4">
            {fieldByKey.get('content') ? (
              <SegmentEditSection title="来源文本或补充说明" description="用于保留可追溯来源；情绪、节奏和戏剧功能应写在上方功能说明中。">
                <SegmentInlineField field={fieldByKey.get('content')!} value={form.content} disabled={lockedFields.has('content')} lockReason={lockedFields.has('content') ? sourceLockReason : undefined} onChange={(value) => updateField('content', value)} textareaRows={7} />
              </SegmentEditSection>
            ) : null}
            {advancedFields.filter((field) => !compactEditFields.includes(field.key)).length > 0 ? (
              <details className="overflow-hidden rounded-lg border border-border bg-muted/20">
                <summary className="cursor-pointer px-4 py-3 type-label font-semibold text-foreground">高级字段</summary>
                <div className="grid gap-3 border-t border-border bg-card/60 p-3">
                  {advancedFields.filter((field) => !compactEditFields.includes(field.key)).map((field) => (
                    <SegmentInlineField key={field.key} field={field} value={form[field.key]} disabled={lockedFields.has(field.key)} lockReason={lockedFields.has(field.key) ? sourceLockReason : undefined} onChange={(value) => updateField(field.key, value)} textareaRows={field.key.endsWith('_json') ? 6 : 3} />
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : record ? (
          <SegmentReadOnlyDetails fields={fields} record={record} scriptBlock={item?.scriptBlock ?? null} />
        ) : null}
      </form>
    </section>
    {record && projectId && (
      <PreviewDrawer
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        projectId={projectId}
        scope="segment"
        entityId={record.ID}
        entityTitle={String(record.title ?? '')}
      />
    )}
    </>
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
          <div className="flex min-w-0 items-center gap-2">
            {sceneIdentifier(sceneMoment) ? <Badge variant="outline" className="shrink-0 type-tiny">{sceneIdentifier(sceneMoment)}</Badge> : null}
            <p className="truncate type-body font-semibold text-foreground">{titleOf(sceneMoment)}</p>
          </div>
          <p className="mt-1 line-clamp-2 type-label leading-5 text-muted-foreground">{sceneMoment.description || sceneMoment.action_text || sceneMoment.condition_text || '暂无情景描述'}</p>
        </div>
        <StatusBadge status={sceneMoment.status ?? 'draft'} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <InfoChip icon={Clock3} label={sceneMoment.time_text || '时间未定'} />
        <InfoChip icon={MapPin} label={sceneMoment.location_text || '地点未定'} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline" className="type-tiny">制作项 {contentCount}</Badge>
        {sceneMoment.mood ? <Badge variant="outline" className="type-tiny">{sceneMoment.mood}</Badge> : null}
        {assetGapCount > 0 ? <Badge variant="warning" className="type-tiny">缺口 {assetGapCount}</Badge> : null}
      </div>
    </button>
  )
}

function ContentUnitRow({
  item,
  selected,
  sceneMoment,
  scriptBlock,
  assetCount,
  keyframeCount,
  onSelect,
}: {
  item: RelatedRecord
  selected: boolean
  sceneMoment?: SceneMomentRecord
  scriptBlock?: ScriptBlockRecord | null
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
          <div className="flex min-w-0 items-center gap-2">
            {productionIdentifier(sceneMoment, item) ? <Badge variant="outline" className="shrink-0 type-tiny">{productionIdentifier(sceneMoment, item)}</Badge> : null}
            <p className="truncate type-body font-semibold text-foreground">{titleOf(item)}</p>
          </div>
          <p className="mt-1 line-clamp-2 type-label leading-5 text-muted-foreground">{item.description || item.prompt || '暂无制作项描述或提示词'}</p>
        </div>
        <StatusBadge status={item.status ?? 'draft'} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline" className="type-tiny">{item.kind ?? '制作项'}</Badge>
        <Badge variant="outline" className="type-tiny">情景 {sceneIdentifier(sceneMoment) || (sceneMoment ? titleOf(sceneMoment) : '未绑定')}</Badge>
        <Badge variant="outline" className="type-tiny">素材需求 {assetCount}</Badge>
        <Badge variant="outline" className="type-tiny">画面锚点 {keyframeCount}</Badge>
        {item.duration_sec ? <Badge variant="outline" className="type-tiny">{formatDuration(item.duration_sec)}</Badge> : null}
        {scriptBlock ? <Badge variant="outline" className="max-w-full truncate type-tiny">{scriptBlockSourceLabel(scriptBlock)}</Badge> : null}
      </div>
    </button>
  )
}

function SceneMomentDetail({ sceneMoment, segment }: { sceneMoment: SceneMomentRecord | null; segment: SegmentRecord | null }) {
  if (!sceneMoment) {
    return null
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Film size={14} className="text-muted-foreground" />
          <p className="type-body font-semibold text-foreground">当前情景</p>
        </div>
        <StatusBadge status={sceneMoment.status ?? 'draft'} />
      </div>
      <div className="space-y-3 p-3">
        <div>
          <p className="type-body font-semibold text-foreground">{titleOf(sceneMoment)}</p>
          <p className="mt-1 type-label text-muted-foreground">{segment ? `来自 ${titleOf(segment)}` : '未绑定编排段'}</p>
        </div>
        {sceneIdentifier(sceneMoment) ? <InfoBlock label="编号" value={sceneIdentifier(sceneMoment)} /> : null}
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

function ContentUnitDetail({ contentUnit, sceneMoment, scriptBlock }: { contentUnit: RelatedRecord | null; sceneMoment: SceneMomentRecord | null; scriptBlock?: ScriptBlockRecord | null }) {
  if (!contentUnit) {
    return null
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Boxes size={14} className="text-muted-foreground" />
          <p className="type-body font-semibold text-foreground">当前制作项设计</p>
        </div>
        <div className="flex items-center gap-2">
          {productionIdentifier(sceneMoment, contentUnit) ? <Badge variant="outline" className="type-tiny">{productionIdentifier(sceneMoment, contentUnit)}</Badge> : null}
          <StatusBadge status={contentUnit.status ?? 'draft'} />
        </div>
      </div>
      <div className="space-y-3 p-3">
        <div>
          <p className="type-body font-semibold text-foreground">{titleOf(contentUnit)}</p>
          <p className="mt-1 type-label text-muted-foreground">{contentUnit.kind ?? '制作项'} · {formatDuration(contentUnit.duration_sec)}</p>
        </div>
        {productionIdentifier(sceneMoment, contentUnit) ? <InfoBlock label="编号" value={productionIdentifier(sceneMoment, contentUnit)} /> : null}
        <InfoBlock label="所属情景" value={sceneIdentifier(sceneMoment) || (sceneMoment ? titleOf(sceneMoment) : '未绑定情景')} />
        <InfoBlock label="来源剧本块" value={scriptBlock ? scriptBlockSourceLabel(scriptBlock) : contentUnit.script_block_id ? `剧本块 #${contentUnit.script_block_id}` : '未绑定剧本块'} />
        {scriptBlock ? <InfoBlock label="来源文本" value={String(scriptBlock.content ?? '').trim() || '暂无剧本块正文'} /> : null}
        <InfoBlock label="创作提示" value={contentUnit.prompt || contentUnit.description || '暂无提示词'} />
        <InfoBlock label="运镜" value={compactJoin([
          contentUnit.shot_size,
          contentUnit.camera_angle,
          contentUnit.camera_motion,
          contentUnit.motion_intensity,
          contentUnit.camera_speed,
          contentUnit.lens,
          contentUnit.focal_length,
          contentUnit.focus_subject,
        ]) || '暂无运镜参数'} />
      </div>
    </section>
  )
}

function SegmentReadOnlyDetails({ fields, record, scriptBlock }: { fields: SemanticEntityField[]; record: SegmentRecord; scriptBlock?: ScriptBlockRecord | null }) {
  const visibleFields = fields.filter((field) => {
    if (field.key === 'title' || field.key === 'summary') return false
    return true
  })
  const contentField = visibleFields.find((field) => field.key === 'content')
  const compactFields = visibleFields.filter((field) => field.key !== 'content')

  return (
    <div className="space-y-4 border-t border-border p-4">
      {scriptBlock ? (
        <SegmentPreviewSection title="来源剧本块">
          <div className="rounded-md border border-border/70 bg-card px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2 type-caption text-muted-foreground">
              <ScrollText size={12} />
              <span>{scriptBlockSourceLabel(scriptBlock)}</span>
              {scriptBlock.kind ? <span>{String(scriptBlock.kind)}</span> : null}
              {scriptBlock.speaker ? <span>{String(scriptBlock.speaker)}</span> : null}
            </div>
            <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words type-body leading-relaxed text-foreground">
              {String(scriptBlock.content ?? '').trim() || '暂无剧本块正文'}
            </p>
          </div>
        </SegmentPreviewSection>
      ) : null}
      {contentField ? (
        <SegmentPreviewSection title="编排段正文">
          <SegmentPreviewValue field={contentField} value={record[contentField.key]} prominent />
        </SegmentPreviewSection>
      ) : null}
      {compactFields.length > 0 ? (
        <SegmentPreviewSection title="全部字段">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {compactFields.map((field) => (
              <SegmentPreviewValue key={field.key} field={field} value={record[field.key]} />
            ))}
          </div>
        </SegmentPreviewSection>
      ) : null}
    </div>
  )
}

function SegmentPreviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-background/70 p-3">
      <p className="mb-3 type-label font-semibold text-foreground">{title}</p>
      {children}
    </section>
  )
}

function SegmentPreviewValue({ field, value, prominent = false }: { field: SemanticEntityField; value: unknown; prominent?: boolean }) {
  const displayValue = segmentDisplayValue(field, value)
  return (
    <div className={cn(
      'rounded-md border border-border/70 bg-card px-3 py-2.5',
      prominent && 'bg-card/80',
    )}>
      <p className="type-caption font-medium text-muted-foreground">{field.label}</p>
      <p className={cn(
        'mt-1 whitespace-pre-wrap break-words type-body leading-relaxed text-foreground',
        field.key.endsWith('_json') && 'max-h-44 overflow-auto rounded bg-background p-2 font-mono type-label',
      )}>
        {displayValue}
      </p>
    </div>
  )
}

function SegmentEditSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-background/70 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="type-label font-semibold text-foreground">{title}</p>
        {description ? <p className="type-caption text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function SegmentInlineField({
  field,
  value,
  invalid = false,
  disabled = false,
  hideLabel = false,
  compact = false,
  surface = 'card',
  label,
  textareaRows,
  inputClassName,
  lockReason,
  onChange,
}: {
  field: SemanticEntityField
  value: string | boolean
  invalid?: boolean
  disabled?: boolean
  hideLabel?: boolean
  compact?: boolean
  surface?: 'card' | 'plain'
  label?: string
  textareaRows?: number
  inputClassName?: string
  lockReason?: string
  onChange: (value: string | boolean) => void
}) {
  const id = `segment-detail-field-${field.key}`
  const controlClassName = cn('border-border/70 bg-background/90 shadow-none', compact && 'h-8 type-label', inputClassName)
  const options = segmentFieldOptions(field)

  return (
    <div className={cn('min-w-0', surface === 'card' && 'rounded-md border border-border/70 bg-card p-3')}>
      {!hideLabel ? <Label htmlFor={id} required={field.required} className="mb-1.5 block type-label font-medium text-muted-foreground">{label ?? field.label}</Label> : null}
      {field.type === 'textarea' ? (
        <Textarea
          id={id}
          required={field.required}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          value={String(value ?? '')}
          rows={textareaRows ?? (field.key.endsWith('_json') ? 5 : 4)}
          placeholder={field.placeholder}
          className={cn(controlClassName, field.key.endsWith('_json') && 'font-mono type-label')}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === 'select' ? (
        <select
          id={id}
          required={field.required}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
          className={cn('w-full rounded-md border px-3 type-body text-foreground outline-none focus:ring-1 focus:ring-ring', compact ? 'h-8 type-label' : 'h-9', controlClassName)}
        >
          <option value="">未设置</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : field.type === 'boolean' ? (
        <label className={cn('flex items-center gap-2 rounded-md border border-border/70 bg-background/90 px-3 type-body text-foreground', compact ? 'h-8 type-label' : 'h-9', disabled && 'opacity-60')}>
          <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
          启用
        </label>
      ) : (
        <Input
          id={id}
          required={field.required}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          type={field.type === 'number' ? 'number' : 'text'}
          step={field.type === 'number' ? 'any' : undefined}
          value={String(value ?? '')}
          placeholder={field.placeholder}
          className={controlClassName}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {lockReason ? <p className="mt-1 type-caption font-medium text-amber-700 dark:text-amber-300">{lockReason}</p> : field.helper ? <p className="mt-1 type-caption text-muted-foreground">{field.helper}</p> : null}
    </div>
  )
}

function sourceLockReasonText(status?: SourceLockStatus) {
  if (!status?.locked) return undefined
  const first = status.reasons[0]
  if (!first) return '来源已锁定，已有下游对象引用当前记录'
  return `${first.message}${status.reasons.length > 1 ? ` 等 ${status.reasons.length} 类下游对象` : ''}`
}

function MetricCard({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: string | number; detail: string; tone: string }) {
  return <AppMetricCard icon={Icon} label={label} value={value} detail={detail} tone={metricTone(tone)} />
}

function RelatedPanel({
  title,
  icon: Icon,
  records,
  empty,
  scriptBlocksById,
}: {
  title: string
  icon: LucideIcon
  records: Array<RelatedRecord | SceneMomentRecord | SegmentRecord | ScriptBlockRecord>
  empty: string
  scriptBlocksById?: Map<number, ScriptBlockRecord>
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-muted-foreground" />
          <p className="type-body font-semibold text-foreground">{title}</p>
        </div>
        <Badge variant="outline" className="type-tiny">{records.length}</Badge>
      </div>
      <div className="space-y-2 p-3">
        {records.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-3 type-label text-muted-foreground">{empty}</p>
        ) : (
          records.slice(0, 5).map((record) => <RelatedRow key={record.ID} record={record} scriptBlocksById={scriptBlocksById} />)
        )}
      </div>
    </section>
  )
}

function RelatedRow({ record, scriptBlocksById }: { record: RelatedRecord | SceneMomentRecord | SegmentRecord | ScriptBlockRecord; scriptBlocksById?: Map<number, ScriptBlockRecord> }) {
  const item = record as RelatedRecord & SceneMomentRecord & SegmentRecord & ScriptBlockRecord
  const title = isScriptBlockRecord(item) ? scriptBlockSourceLabel(item) : titleOf(item)
  const identifier = sceneIdentifier(item) || unitIdentifier(item)
  const sourceBlock = !isScriptBlockRecord(item) && item.script_block_id ? scriptBlocksById?.get(item.script_block_id) : undefined
  const detail = isScriptBlockRecord(item)
    ? String(item.content ?? '').trim() || String(item.kind ?? `ID ${item.ID}`)
    : item.description || item.content || item.visual_intent || item.prompt || item.prompt_hint || item.kind || `ID ${item.ID}`
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            {identifier ? <Badge variant="outline" className="shrink-0 type-tiny">{identifier}</Badge> : null}
            <p className="truncate type-label font-medium text-foreground">{title}</p>
          </div>
          <p className="mt-0.5 line-clamp-2 type-caption leading-4 text-muted-foreground">{detail}</p>
        </div>
        <StatusBadge status={item.status ?? item.priority ?? 'draft'} />
      </div>
      <div className="mt-2 flex items-center gap-1.5 type-tiny text-muted-foreground">
        {item.kind ? <span>{item.kind}</span> : null}
        {item.duration_sec ? <span>{formatDuration(item.duration_sec)}</span> : null}
      </div>
      {item.script_block_id && !isScriptBlockRecord(item) ? (
        <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-0.5 type-tiny text-muted-foreground">
          <ScrollText size={11} className="shrink-0" />
          <span className="truncate">{sourceBlock ? scriptBlockSourceLabel(sourceBlock) : `剧本块 #${item.script_block_id}`}</span>
        </div>
      ) : null}
    </div>
  )
}

function isScriptBlockRecord(record: RelatedRecord & SceneMomentRecord & SegmentRecord & ScriptBlockRecord) {
  return record.script_version_id !== undefined && (record.start_line !== undefined || record.end_line !== undefined)
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-2">
      <p className="type-tiny text-muted-foreground">{label}</p>
      <p className="mt-1 truncate type-label font-semibold text-foreground">{value}</p>
    </div>
  )
}

function HeroStat({ icon: Icon, label, value, tone = 'text-foreground' }: { icon: LucideIcon; label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2 type-label text-muted-foreground">
        <Icon size={14} />
        <span>{label}</span>
      </div>
      <p className={cn('mt-2 truncate type-title-sm font-semibold tabular-nums', tone)}>{value}</p>
    </div>
  )
}

function SectionTitle({ icon: Icon, title, count }: { icon: LucideIcon; title: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-muted-foreground" />
        <p className="type-body font-semibold text-foreground">{title}</p>
      </div>
      <Badge variant="outline" className="type-tiny">{count}</Badge>
    </div>
  )
}

function InfoChip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5">
      <Icon size={12} className="shrink-0 text-muted-foreground" />
      <span className="truncate type-caption text-muted-foreground">{label}</span>
    </div>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="type-label font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words type-body leading-relaxed text-foreground">{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return <SemanticStatusBadge status={status} label={statusLabel(status)} />
}

function EmptyState({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) {
  return <AppEmptyState icon={Film} title={title} detail={detail} compact={compact} />
}

function metricTone(tone: string) {
  if (tone.includes('emerald')) return 'success'
  if (tone.includes('amber') || tone.includes('rose')) return 'warning'
  if (tone.includes('cyan') || tone.includes('teal') || tone.includes('sky')) return 'info'
  return 'neutral'
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

function scriptBlockSourceLabel(block: ScriptBlockRecord) {
  const startLine = block.start_line || '?'
  const endLine = block.end_line || '?'
  return `剧本块 #${block.ID} · 行 ${startLine}-${endLine}`
}

function compactJoin(values: unknown[]) {
  return values.map((value) => String(value ?? '').trim()).filter(Boolean).join(' · ')
}

function buildSegmentInitialForm(fields: SemanticEntityConfig['fields'], record?: SegmentRecord | null, defaults?: Partial<SemanticEntityPayload>): SegmentFormState {
  const source = record ?? defaults ?? {}
  return Object.fromEntries(fields.map((field) => {
    const raw = source[field.key] ?? segmentDefaultValueForField(field.type)
    return [field.key, field.type === 'boolean' ? Boolean(raw) : String(raw ?? '')]
  }))
}

function buildSegmentPayload(fields: SemanticEntityConfig['fields'], form: SegmentFormState): SemanticEntityPayload {
  const payload: SemanticEntityPayload = {}
  for (const field of fields) {
    const value = form[field.key]
    if (field.type === 'boolean') {
      payload[field.key] = Boolean(value)
      continue
    }
    if (field.type === 'number') {
      const raw = String(value ?? '').trim()
      payload[field.key] = raw === '' ? null : Number(raw)
      continue
    }
    payload[field.key] = String(value ?? '').trim()
  }
  return payload
}

function segmentDefaultValueForField(type: SemanticEntityConfig['fields'][number]['type']) {
  if (type === 'boolean') return false
  return ''
}

function isSegmentFieldFilled(value: string | boolean, type: SemanticEntityConfig['fields'][number]['type']) {
  if (type === 'boolean') return Boolean(value)
  return String(value ?? '').trim().length > 0
}

function segmentDisplayValue(field: SemanticEntityField, value: unknown) {
  if (field.type === 'boolean') return value ? '是' : '否'
  const raw = String(value ?? '').trim()
  if (!raw) return '未设置'
  if (field.key === 'status') return statusLabel(raw)
  if (field.key === 'kind') return sectionKinds[raw] ?? raw
  const option = segmentFieldOptions(field).find((item) => item.value === raw)
  return option?.label ?? raw
}

function segmentFieldOptions(field: SemanticEntityField) {
  const options = field.options ?? []
  if (field.key === 'status') {
    return options.map((option) => ({ ...option, label: statusLabel(option.value) }))
  }
  if (field.key === 'kind') {
    return options.map((option) => ({ ...option, label: sectionKinds[option.value] ?? option.label }))
  }
  return options
}
