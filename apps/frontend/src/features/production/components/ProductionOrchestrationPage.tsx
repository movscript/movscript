import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
} from 'lucide-react'

import { semanticEntityConfig } from '@/shared/infrastructure/api/semanticEntities'
import { SemanticEntityCrudDialog } from '@/shared/ui/SemanticEntityCrudDialog'
import { ProductionWorkspaceReviewPanel } from '@/features/production/components/workspaces/ProductionWorkspaceReviewPanel'
import { ProductionOrchestrationWorkspace } from '@/features/production/components/ProductionOrchestrationWorkspace'
import { ContentWorkbenchDialogs } from '@/features/content/components/ContentWorkbenchDialogs'
import { useProjectWorkbenchShellProps } from '@/features/project-workbenches/application/useProjectWorkbenchShellProps'
import { isGeneratedKeyframeCandidateRecord } from '@/features/agent/domain/agentGeneratedResourceBinding'
import { listScriptVersions, type ScriptVersion } from '@/shared/infrastructure/api/scriptVersions'
import {
  buildMoveContentUnitOnTimelineMutationOptions,
  buildReorderContentUnitsMutationOptions,
} from '@/features/content/application/contentWorkbenchMutationController'
import {
  buildContentGenerationMomentRows,
  type ContentGenerationMomentRow,
} from '@/features/content/domain/contentWorkbenchModel'
import { buildProductionOrchestrationLookup } from '@/features/production/domain/productionOrchestrationEntityModel'
import { scriptSourceTextForVersion, scriptVersionOptionLabel } from '@/features/production/domain/productionScriptBlocks'
import {
  buildBindProductionScriptVersionMutationOptions,
  buildBindSceneMomentScriptBlockMutationOptions,
  buildCreateAndBindSceneMomentScriptBlockMutationOptions,
  buildCreateWritingExpressionMutationOptions,
  buildDeleteSegmentMutationOptions,
  buildDeleteSceneMomentMutationOptions,
  buildDeleteWritingExpressionMutationOptions,
  buildLinkSceneMomentReferenceMutationOptions,
  buildReorderProductionSceneMomentsMutationOptions,
  buildReorderProductionSegmentsMutationOptions,
  buildUpdateSceneMomentMutationOptions,
  buildUpdateSegmentMutationOptions,
  buildUpdateWritingExpressionMutationOptions,
  buildUnlinkSceneMomentReferenceMutationOptions,
} from '@/features/production/application/productionOrchestrationMutationController'
import {
  loadProductionOrchestrationData,
  type OrchestrationData,
} from '@/features/production/domain/productionOrchestrationData'
import {
  buildCurrentProductionWorkspaceSnapshot,
} from '@/features/production/domain/productionWorkspaceReviewModel'
import { providerSessionClient } from '@/shared/infrastructure/providerSessionClient'
import {
  buildProductionOrchestrationStaleContentUnitParams,
  useProductionOrchestrationPageController,
} from '@/features/production/application/productionOrchestrationPageController'
import { useProductionOrchestrationReviewController } from '@/features/production/application/productionOrchestrationReviewController'
import {
  compareProductionOrchestrationOrder,
  filterProductionContentUnitsForProduction,
  filterProductionSceneMomentsForSegments,
  filterProductionSegmentsForProduction,
} from '@/features/production/domain/productionOrchestrationWorkspaceModel'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { toast } from '@/shared/ui/toastStore'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'
import {
  Dialog,
  ProductionOrchestrationHeaderAction,
  ProductionOrchestrationHeaderMetaBadge,
  ProductionOrchestrationProductionCard,
  ProductionOrchestrationProductionCardBreadcrumbs,
  ProductionOrchestrationProductionCardScriptBinding,
  ProductionOrchestrationProductionCardScriptSelectTrigger,
  ProductionOrchestrationProductionDeck,
  ProductionOrchestrationProductionDeckGrid,
  ProductionOrchestrationProductionDeckHeader,
  ProductionOrchestrationProductionEmptyState,
  ProductionOrchestrationProductionPager,
  ProductionOrchestrationReviewDialogContent,
  ProductionOrchestrationReviewDialogTitle,
  ProductionOrchestrationReviewEmptyNotice,
  ProductionOrchestrationSkeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  WorkbenchProjectBody,
  WorkbenchProjectPane,
  WorkbenchProjectShell,
  WorkbenchProjectViewport,
} from '@movscript/ui'

