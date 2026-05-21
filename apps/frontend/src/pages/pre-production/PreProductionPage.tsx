import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bot, GitBranch, PackageCheck, Pencil, Plus, Save, Sparkles, Trash2, X } from 'lucide-react'

import { SemanticEntityInlineEditor, type SemanticEntityInlineEditorControlState } from '@/components/shared/SemanticEntityInlineEditor'
import { PreProductionAssetBoard, type PreProductionCardContextTarget } from '@/components/workbench/PreProductionAssetBoard'
import { AssetSlotDetail } from '@/components/workbench/PreProductionAssetDetail'
import { PreProductionResourceLibraryDialog } from '@/components/workbench/PreProductionResourceLibraryDialog'
import { PreProductionReviewWorkspace } from '@/components/workbench/PreProductionReviewWorkspace'
import { ProjectWorkbenchShell } from '@/components/workbench/WorkbenchChrome'
import { deleteSemanticEntity, type SemanticEntityConfig, type SemanticEntityRecord } from '@/api/semanticEntities'
import type { ContentFilterKey } from '@/pages/contents/lib/contentFilters'
import { apiErrorMessage } from '@/lib/contentWorkbenchStatus'
import { RESOURCE_UPLOAD_ACCEPT } from '@/lib/mediaTypes'
import {
  normalizeSlotStatus,
  type AssetKind,
  type AssetSlotRecord,
  type AssetSlotCandidateRecord,
  type AssetSlotViewModel,
  type CreativeReferenceRecord,
  type ReferenceAssetCluster,
} from '@/lib/preProductionAssetRows'
import type { PreProductionCandidateGenerationKind } from '@/lib/preProductionAssetCandidateWrite'
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
import {
  buildCreatePreProductionAssetSlotMutationOptions,
  buildUpdatePreProductionAssetSlotMutationOptions,
  preProductionAssetSlotCandidatesQueryKey,
  preProductionAssetSlotsQueryKey,
  preProductionCreativeReferencesQueryKey,
  usePreProductionWorkbenchData,
} from '@/lib/preProductionDataController'
import { usePreProductionPageController } from '@/lib/preProductionPageController'
import { refreshPreProductionWorkbenchContext } from '@/lib/preProductionRefreshController'
import { usePreProductionResourceLibrary } from '@/lib/preProductionResourceLibrary'
import { usePreProductionReviewController } from '@/lib/preProductionReviewController'
import { usePreProductionUploadInput } from '@/lib/preProductionUploadInput'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogTitle, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui'
import { ROUTES } from '@/routes/projectRoutes'

