import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BadgeCheck, ChevronDown, ChevronUp, Clapperboard, Wand2 } from 'lucide-react'

import { RESOURCE_UPLOAD_ACCEPT } from '@/features/resources/domain/mediaTypes'
import {
  buildContentWorkbenchAiSuggestLaunchInput,
  buildContentWorkbenchVisualPlanLaunchInput,
  launchContentWorkbenchAiSuggestAgent,
  launchContentWorkbenchVisualPlanAgent,
} from '@/features/content/application/contentWorkbenchAgentLaunch'
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
  numberOf,
  titleOfRecord,
} from '@/features/content/domain/contentWorkbenchRecordUtils'
import { contentUnitWorkStatus, normalizeAssetSlotStatus } from '@/features/content/domain/contentWorkbenchStatus'
import { contentWorkbenchUnitRequiresKeyframe } from '@/features/content/domain/contentWorkbenchUnitTrack'
import { trackKindLabel } from '@/features/content/domain/contentWorkbenchLabels'
import {
  keyframeFrameRoleLabel,
  keyframeOrderForRole,
  nextKeyframeFrameRole,
} from '@/features/content/domain/contentWorkbenchEditModel'
import { pickContentWorkbenchUploadTarget } from '@/features/content/domain/contentWorkbenchUploadTarget'
import { pickContentWorkbenchRelevantJobs } from '@/features/content/domain/contentWorkbenchJobScope'
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
  ContentWorkbenchUnitExecutionDetail,
  ContentWorkbenchUnitExecutionDetailGrid,
  ContentWorkbenchUnitInspectorHeader,
  ContentWorkbenchUnitInspectorShell,
  ContentWorkbenchUnitNextActionCard,
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
  missingCount: number
  keyframeCount: number
}

