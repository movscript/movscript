import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardCheck,
  PanelRightOpen,
  Route,
  Wand2,
} from 'lucide-react'

import { RESOURCE_UPLOAD_ACCEPT } from '@/features/resources/domain/mediaTypes'
import {
  buildContentWorkbenchAiSuggestLaunchInput,
  buildContentWorkbenchVisualPlanLaunchInput,
  launchContentWorkbenchAiSuggestAgent,
  launchContentWorkbenchVisualPlanAgent,
} from '@/features/content/application/contentWorkbenchAgentLaunch'
import { pickContentWorkbenchFirstUsableUnit } from '@/features/content/domain/contentWorkbenchCandidateFocus'
import { contentWorkbenchProposalDefaults } from '@/features/content/domain/contentWorkbenchDraftProposal'
import {
  keyframeFrameRoleLabel,
  keyframeOrderForRole,
  nextKeyframeFrameRole,
} from '@/features/content/domain/contentWorkbenchEditModel'
import { contentWorkbenchCanvasRoute, openContentWorkbenchUnitCanvas } from '@/features/content/application/contentWorkbenchCanvasLaunch'
import { pickContentWorkbenchRelevantJobs } from '@/features/content/domain/contentWorkbenchJobScope'
import { useContentWorkbenchPageController } from '@/features/content/application/contentWorkbenchPageController'
import { useContentWorkbenchReviewController } from '@/features/content/application/contentWorkbenchReviewController'
import { apiErrorMessage, contentUnitWorkStatus, normalizeAssetSlotStatus } from '@/features/content/domain/contentWorkbenchStatus'
import {
  buildContentGenerationMomentRows,
  buildGenerationContextRows,
  buildGenerationContextStandards,
  buildMomentStandards,
  contentWorkbenchNullableNumber,
  isVisibleContentWorkbenchRecord,
  loadContentWorkbenchData,
  type ContentGenerationMomentRow,
  type ContentWorkbenchRecord as WorkbenchRecord,
} from '@/features/content/domain/contentWorkbenchModel'
import {
  buildContentWorkbenchUploadCandidateMutationOptions,
  useContentWorkbenchCandidateUploadInput,
} from '@/features/content/application/contentWorkbenchUploadController'
import {
  buildApplyContentUnitProposalMutationOptions,
  buildMarkContentDraftReviewedMutationOptions,
  buildMoveContentUnitOnTimelineMutationOptions,
  buildRejectContentDraftMutationOptions,
  buildReorderContentUnitsMutationOptions,
} from '@/features/content/application/contentWorkbenchMutationController'
import {
  byOrder,
  firstText,
  numberOf,
  titleOfRecord,
} from '@/features/content/domain/contentWorkbenchRecordUtils'
import {
  previewTimelineItemRank,
} from '@/features/content/domain/contentWorkbenchTimeline'
import { contentWorkbenchUnitRequiresKeyframe } from '@/features/content/domain/contentWorkbenchUnitTrack'
import { pickContentWorkbenchUploadTarget } from '@/features/content/domain/contentWorkbenchUploadTarget'
import { unitIdentifier } from '@/features/content/domain/productionIdentifiers'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { toast } from '@/shared/ui/toastStore'
import {
  Badge,
  ContentWorkbenchBody,
  ContentWorkbenchCandidateUploadInput,
  ContentWorkbenchCommandCenter,
  ContentWorkbenchDrawerActionRow,
  ContentWorkbenchDrawerOpenButton,
  ContentWorkbenchEmptyActionButton,
  ContentWorkbenchFilterSidebar,
  ContentWorkbenchInfoSection,
  ContentWorkbenchInfoText,
  ContentWorkbenchMainColumn,
  ContentWorkbenchProductionGrid,
  ContentWorkbenchProductionMain,
  ContentWorkbenchReviewButton,
  ContentWorkbenchReviewPanel,
  ContentWorkbenchSceneInfoGrid,
  ContentWorkbenchViewHeader,
  WorkbenchEmptyState,
  WorkbenchContextStack as ContextStack,
  WorkbenchGateChecklist as GateChecklist,
  WorkbenchMetricStrip as MetricStrip,
  WorkbenchPanel,
  WorkbenchProjectShell,
  WorkbenchQueueMiniMetric as QueueMiniMetric,
  WorkbenchSpecializedQueue as SpecializedQueue,
  type WorkbenchChromeMetric as WorkbenchMetric,
} from '@movscript/ui'
import { ContentWorkbenchDialogs } from './ContentWorkbenchDialogs'
import { contentWorkbenchRowMatchesSearch } from './ContentWorkbenchSearch'
import { ContentWorkbenchScenePreview } from './ContentWorkbenchScenePreview'
import { ContentWorkbenchUnitInspector, UnitProductionTrack } from './ContentWorkbenchUnitTrack'
import { useProjectWorkbenchShellProps } from '@/features/project-workbenches/application/useProjectWorkbenchShellProps'
import type { WorkbenchGate } from '@/shared/domain/workbenchTypes'
import {
  buildContentUnitGenerationContext,
  semanticEntityConfig,
  type SemanticEntityPayload,
} from '@/shared/infrastructure/api/semanticEntities'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'

