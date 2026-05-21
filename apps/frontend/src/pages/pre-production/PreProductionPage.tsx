import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Database, GitBranch, Plus, Sparkles } from 'lucide-react'

import { SemanticEntityInlineEditor } from '@/components/shared/SemanticEntityInlineEditor'
import { PreProductionAssetBoard } from '@/components/workbench/PreProductionAssetBoard'
import { AssetSlotDetail } from '@/components/workbench/PreProductionAssetDetail'
import { PreProductionResourceLibraryDialog } from '@/components/workbench/PreProductionResourceLibraryDialog'
import { PreProductionReviewWorkspace } from '@/components/workbench/PreProductionReviewWorkspace'
import { ProjectWorkbenchShell } from '@/components/workbench/WorkbenchChrome'
import { WorkbenchMetric } from '@/components/workbench/WorkbenchPrimitives'
import { createSemanticEntity, listSemanticEntities, updateSemanticEntity, semanticEntityConfig, type SemanticEntityRecord } from '@/api/semanticEntities'
import { readNumberParam, readStringParam, updateContentFilterParams, type ContentFilterKey } from '@/pages/contents/lib/contentFilters'
import { api } from '@/lib/api'
import { RESOURCE_UPLOAD_ACCEPT } from '@/lib/mediaTypes'
import { localAgentClient, type AgentDraft } from '@/lib/localAgentClient'
import {
  buildPreProductionAssetRows,
  buildReferenceAssetClusters,
  normalizeAssetKind,
  normalizeSlotStatus,
  rowHasActiveAssetCandidates,
  type AssetKind,
  type AssetSlotCandidateRecord,
  type AssetSlotRecord,
  type AssetSlotViewModel,
  type CreativeReferenceRecord,
  type ReferenceAssetCluster,
} from '@/lib/preProductionAssetRows'
import {
  buildPreProductionAssetSlotCreatePayload,
  initialPreProductionResourceLibraryState,
  openPreProductionResourceLibraryState,
  preProductionResourceLibraryPageCount,
  preProductionResourceLibraryTotal,
  preProductionResourceLibraryTypeParam,
  setPreProductionResourceLibraryOpen,
  setPreProductionResourceLibraryPage,
  setPreProductionResourceLibrarySearch,
  setPreProductionResourceLibrarySelection,
  setPreProductionResourceLibraryType,
  type PreProductionCandidateGenerationKind,
} from '@/lib/preProductionAssetCandidateWrite'
import {
  buildPreProductionAddCandidateMutationOptions,
  buildPreProductionAttachLibraryCandidateMutationOptions,
  buildPreProductionLockCandidateMutationOptions,
  buildPreProductionRejectCandidateMutationOptions,
  buildPreProductionUploadCandidateMutationOptions,
} from '@/lib/preProductionAssetCandidateController'
import { buildPreProductionAssetProposalMutationOptions } from '@/lib/preProductionAssetProposalController'
import { runPreProductionAudit } from '@/lib/preProductionAuditController'
import { runPreProductionMediaCandidateGeneration } from '@/lib/preProductionMediaCandidateController'
import { buildPreProductionAssetSlotCanvasMutationOptions } from '@/lib/preProductionCanvasLaunch'
import { refreshPreProductionWorkbenchContext } from '@/lib/preProductionRefreshController'
import { usePreProductionUploadInput } from '@/lib/preProductionUploadInput'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import type { PaginatedResponse, RawResource } from '@/types'
import { Badge, Button } from '@movscript/ui'
import { ROUTES } from '@/routes/projectRoutes'

type CandidateGenerationKind = PreProductionCandidateGenerationKind

async function loadPreProductionReviewDrafts(
  projectId: number,
  kind: Extract<AgentDraft['kind'], 'setting_proposal' | 'asset_proposal'>,
  draftIds: string[],
): Promise<AgentDraft[]> {
  const ids = Array.from(new Set(draftIds.map((id) => id.trim()).filter(Boolean)))
  if (ids.length === 0) return []
  const drafts = await Promise.all(ids.map(async (draftId) => {
    try {
      return await localAgentClient.getDraft(draftId)
    } catch {
      return null
    }
  }))
  return drafts.filter((draft): draft is AgentDraft => Boolean(draft && draft.projectId === projectId && draft.kind === kind))
}

export function PreProductionAssetWorkspace() {
  const projectId = useProjectStore((s) => s.current?.ID)
  return <PreProductionWorkspaceShell projectId={projectId} compact />
}

