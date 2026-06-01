import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardCheck,
  Route,
  Wand2,
} from 'lucide-react'

import {
  buildContentWorkbenchAiSuggestLaunchInput,
  launchContentWorkbenchAiSuggestAgent,
} from '@/features/content/application/contentWorkbenchAgentLaunch'
import { pickContentWorkbenchFirstUsableUnit } from '@/features/content/domain/contentWorkbenchCandidateFocus'
import { contentWorkbenchProposalDefaults } from '@/features/content/domain/contentWorkbenchDraftProposal'
import { useContentWorkbenchPageController } from '@/features/content/application/contentWorkbenchPageController'
import { useContentWorkbenchReviewController } from '@/features/content/application/contentWorkbenchReviewController'
import {
  buildContentGenerationMomentRows,
  isVisibleContentWorkbenchRecord,
  loadContentWorkbenchData,
  type ContentGenerationMomentRow,
} from '@/features/content/domain/contentWorkbenchModel'
import {
  buildApplyContentUnitProposalMutationOptions,
  buildMarkContentDraftReviewedMutationOptions,
  buildMoveContentUnitOnTimelineMutationOptions,
  buildRejectContentDraftMutationOptions,
  buildReorderContentUnitsMutationOptions,
} from '@/features/content/application/contentWorkbenchMutationController'
import {
  firstText,
  numberOf,
  titleOfRecord,
} from '@/features/content/domain/contentWorkbenchRecordUtils'
import {
  previewTimelineItemRank,
} from '@/features/content/domain/contentWorkbenchTimeline'
import { unitIdentifier } from '@/features/content/domain/productionIdentifiers'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { toast } from '@/shared/ui/toastStore'
import {
  Badge,
  ContentWorkbenchBody,
  ContentWorkbenchCommandCenter,
  ContentWorkbenchDetailContent,
  ContentWorkbenchEmptyActionButton,
  ContentWorkbenchFilterSidebar,
  ContentWorkbenchInfoSection,
  ContentWorkbenchInfoText,
  ContentWorkbenchMainColumn,
  ContentWorkbenchReviewButton,
  ContentWorkbenchReviewPanel,
  ContentWorkbenchSceneInfoGrid,
  ContentWorkbenchViewHeader,
  ContentWorkbenchWorkspaceShell,
  OverlapPaneRevealButton,
  WorkbenchEmptyState,
  WorkbenchProjectBody,
  WorkbenchProjectShell,
  usePersistentOverlapPaneController,
} from '@movscript/ui'
import { ContentWorkbenchDialogs } from './ContentWorkbenchDialogs'
import { contentWorkbenchRowMatchesSearch } from './ContentWorkbenchSearch'
import { ContentWorkbenchScenePreview } from './ContentWorkbenchScenePreview'
import { UnitProductionTrack } from './ContentWorkbenchUnitTrack'
import { useProjectWorkbenchShellProps } from '@/features/project-workbenches/application/useProjectWorkbenchShellProps'
import {
  abandonSceneMoment,
  semanticEntityConfig,
  type SemanticEntityPayload,
} from '@/shared/infrastructure/api/semanticEntities'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'