function ContentUnitWorkbenchShotGrid({
  items,
  selectedUnitId,
  collapsed,
  page,
  onCollapsedChange,
  onPageChange,
  onSelectUnit,
}: {
  items: ContentUnitWorkbenchShotItem[]
  selectedUnitId?: number | null
  collapsed: boolean
  page: number
  onCollapsedChange: (collapsed: boolean) => void
  onPageChange: (page: number) => void
  onSelectUnit: (row: ContentGenerationMomentRow, unitId: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(items.length / SHOT_LIST_PAGE_SIZE))
  const safePage = Math.min(Math.max(page, 0), pageCount - 1)
  const pageItems = collapsed ? [] : items.slice(safePage * SHOT_LIST_PAGE_SIZE, (safePage + 1) * SHOT_LIST_PAGE_SIZE)

  return (
    <aside className="content-unit-workbench-list-panel" data-testid="content-unit-workbench-list-panel">
      <div className="content-unit-workbench-list-panel__header">
        <div className="content-unit-workbench-list-panel__title-block">
          <span className="content-unit-workbench-list-panel__kicker">镜头列表</span>
          <h2 className="content-unit-workbench-list-panel__title">待编辑镜头</h2>
        </div>
        <div className="content-unit-workbench-list-panel__controls">
          <Badge variant="outline">{items.length}</Badge>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onCollapsedChange(!collapsed)}
            aria-expanded={!collapsed}
            aria-controls="content-unit-workbench-shot-grid"
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            {collapsed ? '展开' : '折叠'}
          </Button>
        </div>
      </div>

      <div
        id="content-unit-workbench-shot-grid"
        className="content-unit-workbench-list-panel__viewport"
        data-collapsed={collapsed ? 'true' : undefined}
      >
        {items.length === 0 ? (
          <WorkbenchEmptyState compact title="暂无镜头" description="从创作编排工作台创建镜头后，可在这里选择并进入下方编辑。" />
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
              context={`制作 · ${item.productionTitle} / 情绪段 · ${item.row.segment ? titleOfRecord(item.row.segment) : '未绑定'}`}
              onOpen={() => onSelectUnit(item.row, item.unit.ID)}
            />
          ))
        )}
      </div>

      {!collapsed && items.length > SHOT_LIST_PAGE_SIZE ? (
        <div className="content-unit-workbench-list-panel__pagination" aria-label="镜头列表翻页">
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

export function ContentUnitWorkbenchPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const candidateUploadInput = useContentWorkbenchCandidateUploadInput()
  const [creatingUnit, setCreatingUnit] = useState(false)
  const [unitDraftDefaults, setUnitDraftDefaults] = useState<Partial<SemanticEntityPayload> | null>(null)
  const [creatingAssetSlot, setCreatingAssetSlot] = useState(false)
  const [creatingKeyframe, setCreatingKeyframe] = useState(false)
  const [editingUnit, setEditingUnit] = useState(false)
  const [shotListCollapsed, setShotListCollapsed] = useState(false)
  const [shotListPage, setShotListPage] = useState(0)

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
  const productionsById = useMemo(() => new Map((data?.productions ?? []).map((production) => [production.ID, production])), [data?.productions])
  const shotListItems = useMemo<ContentUnitWorkbenchShotItem[]>(() => visibleRows.flatMap((row) => (
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
        missingCount: missingSlots.length,
        keyframeCount: row.keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === unit.ID).length,
      }
    })
  )), [productionsById, visibleRows])

  useEffect(() => {
    if (!selectedUnit?.ID) return
    const index = shotListItems.findIndex((item) => item.unit.ID === selectedUnit.ID)
    if (index < 0) return
    setShotListPage(Math.floor(index / SHOT_LIST_PAGE_SIZE))
  }, [selectedUnit?.ID, shotListItems])

  const contentUnitConfig = useMemo(() => semanticEntityConfig('contentUnits'), [])
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
  const uploadTargetSlot = pickContentWorkbenchUploadTarget({
    selectedUnitAssetSlots,
    momentAssetSlots: selected?.assetSlots ?? [],
  })
  const selectedUnitRequiresKeyframe = selectedUnit ? contentWorkbenchUnitRequiresKeyframe(selectedUnit.kind) : true
  const selectedUnitStatus = selectedUnit ? contentUnitWorkStatus(selectedUnit, selectedUnitMissingSlots) : 'blocked'
  const selectedUnitActionTone = selectedUnitStatus === 'ready' ? 'ready' : selectedUnitStatus === 'blocked' ? 'blocked' : 'idle'
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
    setUnitDraftDefaults(null)
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

  function openAiSuggest(rowOverride?: ContentGenerationMomentRow) {
    const launchInput = buildContentWorkbenchAiSuggestLaunchInput({
      projectId,
      row: rowOverride ?? selected,
      productions: data?.productions ?? [],
    })
    if (!launchInput) {
      toast.info('请先选择情节')
      return
    }
    launchContentWorkbenchAiSuggestAgent(launchInput)
    toast.success('已打开 AI 助手，可在输入框补充需求后发送')
  }

  function openAiVisualTaskGraph(unitOverride?: WorkbenchRecord | null) {
    const launchInput = buildContentWorkbenchVisualPlanLaunchInput({
      projectId,
      row: selected,
      unit: unitOverride ?? selectedUnit,
      productions: data?.productions ?? [],
    })
    if (!launchInput) {
      toast.info('请先选择情节和制作项')
      return
    }
    launchContentWorkbenchVisualPlanAgent(launchInput)
    toast.success('已打开 AI 助手，可起草当前制作项的视觉计划')
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
                onCollapsedChange={setShotListCollapsed}
                onPageChange={setShotListPage}
                onSelectUnit={(row, unitId) => selectContentUnitFromRow(row, unitId)}
              />
              <ContentWorkbenchUnitInspectorShell className="content-unit-workbench-shell__body">
                <ContentWorkbenchUnitInspectorHeader
                  icon={<Clapperboard size={14} />}
                  kicker="内容编辑"
                  title={selectedUnit ? titleOfRecord(selectedUnit) : selected ? '选择或创建镜头' : '等待选择情节'}
                detail={selected ? `${selected.title} · ${selected.scope}` : '从创作编排页进入，或返回选择一个情节和镜头。'}
                  actions={(
                    <>
                      {selectedUnit ? <Badge variant="outline">{selectedUnitRequiresKeyframe ? '需要关键帧' : '无需关键帧'}</Badge> : null}
                      {selectedUnit ? <Badge variant="outline">{selectedUnitStatus}</Badge> : null}
                    </>
                  )}
                />
                {selectedUnit ? (
                  <ContentWorkbenchUnitNextActionCard
                    tone={selectedUnitActionTone}
                    icon={selectedUnitStatus === 'ready' ? <BadgeCheck size={15} /> : <Wand2 size={15} />}
                    label={selectedUnitStatus === 'ready' ? '进入生成画布' : '补齐镜头输入'}
                    detail={selectedUnitStatus === 'ready' ? '当前镜头核心输入已具备，可以进入生成画布检查并发起生成。' : '先在下方补齐提示词、素材缺口、关键帧和视觉调度。'}
                    actionText={selectedUnitStatus === 'ready' ? '生成画布' : '让 AI 起草'}
                    onAction={selectedUnitStatus === 'ready' ? openSelectedUnitCanvas : () => openAiVisualTaskGraph(selectedUnit)}
                  />
                ) : null}
                <ContentWorkbenchUnitExecutionDetailGrid>
                  <ContentWorkbenchUnitExecutionDetail label="情节" value={selected?.title ?? '未选择'} />
                  <ContentWorkbenchUnitExecutionDetail label="素材缺口" value={selectedUnitMissingSlots.length} meta={selectedUnitMissingSlots.length ? '需要补齐' : '无显性缺口'} />
                  <ContentWorkbenchUnitExecutionDetail label="关键帧" value={selectedUnitKeyframes.length} meta={selectedUnitRequiresKeyframe ? '必需' : '可选'} />
                  <ContentWorkbenchUnitExecutionDetail label="任务" value={selectedUnitJobs.length} meta="关联生成任务" />
                </ContentWorkbenchUnitExecutionDetailGrid>
                <ContentUnitEditCards
                  projectId={projectId}
                  queryKey={productionWorkbenchQueryKey}
                  jobs={data?.jobs ?? []}
                  row={selected}
                  unit={selectedUnit}
                  onSelectUnit={selectContentUnit}
                  onCreateUnit={openCreateUnit}
                  onAiSuggest={() => openAiSuggest(selected ?? undefined)}
                  onAiVisualTaskGraph={() => openAiVisualTaskGraph(selectedUnit)}
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
        unitDraftDefaults={unitDraftDefaults}
        editingUnit={editingUnit}
        creatingAssetSlot={creatingAssetSlot}
        assetSlotDefaults={assetSlotDefaults}
        creatingKeyframe={creatingKeyframe}
        keyframeDefaults={keyframeDefaults}
        onCreatingUnitChange={(open) => {
          if (!open) {
            setCreatingUnit(false)
            setUnitDraftDefaults(null)
          }
        }}
        onUnitSaved={(record) => {
          selectContentUnit(record.ID)
          setOptimisticSelectedUnit(record)
          setCreatingUnit(false)
          setUnitDraftDefaults(null)
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
