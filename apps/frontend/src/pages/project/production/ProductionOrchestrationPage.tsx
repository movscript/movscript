import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  GitBranch,
  Wand2,
} from 'lucide-react'

import { SemanticEntityCrudDialog } from '@/components/shared/SemanticEntityCrudDialog'
import { ProductionOrchestrationWorkspace } from '@/components/workbench/ProductionOrchestrationWorkspace'
import { ProductionWorkspaceHeaderContext } from '@/components/workbench/ProductionOrchestrationStructure'
import { ProductionProposalReviewPanel } from '@/components/proposals/ProductionProposalReviewPanel'
import { ProductionProposalReviewEmptyState } from '@/components/proposals/ProductionProposalReviewEmptyState'
import { ProductionUpstreamProposalReviewSummary } from '@/components/proposals/ProductionUpstreamProposalReviewSummary'
import { ProjectWorkbenchShell } from '@/components/workbench/WorkbenchChrome'
import { isGeneratedKeyframeCandidateRecord } from '@/lib/agentGeneratedResourceBinding'
import { listScriptVersions, type ScriptVersion } from '@/api/scriptVersions'
import {
  buildProductionCurrentOverview,
} from '@/lib/productionOrchestrationOverview'
import { buildProductionOrchestrationLookup } from '@/lib/productionOrchestrationEntityModel'
import { scriptSourceTextForVersion } from '@/lib/productionScriptBlocks'
import {
  buildBindProductionScriptVersionMutationOptions,
  buildBindSceneMomentScriptBlockMutationOptions,
  buildCreateAndBindSceneMomentScriptBlockMutationOptions,
  buildCreateWritingExpressionMutationOptions,
  buildDeleteWritingExpressionMutationOptions,
  buildLinkSceneMomentReferenceMutationOptions,
  buildUpdateSceneMomentMutationOptions,
  buildUpdateWritingExpressionMutationOptions,
  buildUnlinkSceneMomentReferenceMutationOptions,
} from '@/lib/productionOrchestrationMutationController'
import {
  loadProductionOrchestrationData,
  type OrchestrationData,
} from '@/lib/productionOrchestrationData'
import {
  buildCurrentProductionProposalSnapshot,
} from '@/lib/productionProposalReviewModel'
import { useProductionOrchestrationPageController } from '@/lib/productionOrchestrationPageController'
import { useProductionOrchestrationLaunchController } from '@/lib/productionOrchestrationLaunchController'
import { useProductionOrchestrationReviewController } from '@/lib/productionOrchestrationReviewController'
import {
  compareProductionOrchestrationOrder,
  filterProductionContentUnitsForProduction,
  filterProductionSceneMomentsForSegments,
  filterProductionSegmentsForProduction,
} from '@/lib/productionOrchestrationWorkspaceModel'
import { useProjectStore } from '@/store/projectStore'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@movscript/ui'

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function ProductionOrchestrationPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const productionId = Number(searchParams.get('productionId')) || 0

  const queryKey = ['production-orchestration', projectId] as const
  const scriptVersionsQueryKey = ['production-orchestration-script-versions', projectId] as const
  const { data, isLoading, isFetching, refetch } = useQuery<OrchestrationData>({
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
  const canLaunchLinkedProposal = Boolean(scriptText) && !isFetchingScriptVersions
  const mutationBase = { projectId, queryClient, queryKey, refetch }
  const bindScriptVersionMutation = useMutation(buildBindProductionScriptVersionMutationOptions({
    ...mutationBase,
    productionId: effectiveProductionId,
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
  const linkSceneMomentReferenceMutation = useMutation(buildLinkSceneMomentReferenceMutationOptions(mutationBase))
  const unlinkSceneMomentReferenceMutation = useMutation(buildUnlinkSceneMomentReferenceMutationOptions(mutationBase))
  const updateWritingExpressionMutation = useMutation(buildUpdateWritingExpressionMutationOptions(mutationBase))
  const deleteWritingExpressionMutation = useMutation(buildDeleteWritingExpressionMutationOptions(mutationBase))
  const createWritingExpressionMutation = useMutation(buildCreateWritingExpressionMutationOptions(mutationBase))
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
    () => (data?.assetSlots ?? []).filter((slot) => !['ignored', 'merged'].includes(String(slot.status ?? ''))),
    [data?.assetSlots],
  )
  const allCreativeReferences = useMemo(
    () => (data?.creativeReferences ?? []).filter((reference) => !['ignored', 'merged'].includes(String(reference.status ?? ''))),
    [data?.creativeReferences],
  )
  const currentProductionOverview = useMemo(
    () => buildProductionCurrentOverview({
      production: selectedProduction,
      scriptVersion: selectedScriptVersion,
      segments: allSegments,
      sceneMoments: allSceneMoments,
      creativeReferences: allCreativeReferences,
      assetSlots: allAssetSlots,
      contentUnits: allContentUnits,
    }),
    [allAssetSlots, allCreativeReferences, allContentUnits, allSceneMoments, allSegments, selectedProduction, selectedScriptVersion],
  )
  const currentProductionSnapshot = useMemo(
    () => buildCurrentProductionProposalSnapshot({
      segments: allSegments,
      sceneMoments: allSceneMoments,
      creativeReferences: allCreativeReferences,
      creativeReferenceUsages: data?.creativeReferenceUsages ?? [],
      contentUnits: allContentUnits,
      keyframes: allKeyframes,
      assetSlots: allAssetSlots,
    }),
    [allAssetSlots, allContentUnits, allCreativeReferences, data?.creativeReferenceUsages, allKeyframes, allSceneMoments, allSegments],
  )
  const {
    openedDraftId,
    openedSettingDraftId,
    openedAssetProposalDraftId,
    openedSettingDraftQuery,
    openedAssetProposalDraftQuery,
    proposalPreviewDraft,
    proposalNodeDecisions,
    setProposalNodeDecisions,
    proposalReviewNodeCount,
    workspaceView,
    showReview,
    showStructure,
    clearProposalReview,
  } = useProductionOrchestrationReviewController({
    projectId,
    searchParams,
    currentProductionSnapshot,
    structureStatusLabel: `${allSegments.length} 编排段 · ${allSceneMoments.length} 情节`,
  })
  const lookup = useMemo(() => buildProductionOrchestrationLookup({
    scriptText,
    scriptVersionTitle: selectedScriptVersion?.title ?? '',
    segments: allSegments,
    sceneMoments: allSceneMoments,
    creativeReferences: allCreativeReferences,
    creativeReferenceUsages: data?.creativeReferenceUsages ?? [],
    assetSlots: allAssetSlots,
    contentUnits: allContentUnits,
  }), [allAssetSlots, allCreativeReferences, allContentUnits, allSceneMoments, allSegments, data?.creativeReferenceUsages, scriptText, selectedScriptVersion?.title])
  const pageController = useProductionOrchestrationPageController({
    projectId,
    searchParams,
    setSearchParams,
    sceneMoments: allSceneMoments,
    effectiveProductionId,
    queryClient,
    queryKey,
    refetch,
  })
  const launchController = useProductionOrchestrationLaunchController({
    projectId,
    effectiveProductionId,
    selectedProduction,
    openedDraftId,
    canLaunchLinkedProposal,
    productionSnapshot: currentProductionSnapshot,
    selectedScriptVersion,
    scriptVersions,
    setSearchParams,
    showReview,
    refetch,
    queryClient,
    queryKey,
  })
  const productionLabel = selectedProduction ? String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`) : '未选择制作'

  return (
    <ProjectWorkbenchShell
      workbenchId="creative_plan"
      projectName={project?.name}
      kicker={selectedProduction ? `${String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`)} · 创作编排` : '创作编排'}
      title="创作编排工作台"
      description="把剧本、设定和素材约束组织成 production 级创作蓝图，并通过 production proposal 审阅后落地。"
      badges={(
        <>
          {openedSettingDraftId ? <Badge variant="secondary" className="h-6 rounded-full px-2 type-tiny">设定 draft</Badge> : null}
          {openedAssetProposalDraftId ? <Badge variant="secondary" className="h-6 rounded-full px-2 type-tiny">素材需求 draft</Badge> : null}
          {openedDraftId ? <Badge variant="secondary" className="h-6 rounded-full px-2 type-tiny">已打开 draft</Badge> : null}
        </>
      )}
      headerBody={(
        <ProductionWorkspaceHeaderContext
          projectName={project?.name ?? '当前项目'}
          productionLabel={productionLabel}
          segmentCount={allSegments.length}
          sceneMomentCount={allSceneMoments.length}
          writingExpressionCount={allWritingExpressions.length}
          selectedScriptVersion={selectedScriptVersion}
          scriptVersions={scriptVersions}
          scriptText={scriptText}
          scriptBlockCount={allScriptBlocks.length}
          nextStep={currentProductionOverview.nextStep[0] ?? '继续写作'}
          isFetchingScriptVersions={isFetchingScriptVersions}
          isBindingScriptVersion={bindScriptVersionMutation.isPending}
          disabled={!selectedProduction}
          onBindScriptVersion={(scriptVersionId) => bindScriptVersionMutation.mutate(scriptVersionId)}
        />
      )}
      onRefresh={() => { void refetch() }}
      refreshing={isFetching}
      refreshLabel="刷新"
      actions={(
        <>
          {productions.length > 0 ? (
            <Select value={String(effectiveProductionId || '')} onValueChange={pageController.handleSelectProduction}>
              <SelectTrigger className="h-8 w-44 type-label">
                <SelectValue placeholder="选择制作" />
              </SelectTrigger>
              <SelectContent>
                {productions.map((p) => (
                  <SelectItem key={p.ID} value={String(p.ID)}>
                    {String(p.name ?? `制作 #${p.ID}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button size="sm" variant="outline" className="h-8 w-32 gap-1.5" onClick={showReview} disabled={!projectId || !effectiveProductionId}>
            <GitBranch size={14} />
            审阅提案
            {proposalPreviewDraft ? <span className="ml-0.5 rounded-full bg-muted px-1.5 type-tiny leading-4 text-muted-foreground">{proposalReviewNodeCount}</span> : null}
          </Button>
          <Button
            size="sm"
            className="h-8 w-32 gap-1.5"
            onClick={() => launchController.handleAnalyzeTarget({ scope: 'production' })}
            loading={launchController.orchestrationStage !== 'idle'}
            disabled={!projectId || !effectiveProductionId || launchController.orchestrationStage !== 'idle'}
          >
            <Wand2 size={14} />
            生成编排提案
          </Button>
        </>
      )}
    >
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-h-0 flex-1 overflow-y-auto bg-muted/20">
          {isLoading ? (
            <ProductionWorkspaceSkeleton />
          ) : (
            <div className="flex h-full min-h-0 flex-1 flex-col">
              {launchController.orchestrationStage !== 'idle' ? (
                <div className="border-b border-border bg-muted/40 px-4 py-2 type-label text-muted-foreground">
                  正在生成编排提案，完成后会打开审阅弹窗。
                </div>
              ) : null}
              <div className="min-h-0 flex-1">
                <ProductionOrchestrationWorkspace
                  scriptSourceText={scriptSourceText}
                  creativeReferences={allCreativeReferences}
                  assetSlots={allAssetSlots}
                  segments={allSegments}
                  sceneMoments={allSceneMoments}
                  writingExpressions={allWritingExpressions}
                  scriptBlocks={allScriptBlocks}
                  selectedMomentId={pageController.selectedWritingMomentId}
                  isBindingSceneMomentScriptBlock={bindSceneMomentScriptBlockMutation.isPending || createAndBindSceneMomentScriptBlockMutation.isPending}
                  lookup={lookup}
                  onEditSegment={pageController.editSegment}
                  onCreateSegment={pageController.createSegment}
                  onCreateSceneMoment={pageController.createSceneMoment}
                  onSelectSceneMoment={pageController.selectSceneMoment}
                  onBindSceneMomentScriptBlock={(momentId, scriptBlockId) => bindSceneMomentScriptBlockMutation.mutate({ momentId, scriptBlockId })}
                  onCreateAndBindSceneMomentScriptBlock={(momentId, startLine, endLine) => createAndBindSceneMomentScriptBlockMutation.mutate({ momentId, startLine, endLine })}
                  onSaveSceneMoment={(momentId, payload) => updateSceneMomentMutation.mutate({ momentId, payload })}
                  onLinkReferenceToSceneMoment={(momentId, referenceId, role) => linkSceneMomentReferenceMutation.mutate({ momentId, referenceId, role })}
                  onUnlinkReferenceFromSceneMoment={(usageId) => unlinkSceneMomentReferenceMutation.mutate(usageId)}
                  onSaveExpressionLine={(target, payload) => updateWritingExpressionMutation.mutate({ target, payload })}
                  onDeleteExpressionLine={(target) => {
                    if (target.kind === 'writingExpressions') deleteWritingExpressionMutation.mutate(target.id)
                  }}
                  onAddExpressionLine={(momentId, order, scriptBlockId) => createWritingExpressionMutation.mutate({ momentId, order, scriptBlockId })}
                  isSavingSceneMoment={updateSceneMomentMutation.isPending}
                  isLinkingSceneMomentReference={linkSceneMomentReferenceMutation.isPending}
                  isDeletingSceneMomentReference={unlinkSceneMomentReferenceMutation.isPending}
                  isSavingExpressionLine={updateWritingExpressionMutation.isPending || createWritingExpressionMutation.isPending || deleteWritingExpressionMutation.isPending}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      <Dialog open={workspaceView === 'review'} onOpenChange={(open) => open ? showReview() : showStructure()}>
        <DialogContent className="flex max-h-[88vh] w-[min(1180px,calc(100vw-32px))] max-w-none flex-col overflow-hidden p-0">
          <DialogTitle className="sr-only">创作编排提案审阅</DialogTitle>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="flex min-h-0 w-full flex-col gap-4">
              <ProductionUpstreamProposalReviewSummary
                settingDraft={openedSettingDraftQuery.data}
                assetProposalDraft={openedAssetProposalDraftQuery.data}
                projectName={project?.name ?? '当前项目'}
                productionName={selectedProduction ? String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`) : `制作 #${effectiveProductionId}`}
                creativeReferences={allCreativeReferences}
                assetSlots={allAssetSlots}
              />
              {proposalPreviewDraft ? (
                <ProductionProposalReviewPanel
                  projectId={projectId}
                  proposalDraft={proposalPreviewDraft}
                  currentSnapshot={currentProductionSnapshot}
                  nodeDecisions={proposalNodeDecisions}
                  onNodeDecisionsChange={setProposalNodeDecisions}
                  onAccepted={() => {
                    clearProposalReview()
                  }}
                  onDiscard={() => {
                    clearProposalReview()
                  }}
                  onApplied={() => {
                    void refetch()
                    queryClient.invalidateQueries({ queryKey })
                  }}
                />
              ) : (
                <ProductionProposalReviewEmptyState onSwitchToStructure={showStructure} />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
      {pageController.editDialog && (
        <SemanticEntityCrudDialog
          open
          mode="edit"
          projectId={projectId}
          config={pageController.editDialog.config}
          record={pageController.editDialog.record}
          queryKey={queryKey}
          title={pageController.editDialog.title}
          onOpenChange={pageController.editDialog.onOpenChange}
          onSaved={pageController.editDialog.onSaved}
        />
      )}
    </ProjectWorkbenchShell>
  )
}

function ProductionWorkspaceSkeleton() {
  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <section className="rounded-lg border border-border bg-background p-4">
        <div className="animate-pulse space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-5 w-40 rounded bg-muted" />
              <div className="h-3 w-80 max-w-full rounded bg-muted" />
            </div>
            <div className="h-7 w-24 rounded-full bg-muted" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`production-skeleton-metric-${index}`} className="h-12 rounded-md border border-border bg-muted/30" />
            ))}
          </div>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        {[0, 1].map((section) => (
          <section key={`production-skeleton-section-${section}`} className="rounded-lg border border-border bg-background p-4">
            <div className="animate-pulse space-y-3">
              <div className="h-3 w-28 rounded bg-muted" />
              <div className="h-4 w-36 rounded bg-muted" />
              {[0, 1, 2].map((row) => (
                <div key={`production-skeleton-row-${section}-${row}`} className="rounded-md border border-border p-3">
                  <div className="h-3 w-2/3 rounded bg-muted" />
                  <div className="mt-2 h-3 w-full rounded bg-muted/70" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-muted/70" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