const CONTENT_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY = 'movscript.contentWorkbench.detailPaneWidth'
function ContentWorkbenchSceneInfoCard({
  row,
}: {
  row: ContentGenerationMomentRow | null
}) {
  if (!row) {
    return (
      <ContentWorkbenchSceneInfoGrid data-testid="content-workbench-select-scene-empty">
        <ContentInfoSection title="涉及设定" items={['等待选择情节']} muted />
        <ContentInfoSection title="条目" items={['等待选择情节']} muted />
        <ContentInfoSection title="作用" items={['等待选择情节']} muted />
      </ContentWorkbenchSceneInfoGrid>
    )
  }

  const settingItems = row.references.slice(0, 4).map((record) => titleOfRecord(record))
  const contentItems = row.units.slice(0, 4).map((unit) => `${unitIdentifier(unit)} · ${titleOfRecord(unit)}`)
  const purposeItems = [
    firstText(row.moment.description, row.moment.action_text, row.moment.content, row.moment.prompt, row.scope),
  ].filter(Boolean)
  const hiddenSettingCount = Math.max(0, row.references.length - settingItems.length)
  const hiddenUnitCount = Math.max(0, row.units.length - contentItems.length)

  return (
    <ContentWorkbenchSceneInfoGrid data-testid="content-workbench-scene-info-card">
      <ContentInfoSection
        title="涉及设定"
        items={settingItems.length > 0 ? settingItems : ['未关联设定']}
        suffix={hiddenSettingCount > 0 ? `另有 ${hiddenSettingCount} 个` : undefined}
        muted={settingItems.length === 0}
      />
      <ContentInfoSection
        title="条目"
        items={contentItems.length > 0 ? contentItems : ['当前情节还没有内容条目']}
        suffix={hiddenUnitCount > 0 ? `另有 ${hiddenUnitCount} 个` : undefined}
        muted={contentItems.length === 0}
      />
      <ContentInfoSection
        title="作用"
        items={purposeItems.length > 0 ? purposeItems : ['未填写情节作用']}
        muted={purposeItems.length === 0}
      />
    </ContentWorkbenchSceneInfoGrid>
  )
}

function ContentInfoSection({
  title,
  items,
  suffix,
  muted = false,
}: {
  title: string
  items: string[]
  suffix?: string
  muted?: boolean
}) {
  return (
    <ContentWorkbenchInfoSection title={title} suffix={suffix}>
      {items.map((item, index) => (
        <ContentWorkbenchInfoText key={`${title}-${index}`} muted={muted}>
          {item}
        </ContentWorkbenchInfoText>
      ))}
    </ContentWorkbenchInfoSection>
  )
}