function appendReviewGate(rows: WorkbenchGate[], pendingDraftCount: number): WorkbenchGate[] {
  if (rows.length === 0) return rows
  return [
    ...rows,
    {
      label: 'AI 草案已处理',
      detail: pendingDraftCount > 0 ? `${pendingDraftCount} 个制作项草案仍需人工审阅` : '没有待确认的制作项草案',
      done: pendingDraftCount === 0,
      state: pendingDraftCount === 0 ? 'passed' : 'required',
    },
  ]
}

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
  const candidateUploadInput = useContentWorkbenchCandidateUploadInput()
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['workbench', 'production', projectId],
    queryFn: () => loadContentWorkbenchData(projectId!),
    enabled: !!projectId,
  })
  const rows = useMemo(() => buildContentGenerationMomentRows(data), [data])
  const [creatingUnit, setCreatingUnit] = useState(false)
  const [unitDraftDefaults, setUnitDraftDefaults] = useState<Partial<SemanticEntityPayload> | null>(null)
  const [creatingAssetSlot, setCreatingAssetSlot] = useState(false)
  const [creatingKeyframe, setCreatingKeyframe] = useState(false)
  const [unitDrawerOpen, setUnitDrawerOpen] = useState(false)
  const pageController = useContentWorkbenchPageController({
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
    editingUnit,
    filteredRows,
    visibleRows,
    productionFilterOptions,
    segmentFilterOptions,
    sceneMomentFilterOptions,
    selected,
    selectedUnit,
    setSidebarQuery,
    setOptimisticSelectedUnit,
    setEditingUnit,
    selectSceneMoment,
    selectContentUnit,
    selectContentUnitFromRow,
    selectProductionFilter,
    selectSegmentFilter,
    focusRowForUnitCreation,
  } = pageController

  const generationContextQuery = useQuery({
    queryKey: ['workbench', 'production', 'generation-context', projectId, selectedUnit?.ID],
    queryFn: () => buildContentUnitGenerationContext(projectId!, selectedUnit!.ID, 'video'),
    enabled: !!projectId && !!selectedUnit?.ID,
  })
  const uploadCandidate = useMutation(buildContentWorkbenchUploadCandidateMutationOptions({
    projectId,
    queryClient,
    onSettled: candidateUploadInput.resetUpload,
  }))
  const openUnitCanvas = useMutation({
    mutationFn: async (unit: WorkbenchRecord) => {
      if (!projectId) throw new Error('请先选择项目')
      return openContentWorkbenchUnitCanvas({
        projectId,
        unit,
      })
    },
    onSuccess: (canvas) => navigate(contentWorkbenchCanvasRoute(canvas)),
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
  const missingGenerationContext = generationContextQuery.data
    ? buildGenerationContextStandards(generationContextQuery.data).filter((item) => !item.done)
    : []

  function triggerCandidateUpload() {
    candidateUploadInput.triggerUpload(uploadTargetSlot, candidateUploadInput.uploading || uploadCandidate.isPending)
  }

  function handleCandidateUpload(file?: File) {
    candidateUploadInput.uploadFile(file, uploadTargetSlot, {
      disabled: uploadCandidate.isPending,
      onUpload: (input) => uploadCandidate.mutate(input),
    })
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
  const standards = useMemo(() => appendReviewGate(baseStandards, reviewQueueSummary.pending), [baseStandards, reviewQueueSummary.pending])

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
  const completedJobCount = data?.jobs.filter((job) => job.status === 'succeeded').length ?? 0
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

  function openAiVisualTaskGraph(unitOverride?: WorkbenchRecord | null) {
    const targetRow = selected
    const targetUnit = unitOverride ?? selectedUnit
    const launchInput = buildContentWorkbenchVisualPlanLaunchInput({
      projectId,
      row: targetRow,
      unit: targetUnit,
      productions: data?.productions ?? [],
    })
    if (!launchInput) {
      toast.info('请先选择情节和制作项')
      return
    }
    launchContentWorkbenchVisualPlanAgent(launchInput)
    toast.success('已打开 AI 助手，可起草当前制作项的视觉计划')
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
    focusRowForUnitCreation(row)
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
      <ContentWorkbenchBody>
        {!projectId ? (
          <WorkbenchEmptyState title="请先选择项目" description="当前没有可用的项目信息，无法拉取情节、制作项、素材需求和生成任务。" />
        ) : isLoading ? (
          <WorkbenchEmptyState title="正在加载内容编排数据..." compact />
        ) : isError ? (
          <WorkbenchEmptyState title="内容编排数据加载失败" description="后端语义实体接口未返回可用数据，稍后重试。" />
        ) : (
          <ContentWorkbenchCommandCenter
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
              />
            )}
          >
            <ContentWorkbenchMainColumn>
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
                      onEditCurrentUnit={openEditSelectedUnit}
                      onApplyUnitProposal={(unitId, proposal) => applyContentUnitProposal.mutate({ unitId, proposal })}
                      onMarkDraftReviewed={(draft) => markContentDraftReviewed.mutate(draft)}
                      onRejectDraft={(draft) => rejectContentDraft.mutate(draft)}
                      onCloseReview={closeReview}
                    />
                  ) : null}

                  <ContentWorkbenchProductionGrid drawerOpen={unitDrawerOpen}>
                    <ContentWorkbenchProductionMain drawerOpen={unitDrawerOpen}>
                      <ContentWorkbenchSceneInfoCard
                        row={selected}
                      />

                      {selectedUnit && !unitDrawerOpen ? (
                        <ContentWorkbenchDrawerActionRow>
                          <ContentWorkbenchDrawerOpenButton
                            onClick={() => setUnitDrawerOpen(true)}
                            data-testid="content-workbench-open-unit-drawer"
                          >
                            <PanelRightOpen size={14} />
                            打开当前制作项
                          </ContentWorkbenchDrawerOpenButton>
                        </ContentWorkbenchDrawerActionRow>
                      ) : null}

                      <UnitProductionTrack
                        row={selected}
                        selectedUnitId={selectedUnit?.ID}
                        showInlineEditor={false}
                        onSelectUnit={(unitId) => {
                          selectContentUnitFromRow(selected, unitId)
                          setUnitDrawerOpen(Boolean(unitId))
                        }}
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
                          setUnitDrawerOpen(false)
                        }}
                        projectId={projectId}
                        queryKey={productionWorkbenchQueryKey}
                        jobs={data?.jobs ?? []}
                        isReordering={reorderContentUnits.isPending || moveContentUnitOnTimeline.isPending}
                      />

                      <ContentWorkbenchScenePreview
                        row={selected}
                        selectedUnit={selectedUnit}
                        keyframes={selectedUnitKeyframes}
                        previewItemCount={selectedPreviewItemCount}
                        runningJobCount={selectedUnitRunningJobCount}
                      />
                    </ContentWorkbenchProductionMain>

                    {unitDrawerOpen ? (
                      <ContentWorkbenchUnitInspector
                        projectId={projectId}
                        queryKey={productionWorkbenchQueryKey}
                        jobs={data?.jobs ?? []}
                        row={selected}
                        unit={selectedUnit}
                        onSelectUnit={(unitId) => {
                          selectContentUnitFromRow(selected, unitId)
                          setUnitDrawerOpen(true)
                        }}
                        onCreateUnit={() => openCreateUnitForRow(selected)}
                        onAiSuggest={() => openAiSuggest(selected)}
                        onAiVisualTaskGraph={() => openAiVisualTaskGraph(selectedUnit)}
                        onCreateAssetSlot={openCreateAssetSlot}
                        onCreateKeyframe={openCreateKeyframe}
                        onOpenCanvas={openSelectedUnitCanvas}
                        onUploadMissingAssets={triggerCandidateUpload}
                        onDeleteUnit={(unit) => {
                          selectContentUnitFromRow(selected, null, { replace: true })
                          setUnitDrawerOpen(false)
                        }}
                        onClose={() => setUnitDrawerOpen(false)}
                      />
                    ) : null}
                  </ContentWorkbenchProductionGrid>
                </>
              )}
            </ContentWorkbenchMainColumn>
            <ContentWorkbenchCandidateUploadInput ref={candidateUploadInput.inputRef} accept={RESOURCE_UPLOAD_ACCEPT} onChange={(e) => handleCandidateUpload(e.target.files?.[0])} />
          </ContentWorkbenchCommandCenter>
        )}
      </ContentWorkbenchBody>

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
          setUnitDrawerOpen(true)
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

    </WorkbenchProjectShell>
  )
}
