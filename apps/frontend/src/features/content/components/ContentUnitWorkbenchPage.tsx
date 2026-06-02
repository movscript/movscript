import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronDown, ChevronUp, Search } from 'lucide-react'

import { RESOURCE_UPLOAD_ACCEPT } from '@/shared/domain/mediaTypes'
import { contentWorkbenchCanvasRoute, openContentWorkbenchUnitCanvas } from '@/features/content/application/contentWorkbenchCanvasLaunch'
import { useContentWorkbenchPageController } from '@/features/content/application/contentWorkbenchPageController'
import {
  buildContentGenerationMomentRows,
  contentWorkbenchNullableNumber,
  loadContentWorkbenchData,
  type ContentGenerationMomentRow,
  type ContentWorkbenchRecord as WorkbenchRecord,
} from '@/features/content/domain/contentWorkbenchModel'
import {
  byOrder,
  firstText,
  titleOfRecord,
} from '@/features/content/domain/contentWorkbenchRecordUtils'
import { normalizeAssetSlotStatus } from '@/features/content/domain/contentWorkbenchStatus'
import { contentUnitKindOptions, trackKindLabel } from '@/features/content/domain/contentWorkbenchLabels'
import {
  keyframeFrameRoleLabel,
  keyframeOrderForRole,
  nextKeyframeFrameRole,
} from '@/features/content/domain/contentWorkbenchEditModel'
import { pickContentWorkbenchUploadTarget } from '@/features/content/domain/contentWorkbenchUploadTarget'
import {
  buildContentWorkbenchUploadCandidateMutationOptions,
  useContentWorkbenchCandidateUploadInput,
} from '@/features/content/application/contentWorkbenchUploadController'
import { useProjectWorkbenchShellProps } from '@/features/project-workbenches/application/useProjectWorkbenchShellProps'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { toast } from '@/shared/ui/toastStore'
import {
  Badge,
  Button,
  ContentWorkbenchCandidateUploadInput,
  ContentWorkbenchWorkspaceShell,
  ContentWorkbenchUnitInspectorShell,
  Input,
  NativeSelect,
  WorkbenchEmptyState,
  WorkbenchProjectBody,
  WorkbenchProjectShell,
} from '@movscript/ui'
import { semanticEntityConfig, type SemanticEntityPayload } from '@/shared/infrastructure/api/semanticEntities'
import { ContentUnitEditCards } from './ContentUnitEditCards'
import { CompactShotListCard } from './CompactShotListCard'
import { ContentWorkbenchDialogs } from './ContentWorkbenchDialogs'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'

const SHOT_LIST_PAGE_SIZE = 8

type ContentUnitWorkbenchShotItem = {
  row: ContentGenerationMomentRow
  unit: WorkbenchRecord
  productionTitle: string
  segmentTitle: string
  missingCount: number
  keyframeCount: number
}