export default function PreProductionPage() {
  const project = useProjectStore((s) => s.current)
  return <PreProductionWorkspaceShell projectId={project?.ID} projectName={project?.name} />
}

function PreProductionWorkspaceShell({ projectId, projectName, compact = false }: { projectId?: number; projectName?: string; compact?: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const assetAssistantCleanupRef = useRef<(() => void) | null>(null)
  const prepAuditCleanupRef = useRef<(() => void) | null>(null)
  const uploadInput = usePreProductionUploadInput()
  const [searchParams, setSearchParams] = useSearchParams()
  const [newSlotEditId, setNewSlotEditId] = useState<number | null>(null)
  const [newReferenceEditKey, setNewReferenceEditKey] = useState<string | number | null>(null)
  const [prepAuditLaunching, setPrepAuditLaunching] = useState(false)
  const [resourceLibraryState, setResourceLibraryState] = useState(initialPreProductionResourceLibraryState)
  const selectedId = readNumberParam(searchParams, 'asset_slot_id') ?? readNumberParam(searchParams, 'selected')
  const selectedReferenceParam = readNumberParam(searchParams, 'reference_id')
  const kindParam = readStringParam(searchParams, 'kind')
  const workspaceView = searchParams.get('view') === 'review' ? 'review' : 'main'
  const openedDraftId = searchParams.get('draftId')?.trim() || ''
  const openedSettingDraftId = searchParams.get('settingDraftId')?.trim() || ''
  const openedAssetProposalDraftId = searchParams.get('assetProposalDraftId')?.trim() || ''
  const kindFilter: AssetKind = kindParam ? normalizeAssetKind(kindParam) : 'all'
  const slotConfig = semanticEntityConfig('assetSlots')
  const candidateConfig = semanticEntityConfig('assetSlotCandidates')
  const referenceConfig = semanticEntityConfig('creativeReferences')

  const { data: creativeReferences = [], isFetching: creativeReferencesFetching } = useQuery({
    queryKey: ['pre-production-creative-references', projectId],
    queryFn: () => listSemanticEntities(projectId!, referenceConfig) as Promise<CreativeReferenceRecord[]>,
    enabled: !!projectId,
  })

  const { data: slots = [], isLoading, isFetching: slotsFetching } = useQuery({
    queryKey: ['semantic-asset-slots-page', projectId],
    queryFn: () => listSemanticEntities(projectId!, slotConfig) as Promise<AssetSlotRecord[]>,
    enabled: !!projectId,
  })

  const { data: candidates = [], isFetching: candidatesFetching } = useQuery({
    queryKey: ['semantic-asset-slot-candidates-page', projectId],
    queryFn: () => listSemanticEntities(projectId!, candidateConfig) as Promise<AssetSlotCandidateRecord[]>,
    enabled: !!projectId,
  })

  const resourceLibraryTypeParam = preProductionResourceLibraryTypeParam(resourceLibraryState.type)
  const resourceLibraryQuery = useQuery<PaginatedResponse<RawResource> | RawResource[]>({
    queryKey: ['resources', 'pre-production-library-picker', resourceLibraryTypeParam, resourceLibraryState.search, resourceLibraryState.page],
    queryFn: () => api.get('/resources', {
      params: {
        page: resourceLibraryState.page,
        page_size: 18,
        type: resourceLibraryTypeParam,
        q: resourceLibraryState.search.trim() || undefined,
      },
    }).then((r) => r.data),
    enabled: resourceLibraryState.open,
  })

  const assetProposalDraftsQuery = useQuery<AgentDraft[]>({
    queryKey: ['asset-proposal-drafts', projectId, openedAssetProposalDraftId, openedDraftId],
    queryFn: () => loadPreProductionReviewDrafts(projectId!, 'asset_proposal', [openedAssetProposalDraftId, openedDraftId]),
    enabled: !!projectId && workspaceView === 'review' && Boolean(openedAssetProposalDraftId || openedDraftId),
    refetchInterval: workspaceView === 'review' ? 1500 : false,
  })
  const settingProposalDraftsQuery = useQuery<AgentDraft[]>({
    queryKey: ['setting-proposal-drafts', projectId, openedSettingDraftId, openedDraftId],
    queryFn: () => loadPreProductionReviewDrafts(projectId!, 'setting_proposal', [openedSettingDraftId, openedDraftId]),
    enabled: !!projectId && workspaceView === 'review' && Boolean(openedSettingDraftId || openedDraftId),
    refetchInterval: workspaceView === 'review' ? 1500 : false,
  })

  useEffect(() => () => {
    assetAssistantCleanupRef.current?.()
    prepAuditCleanupRef.current?.()
  }, [])

  const updateSlotMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, string | number | boolean | null> }) =>
      updateSemanticEntity(projectId!, slotConfig, id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['semantic-asset-slots-page', projectId] }),
  })

  const lockCandidateMutation = useMutation(buildPreProductionLockCandidateMutationOptions({ projectId, queryClient }))
  const rejectCandidateMutation = useMutation(buildPreProductionRejectCandidateMutationOptions({ projectId, queryClient }))

  const createSlotMutation = useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error('请先选择项目')
      return createSemanticEntity(projectId, slotConfig, buildPreProductionAssetSlotCreatePayload({
        kindFilter,
        selectedId,
        selectedReferenceId: selectedReferenceParam,
        slots,
      })) as Promise<AssetSlotRecord>
    },
    onSuccess: async (record) => {
      await queryClient.invalidateQueries({ queryKey: ['semantic-asset-slots-page', projectId] })
      setNewSlotEditId(record.ID)
      setFilter({ asset_slot_id: record.ID, selected: null })
      toast.success('素材需求已创建')
    },
  })

  const addCandidateMutation = useMutation(buildPreProductionAddCandidateMutationOptions({ projectId, queryClient }))

  const attachLibraryCandidateMutation = useMutation(buildPreProductionAttachLibraryCandidateMutationOptions({
    projectId,
    queryClient,
    onAttached: () => setResourceLibraryState((state) => setPreProductionResourceLibraryOpen(state, false)),
  }))

  const uploadCandidateMutation = useMutation(buildPreProductionUploadCandidateMutationOptions({
    projectId,
    queryClient,
    getRow: () => selected,
    onSettled: uploadInput.resetUpload,
  }))

  const openCanvasMutation = useMutation(buildPreProductionAssetSlotCanvasMutationOptions({
    projectId,
    navigateToCanvas: navigate,
  }))

  const generateCandidateMutation = useMutation(buildPreProductionAssetProposalMutationOptions({
    projectId,
    cleanupRef: assetAssistantCleanupRef,
    setReviewSearchParams: (updater) => setSearchParams(updater, { replace: true }),
  }))

  const visibleSlots = useMemo(() => slots.filter((slot) => !isInternalCandidateSlot(slot)), [slots])
  const slotById = useMemo(() => new Map(slots.map((slot) => [slot.ID, slot])), [slots])
  const rows = useMemo(() => buildPreProductionAssetRows(visibleSlots, candidates, slotById), [candidates, slotById, visibleSlots])
  const referenceById = useMemo(() => new Map(creativeReferences.map((reference) => [reference.ID, reference])), [creativeReferences])
  const clusters = useMemo(() => buildReferenceAssetClusters(creativeReferences, rows), [creativeReferences, rows])
  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (kindFilter !== 'all' && row.kind !== kindFilter) return false
      return true
    })
  }, [kindFilter, rows])
  const filteredClusters = useMemo(() => clusters.map((cluster) => ({
    ...cluster,
    rows: cluster.rows.filter((row) => kindFilter === 'all' || row.kind === kindFilter),
  })), [clusters, kindFilter])
  const selected = selectedId ? rows.find((row) => row.slot.ID === selectedId) ?? null : null
  const selectedReferenceId = selected
    ? selectedReferenceParam ?? selected.slot.creative_reference_id ?? null
    : selectedReferenceParam ?? filteredClusters[0]?.reference?.ID
  const selectedReference = selectedReferenceId ? referenceById.get(selectedReferenceId) ?? null : null
  const selectedCluster = filteredClusters.find((cluster) => (cluster.reference?.ID ?? 0) === (selectedReferenceId ?? 0)) ?? filteredClusters[0] ?? null

  const missingCount = visibleSlots.filter((slot) => normalizeSlotStatus(slot.status) === 'missing').length
  const candidateCount = rows.filter(rowHasActiveAssetCandidates).length
  const lockedCount = visibleSlots.filter((slot) => normalizeSlotStatus(slot.status) === 'locked').length
  const waivedCount = visibleSlots.filter((slot) => normalizeSlotStatus(slot.status) === 'waived').length

  function setFilter(updates: Partial<Record<ContentFilterKey, string | number | null | undefined>>) {
    setSearchParams(updateContentFilterParams(searchParams, updates), { replace: true })
  }

  function setWorkspaceView(view: 'main' | 'review') {
    const next = new URLSearchParams(searchParams)
    if (view === 'review') next.set('view', 'review')
    else next.delete('view')
    setSearchParams(next, { replace: true })
  }

  function startCreate() {
    createSlotMutation.mutate()
  }

  function startCreateReference() {
    setNewReferenceEditKey(`new-reference-${Date.now()}`)
    setFilter({ reference_id: null, asset_slot_id: null, selected: null })
  }

  function lockCandidate(candidate: AssetSlotCandidateRecord) {
    if (!selected) return
    lockCandidateMutation.mutate({ row: selected, candidate })
  }

  function rejectCandidate(candidate: AssetSlotCandidateRecord) {
    if (!selected) return
    rejectCandidateMutation.mutate({ row: selected, candidate })
  }

  function triggerUpload() {
    uploadInput.triggerUpload(!selected || uploadInput.uploading || uploadCandidateMutation.isPending)
  }

  function handleUpload(file?: File) {
    uploadInput.uploadFile(file, {
      disabled: !selected || uploadCandidateMutation.isPending,
      onUpload: (selectedFile) => uploadCandidateMutation.mutate(selectedFile),
    })
  }

  function generateCandidate(kind: CandidateGenerationKind) {
    if (!selected) return
    generateCandidateMutation.mutate({ row: selected, kind })
  }

  function generateMediaCandidate(kind: CandidateGenerationKind) {
    if (!selected || !projectId) return
    runPreProductionMediaCandidateGeneration(selected, kind, {
      projectId,
      cleanupRef: assetAssistantCleanupRef,
      queryClient,
      addCandidateMutation,
      generationBusy: generateCandidateMutation.isPending,
    })
  }

  function openResourceLibraryPicker() {
    if (!selected) {
      toast.info('请先选择素材需求')
      return
    }
    setResourceLibraryState(openPreProductionResourceLibraryState(selected.kind))
  }

  function attachSelectedLibraryResource() {
    if (!selected || !resourceLibraryState.selectedResource || attachLibraryCandidateMutation.isPending) return
    attachLibraryCandidateMutation.mutate({ row: selected, resource: resourceLibraryState.selectedResource })
  }

  function openAssistantForSlot() {
    if (!projectId || !selected) {
      toast.info('请先选择素材需求')
      return
    }
    generateCandidateMutation.mutate({ row: selected, kind: selected.kind === 'video' ? 'video' : 'image' })
  }

  function organizeCurrentPrep() {
    runPreProductionAudit({
      projectId,
      projectName,
      cleanupRef: prepAuditCleanupRef,
      queryClient,
      setLaunching: setPrepAuditLaunching,
      setReviewSearchParams: (updater) => setSearchParams(updater, { replace: true }),
      refetchSettingDrafts: settingProposalDraftsQuery.refetch,
      refetchAssetProposalDrafts: assetProposalDraftsQuery.refetch,
    })
  }

  async function refreshPreProduction() {
    await refreshPreProductionWorkbenchContext({
      projectId,
      queryClient,
      refetchSettingDrafts: settingProposalDraftsQuery.refetch,
      refetchAssetProposalDrafts: assetProposalDraftsQuery.refetch,
    })
  }

  function openReviewWorkspace() {
    setWorkspaceView('review')
  }

  function openMainWorkspace() {
    setWorkspaceView('main')
  }

  const mainWorkspace = (
    <PreProductionWorkspace
      loading={isLoading}
      clusters={filteredClusters}
      selectedCluster={selectedCluster}
      selectedReference={selectedReference}
      referenceConfig={referenceConfig}
      newReferenceEditKey={newReferenceEditKey}
      selected={selected}
      referenceCount={creativeReferences.length}
      visibleSlotCount={visibleSlots.length}
      missingCount={missingCount}
      candidateCount={candidateCount}
      lockedCount={lockedCount}
      waivedCount={waivedCount}
      kindFilter={kindFilter}
      rows={rows}
      newSlotEditId={newSlotEditId}
      projectId={projectId}
      slotConfig={slotConfig}
      setFilter={setFilter}
      startCreate={startCreate}
      startCreateReference={startCreateReference}
      createSlotPending={createSlotMutation.isPending}
      prepAuditLaunching={prepAuditLaunching}
      setWorkspaceView={setWorkspaceView}
      updateSlotMutationPending={updateSlotMutation.isPending}
      lockCandidatePending={lockCandidateMutation.isPending}
      rejectCandidatePending={rejectCandidateMutation.isPending}
      addCandidateMutationPending={addCandidateMutation.isPending}
      uploadCandidatePending={uploadCandidateMutation.isPending}
      attachLibraryCandidatePending={attachLibraryCandidateMutation.isPending}
      openCanvasPending={openCanvasMutation.isPending}
      generateCandidatePending={generateCandidateMutation.isPending}
      uploading={uploadInput.uploading || uploadCandidateMutation.isPending}
      generatingKind={generateCandidateMutation.variables?.kind}
      onSaved={(record) => {
        setNewSlotEditId((id) => id === record.ID ? null : id)
        setFilter({ asset_slot_id: record.ID })
      }}
      onDeleted={() => {
        setNewSlotEditId(null)
        setFilter({ asset_slot_id: null, selected: null })
      }}
      onReferenceSaved={(record) => {
        setNewReferenceEditKey(null)
        setFilter({ reference_id: record.ID, asset_slot_id: null, selected: null })
      }}
      onReferenceDeleted={() => {
        setNewReferenceEditKey(null)
        setFilter({ reference_id: null, asset_slot_id: null, selected: null })
      }}
      onLock={lockCandidate}
      onReject={rejectCandidate}
      onUploadCandidate={triggerUpload}
      onOpenResourceLibrary={openResourceLibraryPicker}
      onGenerateProposal={generateCandidate}
      onGenerateMedia={generateMediaCandidate}
      onOpenAssistant={openAssistantForSlot}
      onOrganizeCurrentPrep={organizeCurrentPrep}
      onOpenCanvas={() => selected && openCanvasMutation.mutate(selected.slot)}
      onSelectSlot={(slotId) => {
        const row = rows.find((item) => item.slot.ID === slotId)
        setNewReferenceEditKey(null)
        setFilter({ reference_id: row?.slot.creative_reference_id ?? null, asset_slot_id: slotId })
      }}
      onSelectReference={(referenceId) => {
        setNewReferenceEditKey(null)
        setFilter({ reference_id: referenceId, asset_slot_id: null, selected: null })
      }}
    />
  )

  const resourceLibraryDialog = (
    <PreProductionResourceLibraryDialog
      open={resourceLibraryState.open}
      row={selected}
      resources={Array.isArray(resourceLibraryQuery.data) ? resourceLibraryQuery.data : resourceLibraryQuery.data?.items ?? []}
      selectedResource={resourceLibraryState.selectedResource}
      search={resourceLibraryState.search}
      type={resourceLibraryState.type}
      page={resourceLibraryState.page}
      pageCount={preProductionResourceLibraryPageCount({ data: resourceLibraryQuery.data })}
      total={preProductionResourceLibraryTotal(resourceLibraryQuery.data)}
      isLoading={resourceLibraryQuery.isLoading || resourceLibraryQuery.isFetching}
      isSaving={attachLibraryCandidateMutation.isPending}
      onOpenChange={(open) => setResourceLibraryState((state) => setPreProductionResourceLibraryOpen(state, open))}
      onSearch={(value) => setResourceLibraryState((state) => setPreProductionResourceLibrarySearch(state, value))}
      onType={(value) => setResourceLibraryState((state) => setPreProductionResourceLibraryType(state, value))}
      onPage={(page) => setResourceLibraryState((state) => setPreProductionResourceLibraryPage(state, page))}
      onSelect={(resource) => setResourceLibraryState((state) => setPreProductionResourceLibrarySelection(state, resource))}
      onClear={() => setResourceLibraryState((state) => setPreProductionResourceLibrarySelection(state, null))}
      onConfirm={attachSelectedLibraryResource}
    />
  )

  const reviewWorkspace = (
    <PreProductionReviewWorkspace
      projectId={projectId}
      settingDrafts={settingProposalDraftsQuery.data ?? []}
      settingDraftsLoading={settingProposalDraftsQuery.isLoading}
      drafts={assetProposalDraftsQuery.data ?? []}
      loading={assetProposalDraftsQuery.isLoading}
      creativeReferences={creativeReferences}
      assetSlots={visibleSlots}
      onApplied={refreshPreProduction}
      setWorkspaceView={setWorkspaceView}
    />
  )

  if (workspaceView === 'review') {
    if (compact) {
      return (
        <>
          {reviewWorkspace}
          <input ref={uploadInput.inputRef} type="file" className="hidden" accept={RESOURCE_UPLOAD_ACCEPT} onChange={(e) => handleUpload(e.target.files?.[0])} />
        </>
      )
    }
    return (
      <ProjectWorkbenchShell
        workbenchId="pre_production"
        projectName={projectName}
        kicker="提案审阅"
        title="前期准备审阅"
        description="审阅设定提案和素材需求提案，确认归属、缺口、候选素材和下游可用性。"
        badges={<Badge variant="outline" className="type-tiny">{(settingProposalDraftsQuery.data?.length ?? 0) + (assetProposalDraftsQuery.data?.length ?? 0)} 个提案</Badge>}
        onRefresh={() => { void refreshPreProduction() }}
        refreshing={creativeReferencesFetching || slotsFetching || candidatesFetching || settingProposalDraftsQuery.isFetching || assetProposalDraftsQuery.isFetching}
        refreshLabel="刷新上下文"
        actions={(
          <Button size="sm" variant="outline" onClick={openMainWorkspace}>
            <Database size={14} />
            返回工作区
          </Button>
        )}
      >
        {reviewWorkspace}
        <input ref={uploadInput.inputRef} type="file" className="hidden" accept={RESOURCE_UPLOAD_ACCEPT} onChange={(e) => handleUpload(e.target.files?.[0])} />
      </ProjectWorkbenchShell>
    )
  }

  if (compact) {
    return (
      <>
        {mainWorkspace}
        {resourceLibraryDialog}
        <input ref={uploadInput.inputRef} type="file" className="hidden" accept={RESOURCE_UPLOAD_ACCEPT} onChange={(e) => handleUpload(e.target.files?.[0])} />
      </>
    )
  }

  return (
    <ProjectWorkbenchShell
      workbenchId="pre_production"
      projectName={projectName}
      kicker="前期准备"
      title="前期准备工作台"
      description="沉淀设定资料、素材需求和候选素材，补齐创作编排和内容生成之前的可复用上下文。"
      badges={(
        <>
          <Badge variant="outline" className="type-tiny">{referenceCountLabel(creativeReferences.length, visibleSlots.length)}</Badge>
          {missingCount > 0 ? <Badge variant="warning" className="type-tiny">缺口 {missingCount}</Badge> : null}
        </>
      )}
      onRefresh={() => { void refreshPreProduction() }}
      refreshing={creativeReferencesFetching || slotsFetching || candidatesFetching}
      refreshLabel="刷新上下文"
      actions={(
        <Button size="sm" variant="outline" onClick={openReviewWorkspace}>
          <GitBranch size={14} />
          审阅提案
        </Button>
      )}
    >
      {mainWorkspace}
      {resourceLibraryDialog}
      <input ref={uploadInput.inputRef} type="file" className="hidden" accept={RESOURCE_UPLOAD_ACCEPT} onChange={(e) => handleUpload(e.target.files?.[0])} />
    </ProjectWorkbenchShell>
  )
}