type CandidateGenerationKind = PreProductionCandidateGenerationKind
type InspectorMode = 'asset' | 'reference'
type PreProductionEditRequest = { type: InspectorMode; id: number; token: number } | null
type PreProductionDeleteTarget =
  | { type: 'asset'; record: AssetSlotRecord }
  | { type: 'reference'; record: CreativeReferenceRecord }

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
  const [prepAuditLaunching, setPrepAuditLaunching] = useState(false)
  const [referenceCreateOpen, setReferenceCreateOpen] = useState(false)
  const [referenceCreateKey, setReferenceCreateKey] = useState<string | number | null>(null)
  const [assetCreateOpen, setAssetCreateOpen] = useState(false)
  const [assetCreateReferenceId, setAssetCreateReferenceId] = useState<string>('')
  const resourceLibrary = usePreProductionResourceLibrary()
  const reviewController = usePreProductionReviewController({ projectId, searchParams, setSearchParams })
  const { workspaceView, assetProposalDraftsQuery, settingProposalDraftsQuery, setWorkspaceView, openReviewWorkspace, openMainWorkspace } = reviewController
  const preProductionData = usePreProductionWorkbenchData(projectId)
  const {
    slotConfig,
    referenceConfig,
    creativeReferences,
    slots,
    visibleSlots,
    rows,
    referenceById,
    clusters,
  } = preProductionData
  const pageController = usePreProductionPageController({
    searchParams,
    setSearchParams,
    rows,
    clusters,
    referenceById,
  })
  const {
    selectedId,
    selectedReferenceParam,
    kindFilter,
    filtered,
    filteredClusters,
    selected,
    selectedReference,
    selectedCluster,
    newSlotEditId,
    newReferenceEditKey,
    setFilter,
    handleSlotCreated,
    handleSlotSaved,
    handleSlotDeleted,
    handleReferenceSaved,
    handleReferenceDeleted,
    selectSlot,
    selectReference,
    openSlot,
    openReference,
  } = pageController

  useEffect(() => () => {
    assetAssistantCleanupRef.current?.()
    prepAuditCleanupRef.current?.()
  }, [])

  const updateSlotMutation = useMutation(buildUpdatePreProductionAssetSlotMutationOptions({ projectId, queryClient, slotConfig }))

  const deletePrepEntityMutation = useMutation({
    mutationFn: ({ type, record }: PreProductionDeleteTarget) => {
      if (!projectId) throw new Error('请先选择项目')
      return deleteSemanticEntity(projectId, type === 'asset' ? slotConfig : referenceConfig, record.ID)
    },
    onSuccess: async (_result, target) => {
      if (target.type === 'asset') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: preProductionAssetSlotsQueryKey(projectId) }),
          queryClient.invalidateQueries({ queryKey: preProductionAssetSlotCandidatesQueryKey(projectId) }),
        ])
        if (selected?.slot.ID === target.record.ID) handleSlotDeleted()
        toast.success('素材需求已删除')
        return
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: preProductionCreativeReferencesQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: preProductionAssetSlotsQueryKey(projectId) }),
      ])
      if (selectedReference?.ID === target.record.ID) handleReferenceDeleted()
      toast.success('设定资料已删除')
    },
    onError: (error, target) => {
      toast.error(apiErrorMessage(error, target.type === 'asset' ? '素材需求删除失败' : '设定资料删除失败'))
    },
  })

  const lockCandidateMutation = useMutation(buildPreProductionLockCandidateMutationOptions({ projectId, queryClient }))
  const rejectCandidateMutation = useMutation(buildPreProductionRejectCandidateMutationOptions({ projectId, queryClient }))

  const createSlotMutation = useMutation(buildCreatePreProductionAssetSlotMutationOptions({
    projectId,
    queryClient,
    slotConfig,
    getInput: () => ({
      kindFilter,
      selectedId,
      selectedReferenceId: selectedReferenceParam,
      slots,
    }),
    onCreated: (record) => {
      setAssetCreateOpen(false)
      handleSlotCreated(record)
    },
  }))

  const addCandidateMutation = useMutation(buildPreProductionAddCandidateMutationOptions({ projectId, queryClient }))

  const attachLibraryCandidateMutation = useMutation(buildPreProductionAttachLibraryCandidateMutationOptions({
    projectId,
    queryClient,
    onAttached: () => resourceLibrary.setOpen(false),
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

  const missingCount = visibleSlots.filter((slot) => normalizeSlotStatus(slot.status) === 'missing').length
  function openReferenceCreateDialog() {
    setReferenceCreateKey(`new-reference-${Date.now()}`)
    setReferenceCreateOpen(true)
  }

  function openAssetCreateDialog() {
    const defaultReferenceId = selectedReference?.ID ?? creativeReferences[0]?.ID
    setAssetCreateReferenceId(defaultReferenceId ? String(defaultReferenceId) : '')
    setAssetCreateOpen(true)
  }

  function startCreate(selectedReferenceId?: number | null) {
    createSlotMutation.mutate({ selectedReferenceId })
  }

  function createAssetFromDialog() {
    const referenceId = Number(assetCreateReferenceId)
    if (!referenceId) {
      toast.info('请先选择素材归属设定')
      return
    }
    startCreate(referenceId)
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
    resourceLibrary.open(selected.kind)
  }

  function attachSelectedLibraryResource() {
    if (!selected || !resourceLibrary.state.selectedResource || attachLibraryCandidateMutation.isPending) return
    attachLibraryCandidateMutation.mutate({ row: selected, resource: resourceLibrary.state.selectedResource })
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

  function deleteSlotFromBoard(slotId: number) {
    const row = rows.find((item) => item.slot.ID === slotId)
    if (!row) return
    const title = row.slot.name || `素材 #${row.slot.ID}`
    if (!window.confirm(`确定删除素材「${title}」吗？已生成的候选素材不会自动删除。`)) return
    deletePrepEntityMutation.mutate({ type: 'asset', record: row.slot })
  }

  function deleteReferenceFromBoard(referenceId: number) {
    const reference = referenceById.get(referenceId)
    if (!reference) return
    const title = reference.name || reference.alias || `设定 #${reference.ID}`
    if (!window.confirm(`确定删除设定「${title}」吗？关联素材需求可能需要后续重新归属。`)) return
    deletePrepEntityMutation.mutate({ type: 'reference', record: reference })
  }

  const mainWorkspace = (
    <PreProductionWorkspace
      loading={preProductionData.isLoading}
      clusters={filteredClusters}
      selectedCluster={selectedCluster}
      selectedReference={selectedReference}
      referenceConfig={referenceConfig}
      newReferenceEditKey={newReferenceEditKey}
      selected={selected}
      kindFilter={kindFilter}
      rows={filtered}
      newSlotEditId={newSlotEditId}
      projectId={projectId}
      slotConfig={slotConfig}
      setFilter={setFilter}
      startCreate={openAssetCreateDialog}
      startCreateReference={openReferenceCreateDialog}
      createSlotPending={createSlotMutation.isPending}
      prepAuditLaunching={prepAuditLaunching}
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
      onSaved={handleSlotSaved}
      onDeleted={handleSlotDeleted}
      onReferenceSaved={handleReferenceSaved}
      onReferenceDeleted={handleReferenceDeleted}
      onLock={lockCandidate}
      onReject={rejectCandidate}
      onUploadCandidate={triggerUpload}
      onOpenResourceLibrary={openResourceLibraryPicker}
      onGenerateProposal={generateCandidate}
      onGenerateMedia={generateMediaCandidate}
      onOpenAssistant={openAssistantForSlot}
      onOrganizeCurrentPrep={organizeCurrentPrep}
      onOpenReview={openReviewWorkspace}
      onOpenCanvas={() => selected && openCanvasMutation.mutate(selected.slot)}
      onSelectSlot={selectSlot}
      onSelectReference={selectReference}
      onOpenSlot={openSlot}
      onOpenReference={openReference}
      onDeleteSlot={deleteSlotFromBoard}
      onDeleteReference={deleteReferenceFromBoard}
      showReviewAction={compact}
    />
  )

  const resourceLibraryDialog = (
    <PreProductionResourceLibraryDialog
      open={resourceLibrary.state.open}
      row={selected}
      resources={resourceLibrary.resources}
      selectedResource={resourceLibrary.state.selectedResource}
      search={resourceLibrary.state.search}
      type={resourceLibrary.state.type}
      page={resourceLibrary.state.page}
      pageCount={resourceLibrary.pageCount}
      total={resourceLibrary.total}
      isLoading={resourceLibrary.isLoading}
      isSaving={attachLibraryCandidateMutation.isPending}
      onOpenChange={resourceLibrary.setOpen}
      onSearch={resourceLibrary.setSearch}
      onType={resourceLibrary.setType}
      onPage={resourceLibrary.setPage}
      onSelect={resourceLibrary.select}
      onClear={resourceLibrary.clearSelection}
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

  const reviewDialog = (
    <Dialog open={workspaceView === 'review'} onOpenChange={(open) => open ? openReviewWorkspace() : openMainWorkspace()}>
      <DialogContent className="flex max-h-[88vh] w-[min(1120px,calc(100vw-32px))] max-w-none flex-col overflow-hidden p-0">
        <DialogTitle className="sr-only">前期准备审阅</DialogTitle>
        {reviewWorkspace}
      </DialogContent>
    </Dialog>
  )

  const createDialogs = (
    <>
      <Dialog open={referenceCreateOpen} onOpenChange={setReferenceCreateOpen}>
        <DialogContent className="max-h-[88vh] w-[min(640px,calc(100vw-32px))] max-w-none overflow-y-auto p-0">
          <div className="border-b border-border px-4 py-3">
            <DialogTitle className="type-body font-semibold">新建设定</DialogTitle>
            <DialogDescription className="mt-1 type-label text-muted-foreground">先沉淀人物、地点、道具或风格，再为它绑定素材。</DialogDescription>
          </div>
          <SemanticEntityInlineEditor
            projectId={projectId}
            config={referenceConfig}
            record={null}
            defaults={{ kind: 'person', importance: 'main', status: 'draft', name: '未命名设定' }}
            queryKey={preProductionCreativeReferencesQueryKey(projectId)}
            editKey={referenceCreateKey}
            title="设定字段"
            primaryFieldKeys={['kind', 'name', 'alias', 'description', 'content', 'importance']}
            className="rounded-none border-0 bg-transparent"
            hideDeleteAction
            hiddenFieldKeys={['status']}
            showAdvancedFields={false}
            onSaved={(record) => {
              setReferenceCreateOpen(false)
              handleReferenceSaved(record)
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={assetCreateOpen} onOpenChange={setAssetCreateOpen}>
        <DialogContent className="w-[min(520px,calc(100vw-32px))] max-w-none">
          <DialogTitle>新建素材</DialogTitle>
          <DialogDescription>素材必须先归属到一个设定，后续候选和生成才有明确上下文。</DialogDescription>
          <div className="space-y-2 py-3">
            <Label htmlFor="pre-production-create-asset-reference">归属设定</Label>
            <Select value={assetCreateReferenceId} onValueChange={setAssetCreateReferenceId}>
              <SelectTrigger id="pre-production-create-asset-reference">
                <SelectValue placeholder="选择人物、地点、道具或风格设定" />
              </SelectTrigger>
              <SelectContent>
                {creativeReferences.map((reference) => (
                  <SelectItem key={reference.ID} value={String(reference.ID)}>
                    {reference.name || reference.alias || `设定 #${reference.ID}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {creativeReferences.length === 0 ? (
              <p className="type-label text-muted-foreground">还没有设定。请先新建设定，再创建素材。</p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAssetCreateOpen(false)} disabled={createSlotMutation.isPending}>取消</Button>
            <Button type="button" onClick={createAssetFromDialog} loading={createSlotMutation.isPending} disabled={!assetCreateReferenceId || createSlotMutation.isPending}>
              创建素材
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )

  if (compact) {
    return (
      <>
        {mainWorkspace}
        {resourceLibraryDialog}
        {reviewDialog}
        {createDialogs}
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
      refreshing={preProductionData.isFetching}
      refreshLabel="刷新上下文"
      actions={(
        <Button size="sm" variant="outline" className="h-8 w-32 gap-1.5" onClick={openReviewWorkspace}>
          <GitBranch size={14} />
          审阅提案
        </Button>
      )}
    >
      {mainWorkspace}
      {resourceLibraryDialog}
      {reviewDialog}
      {createDialogs}
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
  onOpenReview,
  onOpenCanvas,
  onSelectSlot,
  onSelectReference,
  onOpenSlot,
  onOpenReference,
  onDeleteSlot,
  onDeleteReference,
  showReviewAction = false,
}: {
  loading: boolean
  clusters: ReferenceAssetCluster[]
  selectedCluster: ReferenceAssetCluster | null
  selectedReference: CreativeReferenceRecord | null
  referenceConfig: SemanticEntityConfig
  newReferenceEditKey: string | number | null
  selected: AssetSlotViewModel | null
  kindFilter: AssetKind
  rows: AssetSlotViewModel[]
  newSlotEditId: number | null
  projectId?: number
  slotConfig: SemanticEntityConfig
  setFilter: (updates: Partial<Record<ContentFilterKey, string | number | null | undefined>>) => void
  startCreate: () => void
  startCreateReference: () => void
  createSlotPending: boolean
  prepAuditLaunching: boolean
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
  onOpenReview: () => void
  onOpenCanvas: () => void
  onSelectSlot: (slotId: number) => void
  onSelectReference: (referenceId: number) => void
  onOpenSlot: (slotId: number) => void
  onOpenReference: (referenceId: number) => void
  onDeleteSlot: (slotId: number) => void
  onDeleteReference: (referenceId: number) => void
  showReviewAction?: boolean
}) {
  const busy = updateSlotMutationPending || lockCandidatePending || rejectCandidatePending || addCandidateMutationPending || uploadCandidatePending || attachLibraryCandidatePending || openCanvasPending || generateCandidatePending
  const creatingReference = Boolean(newReferenceEditKey)
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>('reference')
  const [editRequest, setEditRequest] = useState<PreProductionEditRequest>(null)
  const [cardContextMenu, setCardContextMenu] = useState<{
    x: number
    y: number
    target: PreProductionCardContextTarget
  } | null>(null)

  useEffect(() => {
    if (creatingReference) {
      setInspectorMode('reference')
      return
    }
    if (selected) {
      setInspectorMode('asset')
      return
    }
    setInspectorMode('reference')
  }, [creatingReference, selected?.slot.ID, selectedReference?.ID])

  useEffect(() => {
    if (!cardContextMenu) return
    const close = () => setCardContextMenu(null)
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [cardContextMenu])

  function openCardContextMenu(event: MouseEvent, target: PreProductionCardContextTarget) {
    event.preventDefault()
    event.stopPropagation()
    setCardContextMenu({ x: event.clientX, y: event.clientY, target })
  }

  function editCardTarget(target: PreProductionCardContextTarget) {
    setCardContextMenu(null)
    if (target.type === 'asset') {
      onOpenSlot(target.id)
      setInspectorMode('asset')
      setEditRequest({ type: 'asset', id: target.id, token: Date.now() })
      return
    }
    onOpenReference(target.id)
    setInspectorMode('reference')
    setEditRequest({ type: 'reference', id: target.id, token: Date.now() })
  }

  function deleteCardTarget(target: PreProductionCardContextTarget) {
    setCardContextMenu(null)
    if (target.type === 'asset') {
      onDeleteSlot(target.id)
      return
    }
    onDeleteReference(target.id)
  }

  const boardActions = (
    <>
      <Button size="sm" variant="outline" className="h-8 w-28 justify-center gap-1.5" onClick={startCreateReference} disabled={!projectId}>
        <Sparkles size={14} />
        新建设定
      </Button>
      <Button size="sm" variant="outline" className="h-8 w-28 justify-center gap-1.5" onClick={startCreate} loading={createSlotPending} disabled={!projectId || createSlotPending || creatingReference}>
        <Plus size={14} />
        新建素材
      </Button>
      <Button size="sm" variant="outline" className="h-8 w-36 justify-center gap-1.5" onClick={onOrganizeCurrentPrep} loading={prepAuditLaunching} disabled={!projectId || prepAuditLaunching}>
        <Bot size={14} />
        梳理设定+素材
      </Button>
      {showReviewAction ? (
        <Button size="sm" variant="outline" className="h-8 w-28 justify-center gap-1.5" onClick={onOpenReview}>
          <GitBranch size={14} />
          审阅提案
        </Button>
      ) : null}
    </>
  )
  const detailOpen = Boolean(selected || selectedReference || newReferenceEditKey)

  return (
    <div className="relative min-h-full overflow-y-auto bg-background p-3 xl:flex xl:h-full xl:min-h-[720px] xl:flex-col xl:overflow-hidden">

      <main
        className={`grid items-stretch gap-4 xl:min-h-0 xl:flex-1 ${detailOpen ? 'xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_440px]' : ''}`}
      >
        <div className="min-w-0 xl:min-h-0">
          <PreProductionAssetBoard
            clusters={clusters}
            selectedCluster={selectedCluster}
            selectedReference={selectedReference}
            rows={rows}
            selected={selected}
            loading={loading}
            creatingReference={creatingReference}
            kindFilter={kindFilter}
            onKindChange={(value) => setFilter({ kind: value })}
            onSelectSlot={onSelectSlot}
            onSelectReference={onSelectReference}
            onCardContextMenu={openCardContextMenu}
            actions={boardActions}
          />
        </div>

        <PreProductionInspector
          mode={inspectorMode}
          onModeChange={setInspectorMode}
          projectId={projectId}
          referenceConfig={referenceConfig}
          slotConfig={slotConfig}
          selected={selected}
          selectedReference={selectedReference}
          newReferenceEditKey={newReferenceEditKey}
          newSlotEditId={newSlotEditId}
          onSaved={onSaved}
          onDeleted={onDeleted}
          onReferenceSaved={onReferenceSaved}
          onReferenceDeleted={onReferenceDeleted}
          onLock={onLock}
          onReject={onReject}
          onUploadCandidate={onUploadCandidate}
          onOpenResourceLibrary={onOpenResourceLibrary}
          onGenerateProposal={onGenerateProposal}
          onGenerateMedia={onGenerateMedia}
          onOpenAssistant={onOpenAssistant}
          onOpenCanvas={onOpenCanvas}
          busy={busy}
          uploading={uploading}
          generatingKind={generatingKind}
          editRequest={editRequest}
          onClose={() => setFilter({ reference_id: null, asset_slot_id: null, selected: null })}
        />
      </main>
      {cardContextMenu ? (
        <PreProductionCardContextMenu
          x={cardContextMenu.x}
          y={cardContextMenu.y}
          onEdit={() => editCardTarget(cardContextMenu.target)}
          onDelete={() => deleteCardTarget(cardContextMenu.target)}
        />
      ) : null}
    </div>
  )
}

function PreProductionCardContextMenu({
  x,
  y,
  onEdit,
  onDelete,
}: {
  x: number
  y: number
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      role="menu"
      aria-label="准备项操作"
      className="ms-dropdown__content fixed z-50 min-w-32"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" className="ms-dropdown__item gap-2" onClick={onEdit}>
        <Pencil size={14} />
        编辑
      </button>
      <div className="ms-dropdown__separator" />
      <button type="button" role="menuitem" className="ms-dropdown__item gap-2 text-destructive" onClick={onDelete}>
        <Trash2 size={14} />
        删除
      </button>
    </div>
  )
}

function PreProductionInspector({
  mode,
  onModeChange,
  projectId,
  referenceConfig,
  slotConfig,
  selected,
  selectedReference,
  newReferenceEditKey,
  newSlotEditId,
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
  onOpenCanvas,
  busy,
  uploading,
  generatingKind,
  editRequest,
  onClose,
}: {
  mode: InspectorMode
  onModeChange: (mode: InspectorMode) => void
  projectId?: number
  referenceConfig: SemanticEntityConfig
  slotConfig: SemanticEntityConfig
  selected: AssetSlotViewModel | null
  selectedReference: CreativeReferenceRecord | null
  newReferenceEditKey: string | number | null
  newSlotEditId: number | null
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
  onOpenCanvas: () => void
  busy: boolean
  uploading: boolean
  generatingKind?: CandidateGenerationKind
  editRequest: PreProductionEditRequest
  onClose: () => void
}) {
  const creatingReference = Boolean(newReferenceEditKey)
  const canShowReference = creatingReference || Boolean(selectedReference)
  const open = Boolean(selected || canShowReference)
  const [assetEditing, setAssetEditing] = useState(false)
  const [referenceEditing, setReferenceEditing] = useState(creatingReference)
  const [assetControl, setAssetControl] = useState<SemanticEntityInlineEditorControlState | null>(null)
  const [referenceControl, setReferenceControl] = useState<SemanticEntityInlineEditorControlState | null>(null)
  const [assetResetToken, setAssetResetToken] = useState(0)
  const [referenceResetToken, setReferenceResetToken] = useState(0)
  const title = mode === 'asset'
    ? selected?.slot.name || (selected ? `素材 #${selected.slot.ID}` : '素材详情')
    : creatingReference
      ? '未命名设定'
      : selectedReference?.name || selectedReference?.alias || (selectedReference ? `设定 #${selectedReference.ID}` : '设定详情')
  const subtitle = mode === 'asset'
    ? '维护素材字段、候选素材和最终选定结果。'
    : creatingReference
      ? '补充人物、地点、道具或风格设定，之后再关联素材。'
      : '维护当前准备项的设定资料，作为素材生成和下游创作的上下文。'
  const currentControl = mode === 'asset' ? assetControl : referenceControl
  const hasCurrentRecord = mode === 'asset' ? Boolean(selected) : Boolean(selectedReference)
  const isCreatingCurrentRecord = mode === 'reference' && creatingReference
  const showSaveActions = Boolean(currentControl?.isEditing || isCreatingCurrentRecord)
  const canUseInspectorActions = Boolean(currentControl && (hasCurrentRecord || isCreatingCurrentRecord))

  useEffect(() => {
    setAssetEditing(false)
  }, [selected?.slot.ID])

  useEffect(() => {
    setReferenceEditing(creatingReference)
  }, [creatingReference, selectedReference?.ID])

  useEffect(() => {
    if (!editRequest) return
    if (editRequest.type === 'asset' && selected?.slot.ID === editRequest.id) {
      setAssetEditing(true)
      return
    }
    if (editRequest.type === 'reference' && selectedReference?.ID === editRequest.id) {
      setReferenceEditing(true)
    }
  }, [editRequest, selected?.slot.ID, selectedReference?.ID])

  function setCurrentEditing(nextEditing: boolean) {
    if (mode === 'asset') setAssetEditing(nextEditing)
    else setReferenceEditing(nextEditing)
  }

  function cancelCurrentEditing() {
    if (mode === 'asset') {
      setAssetResetToken((value) => value + 1)
      setAssetEditing(false)
      return
    }
    setReferenceResetToken((value) => value + 1)
    setReferenceEditing(false)
  }

  if (!open) return null

  return (
    <aside className="flex min-w-0 flex-col border-t border-border bg-background xl:min-h-0 xl:border-l xl:border-t-0 xl:pl-4">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        <div className="shrink-0 border-b border-border pb-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/30 text-muted-foreground">
              {mode === 'asset' ? <PackageCheck size={16} /> : <Sparkles size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate type-body font-semibold text-foreground">{title}</p>
              <p className="mt-1 line-clamp-2 type-label leading-5 text-muted-foreground">{subtitle}</p>
            </div>
            <div className="shrink-0">
              <div className="flex items-center gap-2">
                {showSaveActions ? (
                  <>
                    {hasCurrentRecord ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5"
                        onClick={cancelCurrentEditing}
                        disabled={currentControl?.isSaving}
                      >
                        <X size={14} />
                        取消
                      </Button>
                    ) : null}
                    <Button
                      form={currentControl?.formId}
                      size="sm"
                      className="h-8 gap-1.5"
                      loading={currentControl?.isSaving}
                      disabled={!currentControl?.canSave}
                    >
                      <Save size={14} />
                      保存
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={() => setCurrentEditing(true)}
                    disabled={!canUseInspectorActions || currentControl?.isImmutableRecord}
                  >
                    <Pencil size={14} />
                    编辑
                  </Button>
                )}
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={onClose} aria-label="关闭详情">
                  <X size={15} />
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-md bg-muted/50 p-1">
            <Button
              type="button"
              size="sm"
              variant={mode === 'asset' ? 'secondary' : 'ghost'}
              className="h-8 justify-center gap-1.5 type-caption"
              disabled={!selected}
              onClick={() => onModeChange('asset')}
            >
              <PackageCheck size={14} />
              素材
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'reference' ? 'secondary' : 'ghost'}
              className="h-8 justify-center gap-1.5 type-caption"
              disabled={!canShowReference}
              onClick={() => onModeChange('reference')}
            >
              <Sparkles size={14} />
              设定
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-3">
          {mode === 'asset' ? (
            selected ? (
              <div className="space-y-4">
                <SemanticEntityInlineEditor
                  projectId={projectId}
                  config={slotConfig}
                  record={selected.slot}
                  queryKey={preProductionAssetSlotsQueryKey(projectId)}
                  editKey={selected.slot.ID === newSlotEditId ? newSlotEditId : null}
                  title="素材字段"
                  description="名称、类型、状态、用途说明和提示词线索。"
                  primaryFieldKeys={['name', 'kind', 'priority', 'description', 'prompt_hint', 'creative_reference_id', 'creative_reference_state_id']}
                  className="rounded-none border-0 bg-transparent"
                  hideHeaderCopy
                  hideHeaderActions
                  hideDeleteAction
                  hiddenFieldKeys={['status']}
                  showAdvancedFields={false}
                  editing={assetEditing}
                  onEditingChange={setAssetEditing}
                  onControlStateChange={setAssetControl}
                  resetToken={assetResetToken}
                  onSaved={onSaved}
                  onDeleted={onDeleted}
                />
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
              </div>
            ) : (
              <EmptyInspectorState title="选择素材" description="从左侧准备清单选择素材后，在这里维护字段和候选素材。" />
            )
          ) : (
            <SemanticEntityInlineEditor
              projectId={projectId}
              config={referenceConfig}
              record={newReferenceEditKey ? null : selectedReference}
              defaults={newReferenceEditKey ? { kind: 'person', importance: 'main', status: 'draft', name: '未命名设定' } : undefined}
              queryKey={preProductionCreativeReferencesQueryKey(projectId)}
              editKey={newReferenceEditKey}
              title="设定字段"
              primaryFieldKeys={['kind', 'name', 'alias', 'description', 'content', 'importance']}
              className="rounded-none border-0 bg-transparent"
              hideHeaderCopy
              hideHeaderActions
              hideDeleteAction
              hiddenFieldKeys={['status']}
              showAdvancedFields={false}
              editing={referenceEditing}
              onEditingChange={setReferenceEditing}
              onControlStateChange={setReferenceControl}
              resetToken={referenceResetToken}
              emptyTitle="选择或新建设定"
              emptyDescription="从左侧准备清单选择设定，或点击新建设定开始准备。"
              onSaved={onReferenceSaved}
              onDeleted={onReferenceDeleted}
            />
          )}
        </div>
      </section>
    </aside>
  )
}

function EmptyInspectorState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 p-4">
      <p className="type-body font-semibold text-foreground">{title}</p>
      <p className="mt-1 type-label leading-5 text-muted-foreground">{description}</p>
    </div>
  )
}

function referenceCountLabel(referenceCount: number, assetCount: number) {
  return `${referenceCount} 个设定 · ${assetCount} 个素材`
}