function ContentUnitWorkbenchShotGrid({
  items,
  selectedUnitId,
  collapsed,
  page,
  query,
  kindValue,
  productionValue,
  segmentValue,
  kindOptions,
  productionOptions,
  segmentOptions,
  onCollapsedChange,
  onPageChange,
  onQueryChange,
  onKindChange,
  onProductionChange,
  onSegmentChange,
  onSelectUnit,
}: {
  items: ContentUnitWorkbenchShotItem[]
  selectedUnitId?: number | null
  collapsed: boolean
  page: number
  query: string
  kindValue: string
  productionValue: string
  segmentValue: string
  kindOptions: Array<{ value: string; label: string }>
  productionOptions: Array<{ value: string; label: string }>
  segmentOptions: Array<{ value: string; label: string }>
  onCollapsedChange: (collapsed: boolean) => void
  onPageChange: (page: number) => void
  onQueryChange: (query: string) => void
  onKindChange: (value: string) => void
  onProductionChange: (value: string) => void
  onSegmentChange: (value: string) => void
  onSelectUnit: (row: ContentGenerationMomentRow, unitId: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(items.length / SHOT_LIST_PAGE_SIZE))
  const safePage = Math.min(Math.max(page, 0), pageCount - 1)
  const pageItems = collapsed ? [] : items.slice(safePage * SHOT_LIST_PAGE_SIZE, (safePage + 1) * SHOT_LIST_PAGE_SIZE)

  return (
    <aside className="content-unit-workbench-list-panel" data-testid="content-unit-workbench-list-panel">
      <div className="content-unit-workbench-list-panel__header">
        <div className="content-unit-workbench-list-panel__title-block">
          <span className="content-unit-workbench-list-panel__kicker">内容编辑</span>
          <h2 className="content-unit-workbench-list-panel__title">内容列表</h2>
        </div>
        <div className="content-unit-workbench-list-panel__controls">
          <Badge variant="outline">{items.length}</Badge>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onCollapsedChange(!collapsed)}
            aria-expanded={!collapsed}
            aria-controls="content-unit-workbench-content-grid"
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            {collapsed ? '展开' : '折叠'}
          </Button>
        </div>
      </div>
      {!collapsed ? (
        <>
          <div className="content-unit-workbench-list-panel__filters" aria-label="内容列表筛选">
            <label className="content-unit-workbench-list-panel__filter">
              <span>分类</span>
              <NativeSelect controlSize="sm" variant="subtle" value={kindValue} onChange={(event) => onKindChange(event.target.value)}>
                <option value="">全部分类</option>
                {kindOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </NativeSelect>
            </label>
            <label className="content-unit-workbench-list-panel__filter">
              <span>制作</span>
              <NativeSelect controlSize="sm" variant="subtle" value={productionValue} onChange={(event) => onProductionChange(event.target.value)}>
                <option value="">全部制作</option>
                {productionOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </NativeSelect>
            </label>
            <label className="content-unit-workbench-list-panel__filter">
              <span>情绪段</span>
              <NativeSelect controlSize="sm" variant="subtle" value={segmentValue} onChange={(event) => onSegmentChange(event.target.value)}>
                <option value="">全部情绪段</option>
                {segmentOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </NativeSelect>
            </label>
            <label className="content-unit-workbench-list-panel__filter content-unit-workbench-list-panel__filter--search">
              <span>情节搜索</span>
              <div className="content-unit-workbench-list-panel__search">
                <Search size={14} className="content-unit-workbench-list-panel__search-icon" />
                <Input
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder="搜索情节、内容或提示"
                  className="content-unit-workbench-list-panel__search-input"
                />
              </div>
            </label>
          </div>

          <div id="content-unit-workbench-content-grid" className="content-unit-workbench-list-panel__viewport">
            {items.length === 0 ? (
              <WorkbenchEmptyState compact title="暂无内容" description="调整分类、制作、情绪段或情节搜索，或从创作编排工作台创建内容。" />
            ) : (
              pageItems.map((item) => (
                <CompactShotListCard
                  key={item.unit.ID}
                  active={selectedUnitId === item.unit.ID}
                  kind={trackKindLabel(String(item.unit.kind || 'shot'))}
                  title={titleOfRecord(item.unit)}
                  frameCount={item.keyframeCount}
                  expression={firstText(item.unit.description, item.unit.prompt, '未填写镜头表达')}
                  cue={`情节 · ${item.row.title}`}
                  status={item.keyframeCount > 0 ? '已有关键帧' : '待补关键帧'}
                  context={`制作 · ${item.productionTitle} / 情绪段 · ${item.segmentTitle}`}
                  onOpen={() => onSelectUnit(item.row, item.unit.ID)}
                />
              ))
            )}
          </div>
        </>
      ) : null}

      {!collapsed && items.length > SHOT_LIST_PAGE_SIZE ? (
        <div className="content-unit-workbench-list-panel__pagination" aria-label="内容列表翻页">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={safePage === 0}
            onClick={() => onPageChange(safePage - 1)}
          >
            上一页
          </Button>
          <span>{safePage + 1} / {pageCount}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={safePage >= pageCount - 1}
            onClick={() => onPageChange(safePage + 1)}
          >
            下一页
          </Button>
        </div>
      ) : null}
    </aside>
  )
}

function contentUnitWorkbenchItemMatchesSearch(item: ContentUnitWorkbenchShotItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  return [
    item.row.title,
    item.row.scope,
    item.productionTitle,
    item.segmentTitle,
    trackKindLabel(String(item.unit.kind || 'shot')),
    titleOfRecord(item.unit),
    firstText(item.unit.description, item.unit.prompt, item.unit.content),
    firstText(item.unit.status),
  ].join(' ').toLowerCase().includes(normalizedQuery)
}

export function ContentUnitWorkbenchPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const candidateUploadInput = useContentWorkbenchCandidateUploadInput()
  const [creatingUnit, setCreatingUnit] = useState(false)
  const [unitWorkspaceDefaults, setUnitWorkspaceDefaults] = useState<Partial<SemanticEntityPayload> | null>(null)
  const [creatingAssetSlot, setCreatingAssetSlot] = useState(false)
  const [creatingKeyframe, setCreatingKeyframe] = useState(false)
  const [editingUnit, setEditingUnit] = useState(false)
  const [shotListCollapsed, setShotListCollapsed] = useState(false)
  const [shotListPage, setShotListPage] = useState(0)
  const [contentListQuery, setContentListQuery] = useState('')
  const [contentListKindFilter, setContentListKindFilter] = useState('')
  const [contentListProductionFilter, setContentListProductionFilter] = useState('')
  const [contentListSegmentFilter, setContentListSegmentFilter] = useState('')

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['workbench', 'production', projectId],
    queryFn: () => loadContentWorkbenchData(projectId!),
    enabled: !!projectId,
  })
  const rows = useMemo(() => buildContentGenerationMomentRows(data), [data])
  const pageController = useContentWorkbenchPageController({
    projectId,
    route: ROUTES.project.contentUnitEditor,
    rows,
    productions: data?.productions ?? [],
    searchParams,
    setSearchParams,
    matchesSearch: () => true,
  })
  const {
    selected,
    selectedUnit,
    visibleRows,
    selectContentUnit,
    selectContentUnitFromRow,
    setOptimisticSelectedUnit,
  } = pageController
  const contentUnitConfig = useMemo(() => semanticEntityConfig('contentUnits'), [])
  const productionsById = useMemo(() => new Map((data?.productions ?? []).map((production) => [production.ID, production])), [data?.productions])
  const contentListKindOptions = useMemo(() => contentUnitKindOptions(contentUnitConfig), [contentUnitConfig])
  const contentListProductionOptions = useMemo(() => {
    const unassignedCount = visibleRows.filter((row) => row.productionIds.length === 0).reduce((sum, row) => sum + row.units.length, 0)
    return [
      ...(unassignedCount > 0 ? [{ value: 'unassigned', label: `未绑定制作 (${unassignedCount})` }] : []),
      ...(data?.productions ?? [])
        .map((production) => {
          const count = visibleRows.filter((row) => row.productionIds.includes(production.ID)).reduce((sum, row) => sum + row.units.length, 0)
          return { value: String(production.ID), label: `${titleOfRecord(production)} (${count})`, count }
        })
        .filter((option) => option.count > 0)
        .map(({ value, label }) => ({ value, label })),
    ]
  }, [data?.productions, visibleRows])
  const contentListSegmentOptions = useMemo(() => {
    const segmentMap = new Map<string, { value: string; label: string; count: number }>()
    let unassignedCount = 0
    for (const row of visibleRows) {
      if (!row.segment?.ID) {
        unassignedCount += row.units.length
        continue
      }
      const key = String(row.segment.ID)
      const existing = segmentMap.get(key)
      if (existing) existing.count += row.units.length
      else segmentMap.set(key, { value: key, label: titleOfRecord(row.segment), count: row.units.length })
    }
    return [
      ...(unassignedCount > 0 ? [{ value: 'unassigned', label: `未绑定情绪段 (${unassignedCount})` }] : []),
      ...Array.from(segmentMap.values())
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-Hans-CN'))
        .map((option) => ({ value: option.value, label: `${option.label} (${option.count})` })),
    ]
  }, [visibleRows])
  const allShotListItems = useMemo<ContentUnitWorkbenchShotItem[]>(() => visibleRows.flatMap((row) => (
    row.units.map((unit) => {
      const missingSlots = row.assetSlots.filter((slot) => (
        slot.owner_type === 'content_unit' &&
        Number(slot.owner_id) === unit.ID &&
        normalizeAssetSlotStatus(slot.status) === 'missing'
      ))
      return {
        row,
        unit,
        productionTitle: row.productionIds
          .map((id) => productionsById.get(id))
          .filter(Boolean)
          .map((production) => titleOfRecord(production))
          .slice(0, 2)
          .join('、') || '未绑定',
        segmentTitle: row.segment ? titleOfRecord(row.segment) : '未绑定',
        missingCount: missingSlots.length,
        keyframeCount: row.keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === unit.ID).length,
      }
    })
  )), [productionsById, visibleRows])
  const shotListItems = useMemo(() => allShotListItems.filter((item) => {
    if (contentListKindFilter && String(item.unit.kind || 'shot') !== contentListKindFilter) return false
    if (contentListProductionFilter === 'unassigned' && item.row.productionIds.length > 0) return false
    if (contentListProductionFilter && contentListProductionFilter !== 'unassigned' && !item.row.productionIds.includes(Number(contentListProductionFilter))) return false
    if (contentListSegmentFilter === 'unassigned' && item.row.segment?.ID) return false
    if (contentListSegmentFilter && contentListSegmentFilter !== 'unassigned' && item.row.segment?.ID !== Number(contentListSegmentFilter)) return false
    return contentUnitWorkbenchItemMatchesSearch(item, contentListQuery)
  }), [allShotListItems, contentListKindFilter, contentListProductionFilter, contentListQuery, contentListSegmentFilter])

  useEffect(() => {
    if (!selectedUnit?.ID) return
    const index = shotListItems.findIndex((item) => item.unit.ID === selectedUnit.ID)
    if (index < 0) return
    setShotListPage(Math.floor(index / SHOT_LIST_PAGE_SIZE))
  }, [selectedUnit?.ID, shotListItems])

  useEffect(() => {
    setShotListPage(0)
  }, [contentListKindFilter, contentListProductionFilter, contentListQuery, contentListSegmentFilter])

  const assetSlotConfig = useMemo(() => semanticEntityConfig('assetSlots'), [])
  const keyframeConfig = useMemo(() => semanticEntityConfig('keyframes'), [])
  const productionWorkbenchQueryKey = ['workbench', 'production', projectId] as const
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
  const nextKeyframeRole = nextKeyframeFrameRole(selectedUnitKeyframes)
  const keyframeDefaults = useMemo<Partial<SemanticEntityPayload> | undefined>(() => {
    if (!selected || !selectedUnit) return undefined
    return {
      production_id: contentWorkbenchNullableNumber(selectedUnit.production_id ?? selected.segment?.production_id ?? selected.moment.production_id ?? selected.productionIds[0]),
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
      production_id: contentWorkbenchNullableNumber(selectedUnit.production_id ?? selected.moment.production_id ?? selected.segment?.production_id ?? selected.productionIds[0]),
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
  const uploadCandidate = useMutation(buildContentWorkbenchUploadCandidateMutationOptions({
    projectId,
    queryClient,
    onSettled: candidateUploadInput.resetUpload,
  }))
  const openUnitCanvas = useMutation({
    mutationFn: async (unit: WorkbenchRecord) => {
      if (!projectId) throw new Error('请先选择项目')
      return openContentWorkbenchUnitCanvas({ projectId, unit })
    },
    onSuccess: (canvas) => navigate(contentWorkbenchCanvasRoute(canvas)),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '打开生成画布失败')
    },
  })

  function openCreateUnit() {
    if (!selected) return
    setUnitWorkspaceDefaults(null)
    setCreatingUnit(true)
  }

  function openCreateAssetSlot() {
    if (!selectedUnit) return
    setCreatingAssetSlot(true)
  }

  function openCreateKeyframe() {
    if (!selectedUnit) return
    setCreatingKeyframe(true)
  }

  function openSelectedUnitCanvas() {
    if (!selectedUnit || openUnitCanvas.isPending) return
    openUnitCanvas.mutate(selectedUnit)
  }

  function triggerCandidateUpload() {
    candidateUploadInput.triggerUpload(uploadTargetSlot, candidateUploadInput.uploading || uploadCandidate.isPending)
  }

  function handleCandidateUpload(file?: File) {
    candidateUploadInput.uploadFile(file, uploadTargetSlot, {
      disabled: uploadCandidate.isPending,
      onUpload: (input) => uploadCandidate.mutate(input),
    })
  }

  const shellProps = useProjectWorkbenchShellProps({
    workbenchId: 'content_orchestration',
    projectName: project?.name,
    kicker: '内容编辑',
    title: selectedUnit ? titleOfRecord(selectedUnit) : '内容编辑',
    description: selected ? `${selected.title} · 专注编辑单个镜头的生成目标、关键帧、素材和画布入口。` : '从创作编排页选择镜头后进入独立编辑工作台。',
    badges: isFetching ? <Badge variant="outline">同步中</Badge> : null,
    actions: (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => navigate(withRouteParams(ROUTES.project.productionOrchestration, {
          productionId: selected?.productionIds[0],
          scene_moment_id: selected?.moment.ID,
          content_unit_id: selectedUnit?.ID,
        }))}
      >
        <ArrowLeft size={14} />
        返回创作编排
      </Button>
    ),
    onRefresh: () => { void refetch() },
    refreshing: isFetching,
  })

  return (
    <WorkbenchProjectShell {...shellProps}>
      <WorkbenchProjectBody padding="none" scroll="hidden" tone="muted">
        {!projectId ? (
          <WorkbenchEmptyState title="请先选择项目" description="当前没有可用的项目信息，无法编辑镜头。" />
        ) : isLoading ? (
          <WorkbenchEmptyState title="正在加载内容编辑..." compact />
        ) : isError ? (
          <WorkbenchEmptyState title="内容编辑加载失败" description="后端语义实体接口未返回可用数据，稍后重试。" />
        ) : (
          <ContentWorkbenchWorkspaceShell>
            <div className="content-unit-workbench-shell">
              <ContentUnitWorkbenchShotGrid
                items={shotListItems}
                selectedUnitId={selectedUnit?.ID}
                collapsed={shotListCollapsed}
                page={shotListPage}
                query={contentListQuery}
                kindValue={contentListKindFilter}
                productionValue={contentListProductionFilter}
                segmentValue={contentListSegmentFilter}
                kindOptions={contentListKindOptions}
                productionOptions={contentListProductionOptions}
                segmentOptions={contentListSegmentOptions}
                onCollapsedChange={setShotListCollapsed}
                onPageChange={setShotListPage}
                onQueryChange={setContentListQuery}
                onKindChange={setContentListKindFilter}
                onProductionChange={setContentListProductionFilter}
                onSegmentChange={setContentListSegmentFilter}
                onSelectUnit={(row, unitId) => selectContentUnitFromRow(row, unitId)}
              />
              <ContentWorkbenchUnitInspectorShell className="content-unit-workbench-shell__body">
                <ContentUnitEditCards
                  projectId={projectId}
                  queryKey={productionWorkbenchQueryKey}
                  jobs={data?.jobs ?? []}
                  row={selected}
                  unit={selectedUnit}
                  onSelectUnit={selectContentUnit}
                  onCreateUnit={openCreateUnit}
                  onCreateAssetSlot={openCreateAssetSlot}
                  onCreateKeyframe={openCreateKeyframe}
                  onOpenCanvas={openSelectedUnitCanvas}
                  onUploadMissingAssets={triggerCandidateUpload}
                  onDeleteUnit={() => {
                    if (selected) selectContentUnitFromRow(selected, null, { replace: true })
                  }}
                />
              </ContentWorkbenchUnitInspectorShell>
            </div>
          </ContentWorkbenchWorkspaceShell>
        )}
      </WorkbenchProjectBody>
      <ContentWorkbenchDialogs
        projectId={projectId}
        queryKey={productionWorkbenchQueryKey}
        selected={selected}
        selectedUnit={selectedUnit}
        selectedUnitKeyframes={selectedUnitKeyframes}
        contentUnitConfig={contentUnitConfig}
        assetSlotConfig={assetSlotConfig}
        keyframeConfig={keyframeConfig}
        creatingUnit={creatingUnit}
        unitWorkspaceDefaults={unitWorkspaceDefaults}
        editingUnit={editingUnit}
        creatingAssetSlot={creatingAssetSlot}
        assetSlotDefaults={assetSlotDefaults}
        creatingKeyframe={creatingKeyframe}
        keyframeDefaults={keyframeDefaults}
        onCreatingUnitChange={(open) => {
          if (!open) {
            setCreatingUnit(false)
            setUnitWorkspaceDefaults(null)
          }
        }}
        onUnitSaved={(record) => {
          selectContentUnit(record.ID)
          setOptimisticSelectedUnit(record)
          setCreatingUnit(false)
          setUnitWorkspaceDefaults(null)
          setEditingUnit(false)
        }}
        onEditingUnitChange={(open) => { if (!open) setEditingUnit(false) }}
        onAssetSlotCreated={() => setCreatingAssetSlot(false)}
        onCreatingAssetSlotChange={(open) => { if (!open) setCreatingAssetSlot(false) }}
        onKeyframeCreated={(record) => {
          setCreatingKeyframe(false)
          selectContentUnit(Number(record.content_unit_id) || selectedUnit?.ID || null)
        }}
        onCreatingKeyframeChange={(open) => { if (!open) setCreatingKeyframe(false) }}
      />
      <ContentWorkbenchCandidateUploadInput ref={candidateUploadInput.inputRef} accept={RESOURCE_UPLOAD_ACCEPT} onChange={(e) => handleCandidateUpload(e.target.files?.[0])} />
    </WorkbenchProjectShell>
  )
}