const PRODUCTION_PAGE_SIZE = 8

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function ProductionOrchestrationPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const productionId = Number(searchParams.get('productionId')) || 0
  const selectedContentUnitId = Number(searchParams.get('content_unit_id')) || 0

  const queryKey = ['production-orchestration', projectId] as const
  const scriptVersionsQueryKey = ['production-orchestration-script-versions', projectId] as const
  const { data, isLoading, refetch } = useQuery<OrchestrationData>({
    queryKey,
    queryFn: () => loadProductionOrchestrationData(projectId!),
    enabled: !!projectId,
  })
  const { data: scriptVersions = [], isFetching: isFetchingScriptVersions } = useQuery<ScriptVersion[]>({
    queryKey: scriptVersionsQueryKey,
    queryFn: () => listScriptVersions(projectId!),
    enabled: !!projectId,
  })

  const productions = data?.productions ?? []
  const selectedProduction = productions.find((p) => p.ID === productionId) ?? productions[0]
  const effectiveProductionId = selectedProduction?.ID ?? 0
  const selectedScriptVersion = useMemo(
    () => scriptVersions.find((version) => version.ID === Number(selectedProduction?.script_version_id)) ?? null,
    [scriptVersions, selectedProduction?.script_version_id],
  )
  const scriptSourceText = scriptSourceTextForVersion(selectedScriptVersion)
  const scriptText = scriptSourceText.trim()
  const canLaunchLinkedWorkspace = Boolean(scriptText) && !isFetchingScriptVersions
  const mutationBase = { projectId, queryClient, queryKey, refetch }
  const bindScriptVersionMutation = useMutation(buildBindProductionScriptVersionMutationOptions({
    ...mutationBase,
    scriptVersionsQueryKey,
  }))
  const bindSceneMomentScriptBlockMutation = useMutation(buildBindSceneMomentScriptBlockMutationOptions(mutationBase))
  const createAndBindSceneMomentScriptBlockMutation = useMutation(buildCreateAndBindSceneMomentScriptBlockMutationOptions({
    ...mutationBase,
    selectedScriptVersion,
    scriptSourceText,
    scriptBlocks: data?.scriptBlocks ?? [],
  }))
  const updateSceneMomentMutation = useMutation(buildUpdateSceneMomentMutationOptions(mutationBase))
  const updateSegmentMutation = useMutation(buildUpdateSegmentMutationOptions(mutationBase))
  const reorderSegmentsMutation = useMutation(buildReorderProductionSegmentsMutationOptions(mutationBase))
  const reorderSceneMomentsMutation = useMutation(buildReorderProductionSceneMomentsMutationOptions(mutationBase))
  const deleteSegmentMutation = useMutation(buildDeleteSegmentMutationOptions(mutationBase))
  const deleteSceneMomentMutation = useMutation(buildDeleteSceneMomentMutationOptions(mutationBase))
  const linkSceneMomentReferenceMutation = useMutation(buildLinkSceneMomentReferenceMutationOptions(mutationBase))
  const unlinkSceneMomentReferenceMutation = useMutation(buildUnlinkSceneMomentReferenceMutationOptions(mutationBase))
  const updateWritingExpressionMutation = useMutation(buildUpdateWritingExpressionMutationOptions(mutationBase))
  const deleteWritingExpressionMutation = useMutation(buildDeleteWritingExpressionMutationOptions(mutationBase))
  const createWritingExpressionMutation = useMutation(buildCreateWritingExpressionMutationOptions(mutationBase))
  const contentUnitConfig = useMemo(() => semanticEntityConfig('contentUnits'), [])
  const assetSlotConfig = useMemo(() => semanticEntityConfig('assetSlots'), [])
  const keyframeConfig = useMemo(() => semanticEntityConfig('keyframes'), [])
  const previewTimelineItemConfig = useMemo(() => semanticEntityConfig('previewTimelineItems'), [])
  const allSegments = useMemo(
    () => filterProductionSegmentsForProduction(data?.segments ?? [], effectiveProductionId).sort(compareProductionOrchestrationOrder),
    [data?.segments, effectiveProductionId]
  )
  const currentSegmentIds = useMemo(() => new Set(allSegments.map((segment) => segment.ID)), [allSegments])
  const allSceneMoments = useMemo(
    () => filterProductionSceneMomentsForSegments(data?.sceneMoments ?? [], currentSegmentIds).sort(compareProductionOrchestrationOrder),
    [currentSegmentIds, data?.sceneMoments]
  )
  const currentSceneMomentIds = useMemo(() => new Set(allSceneMoments.map((moment) => moment.ID)), [allSceneMoments])
  const allWritingExpressions = useMemo(
    () => (data?.writingExpressions ?? [])
      .filter((item) => item.scene_moment_id ? currentSceneMomentIds.has(Number(item.scene_moment_id)) : false)
      .sort(compareProductionOrchestrationOrder),
    [currentSceneMomentIds, data?.writingExpressions],
  )
  const allContentUnits = useMemo(
    () => filterProductionContentUnitsForProduction(data?.contentUnits ?? [], effectiveProductionId, currentSegmentIds, currentSceneMomentIds).sort(compareProductionOrchestrationOrder),
    [currentSceneMomentIds, currentSegmentIds, data?.contentUnits, effectiveProductionId]
  )
  const allScriptBlocks = useMemo(
    () => (data?.scriptBlocks ?? [])
      .filter((block) => !selectedScriptVersion || Number(block.script_version_id) === selectedScriptVersion.ID)
      .sort(compareProductionOrchestrationOrder),
    [data?.scriptBlocks, selectedScriptVersion],
  )
  const currentContentUnitIds = useMemo(() => new Set(allContentUnits.map((unit) => unit.ID)), [allContentUnits])
  const allKeyframes = useMemo(
    () => (data?.keyframes ?? [])
      .filter((keyframe) => !isGeneratedKeyframeCandidateRecord(keyframe))
      .filter((keyframe) => (
        Number(keyframe.production_id) === effectiveProductionId
        || (keyframe.scene_moment_id ? currentSceneMomentIds.has(Number(keyframe.scene_moment_id)) : false)
        || (keyframe.content_unit_id ? currentContentUnitIds.has(Number(keyframe.content_unit_id)) : false)
      ))
      .sort(compareProductionOrchestrationOrder),
    [currentContentUnitIds, currentSceneMomentIds, data?.keyframes, effectiveProductionId],
  )
  const allAssetSlots = useMemo(
    () => (data?.assetSlots ?? []).filter(isVisibleWorkspaceRecord),
    [data?.assetSlots],
  )
  const allSettings = useMemo(
    () => (data?.settings ?? []).filter(isVisibleWorkspaceRecord),
    [data?.settings],
  )
  const currentProductionSnapshot = useMemo(
    () => buildCurrentProductionWorkspaceSnapshot({
      segments: allSegments,
      sceneMoments: allSceneMoments,
      settings: allSettings,
      settingUsages: data?.settingUsages ?? [],
      contentUnits: allContentUnits,
      keyframes: allKeyframes,
      assetSlots: allAssetSlots,
      writingExpressions: allWritingExpressions,
    }),
    [allAssetSlots, allContentUnits, allSettings, allKeyframes, allSceneMoments, allSegments, allWritingExpressions, data?.settingUsages],
  )
  const {
    openedWorkspaceId,
    openedSettingWorkspaceId,
    openedAssetWorkspaceArtifactId,
    openedWorkspaceQuery,
    openedSettingWorkspaceQuery,
    openedAssetWorkspaceArtifactQuery,
    workspacePreviewWorkspace,
    workspaceNodeDecisions,
    setWorkspaceNodeDecisions,
    workspaceReviewNodeCount,
    reviewOpen,
    clearWorkspaceReview,
  } = useProductionOrchestrationReviewController({
    projectId,
    searchParams,
    currentProductionSnapshot,
    structureStatusLabel: `${allSegments.length} 编排段 · ${allSceneMoments.length} 情节`,
  })
  const pageController = useProductionOrchestrationPageController({
    projectId,
    route: ROUTES.project.productionOrchestration,
    searchParams,
    setSearchParams,
    sceneMoments: allSceneMoments,
    segments: allSegments,
    effectiveProductionId,
    queryClient,
    queryKey,
    refetch,
  })
  const productionLabel = selectedProduction ? String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`) : '未选择制作'
  const [createProductionOpen, setCreateProductionOpen] = useState(false)
  const [productionPage, setProductionPage] = useState(0)
  const workspaceLookup = useMemo(() => buildProductionOrchestrationLookup({
    scriptText,
    scriptVersionTitle: selectedScriptVersion?.title ?? '',
    segments: allSegments,
    sceneMoments: allSceneMoments,
    settings: allSettings,
    settingUsages: data?.settingUsages ?? [],
    assetSlots: allAssetSlots,
    contentUnits: allContentUnits,
  }), [allAssetSlots, allContentUnits, allSettings, allSceneMoments, allSegments, data?.settingUsages, scriptText, selectedScriptVersion?.title])
  const shotPlanRows = useMemo(() => buildContentGenerationMomentRows(data), [data])
  const selectedShotPlanRow = useMemo(
    () => pageController.selectedWritingMomentId
      ? shotPlanRows.find((row) => row.moment.ID === pageController.selectedWritingMomentId) ?? null
      : null,
    [pageController.selectedWritingMomentId, shotPlanRows],
  )
  const selectedShotPlanUnit = useMemo(
    () => selectedShotPlanRow?.units.find((unit) => unit.ID === selectedContentUnitId) ?? null,
    [selectedContentUnitId, selectedShotPlanRow],
  )
  const selectedShotPlanUnitKeyframes = selectedShotPlanRow && selectedShotPlanUnit
    ? selectedShotPlanRow.keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === selectedShotPlanUnit.ID)
    : []
  const [creatingContentUnit, setCreatingContentUnit] = useState(false)
  const reorderContentUnits = useMutation(buildReorderContentUnitsMutationOptions({
    projectId,
    contentUnitConfig,
    queryClient,
    productionWorkbenchQueryKey: queryKey,
    selectContentUnitFromRow: (row: ContentGenerationMomentRow, unitId: number) => selectContentUnitFromShotPlan(row, unitId),
  }))
  const moveContentUnitOnTimeline = useMutation(buildMoveContentUnitOnTimelineMutationOptions({
    projectId,
    previewTimelineItemConfig,
    previewTimelines: data?.previewTimelines ?? [],
    queryClient,
    productionWorkbenchQueryKey: queryKey,
    selectContentUnit: (unitId: number) => selectContentUnitFromShotPlan(selectedShotPlanRow, unitId),
  }))

  useEffect(() => {
    if (!selectedContentUnitId || pageController.selectedWritingMomentId || shotPlanRows.length === 0) return
    const rowForUnit = shotPlanRows.find((row) => row.units.some((unit) => unit.ID === selectedContentUnitId))
    if (!rowForUnit || !currentSceneMomentIds.has(rowForUnit.moment.ID)) {
      setSearchParams((current) => {
        return buildProductionOrchestrationStaleContentUnitParams({
          searchParams: current,
          sceneMomentId: rowForUnit?.moment.ID,
        })
      }, { replace: true })
      return
    }
    pageController.focusSceneMoment(rowForUnit.moment.ID)
  }, [currentSceneMomentIds, pageController.selectedWritingMomentId, selectedContentUnitId, setSearchParams, shotPlanRows])

  const productionCards = useMemo(() => buildProductionHeaderCards(data), [data])
  const productionPageCount = Math.max(1, Math.ceil(productionCards.length / PRODUCTION_PAGE_SIZE))
  const currentProductionPage = Math.min(productionPage, productionPageCount - 1)
  const visibleProductionCards = productionCards.slice(
    currentProductionPage * PRODUCTION_PAGE_SIZE,
    currentProductionPage * PRODUCTION_PAGE_SIZE + PRODUCTION_PAGE_SIZE,
  )

  useEffect(() => {
    if (productionPage > productionPageCount - 1) setProductionPage(productionPageCount - 1)
  }, [productionPage, productionPageCount])

  useEffect(() => {
    if (!effectiveProductionId) return
    const selectedIndex = productionCards.findIndex((item) => item.id === effectiveProductionId)
    if (selectedIndex < 0) return
    const selectedPage = Math.floor(selectedIndex / PRODUCTION_PAGE_SIZE)
    if (selectedPage !== productionPage) setProductionPage(selectedPage)
  }, [effectiveProductionId, productionCards, productionPage])

  function clearWorkspacePatchParams() {
    clearWorkspaceReview()
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('view')
      next.delete('workspaceId')
      next.delete('settingWorkspaceId')
      next.delete('assetWorkspaceArtifactId')
      next.delete('assetWorkspaceWorkspaceId')
      return next
    }, { replace: true })
  }

  async function handleWorkspaceArtifactUpdated() {
    await Promise.all([
      openedWorkspaceQuery.refetch(),
      openedSettingWorkspaceQuery.refetch(),
      openedAssetWorkspaceArtifactQuery.refetch(),
      refetch(),
    ])
    queryClient.invalidateQueries({ queryKey })
  }

  async function discardWorkspaceArtifact() {
    if (openedWorkspaceId) {
      await providerSessionClient.rejectWorkspaceArtifact(openedWorkspaceId, '用户放弃 production workspace patch').catch(() => undefined)
    }
    clearWorkspacePatchParams()
  }

  async function handleWorkspaceApplied() {
    await refetch()
    queryClient.invalidateQueries({ queryKey })
    clearWorkspacePatchParams()
  }

  function closeWorkspacePatchDialog() {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('view')
      return next
    }, { replace: true })
  }

  function handleProductionCreated(record: { ID: number }) {
    setCreateProductionOpen(false)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('productionId', String(record.ID))
      next.delete('scene_moment_id')
      return next
    }, { replace: true })
    queryClient.invalidateQueries({ queryKey })
    void refetch()
  }

  function selectContentUnitFromShotPlan(row: ContentGenerationMomentRow | null, unitId: number | null) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (row?.moment.ID) next.set('scene_moment_id', String(row.moment.ID))
      if (unitId) next.set('content_unit_id', String(unitId))
      else next.delete('content_unit_id')
      return next
    }, { replace: true })
  }

  function createContentUnitForSelectedMoment() {
    if (!selectedShotPlanRow) {
      toast.info('请先选择情节')
      return
    }
    setCreatingContentUnit(true)
  }

  function openContentUnitEditor(unitId: number) {
    if (!selectedShotPlanRow) return
    navigate(withRouteParams(ROUTES.project.contentUnitEditor, {
      productionId: effectiveProductionId || undefined,
      scene_moment_id: selectedShotPlanRow.moment.ID,
      content_unit_id: unitId,
    }))
  }

  function selectFirstSceneMomentForShotPlan() {
    const firstMoment = allSceneMoments[0]
    if (!firstMoment) {
      toast.info('暂无可选择的情节')
      return
    }
    pageController.selectSceneMoment(firstMoment.ID)
  }

  const workbenchShellProps = useProjectWorkbenchShellProps({
    workbenchId: 'orchestration_production',
    projectName: project?.name,
    kicker: selectedProduction ? `${String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`)} · 创作编排` : '创作编排',
    title: '创作编排工作台',
    description: '组织剧本、设定和素材约束，形成创作蓝图。',
    badges: (
      <>
        {openedSettingWorkspaceId ? <ProductionOrchestrationHeaderMetaBadge>设定草案</ProductionOrchestrationHeaderMetaBadge> : null}
        {openedAssetWorkspaceArtifactId ? <ProductionOrchestrationHeaderMetaBadge>素材需求草案</ProductionOrchestrationHeaderMetaBadge> : null}
        {openedWorkspaceId ? <ProductionOrchestrationHeaderMetaBadge>已打开草案</ProductionOrchestrationHeaderMetaBadge> : null}
      </>
    ),
    headerBody: (
      <>
        <ProductionOrchestrationProductionDeck>
          <ProductionOrchestrationProductionDeckHeader
            title="制作列表"
            meta={`${productions.length} 个 · 当前 ${productionLabel}`}
            actions={(
              <>
                <ProductionOrchestrationHeaderAction
                  variant="outline"
                  onClick={() => setCreateProductionOpen(true)}
                  disabled={!projectId}
                >
                  <Plus size={14} />
                  新建制作
                </ProductionOrchestrationHeaderAction>
                <ProductionOrchestrationProductionPager
                  pageLabel={`${currentProductionPage + 1}/${productionPageCount}`}
                  canPrevious={currentProductionPage > 0}
                  canNext={currentProductionPage < productionPageCount - 1}
                  onPrevious={() => setProductionPage((page) => Math.max(0, page - 1))}
                  onNext={() => setProductionPage((page) => Math.min(productionPageCount - 1, page + 1))}
                />
              </>
            )}
          />
          {visibleProductionCards.length > 0 ? (
            <ProductionOrchestrationProductionDeckGrid>
              {visibleProductionCards.map((production) => (
                <ProductionOrchestrationProductionCard
                  key={production.id}
                  active={production.id === effectiveProductionId}
                  title={production.name}
                  titleMeta={(
                    <ProductionOrchestrationProductionCardBreadcrumbs>
                      {production.breadcrumbLabel}
                    </ProductionOrchestrationProductionCardBreadcrumbs>
                  )}
                  scriptBinding={(
                    <ProductionOrchestrationProductionCardScriptBinding>
                      <Select
                        value={production.scriptVersionId ? String(production.scriptVersionId) : '__none__'}
                        onValueChange={(value) => bindScriptVersionMutation.mutate({
                          productionId: production.id,
                          scriptVersionId: value === '__none__' ? null : Number(value),
                        })}
                        disabled={isFetchingScriptVersions || bindScriptVersionMutation.isPending || scriptVersions.length === 0}
                      >
                        <ProductionOrchestrationProductionCardScriptSelectTrigger>
                          <SelectValue placeholder={isFetchingScriptVersions ? '读取剧本...' : '选择剧本'} />
                        </ProductionOrchestrationProductionCardScriptSelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">不绑定剧本</SelectItem>
                          {scriptVersions.map((version) => (
                            <SelectItem key={version.ID} value={String(version.ID)}>
                              {scriptVersionOptionLabel(version)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </ProductionOrchestrationProductionCardScriptBinding>
                  )}
                  onSelect={() => pageController.handleSelectProduction(String(production.id))}
                />
              ))}
            </ProductionOrchestrationProductionDeckGrid>
          ) : (
            <ProductionOrchestrationProductionEmptyState>
              暂无制作。可以先新建制作，再继续编排段和情节。
            </ProductionOrchestrationProductionEmptyState>
          )}
        </ProductionOrchestrationProductionDeck>
      </>
    ),
  })

  return (
    <WorkbenchProjectShell {...workbenchShellProps}>
      <WorkbenchProjectBody padding="none" scroll="hidden" tone="muted">
        {isLoading ? (
          <ProductionOrchestrationSkeleton />
        ) : (
          <WorkbenchProjectViewport direction="column">
            <WorkbenchProjectPane>
              <ProductionOrchestrationWorkspace
                scriptSourceText={scriptSourceText}
                settings={allSettings}
                assetSlots={allAssetSlots}
                segments={allSegments}
                sceneMoments={allSceneMoments}
                writingExpressions={allWritingExpressions}
                scriptBlocks={allScriptBlocks}
                projectId={projectId}
                selectedMomentId={pageController.selectedWritingMomentId}
                shotPlanRow={selectedShotPlanRow}
                selectedContentUnit={selectedShotPlanUnit}
                shotPlanJobs={data?.jobs ?? []}
                shotPlanQueryKey={queryKey}
                isReorderingShotPlan={reorderContentUnits.isPending || moveContentUnitOnTimeline.isPending}
                isBindingSceneMomentScriptBlock={bindSceneMomentScriptBlockMutation.isPending || createAndBindSceneMomentScriptBlockMutation.isPending}
                allowCreateAndBindSceneMomentScriptBlock
                lookup={workspaceLookup}
                onCreateSegment={pageController.createSegment}
                onCreateSceneMoment={pageController.createSceneMoment}
                onSelectSceneMoment={pageController.selectSceneMoment}
                onReorderSegment={(draggedSegmentId, targetSegmentId, position) => {
                  if (reorderSegmentsMutation.isPending) return
                  reorderSegmentsMutation.mutate({ productionId: effectiveProductionId, currentSnapshot: currentProductionSnapshot, segments: allSegments, draggedSegmentId, targetSegmentId, position })
                }}
                onReorderSceneMoment={(draggedMomentId, targetSegmentId, targetMomentId, position) => {
                  if (reorderSceneMomentsMutation.isPending) return
                  reorderSceneMomentsMutation.mutate({ productionId: effectiveProductionId, currentSnapshot: currentProductionSnapshot, sceneMoments: allSceneMoments, draggedMomentId, targetSegmentId, targetMomentId, position })
                }}
                onSelectContentUnit={(unitId) => selectContentUnitFromShotPlan(selectedShotPlanRow, unitId)}
                onCreateContentUnit={createContentUnitForSelectedMoment}
                onOpenContentUnitEditor={openContentUnitEditor}
                onSelectFirstSceneMomentForShotPlan={selectFirstSceneMomentForShotPlan}
                onReorderContentUnit={(draggedUnitId, targetUnitId, position) => {
                  if (!selectedShotPlanRow || reorderContentUnits.isPending) return
                  reorderContentUnits.mutate({ row: selectedShotPlanRow, draggedUnitId, targetUnitId, position })
                }}
                onMoveContentUnitOnTimeline={(unitId, startSec) => {
                  if (!selectedShotPlanRow || moveContentUnitOnTimeline.isPending) return
                  moveContentUnitOnTimeline.mutate({ row: selectedShotPlanRow, unitId, startSec })
                }}
                onSaveSegment={(segmentId, payload) => updateSegmentMutation.mutate({ productionId: effectiveProductionId, currentSnapshot: currentProductionSnapshot, segmentId, payload })}
                onDeleteSegment={(segmentId) => deleteSegmentMutation.mutate({ productionId: effectiveProductionId, currentSnapshot: currentProductionSnapshot, segmentId })}
                onBindSceneMomentScriptBlock={(momentId, scriptBlockId) => bindSceneMomentScriptBlockMutation.mutate({ momentId, scriptBlockId })}
                onCreateAndBindSceneMomentScriptBlock={(momentId, startLine, endLine) => createAndBindSceneMomentScriptBlockMutation.mutate({ momentId, startLine, endLine })}
                onSaveSceneMoment={(momentId, payload) => updateSceneMomentMutation.mutate({ productionId: effectiveProductionId, currentSnapshot: currentProductionSnapshot, momentId, payload })}
                onDeleteSceneMoment={(momentId) => deleteSceneMomentMutation.mutate({ productionId: effectiveProductionId, currentSnapshot: currentProductionSnapshot, momentId })}
                onLinkReferenceToSceneMoment={(momentId, referenceId, role) => linkSceneMomentReferenceMutation.mutate({ productionId: effectiveProductionId, currentSnapshot: currentProductionSnapshot, momentId, referenceId, role, settings: allSettings })}
                onUnlinkReferenceFromSceneMoment={(momentId, referenceId) => unlinkSceneMomentReferenceMutation.mutate({ productionId: effectiveProductionId, currentSnapshot: currentProductionSnapshot, momentId, referenceId })}
                onSaveExpressionLine={(target, payload) => updateWritingExpressionMutation.mutate({ productionId: effectiveProductionId, currentSnapshot: currentProductionSnapshot, target, payload })}
                onDeleteExpressionLine={(target) => {
                  if (target.kind === 'writingExpressions') deleteWritingExpressionMutation.mutate({ productionId: effectiveProductionId, currentSnapshot: currentProductionSnapshot, expressionId: target.id })
                }}
                onAddExpressionLine={(momentId, order, scriptBlockId) => createWritingExpressionMutation.mutate({ productionId: effectiveProductionId, currentSnapshot: currentProductionSnapshot, momentId, order, scriptBlockId })}
                canDeleteFallbackContentUnits={false}
                isSavingSegment={updateSegmentMutation.isPending}
                isReorderingStructure={reorderSegmentsMutation.isPending || reorderSceneMomentsMutation.isPending}
                isDeletingSegment={deleteSegmentMutation.isPending}
                isSavingSceneMoment={updateSceneMomentMutation.isPending}
                isDeletingSceneMoment={deleteSceneMomentMutation.isPending}
                isLinkingSceneMomentReference={linkSceneMomentReferenceMutation.isPending}
                isDeletingSceneMomentReference={unlinkSceneMomentReferenceMutation.isPending}
                isSavingExpressionLine={updateWritingExpressionMutation.isPending || createWritingExpressionMutation.isPending || deleteWritingExpressionMutation.isPending}
              />
            </WorkbenchProjectPane>
          </WorkbenchProjectViewport>
        )}
      </WorkbenchProjectBody>

      <Dialog open={reviewOpen} onOpenChange={(open) => {
        if (!open) closeWorkspacePatchDialog()
      }}>
        <ProductionOrchestrationReviewDialogContent>
          <ProductionOrchestrationReviewDialogTitle />
          <div className="production-orchestration-review-dialog-toolbar">
            <div className="production-orchestration-review-dialog-toolbar__copy">
              <span className="production-orchestration-review-dialog-toolbar__title">工作区草案</span>
              <span className="production-orchestration-review-dialog-toolbar__meta">
                {workspacePreviewWorkspace ? `待审节点 ${workspaceReviewNodeCount}` : '等待草案'}
              </span>
            </div>
          </div>
          {workspacePreviewWorkspace ? (
            <ProductionWorkspaceReviewPanel
              projectId={projectId}
              workspaceArtifact={workspacePreviewWorkspace}
              currentSnapshot={currentProductionSnapshot}
              nodeDecisions={workspaceNodeDecisions}
              onNodeDecisionsChange={setWorkspaceNodeDecisions}
              onAccepted={closeWorkspacePatchDialog}
              onDiscard={() => { void discardWorkspaceArtifact() }}
              onApplied={() => { void handleWorkspaceApplied() }}
            />
          ) : (
            <ProductionOrchestrationReviewEmptyNotice />
          )}
        </ProductionOrchestrationReviewDialogContent>
      </Dialog>

      <SemanticEntityCrudDialog
        open={createProductionOpen}
        mode="create"
        projectId={projectId}
        config={semanticEntityConfig('productions')}
        defaults={{ source_type: 'direct', owner_label: '导演组', progress: 0 }}
        queryKey={queryKey}
        title="新建制作"
        onOpenChange={setCreateProductionOpen}
        onSaved={handleProductionCreated}
      />

      {pageController.createDialog && (
        <SemanticEntityCrudDialog
          open
          mode="create"
          projectId={projectId}
          config={pageController.createDialog.config}
          defaults={pageController.createDialog.defaults}
          queryKey={queryKey}
          title={pageController.createDialog.title}
          onOpenChange={pageController.createDialog.onOpenChange}
          onSaved={pageController.createDialog.onSaved}
        />
      )}
      <ContentWorkbenchDialogs
        projectId={projectId}
        queryKey={queryKey}
        selected={selectedShotPlanRow}
        selectedUnit={selectedShotPlanUnit}
        selectedUnitKeyframes={selectedShotPlanUnitKeyframes}
        contentUnitConfig={contentUnitConfig}
        assetSlotConfig={assetSlotConfig}
        keyframeConfig={keyframeConfig}
        creatingUnit={creatingContentUnit}
        unitWorkspaceDefaults={null}
        editingUnit={false}
        creatingAssetSlot={false}
        assetSlotDefaults={undefined}
        creatingKeyframe={false}
        keyframeDefaults={undefined}
        onCreatingUnitChange={(open) => {
          if (!open) setCreatingContentUnit(false)
        }}
        onUnitSaved={(record) => {
          setCreatingContentUnit(false)
          selectContentUnitFromShotPlan(selectedShotPlanRow, record.ID)
        }}
        onEditingUnitChange={() => {}}
        onAssetSlotCreated={() => {}}
        onCreatingAssetSlotChange={() => {}}
        onKeyframeCreated={() => {}}
        onCreatingKeyframeChange={() => {}}
      />
    </WorkbenchProjectShell>
  )
}

function isVisibleWorkspaceRecord(record: SemanticEntityRecord) {
  return !Boolean(record.__delete ?? record.deleted)
}

interface ProductionHeaderCard {
  id: number
  name: string
  breadcrumbLabel: string
  scriptVersionId: number | null
}

function buildProductionHeaderCards(data?: OrchestrationData): ProductionHeaderCard[] {
  if (!data) return []
  return data.productions.map((production) => {
    const productionId = production.ID
    const segments = filterProductionSegmentsForProduction(data.segments, productionId)
    const segmentIds = new Set(segments.map((segment) => segment.ID))
    const sceneMoments = filterProductionSceneMomentsForSegments(data.sceneMoments, segmentIds)
    const sceneMomentIds = new Set(sceneMoments.map((moment) => moment.ID))
    const contentUnits = filterProductionContentUnitsForProduction(data.contentUnits, productionId, segmentIds, sceneMomentIds)
    const scriptVersionId = Number(production.script_version_id) || null
    const name = firstProductionText(production.name) || `#${productionId}`

    return {
      id: productionId,
      name,
      breadcrumbLabel: `${segments.length} 编排段 / ${sceneMoments.length} 情节 / ${contentUnits.length} 制作项`,
      scriptVersionId,
    }
  })
}

function firstProductionText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}