function PreProductionWorkspace({
  loading,
  clusters,
  selectedCluster,
  selectedReference,
  referenceConfig,
  newReferenceEditKey,
  selected,
  referenceCount,
  visibleSlotCount,
  missingCount,
  candidateCount,
  lockedCount,
  waivedCount,
  kindFilter,
  rows,
  newSlotEditId,
  projectId,
  slotConfig,
  setFilter,
  startCreate,
  startCreateReference,
  createSlotPending,
  prepAuditLaunching,
  setWorkspaceView,
  updateSlotMutationPending,
  lockCandidatePending,
  rejectCandidatePending,
  addCandidateMutationPending,
  uploadCandidatePending,
  attachLibraryCandidatePending,
  openCanvasPending,
  generateCandidatePending,
  uploading,
  generatingKind,
  onSaved,
  onDeleted,
  onReferenceSaved,
  onReferenceDeleted,
  onLock,
  onReject,
  onUploadCandidate,
  onOpenResourceLibrary,
  onGenerateProposal,
  onGenerateMedia,
  onOpenAssistant,
  onOrganizeCurrentPrep,
  onOpenCanvas,
  onSelectSlot,
  onSelectReference,
}: {
  loading: boolean
  clusters: ReferenceAssetCluster[]
  selectedCluster: ReferenceAssetCluster | null
  selectedReference: CreativeReferenceRecord | null
  referenceConfig: ReturnType<typeof semanticEntityConfig>
  newReferenceEditKey: string | number | null
  selected: AssetSlotViewModel | null
  referenceCount: number
  visibleSlotCount: number
  missingCount: number
  candidateCount: number
  lockedCount: number
  waivedCount: number
  kindFilter: AssetKind
  rows: AssetSlotViewModel[]
  newSlotEditId: number | null
  projectId?: number
  slotConfig: ReturnType<typeof semanticEntityConfig>
  setFilter: (updates: Partial<Record<ContentFilterKey, string | number | null | undefined>>) => void
  startCreate: () => void
  startCreateReference: () => void
  createSlotPending: boolean
  prepAuditLaunching: boolean
  setWorkspaceView: (view: 'main' | 'review') => void
  updateSlotMutationPending: boolean
  lockCandidatePending: boolean
  rejectCandidatePending: boolean
  addCandidateMutationPending: boolean
  uploadCandidatePending: boolean
  attachLibraryCandidatePending: boolean
  openCanvasPending: boolean
  generateCandidatePending: boolean
  uploading: boolean
  generatingKind?: CandidateGenerationKind
  onSaved: (record: SemanticEntityRecord) => void
  onDeleted: () => void
  onReferenceSaved: (record: SemanticEntityRecord) => void
  onReferenceDeleted: () => void
  onLock: (candidate: AssetSlotCandidateRecord) => void
  onReject: (candidate: AssetSlotCandidateRecord) => void
  onUploadCandidate: () => void
  onOpenResourceLibrary: () => void
  onGenerateProposal: (kind: CandidateGenerationKind) => void
  onGenerateMedia: (kind: CandidateGenerationKind) => void
  onOpenAssistant: () => void
  onOrganizeCurrentPrep: () => void
  onOpenCanvas: () => void
  onSelectSlot: (slotId: number) => void
  onSelectReference: (referenceId: number) => void
}) {
  const clusterRows = selectedCluster?.rows ?? []
  const busy = updateSlotMutationPending || lockCandidatePending || rejectCandidatePending || addCandidateMutationPending || uploadCandidatePending || attachLibraryCandidatePending || openCanvasPending || generateCandidatePending
  const headerActionButtonClass = 'w-[132px] justify-center gap-1.5'
  const creatingReference = Boolean(newReferenceEditKey)
  const [referenceEditorCollapsed, setReferenceEditorCollapsed] = useState(true)
  const [assetEditorCollapsed, setAssetEditorCollapsed] = useState(false)

  useEffect(() => {
    if (creatingReference) {
      setReferenceEditorCollapsed(false)
      setAssetEditorCollapsed(true)
      return
    }
    if (selected) {
      setReferenceEditorCollapsed(true)
      setAssetEditorCollapsed(false)
      return
    }
    setReferenceEditorCollapsed(true)
    setAssetEditorCollapsed(true)
  }, [creatingReference, selected?.slot.ID])

  function handleReferenceEditorCollapsedChange(collapsed: boolean) {
    setReferenceEditorCollapsed(collapsed)
    if (!collapsed) setAssetEditorCollapsed(true)
  }

  function handleAssetEditorCollapsedChange(collapsed: boolean) {
    setAssetEditorCollapsed(collapsed)
    if (!collapsed) setReferenceEditorCollapsed(true)
  }

  const detailRailCollapsed = referenceEditorCollapsed && assetEditorCollapsed

  return (
    <div className="min-h-full overflow-y-auto bg-background p-4 xl:flex xl:h-full xl:min-h-[720px] xl:flex-col xl:overflow-hidden">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 xl:shrink-0">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <CompactMetric label="设定" value={referenceCount} />
          <CompactMetric label="素材" value={visibleSlotCount} />
          <CompactMetric label="缺少" value={missingCount} />
          <CompactMetric label="待选择" value={candidateCount} />
          <CompactMetric label="已选定" value={lockedCount} detail={`${waivedCount} 不需要`} />
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" className={headerActionButtonClass} onClick={startCreateReference} disabled={!projectId}>
            <Sparkles size={14} />
            新建设定
          </Button>
          <Button size="sm" variant="outline" className={headerActionButtonClass} onClick={startCreate} loading={createSlotPending} disabled={!projectId || createSlotPending || creatingReference}>
            <Plus size={14} />
            新建素材
          </Button>
          <Button size="sm" variant="outline" className={headerActionButtonClass} onClick={onOrganizeCurrentPrep} loading={prepAuditLaunching} disabled={!projectId || prepAuditLaunching}>
            <Bot size={14} />
            梳理设定+素材
          </Button>
          <Button size="sm" variant="outline" className={headerActionButtonClass} onClick={() => setWorkspaceView('review')}>
            <GitBranch size={14} />
            审阅提案
          </Button>
        </div>
      </div>

      <main
        className={cn(
          'grid items-stretch gap-4 xl:min-h-0 xl:flex-1',
          detailRailCollapsed
            ? 'xl:grid-cols-[minmax(0,1fr)_56px] 2xl:grid-cols-[minmax(0,1fr)_60px]'
            : 'xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_380px]',
        )}
        data-detail-rail-collapsed={detailRailCollapsed ? 'true' : undefined}
      >
        <div className="min-w-0 xl:min-h-0">
          <PreProductionAssetBoard
            clusters={clusters}
            selectedCluster={selectedCluster}
            selectedReference={selectedReference}
            rows={clusterRows}
            selected={selected}
            loading={loading}
            creatingReference={creatingReference}
            kindFilter={kindFilter}
            onKindChange={(value) => setFilter({ kind: value })}
            onSelectSlot={onSelectSlot}
            onSelectReference={onSelectReference}
          />
        </div>

        <aside className="min-w-0 space-y-3 pr-1 xl:min-h-0 xl:overflow-y-auto">
          {selected || newReferenceEditKey ? (
            <>
              <SemanticEntityInlineEditor
                projectId={projectId}
                config={referenceConfig}
                record={newReferenceEditKey ? null : selectedReference}
                defaults={newReferenceEditKey ? { kind: 'person', importance: 'main', status: 'draft', name: '未命名设定' } : undefined}
                queryKey={['pre-production-creative-references', projectId]}
                editKey={newReferenceEditKey}
                title="编辑设定"
                primaryFieldKeys={['kind', 'name', 'alias', 'description', 'content', 'importance', 'status']}
                collapsed={referenceEditorCollapsed}
                collapsedMode="horizontal"
                onCollapsedChange={handleReferenceEditorCollapsedChange}
                emptyTitle="当前素材未绑定设定"
                emptyDescription="这个素材还没有绑定到具体设定。可以在素材字段里补充归属。"
                onSaved={onReferenceSaved}
                onDeleted={onReferenceDeleted}
              />
              {selected ? (
                <>
                  <SemanticEntityInlineEditor
                    projectId={projectId}
                    config={slotConfig}
                    record={selected.slot}
                    queryKey={['semantic-asset-slots-page', projectId]}
                    editKey={selected.slot.ID === newSlotEditId ? newSlotEditId : null}
                    title="编辑素材"
                    description="关键字段：素材名称、类型、状态、优先级、用途说明和提示词线索。"
                    primaryFieldKeys={['name', 'kind', 'status', 'priority', 'description', 'prompt_hint', 'creative_reference_id', 'creative_reference_state_id']}
                    collapsed={assetEditorCollapsed}
                    collapsedMode="horizontal"
                    onCollapsedChange={handleAssetEditorCollapsedChange}
                    onSaved={onSaved}
                    onDeleted={onDeleted}
                  />
                  {!detailRailCollapsed ? (
                    <AssetSlotDetail
                      row={selected}
                      onLock={onLock}
                      onReject={onReject}
                      onUploadCandidate={onUploadCandidate}
                      onOpenResourceLibrary={onOpenResourceLibrary}
                      onGenerateCandidate={onGenerateProposal}
                      onGenerateMediaCandidate={onGenerateMedia}
                      onOpenAssistant={onOpenAssistant}
                      onOpenCanvas={onOpenCanvas}
                      busy={busy}
                      uploading={uploading}
                      generatingKind={generatingKind}
                    />
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <SemanticEntityInlineEditor
              projectId={projectId}
              config={referenceConfig}
              record={selectedReference}
              queryKey={['pre-production-creative-references', projectId]}
              title="编辑设定"
              primaryFieldKeys={['kind', 'name', 'alias', 'description', 'content', 'importance', 'status']}
              collapsed={referenceEditorCollapsed}
              collapsedMode="horizontal"
              onCollapsedChange={handleReferenceEditorCollapsedChange}
              emptyTitle="选择或新建设定"
              emptyDescription="点击左侧设定卡片，或点击新建设定开始准备。"
              onSaved={onReferenceSaved}
              onDeleted={onReferenceDeleted}
            />
          )}
        </aside>
      </main>
    </div>
  )
}

function isInternalCandidateSlot(slot: AssetSlotRecord) {
  return slot.owner_type === 'asset_slot'
}

function referenceCountLabel(referenceCount: number, assetCount: number) {
  return `${referenceCount} 个设定 · ${assetCount} 个素材`
}

function CompactMetric({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return <WorkbenchMetric label={label} value={value} detail={detail} compact className="min-w-20" />
}
