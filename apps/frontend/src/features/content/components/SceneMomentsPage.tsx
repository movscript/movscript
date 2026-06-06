import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Boxes,
  Clapperboard,
  Film,
  Layers3,
  PackageCheck,
  Plus,
  RefreshCcw,
  Route,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import { abandonSceneMoment, listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import { ContentWorkspaceLayout } from '@movscript/ui'
import { PreviewDrawer } from '@/shared/ui/PreviewDrawer'
import { ContentPageActionButton, ContentPageEmptyState, ContentPageKeyValue, ContentPageListCard, ContentPageListCardDescription, ContentPageListCardHeader, ContentPageListCardMetaRow, ContentPageListCardMetricGrid, ContentPageListCardReadiness, ContentPageListCardSubtitle, ContentPageListCardTitle, ContentPageListViewport, ContentPageMeta, ContentPageMetricCard, ContentPagePanel, ContentPageRelatedActionItem, ContentPageRelatedDescription, ContentPageRelatedHeader, ContentPageRelatedItem, ContentPageRelatedMetaRow, ContentPageRelatedStack, ContentPageRelatedTitle, ContentPageStatusBadge, ContentPageSummaryGrid, ContentPageSurfaceItem, ContentPageTextEmptyState, ProjectSurfaceHeader } from '@movscript/ui'
import { SemanticEntityInlineEditor } from '@/shared/ui/SemanticEntityInlineEditor'
import { ContentFilterBar } from '@/features/content/presentation/ContentFilterBar'
import { makeContentFilterSearch, readNumberParam, readStringParam, updateContentFilterParams, type ContentFilterKey } from '@/features/content/presentation/contentFilters'
import { contentEntityStatusRecipe } from '@/features/content/presentation/contentSemanticUi'
import { isGeneratedKeyframeCandidateRecord } from '@/features/agent/domain/agentGeneratedResourceBinding'
import { isActiveSemanticEntityRecord } from '@/shared/domain/semanticEntityVisibility'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
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
  setting_id?: number
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

const statusLabels: Record<string, string> = {
  confirmed: '已确认',
  locked: '已锁定',
  accepted: '已采纳',
  attached: '已关联',
  workspace: '工作区',
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
    queryKey: ['semantic-scene-moment-page', projectId, 'settings'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('settings')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const usagesQuery = useQuery({
    queryKey: ['semantic-scene-moment-page', projectId, 'setting-usages'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('settingUsages')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const assetSlotsQuery = useQuery({
    queryKey: ['semantic-scene-moment-page', projectId, 'asset-slots'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('assetSlots')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })

  const segments = useMemo(() => (segmentsQuery.data ?? []).filter(isActiveSemanticEntityRecord), [segmentsQuery.data])
  const moments = useMemo(
    () => (sceneMomentsQuery.data ?? []).filter(isActiveSemanticEntityRecord).slice().sort(compareByOrder),
    [sceneMomentsQuery.data],
  )
  const contentUnits = useMemo(() => (contentUnitsQuery.data ?? []).filter(isActiveSemanticEntityRecord), [contentUnitsQuery.data])
  const scriptBlocks = scriptBlocksQuery.data ?? []
  const keyframes = useMemo(
    () => (keyframesQuery.data ?? []).filter((item) => !isGeneratedKeyframeCandidateRecord(item)),
    [keyframesQuery.data],
  )
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
      .map((usage) => usage.setting_id ? referencesById.get(usage.setting_id) : undefined)
      .filter(Boolean) as RelatedRecord[])
    const referenceIds = new Set(momentReferences.map((item) => item.ID))
    const momentAssetSlots = assetSlots.filter((item) => (
      (item.owner_type === 'scene_moment' && item.owner_id === moment.ID) ||
      Boolean(item.owner_type === 'content_unit' && item.owner_id && contentUnitIds.has(item.owner_id)) ||
      Boolean(item.setting_id && referenceIds.has(item.setting_id))
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
          <ProjectSurfaceHeader
            icon={Clapperboard}
            title="情景"
            description="情景属于某一个编排段，提供时间、地点、条件、动作和情绪上下文；设定资料和素材需求从这里向下游制作项与生产任务传递。"
            actions={(
              <>
            <ContentPageActionButton onClick={startCreateMoment}>
              <Plus size={14} />
              新建情景
            </ContentPageActionButton>
            <ContentPageActionButton variant="outline" onClick={refreshAll} loading={isFetching}>
              <RefreshCcw size={14} />
              刷新
            </ContentPageActionButton>
            <ContentPageActionButton asChild>
              <Link to={`${ROUTES.project.productionOrchestration}${selected ? makeContentFilterSearch({ scene_moment_id: selected.moment.ID }) : ''}`}>
                <Boxes size={14} />
                查看镜头方案
              </Link>
            </ContentPageActionButton>
              </>
            )}
          />
        )}
        overview={(
          <ContentPageSummaryGrid>
          <ContentPageMetricCard icon={Film} label="情景" value={momentWorkspaces.length} detail={`${filteredMoments.length} 个符合当前筛选`} tone="info" />
          <ContentPageMetricCard icon={Layers3} label="所属编排段" value={new Set(moments.map((item) => item.segment_id).filter(Boolean)).size} detail="情景通过编排段进入制作结构" tone="info" />
          <ContentPageMetricCard icon={ShieldCheck} label="可推进" value={readyCount} detail={`${averageReadiness}% 平均准备度`} tone="success" />
          <ContentPageMetricCard icon={AlertTriangle} label="待处理" value={attentionCount} detail={`估算总时长 ${formatDuration(totalDuration)}`} tone="warning" />
          </ContentPageSummaryGrid>
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
            <ContentPagePanel title="情景列表" icon={Route}>
              <ContentPageListViewport>
                {isLoading ? (
                  <ContentPageEmptyState icon={Film} title="正在加载情景" detail="读取情景和上游编排段" compact />
                ) : filteredMoments.length === 0 ? (
                  <ContentPageEmptyState icon={Film} title="暂无情景" detail="可从编排段页或剧本拆解生成情景" compact />
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
              </ContentPageListViewport>
            </ContentPagePanel>
        )}
        preview={(
          <ContentPagePanel title="制作项设计" icon={Boxes}>
            <RelatedList
              records={selected?.contentUnits ?? []}
              scriptBlocksById={scriptBlocksById}
              empty="当前情景暂无制作项"
              onSelect={(record) => setFilter({ content_unit_id: record.ID })}
            />
          </ContentPagePanel>
        )}
        detail={(
          <>
            {selected && !creatingMoment && projectId && (
              <div className="flex justify-end">
                <ContentPageActionButton size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
                  <Clapperboard size={14} />
                  预览
                </ContentPageActionButton>
              </div>
            )}
            <SemanticEntityInlineEditor
              projectId={projectId}
              config={sceneMomentConfig}
              record={creatingMoment ? null : selected?.moment}
              defaults={creatingMoment ? { segment_id: selected?.segment?.ID ?? segmentFilterId ?? null, script_block_id: selected?.scriptBlock?.ID ?? selected?.segment?.script_block_id ?? null, order: momentWorkspaces.length + 1, status: 'workspace' } : undefined}
              queryKey={['semantic-scene-moment-page', projectId]}
              title={creatingMoment ? '新建情景' : '卡片内编辑情景'}
              description="直接维护情景标题、时空、条件、动作和情绪；引用关系不在这里重写。"
              hero={{
                icon: <Film size={18} />,
                eyebrow: selected?.segment ? titleOf(selected.segment) : '未绑定编排段',
                title: creatingMoment ? '新建情景' : selected ? titleOf(selected.moment) : '新建情景',
                subtitle: creatingMoment ? '项目情景' : selected ? `情景 #${selected.moment.ID}` : '项目情景',
                summary: creatingMoment ? '补充时间、地点、条件、动作和情绪后，情景就可以承接制作项与素材需求。' : selected?.moment.description || selected?.moment.action_text || '暂无情景描述。',
                accentTone: 'teal',
                status: <ContentPageStatusBadge {...contentEntityStatusRecipe(creatingMoment ? 'workspace' : selected?.moment.status ?? 'workspace')}>{statusLabel(creatingMoment ? 'workspace' : selected?.moment.status ?? 'workspace')}</ContentPageStatusBadge>,
                stats: selected && !creatingMoment ? [
                  { label: '时间', value: selected.moment.time_text || '未设定' },
                  { label: '地点', value: selected.moment.location_text || '未设定' },
                  { label: '剧本来源', value: selected.scriptBlock ? `行 ${selected.scriptBlock.start_line || '?'}-${selected.scriptBlock.end_line || '?'}` : '未绑定' },
                  { label: '制作项', value: selected.contentUnits.length },
                ] : [
                  { label: '默认状态', value: '工作区' },
                  { label: '所属编排段', value: selected?.segment ? titleOf(selected.segment) : '未绑定' },
                  { label: '剧本来源', value: selected?.scriptBlock ? `行 ${selected.scriptBlock.start_line || '?'}-${selected.scriptBlock.end_line || '?'}` : '继承编排段' },
                  { label: '顺序', value: momentWorkspaces.length + 1 },
                ],
              }}
              onSaved={(record) => {
                setCreatingMoment(false)
                setFilter({ scene_moment_id: record.ID, segment_id: record.segment_id as number | undefined })
              }}
              deleteRecord={(record) => abandonSceneMoment(projectId!, record.ID)}
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
            <ContentPagePanel title="来源剧本块" icon={ScrollText}>
              {selected?.scriptBlock ? (
                <ContentPageSurfaceItem>
                  <p className="truncate type-label font-medium text-foreground">{scriptBlockSourceLabel(selected.scriptBlock)}</p>
                  <p className="mt-1 line-clamp-4 type-caption leading-4 text-muted-foreground">{String(selected.scriptBlock.content ?? '').trim() || '暂无剧本块正文'}</p>
                </ContentPageSurfaceItem>
              ) : (
                <ContentPageTextEmptyState>当前情景暂无稳定剧本块来源</ContentPageTextEmptyState>
              )}
            </ContentPagePanel>
            <ContentPagePanel title="涉及到的设定资料" icon={Sparkles}>
              <RelatedList
                records={selected?.references ?? []}
                empty="当前情景暂无设定资料引用"
                onSelect={(record) => setFilter({ reference_id: record.ID })}
              />
            </ContentPagePanel>
            <ContentPagePanel title="所需要的素材需求" icon={PackageCheck}>
              <RelatedList
                records={selected?.assetSlots ?? []}
                empty="当前情景暂无素材需求"
                onSelect={(record) => setFilter({ asset_slot_id: record.ID })}
              />
            </ContentPagePanel>
            <ContentPagePanel title="需要产出的制作项" icon={Boxes}>
              <RelatedList
                records={selected?.contentUnits ?? []}
                scriptBlocksById={scriptBlocksById}
                empty="当前情景暂无制作项"
                onSelect={(record) => setFilter({ content_unit_id: record.ID })}
              />
            </ContentPagePanel>
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
    <ContentPageListCard
      onClick={onClick}
      active={selected}
    >
      <ContentPageListCardHeader
        aside={(
          <ContentPageStatusBadge {...contentEntityStatusRecipe(item.moment.status ?? 'workspace')}>{statusLabel(item.moment.status ?? 'workspace')}</ContentPageStatusBadge>
        )}
      >
        <ContentPageListCardTitle>{titleOf(item.moment)}</ContentPageListCardTitle>
        <ContentPageListCardSubtitle>{item.segment ? titleOf(item.segment) : '未绑定编排段'}</ContentPageListCardSubtitle>
      </ContentPageListCardHeader>
      <ContentPageListCardDescription>{item.moment.description || item.moment.action_text || '暂无情景描述'}</ContentPageListCardDescription>
      {item.scriptBlock ? (
        <ContentPageListCardMetaRow>
          <ContentPageMeta icon={ScrollText}>{scriptBlockSourceLabel(item.scriptBlock)}</ContentPageMeta>
        </ContentPageListCardMetaRow>
      ) : null}
      <ContentPageListCardMetricGrid>
        <ContentPageKeyValue label="内容" value={item.contentUnits.length} strong />
        <ContentPageKeyValue label="设定资料" value={item.references.length} strong />
        <ContentPageKeyValue label="素材需求" value={item.assetSlots.length} strong />
      </ContentPageListCardMetricGrid>
      <ContentPageListCardReadiness value={item.readiness} />
    </ContentPageListCard>
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
    return <ContentPageTextEmptyState>{empty}</ContentPageTextEmptyState>
  }

  return (
    <ContentPageRelatedStack>
      {records.slice(0, 8).map((record) => {
        const scriptBlock = record.script_block_id ? scriptBlocksById?.get(record.script_block_id) : undefined
        const content = (
          <>
            <ContentPageRelatedHeader
              aside={<ContentPageStatusBadge {...contentEntityStatusRecipe(record.status ?? 'workspace')}>{statusLabel(record.status ?? 'workspace')}</ContentPageStatusBadge>}
            >
              <ContentPageRelatedTitle>{titleOf(record)}</ContentPageRelatedTitle>
              <ContentPageRelatedDescription>{record.description || record.content || record.prompt || record.prompt_hint || record.visual_intent || record.kind || `ID ${record.ID}`}</ContentPageRelatedDescription>
              {record.script_block_id ? (
                <ContentPageRelatedMetaRow>
                  <ContentPageMeta icon={ScrollText}>{scriptBlockSourceLabel(scriptBlock) || `剧本块 #${record.script_block_id}`}</ContentPageMeta>
                </ContentPageRelatedMetaRow>
              ) : null}
              {scriptBlock?.content ? (
                <ContentPageRelatedDescription>{String(scriptBlock.content)}</ContentPageRelatedDescription>
              ) : null}
            </ContentPageRelatedHeader>
          </>
        )
        return onSelect ? (
          <ContentPageRelatedActionItem key={record.ID} onClick={() => onSelect(record)}>
            {content}
          </ContentPageRelatedActionItem>
        ) : (
          <ContentPageRelatedItem key={record.ID}>
            {content}
          </ContentPageRelatedItem>
        )
      })}
    </ContentPageRelatedStack>
  )
}

function normalizeStatusFilter(value: string): StatusFilter {
  return ['ready', 'attention', 'confirmed'].includes(value) ? value as StatusFilter : 'all'
}

function matchesStatus(status: StatusFilter, item: MomentWorkspace) {
  const value = String(item.moment.status ?? '')
  if (status === 'all') return true
  if (status === 'ready') return item.readiness >= 70 && item.assetSlots.every((slot) => !isAssetGap(slot))
  if (status === 'attention') return item.readiness < 70 || item.assetSlots.some(isAssetGap) || ['workspace', 'candidate', 'review', 'blocked'].includes(value)
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