export function ContentWorkbenchPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['workbench', 'production', projectId],
    queryFn: () => loadContentWorkbenchData(projectId!),
    enabled: !!projectId,
  })
  const rows = useMemo(() => buildContentGenerationMomentRows(data), [data])
  const [creatingUnit, setCreatingUnit] = useState(false)
  const [unitDraftDefaults, setUnitDraftDefaults] = useState<Partial<SemanticEntityPayload> | null>(null)
  const detailPane = usePersistentOverlapPaneController({
    storageKey: CONTENT_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY,
    defaultSize: 880,
    minSize: 560,
    maxSize: (containerRect) => Math.max(600, Math.min(containerRect.width - 300, 1160)),
    resizeEdge: 'left',
    collapseMode: 'after-min',
    expandMode: 'after-max',
    ariaLabel: '调整内容编排详情面板宽度',
  })
  const pageController = useContentWorkbenchPageController({
    projectId,
    route: ROUTES.project.contentUnitWorkbench,
    rows,
    productions: data?.productions ?? [],
    searchParams,
    setSearchParams,
    matchesSearch: contentWorkbenchRowMatchesSearch,
  })
  const {
    productionFilter,
    segmentFilter,
    sidebarQuery,
    scopeLevel,
    filteredRows,
    visibleRows,
    productionFilterOptions,
    segmentFilterOptions,
    sceneMomentFilterOptions,
    selected,
    selectedUnit,
    setSidebarQuery,
    setOptimisticSelectedUnit,
    selectSceneMoment,
    selectContentUnit,
    selectContentUnitFromRow,
    selectProductionFilter,
    selectSegmentFilter,
    focusRowForUnitCreation,
  } = pageController
  const hasSelectedRow = Boolean(selected)
  const detailPaneLayoutProps = hasSelectedRow
    ? detailPane.groupProps
    : {
        ...detailPane.groupProps,
        'data-overlap-pane-collapsed': 'true' as const,
        'data-overlap-pane-expanded': undefined,
      }
  const selectedUnitKeyframes = selected && selectedUnit
    ? selected.keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === selectedUnit.ID)
    : []
  const keyframeConfig = useMemo(() => semanticEntityConfig('keyframes'), [])
  const assetSlotConfig = useMemo(() => semanticEntityConfig('assetSlots'), [])

  const contentUnitConfig = useMemo(() => semanticEntityConfig('contentUnits'), [])
  const previewTimelineItemConfig = useMemo(() => semanticEntityConfig('previewTimelineItems'), [])
  const productionWorkbenchQueryKey = ['workbench', 'production', projectId] as const
  const reviewController = useContentWorkbenchReviewController({
    projectId,
    rows,
    searchParams,
    setSearchParams,
  })
  const {
    drafts: reviewDrafts,
    draftsQuery: reviewDraftsQuery,
    selectedDraft: selectedReviewDraft,
    reviewModel: contentDraftReview,
    queueSummary: reviewQueueSummary,
    reviewMode,
    showReviewPanel,
    selectDraft: selectReviewDraft,
    closeReview,
  } = reviewController

  const rejectContentDraft = useMutation(buildRejectContentDraftMutationOptions({
    refetchDrafts: reviewDraftsQuery.refetch,
    closeReview,
  }))
  const markContentDraftReviewed = useMutation(buildMarkContentDraftReviewedMutationOptions({
    projectId,
    selectedMomentId: selected?.moment.ID,
    refetchDrafts: reviewDraftsQuery.refetch,
    closeReview,
  }))
  const applyContentUnitProposal = useMutation(buildApplyContentUnitProposalMutationOptions({
    projectId,
    contentUnitConfig,
    contentUnits: data?.contentUnits ?? [],
    queryClient,
    productionWorkbenchQueryKey,
    selectContentUnit,
    setOptimisticSelectedUnit,
  }))

  const totalUnitCount = visibleRows.reduce((sum, row) => sum + row.units.length, 0)
  const totalKeyframeCount = visibleRows.reduce((sum, row) => sum + row.keyframes.length, 0)
  const totalMissingSlotCount = visibleRows.reduce((sum, row) => sum + row.missingSlots.length, 0)
  const projectReferenceCount = (data?.creativeReferences ?? []).filter(isVisibleContentWorkbenchRecord).length
  const projectAssetSlotCount = (data?.assetSlots ?? []).filter((slot) => slot.owner_type !== 'asset_slot' && isVisibleContentWorkbenchRecord(slot)).length
  const runningJobCount = data?.jobs.filter((job) => job.status === 'pending' || job.status === 'running').length ?? 0
  const selectedProductionIdSet = new Set(selected?.productionIds ?? [])
  const selectedPreviewItemCount = data?.previewTimelineItems.filter((item) => isVisibleContentWorkbenchRecord(item) && (
    selectedProductionIdSet.has(numberOf(item.production_id)) ||
    (selected?.moment.ID && numberOf(item.scene_moment_id) === selected.moment.ID) ||
    (selectedUnit?.ID && numberOf(item.content_unit_id) === selectedUnit.ID)
  )).length ?? 0
  const reorderContentUnits = useMutation(buildReorderContentUnitsMutationOptions({
    projectId,
    contentUnitConfig,
    queryClient,
    productionWorkbenchQueryKey,
    selectContentUnitFromRow,
  }))
  const moveContentUnitOnTimeline = useMutation(buildMoveContentUnitOnTimelineMutationOptions({
    projectId,
    previewTimelineItemConfig,
    previewTimelines: data?.previewTimelines ?? [],
    queryClient,
    productionWorkbenchQueryKey,
    selectContentUnit,
  }))
  const deleteSceneMoment = useMutation({
    mutationFn: async (row: ContentGenerationMomentRow) => {
      if (!projectId) throw new Error('请先选择项目')
      await abandonSceneMoment(projectId, row.moment.ID)
      return row
    },
    onSuccess: async (row) => {
      if (selected?.id === row.id) selectSceneMoment(row.id, { replace: true })
      await queryClient.invalidateQueries({ queryKey: productionWorkbenchQueryKey })
      toast.success('情节已删除')
    },
    onError: () => {
      toast.error('删除情节失败')
    },
  })

  function openAiSuggest(rowOverride?: ContentGenerationMomentRow) {
    const targetRow = rowOverride ?? selected
    const launchInput = buildContentWorkbenchAiSuggestLaunchInput({
      projectId,
      row: targetRow,
      productions: data?.productions ?? [],
    })
    if (!launchInput) {
      toast.info('请先选择情节')
      return
    }
    launchContentWorkbenchAiSuggestAgent(launchInput)
    toast.success('已打开 AI 助手，可在输入框补充需求后发送')
  }

  function openReviewQueue() {
    reviewController.setCollapsed(false)
    const draft = selectedReviewDraft ?? reviewDrafts[0]
    if (!draft) {
      openAiSuggest()
      return
    }
    selectReviewDraft(draft.id)
  }

  function openReviewUnitEditor(unitId: number) {
    const targetRow = rows.find((row) => row.units.some((unit) => unit.ID === unitId)) ?? selected
    if (!targetRow) {
      setCreatingUnit(true)
      return
    }
    openUnitEditor(targetRow, unitId)
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
    focusRowForUnitCreation(row)
    setUnitDraftDefaults(null)
    setCreatingUnit(true)
  }

  function openUnitEditor(row: ContentGenerationMomentRow, unitId: number) {
    selectContentUnitFromRow(row, unitId)
    navigate(withRouteParams(ROUTES.project.contentUnitEditor, {
      scene_moment_id: row.moment.ID,
      content_unit_id: unitId,
    }))
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

  function deleteSceneMomentFromSidebar(rowId: string) {
    const row = rows.find((item) => item.id === rowId)
    if (!row || deleteSceneMoment.isPending) return
    if (!window.confirm(`确定删除情节「${row.title}」吗？相关镜头方案、表达和素材需求可能需要重新归属。`)) return
    deleteSceneMoment.mutate(row)
  }

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
  const workbenchShellProps = useProjectWorkbenchShellProps({
    workbenchId: 'content_orchestration',
    projectName: project?.name,
    kicker: '内容编排',
    title: '内容编排工作台',
    description: '把情节拆成制作项，用时间轴管理顺序、对白、声音和关键帧。',
    badges: isFetching ? <Badge variant="outline">同步中</Badge> : null,
    onRefresh: () => { void refetch() },
    refreshing: isFetching,
  })

  return (
    <WorkbenchProjectShell {...workbenchShellProps}>
      <WorkbenchProjectBody padding="none" scroll="hidden" tone="muted">
        {!projectId ? (
          <WorkbenchEmptyState title="请先选择项目" description="当前没有可用的项目信息，无法拉取情节、制作项、素材需求和生成任务。" />
        ) : isLoading ? (
          <WorkbenchEmptyState title="正在加载内容编排数据..." compact />
        ) : isError ? (
          <WorkbenchEmptyState title="内容编排数据加载失败" description="后端语义实体接口未返回可用数据，稍后重试。" />
        ) : (
          <ContentWorkbenchWorkspaceShell>
            <ContentWorkbenchBody>
              <ContentWorkbenchCommandCenter
                {...detailPaneLayoutProps}
                sidebar={(
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
                    onQueryChange={setSidebarQuery}
                    onSelectProduction={selectProductionFilter}
                    onSelectSegment={selectSegmentFilter}
                    onSelectScene={selectSceneMoment}
                    onDeleteScene={deleteSceneMomentFromSidebar}
                  />
                )}
              >
                {hasSelectedRow && !detailPane.collapsed ? (
                  <ContentWorkbenchMainColumn
                    overlapState={detailPane.overlapState}
                    resizeHandleProps={detailPane.resizeHandleProps}
                    resizeHandleSide="left"
                  >
                    <ContentWorkbenchDetailContent>
                      <ContentWorkbenchViewHeader
                        icon={<Wand2 size={14} />}
                        kicker="编排视图"
                        title={contentWorkbenchViewTitle}
                        detail={contentWorkbenchViewDetail}
                        action={(
                          <ContentWorkbenchReviewButton
                            data-action-key="review_ai_drafts"
                            pendingCount={reviewQueueSummary.pending}
                            icon={<ClipboardCheck size={14} />}
                            onClick={openReviewQueue}
                          >
                            待审草案
                          </ContentWorkbenchReviewButton>
                        )}
                        emptyMessage={visibleRows.length === 0 ? (
                          filteredRows.length === 0 ? '当前项目还没有情节入口，先完成制作编排后再进入内容编排。' : '没有匹配当前搜索条件的情节。'
                        ) : undefined}
                        emptyAction={visibleRows.length === 0 && filteredRows.length === 0 ? (
                          <ContentWorkbenchEmptyActionButton onClick={() => navigate(ROUTES.project.productionOrchestration)}>
                            <Route size={14} />
                            进入制作编排
                          </ContentWorkbenchEmptyActionButton>
                        ) : undefined}
                      />

                      {!selected ? (
                        <ContentWorkbenchSceneInfoCard
                          row={null}
                        />
                      ) : (
                        <>
                          {showReviewPanel ? (
                            <ContentWorkbenchReviewPanel
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
                              onEditCurrentUnit={openReviewUnitEditor}
                              onApplyUnitProposal={(unitId, proposal) => applyContentUnitProposal.mutate({ unitId, proposal })}
                              onMarkDraftReviewed={(draft) => markContentDraftReviewed.mutate(draft)}
                              onRejectDraft={(draft) => rejectContentDraft.mutate(draft)}
                              onCloseReview={closeReview}
                            />
                          ) : null}

                          <ContentWorkbenchSceneInfoCard
                            row={selected}
                          />

                          <ContentWorkbenchScenePreview
                            row={selected}
                            selectedUnit={selectedUnit}
                            keyframes={selectedUnitKeyframes}
                            previewItemCount={selectedPreviewItemCount}
                            runningJobCount={runningJobCount}
                          />

                          <UnitProductionTrack
                            row={selected}
                            selectedUnitId={selectedUnit?.ID}
                            showInlineEditor={false}
                            onSelectUnit={(unitId) => {
                              selectContentUnit(unitId)
                            }}
                            onOpenUnitEditor={(unitId) => openUnitEditor(selected, unitId)}
                            onCreateUnit={() => openCreateUnitForRow(selected)}
                            onAiSuggest={() => openAiSuggest(selected)}
                            onSelectFirstMoment={selectFirstSceneMoment}
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
                        </>
                      )}
                    </ContentWorkbenchDetailContent>
                  </ContentWorkbenchMainColumn>
                ) : null}
                {hasSelectedRow && detailPane.collapsed ? (
                  <OverlapPaneRevealButton
                    action="show"
                    label="显示内容详情"
                    onClick={detailPane.show}
                  />
                ) : null}
                {hasSelectedRow && detailPane.expanded ? (
                  <OverlapPaneRevealButton
                    action="restore"
                    label="还原内容详情"
                    onClick={detailPane.restore}
                  />
                ) : null}
              </ContentWorkbenchCommandCenter>
            </ContentWorkbenchBody>
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
        editingUnit={false}
        creatingAssetSlot={false}
        assetSlotDefaults={undefined}
        creatingKeyframe={false}
        keyframeDefaults={undefined}
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
          if (selected) openUnitEditor(selected, record.ID)
        }}
        onEditingUnitChange={() => {}}
        onAssetSlotCreated={() => {}}
        onCreatingAssetSlotChange={() => {}}
        onKeyframeCreated={(record) => {
          selectContentUnit(Number(record.content_unit_id) || selectedUnit?.ID || null)
        }}
        onCreatingKeyframeChange={() => {}}
      />

    </WorkbenchProjectShell>
  )
}
