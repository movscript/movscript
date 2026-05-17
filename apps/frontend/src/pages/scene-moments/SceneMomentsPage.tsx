import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  Clapperboard,
  Database,
  Film,
  GitBranch,
  Layers3,
  PackageCheck,
  Plus,
  RefreshCcw,
  Route,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/api/semanticEntities'
import { ContentWorkspaceLayout } from '@/components/layout/ContentWorkspaceLayout'
import { PreviewDrawer } from '@/components/preview/PreviewDrawer'
import { SemanticEntityInlineEditor } from '@/components/shared/SemanticEntityInlineEditor'
import { ContentFilterBar } from '@/pages/contents/components/ContentFilterBar'
import { makeContentFilterSearch, readNumberParam, readStringParam, updateContentFilterParams, type ContentFilterKey } from '@/pages/contents/lib/contentFilters'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { Badge, Button, Progress } from '@movscript/ui'
import { ROUTES } from '@/routes/projectRoutes'

type StatusFilter = 'all' | 'ready' | 'attention' | 'confirmed'

type SegmentRecord = SemanticEntityRecord & {
  title?: string
  summary?: string
  content?: string
  script_block_id?: number
  status?: string
}

type SceneMomentRecord = SemanticEntityRecord & {
  segment_id?: number
  script_block_id?: number
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

interface MomentWorkspace {
  moment: SceneMomentRecord
  segment?: SegmentRecord
  scriptBlock?: ScriptBlockRecord
  contentUnits: RelatedRecord[]
  keyframes: RelatedRecord[]
  references: RelatedRecord[]
  assetSlots: RelatedRecord[]
  readiness: number
  totalDuration: number
}

const statusTone: Record<string, string> = {
  confirmed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  locked: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  accepted: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  attached: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  draft: 'bg-muted text-muted-foreground',
  candidate: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  generated: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  missing: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  review: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  blocked: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
}

const statusLabels: Record<string, string> = {
  confirmed: '已确认',
  locked: '已锁定',
  accepted: '已采纳',
  attached: '已关联',
  draft: '草稿',
  candidate: '候选',
  generated: '已生成',
  missing: '缺素材需求',
  review: '待审',
  blocked: '阻塞',
  ignored: '忽略',
}

export default function SceneMomentsPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const sceneMomentConfig = semanticEntityConfig('sceneMoments')
  const [creatingMoment, setCreatingMoment] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const segmentFilterId = readNumberParam(searchParams, 'segment_id')
  const selectedMomentId = readNumberParam(searchParams, 'scene_moment_id')
  const contentUnitFilterId = readNumberParam(searchParams, 'content_unit_id')
  const referenceFilterId = readNumberParam(searchParams, 'reference_id')
  const assetSlotFilterId = readNumberParam(searchParams, 'asset_slot_id')
  const query = readStringParam(searchParams, 'q')
  const statusFilter = normalizeStatusFilter(readStringParam(searchParams, 'status'))

  const segmentsQuery = useQuery({
    queryKey: ['semantic-scene-moment-page', projectId, 'segments'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('segments')) as Promise<SegmentRecord[]>,
    enabled: !!projectId,
  })
  const sceneMomentsQuery = useQuery({
    queryKey: ['semantic-scene-moment-page', projectId, 'sceneMoments'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('sceneMoments')) as Promise<SceneMomentRecord[]>,
    enabled: !!projectId,
  })
  const contentUnitsQuery = useQuery({
    queryKey: ['semantic-scene-moment-page', projectId, 'content-units'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('contentUnits')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const scriptBlocksQuery = useQuery({
    queryKey: ['semantic-scene-moment-page', projectId, 'script-blocks'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('scriptBlocks')) as Promise<ScriptBlockRecord[]>,
    enabled: !!projectId,
  })
  const keyframesQuery = useQuery({
    queryKey: ['semantic-scene-moment-page', projectId, 'keyframes'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('keyframes')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const referencesQuery = useQuery({
    queryKey: ['semantic-scene-moment-page', projectId, 'creative-references'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('creativeReferences')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const usagesQuery = useQuery({
    queryKey: ['semantic-scene-moment-page', projectId, 'creative-reference-usages'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('creativeReferenceUsages')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const assetSlotsQuery = useQuery({
    queryKey: ['semantic-scene-moment-page', projectId, 'asset-slots'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('assetSlots')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })

  const segments = segmentsQuery.data ?? []
  const moments = useMemo(() => (sceneMomentsQuery.data ?? []).slice().sort(compareByOrder), [sceneMomentsQuery.data])
  const contentUnits = contentUnitsQuery.data ?? []
  const scriptBlocks = scriptBlocksQuery.data ?? []
  const keyframes = keyframesQuery.data ?? []
  const references = referencesQuery.data ?? []
  const usages = usagesQuery.data ?? []
  const assetSlots = assetSlotsQuery.data ?? []

  const segmentById = useMemo(() => new Map(segments.map((item) => [item.ID, item])), [segments])
  const referencesById = useMemo(() => new Map(references.map((item) => [item.ID, item])), [references])
  const scriptBlocksById = useMemo(() => new Map(scriptBlocks.map((item) => [item.ID, item])), [scriptBlocks])

  const momentWorkspaces = useMemo(() => moments.map((moment) => {
    const momentContentUnits = contentUnits.filter((item) => item.scene_moment_id === moment.ID).sort(compareByOrder)
    const contentUnitIds = new Set(momentContentUnits.map((item) => item.ID))
    const momentKeyframes = keyframes.filter((item) => item.scene_moment_id === moment.ID || Boolean(item.content_unit_id && contentUnitIds.has(item.content_unit_id))).sort(compareByOrder)
    const momentUsages = usages.filter((item) => (
      (item.owner_type === 'scene_moment' && item.owner_id === moment.ID) ||
      Boolean(item.owner_type === 'content_unit' && item.owner_id && contentUnitIds.has(item.owner_id))
    ))
    const momentReferences = dedupeRecords(momentUsages
      .map((usage) => usage.creative_reference_id ? referencesById.get(usage.creative_reference_id) : undefined)
      .filter(Boolean) as RelatedRecord[])
    const referenceIds = new Set(momentReferences.map((item) => item.ID))
    const momentAssetSlots = assetSlots.filter((item) => (
      (item.owner_type === 'scene_moment' && item.owner_id === moment.ID) ||
      Boolean(item.owner_type === 'content_unit' && item.owner_id && contentUnitIds.has(item.owner_id)) ||
      Boolean(item.creative_reference_id && referenceIds.has(item.creative_reference_id))
    )).sort(compareByOrder)
    const totalDuration = momentContentUnits.reduce((sum, item) => sum + (item.duration_sec ?? 0), 0)

    return {
      moment,
      segment: moment.segment_id ? segmentById.get(moment.segment_id) : undefined,
      scriptBlock: moment.script_block_id ? scriptBlocksById.get(moment.script_block_id) : undefined,
      contentUnits: momentContentUnits,
      keyframes: momentKeyframes,
      references: momentReferences,
      assetSlots: momentAssetSlots,
      readiness: calculateReadiness(moment, momentContentUnits, momentReferences, momentAssetSlots),
      totalDuration,
    }
  }), [assetSlots, contentUnits, keyframes, moments, referencesById, scriptBlocksById, segmentById, usages])

  const filteredMoments = useMemo(() => {
    const q = query.trim().toLowerCase()
    return momentWorkspaces.filter((item) => {
      if (segmentFilterId && item.moment.segment_id !== segmentFilterId) return false
      if (selectedMomentId && item.moment.ID !== selectedMomentId) return false
      if (contentUnitFilterId && !item.contentUnits.some((unit) => unit.ID === contentUnitFilterId)) return false
      if (referenceFilterId && !item.references.some((reference) => reference.ID === referenceFilterId)) return false
      if (assetSlotFilterId && !item.assetSlots.some((slot) => slot.ID === assetSlotFilterId)) return false
      if (!matchesStatus(statusFilter, item)) return false
      if (!q) return true
      const haystack = [
        titleOf(item.moment),
        item.moment.description,
        item.moment.time_text,
        item.moment.location_text,
        item.moment.condition_text,
        item.moment.action_text,
        item.moment.mood,
        titleOf(item.segment),
        item.scriptBlock ? scriptBlockSourceLabel(item.scriptBlock) : '',
        item.scriptBlock?.content,
        item.contentUnits.map((unit) => [
          titleOf(unit),
          unit.description,
          unit.prompt,
          unit.script_block_id ? scriptBlockSourceLabel(scriptBlocksById.get(unit.script_block_id)) : '',
          unit.script_block_id ? scriptBlocksById.get(unit.script_block_id)?.content : '',
        ].join(' ')).join(' '),
        item.references.map((reference) => titleOf(reference)).join(' '),
        item.assetSlots.map((slot) => titleOf(slot)).join(' '),
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [assetSlotFilterId, contentUnitFilterId, momentWorkspaces, query, referenceFilterId, scriptBlocksById, segmentFilterId, selectedMomentId, statusFilter])

  const selected = useMemo(() => {
    if (selectedMomentId) {
      const exact = momentWorkspaces.find((item) => item.moment.ID === selectedMomentId)
      if (exact) return exact
    }
    return filteredMoments[0] ?? momentWorkspaces[0] ?? null
  }, [filteredMoments, momentWorkspaces, selectedMomentId])

  const readyCount = momentWorkspaces.filter((item) => matchesStatus('ready', item)).length
  const attentionCount = momentWorkspaces.filter((item) => matchesStatus('attention', item)).length
  const averageReadiness = momentWorkspaces.length
    ? Math.round(momentWorkspaces.reduce((sum, item) => sum + item.readiness, 0) / momentWorkspaces.length)
    : 0
  const totalDuration = momentWorkspaces.reduce((sum, item) => sum + item.totalDuration, 0)
  const isLoading = sceneMomentsQuery.isLoading || segmentsQuery.isLoading
  const isFetching = segmentsQuery.isFetching || sceneMomentsQuery.isFetching || contentUnitsQuery.isFetching || scriptBlocksQuery.isFetching || keyframesQuery.isFetching || referencesQuery.isFetching || usagesQuery.isFetching || assetSlotsQuery.isFetching

  function setFilter(updates: Partial<Record<ContentFilterKey, string | number | null | undefined>>) {
    setSearchParams(updateContentFilterParams(searchParams, updates), { replace: true })
  }

  function refreshAll() {
    segmentsQuery.refetch()
    sceneMomentsQuery.refetch()
    contentUnitsQuery.refetch()
    scriptBlocksQuery.refetch()
    keyframesQuery.refetch()
    referencesQuery.refetch()
    usagesQuery.refetch()
    assetSlotsQuery.refetch()
  }

  function startCreateMoment() {
    setCreatingMoment(true)
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
              <span>内容区</span>
              <ChevronRight size={13} />
              <span>情景</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">情景</h1>
            <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
              情景属于某一个编排段，提供时间、地点、条件、动作和情绪上下文；设定资料和素材需求从这里向下游制作项与生产任务传递。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button className="gap-2" onClick={startCreateMoment}>
              <Plus size={15} />
              新建情景
            </Button>
            <Button variant="outline" className="gap-2" onClick={refreshAll} loading={isFetching}>
              <RefreshCcw size={15} />
              刷新
            </Button>
            <Button variant="outline" className="gap-2" asChild>
              <Link to={ROUTES.project.referenceRelations}>
                <GitBranch size={15} />
                查看关系
              </Link>
            </Button>
            <Button className="gap-2" asChild>
              <Link to={`${ROUTES.project.contentUnits}${selected ? makeContentFilterSearch({ scene_moment_id: selected.moment.ID }) : ''}`}>
                <Boxes size={15} />
                查看内容
              </Link>
            </Button>
          </div>
          </header>
        )}
        overview={(
          <section className="grid grid-cols-4 gap-3">
          <MetricCard icon={Film} label="情景" value={momentWorkspaces.length} detail={`${filteredMoments.length} 个符合当前筛选`} tone="text-teal-600" />
          <MetricCard icon={Layers3} label="所属编排段" value={new Set(moments.map((item) => item.segment_id).filter(Boolean)).size} detail="情景通过编排段进入制作结构" tone="text-cyan-600" />
          <MetricCard icon={ShieldCheck} label="可推进" value={readyCount} detail={`${averageReadiness}% 平均准备度`} tone="text-emerald-600" />
          <MetricCard icon={AlertTriangle} label="待处理" value={attentionCount} detail={`估算总时长 ${formatDuration(totalDuration)}`} tone="text-amber-600" />
          </section>
        )}
        filters={(
          <ContentFilterBar
          query={query}
          onQueryChange={(value) => setFilter({ q: value })}
          queryPlaceholder="搜索情景、编排段、设定资料、素材需求或内容"
          filters={[
            {
              id: 'status',
              label: '状态',
              value: statusFilter,
              onChange: (value) => setFilter({ status: value }),
              options: [
                { value: 'all', label: '全部情景', count: momentWorkspaces.length },
                { value: 'ready', label: '可推进', count: readyCount },
                { value: 'attention', label: '待处理', count: attentionCount },
                { value: 'confirmed', label: '已确认', count: momentWorkspaces.filter((item) => item.moment.status === 'confirmed').length },
              ],
            },
            {
              id: 'segment',
              label: '编排段',
              value: segmentFilterId ? String(segmentFilterId) : 'all',
              onChange: (value) => setFilter({ segment_id: value === 'all' ? null : value, scene_moment_id: null }),
              options: [
                { value: 'all', label: '全部编排段', count: momentWorkspaces.length },
                ...segments.map((segment) => ({
                  value: String(segment.ID),
                  label: titleOf(segment),
                  count: momentWorkspaces.filter((item) => item.moment.segment_id === segment.ID).length,
                })),
              ],
            },
          ]}
          chips={[
            selectedMomentId ? { id: 'moment', label: `情景 #${selectedMomentId}`, onRemove: () => setFilter({ scene_moment_id: null }) } : null,
            contentUnitFilterId ? { id: 'content', label: `制作项 #${contentUnitFilterId}`, onRemove: () => setFilter({ content_unit_id: null }) } : null,
            referenceFilterId ? { id: 'reference', label: `设定资料 #${referenceFilterId}`, onRemove: () => setFilter({ reference_id: null }) } : null,
            assetSlotFilterId ? { id: 'asset', label: `素材需求 #${assetSlotFilterId}`, onRemove: () => setFilter({ asset_slot_id: null }) } : null,
          ].filter(Boolean) as Array<{ id: string; label: string; onRemove: () => void }>}
          resultCount={filteredMoments.length}
          totalCount={momentWorkspaces.length}
          />
        )}
        list={(
            <Panel title="情景列表" icon={Route}>
              <div className="max-h-[760px] space-y-2 overflow-auto pr-1">
                {isLoading ? (
                  <EmptyState title="正在加载情景" detail="读取情景和上游编排段" compact />
                ) : filteredMoments.length === 0 ? (
                  <EmptyState title="暂无情景" detail="可从编排段页或剧本拆解生成情景" compact />
                ) : (
                  filteredMoments.map((item) => (
                    <MomentButton
                      key={item.moment.ID}
                      item={item}
                      selected={selected?.moment.ID === item.moment.ID}
                      onClick={() => setFilter({ segment_id: item.moment.segment_id ?? null, scene_moment_id: item.moment.ID })}
                    />
                  ))
                )}
              </div>
            </Panel>
        )}
        preview={(
          <Panel title="制作项设计" icon={Boxes}>
            <RelatedList
              records={selected?.contentUnits ?? []}
              scriptBlocksById={scriptBlocksById}
              empty="当前情景暂无制作项"
              onSelect={(record) => setFilter({ content_unit_id: record.ID })}
            />
          </Panel>
        )}
        detail={(
          <>
            {selected && !creatingMoment && projectId && (
              <div className="flex justify-end">
                <Button size="sm" variant="outline" className="gap-2" onClick={() => setPreviewOpen(true)}>
                  <Clapperboard size={14} />
                  预览
                </Button>
              </div>
            )}
            <SemanticEntityInlineEditor
              projectId={projectId}
              config={sceneMomentConfig}
              record={creatingMoment ? null : selected?.moment}
              defaults={creatingMoment ? { segment_id: selected?.segment?.ID ?? segmentFilterId ?? null, script_block_id: selected?.scriptBlock?.ID ?? selected?.segment?.script_block_id ?? null, order: momentWorkspaces.length + 1, status: 'draft' } : undefined}
              queryKey={['semantic-scene-moment-page', projectId]}
              title={creatingMoment ? '新建情景' : '卡片内编辑情景'}
              description="直接维护情景标题、时空、条件、动作和情绪；引用关系不在这里重写。"
              hero={{
                icon: <Film size={19} />,
                eyebrow: selected?.segment ? titleOf(selected.segment) : '未绑定编排段',
                title: creatingMoment ? '新建情景' : selected ? titleOf(selected.moment) : '新建情景',
                subtitle: creatingMoment ? '项目情景' : selected ? `情景 #${selected.moment.ID}` : '项目情景',
                summary: creatingMoment ? '补充时间、地点、条件、动作和情绪后，情景就可以承接制作项与素材需求。' : selected?.moment.description || selected?.moment.action_text || '暂无情景描述。',
                accentClassName: 'from-teal-500/15 via-cyan-500/10 to-emerald-500/10',
                status: <StatusBadge status={creatingMoment ? 'draft' : selected?.moment.status ?? 'draft'} />,
                stats: selected && !creatingMoment ? [
                  { label: '时间', value: selected.moment.time_text || '未设定' },
                  { label: '地点', value: selected.moment.location_text || '未设定' },
                  { label: '剧本来源', value: selected.scriptBlock ? `行 ${selected.scriptBlock.start_line || '?'}-${selected.scriptBlock.end_line || '?'}` : '未绑定' },
                  { label: '制作项', value: selected.contentUnits.length },
                ] : [
                  { label: '默认状态', value: '草稿' },
                  { label: '所属编排段', value: selected?.segment ? titleOf(selected.segment) : '未绑定' },
                  { label: '剧本来源', value: selected?.scriptBlock ? `行 ${selected.scriptBlock.start_line || '?'}-${selected.scriptBlock.end_line || '?'}` : '继承编排段' },
                  { label: '顺序', value: momentWorkspaces.length + 1 },
                ],
              }}
              onSaved={(record) => {
                setCreatingMoment(false)
                setFilter({ scene_moment_id: record.ID, segment_id: record.segment_id as number | undefined })
              }}
              onDeleted={() => {
                setCreatingMoment(false)
                setFilter({ scene_moment_id: null })
              }}
            />
          </>
        )}
        upstream={<div />}
        downstream={<div />}
        bottom={(
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-5">
            <Panel title="来源剧本块" icon={ScrollText}>
              {selected?.scriptBlock ? (
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <p className="truncate text-xs font-medium text-foreground">{scriptBlockSourceLabel(selected.scriptBlock)}</p>
                  <p className="mt-1 line-clamp-4 text-[11px] leading-4 text-muted-foreground">{String(selected.scriptBlock.content ?? '').trim() || '暂无剧本块正文'}</p>
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">当前情景暂无稳定剧本块来源</p>
              )}
            </Panel>
            <Panel title="涉及到的设定资料" icon={Sparkles}>
              <RelatedList
                records={selected?.references ?? []}
                empty="当前情景暂无设定资料引用"
                onSelect={(record) => setFilter({ reference_id: record.ID })}
              />
            </Panel>
            <Panel title="所需要的素材需求" icon={PackageCheck}>
              <RelatedList
                records={selected?.assetSlots ?? []}
                empty="当前情景暂无素材需求"
                onSelect={(record) => setFilter({ asset_slot_id: record.ID })}
              />
            </Panel>
            <Panel title="需要产出的制作项" icon={Boxes}>
              <RelatedList
                records={selected?.contentUnits ?? []}
                scriptBlocksById={scriptBlocksById}
                empty="当前情景暂无制作项"
                onSelect={(record) => setFilter({ content_unit_id: record.ID })}
              />
            </Panel>
          </div>
        )}
      />
      {selected && !creatingMoment && projectId && (
        <PreviewDrawer
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          projectId={projectId}
          scope="scene_moment"
          entityId={selected.moment.ID}
          entityTitle={titleOf(selected.moment)}
        />
      )}
    </>
  )
}

function MomentButton({ item, selected, onClick }: { item: MomentWorkspace; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-lg border bg-background p-3 text-left transition-all hover:border-primary/50 hover:shadow-sm',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{titleOf(item.moment)}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.segment ? titleOf(item.segment) : '未绑定编排段'}</p>
        </div>
        <StatusBadge status={item.moment.status ?? 'draft'} />
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.moment.description || item.moment.action_text || '暂无情景描述'}</p>
      {item.scriptBlock ? (
        <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
          <ScrollText size={11} className="shrink-0" />
          <span className="truncate">{scriptBlockSourceLabel(item.scriptBlock)}</span>
        </div>
      ) : null}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat label="内容" value={item.contentUnits.length} />
        <MiniStat label="设定资料" value={item.references.length} />
        <MiniStat label="素材需求" value={item.assetSlots.length} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Progress value={item.readiness} className="h-1.5 flex-1" />
        <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">{item.readiness}%</span>
      </div>
    </button>
  )
}

function RelatedList({
  records,
  empty,
  scriptBlocksById,
  onSelect,
}: {
  records: RelatedRecord[]
  empty: string
  scriptBlocksById?: Map<number, ScriptBlockRecord>
  onSelect?: (record: RelatedRecord) => void
}) {
  if (records.length === 0) {
    return <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">{empty}</p>
  }

  return (
    <div className="space-y-2">
      {records.slice(0, 8).map((record) => {
        const scriptBlock = record.script_block_id ? scriptBlocksById?.get(record.script_block_id) : undefined
        const content = (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">{titleOf(record)}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{record.description || record.content || record.prompt || record.prompt_hint || record.visual_intent || record.kind || `ID ${record.ID}`}</p>
                {record.script_block_id ? (
                  <div className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                    <ScrollText size={11} className="shrink-0" />
                    <span className="truncate">{scriptBlockSourceLabel(scriptBlock) || `剧本块 #${record.script_block_id}`}</span>
                  </div>
                ) : null}
                {scriptBlock?.content ? (
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{String(scriptBlock.content)}</p>
                ) : null}
              </div>
              <StatusBadge status={record.status ?? 'draft'} />
            </div>
          </>
        )
        return onSelect ? (
          <button key={record.ID} type="button" onClick={() => onSelect(record)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-left hover:border-primary/40">
            {content}
          </button>
        ) : (
          <div key={record.ID} className="rounded-md border border-border bg-background px-3 py-2">
            {content}
          </div>
        )
      })}
    </div>
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

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-foreground">{value}</p>
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

function normalizeStatusFilter(value: string): StatusFilter {
  return ['ready', 'attention', 'confirmed'].includes(value) ? value as StatusFilter : 'all'
}

function matchesStatus(status: StatusFilter, item: MomentWorkspace) {
  const value = String(item.moment.status ?? '')
  if (status === 'all') return true
  if (status === 'ready') return item.readiness >= 70 && item.assetSlots.every((slot) => !isAssetGap(slot))
  if (status === 'attention') return item.readiness < 70 || item.assetSlots.some(isAssetGap) || ['draft', 'candidate', 'review', 'blocked'].includes(value)
  return value === status
}

function calculateReadiness(moment: SceneMomentRecord, contentUnits: RelatedRecord[], references: RelatedRecord[], assetSlots: RelatedRecord[]) {
  let score = 0
  if (moment.segment_id) score += 15
  if (moment.description || moment.action_text) score += 25
  if (moment.time_text || moment.location_text) score += 15
  if (contentUnits.length > 0) score += 20
  if (references.length > 0) score += 15
  const gapCount = assetSlots.filter(isAssetGap).length
  if (assetSlots.length === 0 || gapCount === 0) score += 10
  else score += Math.max(0, 10 - gapCount * 4)
  return Math.max(0, Math.min(100, Math.round(score)))
}

function titleOf(record?: RelatedRecord | SceneMomentRecord | SegmentRecord | null) {
  if (!record) return '未命名'
  return String(record.title ?? record.name ?? record.label ?? `#${record.ID}`)
}

function scriptBlockSourceLabel(block?: ScriptBlockRecord) {
  if (!block) return ''
  const startLine = block.start_line || '?'
  const endLine = block.end_line || '?'
  return `剧本块 #${block.ID} · 行 ${startLine}-${endLine}`
}

function orderOf(record: { order?: number; ID: number }) {
  return typeof record.order === 'number' ? record.order : record.ID
}

function compareByOrder<T extends { order?: number; ID: number }>(a: T, b: T) {
  return orderOf(a) - orderOf(b)
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

function formatDuration(value?: number) {
  if (!value) return '-'
  return `${value}s`
}

function statusLabel(status?: string) {
  return statusLabels[String(status ?? '')] ?? status ?? '未知'
}
