import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PackageCheck, Pencil, Plus, Save, Sparkles, Trash2, X } from 'lucide-react'

import { SemanticEntityInlineEditor, type SemanticEntityInlineEditorControlState } from '@/shared/ui/SemanticEntityInlineEditor'
import { EmptyPreview, SlotStatusBadge } from '@/features/pre-production/components/PreProductionAssetBoard'
import { AssetSlotDetail } from '@/features/pre-production/components/PreProductionAssetDetail'
import { PreProductionResourceLibraryDialog } from '@/features/pre-production/components/PreProductionResourceLibraryDialog'
import { PreProductionReviewWorkspace } from '@/features/pre-production/components/PreProductionReviewWorkspace'
import { useProjectWorkbenchShellProps } from '@/features/project-workbenches/application/useProjectWorkbenchShellProps'
import { deleteSemanticEntity, type SemanticEntityConfig, type SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import { readStringParam, type ContentFilterKey } from '@/features/content/presentation/contentFilters'
import { apiErrorMessage } from '@/features/content/domain/contentWorkbenchStatus'
import { RESOURCE_UPLOAD_ACCEPT } from '@/features/resources/domain/mediaTypes'
import {
  normalizeSlotStatus,
  assetKindLabel,
  type AssetKind,
  type AssetSlotRecord,
  type AssetSlotCandidateRecord,
  type AssetSlotViewModel,
  type CreativeReferenceRecord,
  type ReferenceAssetCluster,
} from '@/features/pre-production/domain/preProductionAssetRows'
import {
  buildPreProductionAttachLibraryCandidateMutationOptions,
  buildPreProductionLockCandidateMutationOptions,
  buildPreProductionRejectCandidateMutationOptions,
  buildPreProductionUploadCandidateMutationOptions,
} from '@/features/pre-production/application/preProductionAssetCandidateController'
import {
  buildCreatePreProductionAssetSlotMutationOptions,
  buildUpdatePreProductionAssetSlotMutationOptions,
  preProductionAssetSlotCandidatesQueryKey,
  preProductionAssetSlotsQueryKey,
  preProductionCreativeReferencesQueryKey,
  usePreProductionWorkbenchData,
} from '@/features/pre-production/application/preProductionDataController'
import { usePreProductionPageController } from '@/features/pre-production/application/preProductionPageController'
import { refreshPreProductionWorkbenchContext } from '@/features/pre-production/application/preProductionRefreshController'
import { usePreProductionResourceLibrary } from '@/features/pre-production/application/preProductionResourceLibrary'
import { usePreProductionReviewController } from '@/features/pre-production/application/preProductionReviewController'
import { usePreProductionUploadInput } from '@/features/pre-production/application/preProductionUploadInput'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { toast } from '@/shared/ui/toastStore'
import { ROUTES } from '@/routes/projectRoutes'
import {
  Dialog,
  OverlapPane,
  OverlapPaneGroup,
  OverlapPaneRevealButton,
  ResourcePrepActionButton,
  ResourcePrepContextMenu,
  ResourcePrepContextMenuButton,
  ResourcePrepContextMenuSeparator,
  ResourcePrepCreateAssetDialogContent,
  ResourcePrepCreateAssetField,
  ResourcePrepCreateReferenceDialogContent,
  ResourcePrepDialogActions,
  ResourcePrepDialogBody,
  ResourcePrepDialogHeader,
  ResourcePrepHiddenFileInput,
  ResourcePrepInspectorBody,
  ResourcePrepInspectorHeader,
  ResourcePrepInspectorPanel,
  ResourcePrepInspectorRoot,
  ResourcePrepInspectorStack,
  ResourcePrepReviewDialogContent,
  ResourcePrepScreenReaderTitle,
  ResourcePrepSelect,
  ResourcePrepShellBadge,
  ResourcePrepShellStatusBadge,
  ResourcePrepViewButton,
  ResourcePrepViewTabs,
  ResourcePrepWorkbenchDetailContent,
  ResourcePrepWorkbenchLayout,
  ResourcePrepWorkbenchMain,
  ResourcePrepWorkbenchRail,
  ResourcePrepWorkbenchRailHeader,
  ResourcePrepWorkbenchRailList,
  ResourcePrepWorkbenchShell,
  WorkbenchProjectBody,
  WorkbenchProjectShell,
  usePersistentOverlapPaneController,
} from '@movscript/ui'
import { preProductionMissingCountRecipe } from '@/features/pre-production/presentation/preProductionSemanticUi'

const PREP_SETTING_ASSET_PANE_MIN_WIDTH = 360
const PREP_SETTING_ASSET_PANE_MAX_WIDTH = 720
const PREP_SETTING_ASSET_LIST_MIN_WIDTH = 240
const PREP_WORKBENCH_DETAIL_PANE_MIN_WIDTH = 420
const PREP_WORKBENCH_DETAIL_PANE_MAX_WIDTH = 960
const PREP_WORKBENCH_RAIL_MIN_WIDTH = 260
const PREP_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH = 760
const PREP_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY = 'movscript.preProduction.detailPaneWidth'
const PREP_SETTING_ASSET_PANE_DEFAULT_WIDTH = 460
const PREP_SETTING_ASSET_PANE_WIDTH_STORAGE_KEY = 'movscript.preProduction.settingAssetPaneWidth'

type PreProductionWorkbenchView = 'setting' | 'asset'
type PreProductionCardContextTarget = { type: 'asset'; id: number } | { type: 'reference'; id: number }
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
  const queryClient = useQueryClient()
  const uploadInput = usePreProductionUploadInput()
  const [searchParams, setSearchParams] = useSearchParams()
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
    projectId,
    route: ROUTES.project.preProduction,
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

  const workbenchView = normalizePreProductionWorkbenchView(readStringParam(searchParams, 'prep_view'))

  function setWorkbenchView(view: PreProductionWorkbenchView) {
    setFilter({ prep_view: view })
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
      workbenchView={workbenchView}
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
      setWorkbenchView={setWorkbenchView}
      startCreate={openAssetCreateDialog}
      startCreateReference={openReferenceCreateDialog}
      createSlotPending={createSlotMutation.isPending}
      updateSlotMutationPending={updateSlotMutation.isPending}
      lockCandidatePending={lockCandidateMutation.isPending}
      rejectCandidatePending={rejectCandidateMutation.isPending}
      uploadCandidatePending={uploadCandidateMutation.isPending}
      attachLibraryCandidatePending={attachLibraryCandidateMutation.isPending}
      uploading={uploadInput.uploading || uploadCandidateMutation.isPending}
      onSaved={handleSlotSaved}
      onDeleted={handleSlotDeleted}
      onReferenceSaved={handleReferenceSaved}
      onReferenceDeleted={handleReferenceDeleted}
      onLock={lockCandidate}
      onReject={rejectCandidate}
      onUploadCandidate={triggerUpload}
      onOpenResourceLibrary={openResourceLibraryPicker}
      onSelectSlot={selectSlot}
      onSelectReference={selectReference}
      onOpenSlot={openSlot}
      onOpenReference={openReference}
      onDeleteSlot={deleteSlotFromBoard}
      onDeleteReference={deleteReferenceFromBoard}
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
      <ResourcePrepReviewDialogContent>
        <ResourcePrepScreenReaderTitle>前期准备审阅</ResourcePrepScreenReaderTitle>
        {reviewWorkspace}
      </ResourcePrepReviewDialogContent>
    </Dialog>
  )

  const createDialogs = (
    <>
      <Dialog open={referenceCreateOpen} onOpenChange={setReferenceCreateOpen}>
        <ResourcePrepCreateReferenceDialogContent>
          <ResourcePrepDialogHeader title="新建设定" description="先沉淀人物、地点、道具或风格，再为它绑定素材。" />
          <SemanticEntityInlineEditor
            projectId={projectId}
            config={referenceConfig}
            record={null}
            defaults={{ kind: 'person', importance: 'main', status: 'draft', name: '未命名设定' }}
            queryKey={preProductionCreativeReferencesQueryKey(projectId)}
            editKey={referenceCreateKey}
            title="设定字段"
            primaryFieldKeys={['kind', 'name', 'alias', 'description', 'content', 'importance']}
            surface="embedded"
            hideDeleteAction
            hiddenFieldKeys={['status']}
            showAdvancedFields={false}
            onSaved={(record) => {
              setReferenceCreateOpen(false)
              handleReferenceSaved(record)
            }}
          />
        </ResourcePrepCreateReferenceDialogContent>
      </Dialog>

      <Dialog open={assetCreateOpen} onOpenChange={setAssetCreateOpen}>
        <ResourcePrepCreateAssetDialogContent>
          <ResourcePrepDialogHeader title="新建素材" description="素材必须先归属到一个设定，后续候选和生成才有明确上下文。" />
          <ResourcePrepDialogBody>
            <ResourcePrepCreateAssetField
              label="归属设定"
              help={creativeReferences.length === 0 ? '还没有设定。请先新建设定，再创建素材。' : undefined}
            >
              <ResourcePrepSelect
                triggerId="pre-production-create-asset-reference"
                value={assetCreateReferenceId}
                onValueChange={setAssetCreateReferenceId}
                placeholder="选择人物、地点、道具或风格设定"
                options={creativeReferences.map((reference) => ({
                  value: String(reference.ID),
                  label: reference.name || reference.alias || `设定 #${reference.ID}`,
                }))}
              />
            </ResourcePrepCreateAssetField>
          </ResourcePrepDialogBody>
          <ResourcePrepDialogActions>
            <ResourcePrepActionButton type="button" variant="outline" onClick={() => setAssetCreateOpen(false)} disabled={createSlotMutation.isPending}>取消</ResourcePrepActionButton>
            <ResourcePrepActionButton type="button" onClick={createAssetFromDialog} loading={createSlotMutation.isPending} disabled={!assetCreateReferenceId || createSlotMutation.isPending}>
              创建素材
            </ResourcePrepActionButton>
          </ResourcePrepDialogActions>
        </ResourcePrepCreateAssetDialogContent>
      </Dialog>
    </>
  )
  const workbenchShellProps = useProjectWorkbenchShellProps({
    workbenchId: 'pre_production',
    projectName,
    kicker: '前期准备',
    title: '前期准备工作台',
    description: '沉淀设定资料、素材需求和候选素材，补齐创作编排和内容生成之前的可复用上下文。',
    badges: (
      <>
        <ResourcePrepShellBadge>{referenceCountLabel(creativeReferences.length, visibleSlots.length)}</ResourcePrepShellBadge>
        {missingCount > 0 ? <ResourcePrepShellStatusBadge {...preProductionMissingCountRecipe(missingCount)}>缺口 {missingCount}</ResourcePrepShellStatusBadge> : null}
      </>
    ),
    actions: (
      <ResourcePrepViewTabs>
        <ResourcePrepViewButton active={workbenchView === 'setting'} count={filteredClusters.length} onClick={() => setWorkbenchView('setting')}>
          设定
        </ResourcePrepViewButton>
        <ResourcePrepViewButton active={workbenchView === 'asset'} count={filtered.length} onClick={() => setWorkbenchView('asset')}>
          素材
        </ResourcePrepViewButton>
      </ResourcePrepViewTabs>
    ),
  })

  if (compact) {
    return (
      <>
        <WorkbenchProjectBody padding="none" scroll="hidden" tone="muted" className="resource-prep-page-body">
          {mainWorkspace}
        </WorkbenchProjectBody>
        {resourceLibraryDialog}
        {reviewDialog}
        {createDialogs}
        <ResourcePrepHiddenFileInput ref={uploadInput.inputRef} type="file" accept={RESOURCE_UPLOAD_ACCEPT} onChange={(e) => handleUpload(e.target.files?.[0])} />
      </>
    )
  }

  return (
    <WorkbenchProjectShell {...workbenchShellProps}>
      <WorkbenchProjectBody padding="none" scroll="hidden" tone="muted" className="resource-prep-page-body">
        {mainWorkspace}
      </WorkbenchProjectBody>
      {resourceLibraryDialog}
      {reviewDialog}
      {createDialogs}
      <ResourcePrepHiddenFileInput ref={uploadInput.inputRef} type="file" accept={RESOURCE_UPLOAD_ACCEPT} onChange={(e) => handleUpload(e.target.files?.[0])} />
    </WorkbenchProjectShell>
  )
}

function PreProductionWorkspace({
  workbenchView,
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
  setWorkbenchView,
  startCreate,
  startCreateReference,
  createSlotPending,
  updateSlotMutationPending,
  lockCandidatePending,
  rejectCandidatePending,
  uploadCandidatePending,
  attachLibraryCandidatePending,
  uploading,
  onSaved,
  onDeleted,
  onReferenceSaved,
  onReferenceDeleted,
  onLock,
  onReject,
  onUploadCandidate,
  onOpenResourceLibrary,
  onSelectSlot,
  onSelectReference,
  onOpenSlot,
  onOpenReference,
  onDeleteSlot,
  onDeleteReference,
}: {
  workbenchView: PreProductionWorkbenchView
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
  setWorkbenchView: (view: PreProductionWorkbenchView) => void
  startCreate: () => void
  startCreateReference: () => void
  createSlotPending: boolean
  updateSlotMutationPending: boolean
  lockCandidatePending: boolean
  rejectCandidatePending: boolean
  uploadCandidatePending: boolean
  attachLibraryCandidatePending: boolean
  uploading: boolean
  onSaved: (record: SemanticEntityRecord) => void
  onDeleted: () => void
  onReferenceSaved: (record: SemanticEntityRecord) => void
  onReferenceDeleted: () => void
  onLock: (candidate: AssetSlotCandidateRecord) => void
  onReject: (candidate: AssetSlotCandidateRecord) => void
  onUploadCandidate: () => void
  onOpenResourceLibrary: () => void
  onSelectSlot: (slotId: number) => void
  onSelectReference: (referenceId: number) => void
  onOpenSlot: (slotId: number) => void
  onOpenReference: (referenceId: number) => void
  onDeleteSlot: (slotId: number) => void
  onDeleteReference: (referenceId: number) => void
}) {
  const busy = updateSlotMutationPending || lockCandidatePending || rejectCandidatePending || uploadCandidatePending || attachLibraryCandidatePending
  const creatingReference = Boolean(newReferenceEditKey)
  const [editingAssetSlotId, setEditingAssetSlotId] = useState<number | null>(null)
  const [editingReferenceId, setEditingReferenceId] = useState<number | null>(null)
  const detailPane = usePersistentOverlapPaneController({
    storageKey: PREP_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY,
    defaultSize: PREP_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH,
    minSize: PREP_WORKBENCH_DETAIL_PANE_MIN_WIDTH,
    maxSize: (rect) => Math.max(
      PREP_WORKBENCH_DETAIL_PANE_MIN_WIDTH,
      Math.min(PREP_WORKBENCH_DETAIL_PANE_MAX_WIDTH, rect.width - PREP_WORKBENCH_RAIL_MIN_WIDTH),
    ),
    resizeEdge: 'left',
    collapseMode: 'after-min',
    expandMode: 'after-max',
    ariaLabel: '调整详情宽度',
  })
  const hasDetailSelection = workbenchView === 'setting' ? Boolean(selectedReference) : Boolean(selected)
  const detailPaneLayoutProps = hasDetailSelection
    ? detailPane.groupProps
    : {
        ...detailPane.groupProps,
        'data-overlap-pane-collapsed': 'true' as const,
        'data-overlap-pane-expanded': undefined,
      }
  const [cardContextMenu, setCardContextMenu] = useState<{
    x: number
    y: number
    target: PreProductionCardContextTarget
  } | null>(null)

  useEffect(() => {
    if (creatingReference) setEditingReferenceId(null)
  }, [creatingReference])

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
      setFilter({ prep_view: workbenchView === 'setting' ? 'setting' : 'asset' })
      setEditingAssetSlotId(target.id)
      return
    }
    onOpenReference(target.id)
    setFilter({ prep_view: 'setting' })
    setEditingReferenceId(target.id)
  }

  function deleteCardTarget(target: PreProductionCardContextTarget) {
    setCardContextMenu(null)
    if (target.type === 'asset') {
      onDeleteSlot(target.id)
      return
    }
    onDeleteReference(target.id)
  }

  return (
    <>
      <ResourcePrepWorkbenchShell>
        <ResourcePrepWorkbenchLayout
          {...detailPaneLayoutProps}
        >
          <ResourcePrepWorkbenchRail>
            <ResourcePrepWorkbenchRailHeader
              icon={workbenchView === 'setting' ? <Sparkles size={14} /> : <PackageCheck size={14} />}
              title={workbenchView === 'setting' ? '设定视图' : '素材视图'}
              detail={workbenchView === 'setting' ? referenceCountLabel(clusters.filter((cluster) => cluster.reference).length, rows.length) : `${rows.length} 个素材`}
              action={(
                <ResourcePrepActionButton
                  size="icon-sm"
                  variant="outline"
                  aria-label={workbenchView === 'setting' ? '新建设定' : '新建素材'}
                  onClick={workbenchView === 'setting' ? startCreateReference : startCreate}
                  loading={workbenchView === 'asset' ? createSlotPending : undefined}
                  disabled={!projectId || (workbenchView === 'asset' && (createSlotPending || creatingReference))}
                >
                  <Plus size={14} />
                </ResourcePrepActionButton>
              )}
            />
            <ResourcePrepWorkbenchRailList>
              {loading ? <EmptyPreview title="加载中" description="正在读取设定和素材。" /> : null}
              {!loading && workbenchView === 'setting' && clusters.length === 0 && !creatingReference ? (
                <EmptyPreview title="暂无设定" description="先创建设定，再为它添加要准备的素材。" />
              ) : null}
              {!loading && workbenchView === 'asset' && rows.length === 0 ? (
                <EmptyPreview title="暂无素材" description="先选择或创建设定，再添加素材需求。" />
              ) : null}
              {workbenchView === 'setting' ? (
                <>
                  {creatingReference ? (
                    <ReferenceInlineCard
                      projectId={projectId}
                      referenceConfig={referenceConfig}
                      cluster={null}
                      active
                      editing
                      editKey={newReferenceEditKey}
                      onSelect={() => undefined}
                      onEdit={() => undefined}
                      onEditingChange={() => undefined}
                      onSaved={(record) => {
                        onReferenceSaved(record)
                        setEditingReferenceId(null)
                      }}
                      onDeleted={onReferenceDeleted}
                    />
                  ) : null}
                  {clusters.map((cluster) => {
                    const reference = cluster.reference
                    if (!reference) {
                      return cluster.rows.map((row) => (
                        <AssetSlotInlineCard
                          key={`unbound-${row.slot.ID}`}
                          projectId={projectId}
                          slotConfig={slotConfig}
                          row={row}
                          reference={null}
                          active={selected?.slot.ID === row.slot.ID}
                          editing={editingAssetSlotId === row.slot.ID}
                          editKey={row.slot.ID === newSlotEditId ? newSlotEditId : null}
                          onSelect={() => {
                            setWorkbenchView('asset')
                            onSelectSlot(row.slot.ID)
                          }}
                          onEdit={() => {
                            setWorkbenchView('asset')
                            onOpenSlot(row.slot.ID)
                          }}
                          onEditingChange={(editing) => {
                            setEditingAssetSlotId(editing ? row.slot.ID : null)
                          }}
                          onSaved={(record) => {
                            onSaved(record)
                            setEditingAssetSlotId(null)
                          }}
                          onDeleted={onDeleted}
                          onContextMenu={(event) => openCardContextMenu(event, { type: 'asset', id: row.slot.ID })}
                        />
                      ))
                    }
                    return (
                      <ReferenceInlineCard
                        key={reference.ID}
                        projectId={projectId}
                        referenceConfig={referenceConfig}
                        cluster={cluster}
                        active={selectedReference?.ID === reference.ID}
                        editing={editingReferenceId === reference.ID}
                        onSelect={() => {
                          setWorkbenchView('setting')
                          onSelectReference(reference.ID)
                        }}
                        onEdit={() => {
                          setWorkbenchView('setting')
                          onOpenReference(reference.ID)
                        }}
                        onEditingChange={(editing) => {
                          setEditingReferenceId(editing ? reference.ID : null)
                        }}
                        onSaved={(record) => {
                          onReferenceSaved(record)
                          setEditingReferenceId(null)
                        }}
                        onDeleted={onReferenceDeleted}
                        onContextMenu={(event) => openCardContextMenu(event, { type: 'reference', id: reference.ID })}
                      />
                    )
                  })}
                </>
              ) : (
                rows.map((row) => (
                  <AssetSlotInlineCard
                    key={row.slot.ID}
                    projectId={projectId}
                    slotConfig={slotConfig}
                    row={row}
                    reference={referenceForRow(clusters, row)}
                    active={selected?.slot.ID === row.slot.ID}
                    editing={editingAssetSlotId === row.slot.ID}
                    editKey={row.slot.ID === newSlotEditId ? newSlotEditId : null}
                    onSelect={() => {
                      setWorkbenchView('asset')
                      onSelectSlot(row.slot.ID)
                    }}
                    onEdit={() => {
                      setWorkbenchView('asset')
                      onOpenSlot(row.slot.ID)
                    }}
                    onEditingChange={(editing) => {
                      setEditingAssetSlotId(editing ? row.slot.ID : null)
                    }}
                    onSaved={(record) => {
                      onSaved(record)
                      setEditingAssetSlotId(null)
                    }}
                    onDeleted={onDeleted}
                    onContextMenu={(event) => openCardContextMenu(event, { type: 'asset', id: row.slot.ID })}
                  />
                ))
              )}
            </ResourcePrepWorkbenchRailList>
          </ResourcePrepWorkbenchRail>

          {hasDetailSelection && !detailPane.collapsed ? (
            <ResourcePrepWorkbenchMain
              overlapState={detailPane.overlapState}
              resizeHandleSide="left"
              resizeHandleProps={{
                ...detailPane.resizeHandleProps,
              }}
            >
              <ResourcePrepWorkbenchDetailContent className={workbenchView === 'setting' ? 'resource-prep-workbench-detail--nested-pane' : undefined}>
                {workbenchView === 'setting' ? (
                  <PreProductionSettingDetail
                    projectId={projectId}
                    selectedReference={selectedReference}
                    slotConfig={slotConfig}
                    rows={selectedCluster?.rows ?? []}
                    selected={selected}
                    newSlotEditId={newSlotEditId}
                    onAssetSaved={onSaved}
                    onLock={onLock}
                    onReject={onReject}
                    onUploadCandidate={onUploadCandidate}
                    onOpenResourceLibrary={onOpenResourceLibrary}
                    busy={busy}
                    uploading={uploading}
                    editingAssetSlotId={editingAssetSlotId}
                    onEditingAssetSlotChange={setEditingAssetSlotId}
                    onSelectSlot={onSelectSlot}
                    onOpenSlot={onOpenSlot}
                    onCardContextMenu={openCardContextMenu}
                  />
                ) : (
                  <PreProductionAssetDetailPanel
                    selected={selected}
                    selectedReference={selectedReference}
                    onLock={onLock}
                    onReject={onReject}
                    onUploadCandidate={onUploadCandidate}
                    onOpenResourceLibrary={onOpenResourceLibrary}
                    busy={busy}
                    uploading={uploading}
                  />
                )}
              </ResourcePrepWorkbenchDetailContent>
            </ResourcePrepWorkbenchMain>
          ) : null}
          {hasDetailSelection && detailPane.collapsed ? (
            <OverlapPaneRevealButton
              action="show"
              label="显示详情"
              onClick={detailPane.show}
            />
          ) : null}
          {hasDetailSelection && detailPane.expanded ? (
            <OverlapPaneRevealButton
              action="restore"
              label="还原详情"
              onClick={detailPane.restore}
            />
          ) : null}
        </ResourcePrepWorkbenchLayout>
      </ResourcePrepWorkbenchShell>
      {cardContextMenu ? (
        <PreProductionCardContextMenu
          x={cardContextMenu.x}
          y={cardContextMenu.y}
          onEdit={() => editCardTarget(cardContextMenu.target)}
          onDelete={() => deleteCardTarget(cardContextMenu.target)}
        />
      ) : null}
    </>
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
    <ResourcePrepContextMenu
      x={x}
      y={y}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <ResourcePrepContextMenuButton onClick={onEdit}>
        <Pencil size={14} />
        编辑
      </ResourcePrepContextMenuButton>
      <ResourcePrepContextMenuSeparator />
      <ResourcePrepContextMenuButton tone="danger" onClick={onDelete}>
        <Trash2 size={14} />
        删除
      </ResourcePrepContextMenuButton>
    </ResourcePrepContextMenu>
  )
}

function ReferenceInlineCard({
  projectId,
  referenceConfig,
  cluster,
  active,
  editing,
  editKey,
  onSelect,
  onEdit,
  onEditingChange,
  onSaved,
  onDeleted,
  onContextMenu,
}: {
  projectId?: number
  referenceConfig: SemanticEntityConfig
  cluster: ReferenceAssetCluster | null
  active?: boolean
  editing: boolean
  editKey?: string | number | null
  onSelect: () => void
  onEdit: () => void
  onEditingChange: (editing: boolean) => void
  onSaved: (record: SemanticEntityRecord) => void
  onDeleted: () => void
  onContextMenu?: (event: MouseEvent) => void
}) {
  const reference = cluster?.reference ?? null
  const [control, setControl] = useState<SemanticEntityInlineEditorControlState | null>(null)
  const [resetToken, setResetToken] = useState(0)
  const isCreating = !reference
  const isEditing = editing || isCreating
  const effectiveEditKey = isEditing ? (editKey ?? reference?.ID ?? 'new-reference') : null
  const title = referenceTitle(reference)

  function cancelEditing(event: MouseEvent) {
    event.stopPropagation()
    setResetToken((value) => value + 1)
    if (!isCreating) onEditingChange(false)
  }

  function startEditing(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onEdit()
    onEditingChange(true)
  }

  return (
    <section
      className="resource-prep-inline-card"
      data-active={active ? 'true' : undefined}
      data-editing={isEditing ? 'true' : undefined}
      onContextMenu={onContextMenu}
    >
      <div className="resource-prep-inline-card__header">
        <button type="button" className="resource-prep-inline-card__select" onClick={onSelect}>
          <span className="resource-prep-inline-card__copy">
            <span className="resource-prep-inline-card__title">{isCreating ? '未命名设定' : title}</span>
            <span className="resource-prep-inline-card__meta">{isCreating ? '编辑中' : `${referenceKindLabel(reference?.kind)} · ${cluster?.rows.length ?? 0} 个素材`}</span>
          </span>
          <span className="resource-prep-inline-card__status">
            <ResourcePrepShellBadge>{cluster?.rows.length ?? '新建'}</ResourcePrepShellBadge>
          </span>
        </button>
        {!isCreating ? (
          <ResourcePrepActionButton
            type="button"
            size="icon-xs"
            variant={isEditing ? 'soft' : 'ghost'}
            className="resource-prep-inline-card__detail-button"
            aria-label={`编辑设定「${title}」`}
            title="编辑"
            onClick={startEditing}
          >
            <Pencil size={13} />
          </ResourcePrepActionButton>
        ) : null}
      </div>

      {!isEditing ? (
        null
      ) : (
        <InlineCardEditorFrame onClick={(event) => event.stopPropagation()}>
          <SemanticEntityInlineEditor
            projectId={projectId}
            config={referenceConfig}
            record={reference}
            defaults={isCreating ? { kind: 'person', importance: 'main', status: 'draft', name: '未命名设定' } : undefined}
            queryKey={preProductionCreativeReferencesQueryKey(projectId)}
            editKey={effectiveEditKey}
            title="设定字段"
            primaryFieldKeys={['kind', 'name', 'alias', 'description', 'content', 'importance']}
            surface="embedded"
            hideHeaderCopy
            hideHeaderActions
            hideDeleteAction
            hiddenFieldKeys={['status']}
            showAdvancedFields={false}
            editing={isEditing}
            onEditingChange={onEditingChange}
            onControlStateChange={setControl}
            resetToken={resetToken}
            idScope={`prep-reference-card-${reference?.ID ?? 'new'}`}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
          <InlineCardEditorActions
            formId={control?.formId}
            canSave={Boolean(control?.canSave)}
            saving={Boolean(control?.isSaving)}
            canCancel={!isCreating}
            onCancel={cancelEditing}
          />
        </InlineCardEditorFrame>
      )}
    </section>
  )
}

function AssetSlotInlineCard({
  projectId,
  slotConfig,
  row,
  reference,
  active,
  editing,
  editKey,
  onSelect,
  onEdit,
  onEditingChange,
  onSaved,
  onDeleted,
  onContextMenu,
}: {
  projectId?: number
  slotConfig: SemanticEntityConfig
  row: AssetSlotViewModel
  reference: CreativeReferenceRecord | null
  active?: boolean
  editing: boolean
  editKey?: string | number | null
  onSelect: () => void
  onEdit: () => void
  onEditingChange: (editing: boolean) => void
  onSaved: (record: SemanticEntityRecord) => void
  onDeleted: () => void
  onContextMenu?: (event: MouseEvent) => void
}) {
  const [control, setControl] = useState<SemanticEntityInlineEditorControlState | null>(null)
  const [resetToken, setResetToken] = useState(0)
  const slot = row.slot
  const status = normalizeSlotStatus(slot.status)
  const effectiveEditKey = editing ? (editKey ?? slot.ID) : null

  function cancelEditing(event: MouseEvent) {
    event.stopPropagation()
    setResetToken((value) => value + 1)
    onEditingChange(false)
  }

  function startEditing(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onEdit()
    onEditingChange(true)
  }

  return (
    <section
      className="resource-prep-inline-card resource-prep-inline-card--asset"
      data-active={active ? 'true' : undefined}
      data-editing={editing ? 'true' : undefined}
      onContextMenu={onContextMenu}
    >
      <div className="resource-prep-inline-card__header">
        <button type="button" className="resource-prep-inline-card__select" onClick={onSelect}>
          <span className="resource-prep-inline-card__copy">
            <span className="resource-prep-inline-card__title">{slot.name || `素材 #${slot.ID}`}</span>
            <span className="resource-prep-inline-card__meta">{assetSlotRailMeta(row, reference)}</span>
          </span>
          <span className="resource-prep-inline-card__status">
            <SlotStatusBadge status={status} />
          </span>
        </button>
        <ResourcePrepActionButton
          type="button"
          size="icon-xs"
          variant={editing ? 'soft' : 'ghost'}
          className="resource-prep-inline-card__detail-button"
          aria-label={`编辑素材「${slot.name || `素材 #${slot.ID}`}」`}
          title="编辑"
          onClick={startEditing}
        >
          <Pencil size={13} />
        </ResourcePrepActionButton>
      </div>

      {!editing ? (
        null
      ) : (
        <InlineCardEditorFrame onClick={(event) => event.stopPropagation()}>
          <SemanticEntityInlineEditor
            projectId={projectId}
            config={slotConfig}
            record={slot}
            queryKey={preProductionAssetSlotsQueryKey(projectId)}
            editKey={effectiveEditKey}
            title="素材字段"
            primaryFieldKeys={['name', 'kind', 'priority', 'description', 'prompt_hint', 'creative_reference_id', 'creative_reference_state_id']}
            surface="embedded"
            hideHeaderCopy
            hideHeaderActions
            hideDeleteAction
            hiddenFieldKeys={['status']}
            showAdvancedFields={false}
            editing={editing}
            onEditingChange={onEditingChange}
            onControlStateChange={setControl}
            resetToken={resetToken}
            idScope={`prep-asset-card-${slot.ID}`}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
          <InlineCardEditorActions
            formId={control?.formId}
            canSave={Boolean(control?.canSave)}
            saving={Boolean(control?.isSaving)}
            canCancel
            onCancel={cancelEditing}
          />
        </InlineCardEditorFrame>
      )}
    </section>
  )
}

function InlineCardEditorFrame({ children, onClick }: { children: ReactNode; onClick: (event: MouseEvent<HTMLDivElement>) => void }) {
  return (
    <div className="resource-prep-inline-card__editor" onClick={onClick}>
      {children}
    </div>
  )
}

function InlineCardEditorActions({
  formId,
  canSave,
  saving,
  canCancel,
  onCancel,
}: {
  formId?: string
  canSave: boolean
  saving: boolean
  canCancel: boolean
  onCancel: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <div className="resource-prep-inline-card__editor-actions">
      {canCancel ? (
        <ResourcePrepActionButton type="button" size="sm" variant="outline" onClick={onCancel} disabled={saving}>
          <X size={14} />
          取消
        </ResourcePrepActionButton>
      ) : null}
      <ResourcePrepActionButton form={formId} size="sm" loading={saving} disabled={!canSave}>
        <Save size={14} />
        保存
      </ResourcePrepActionButton>
    </div>
  )
}

function PreProductionSettingDetail({
  projectId,
  selectedReference,
  slotConfig,
  rows,
  selected,
  newSlotEditId,
  onAssetSaved,
  onLock,
  onReject,
  onUploadCandidate,
  onOpenResourceLibrary,
  busy,
  uploading,
  editingAssetSlotId,
  onEditingAssetSlotChange,
  onSelectSlot,
  onOpenSlot,
  onCardContextMenu,
}: {
  projectId?: number
  selectedReference: CreativeReferenceRecord | null
  slotConfig: SemanticEntityConfig
  rows: AssetSlotViewModel[]
  selected: AssetSlotViewModel | null
  newSlotEditId: number | null
  onAssetSaved: (record: SemanticEntityRecord) => void
  onLock: (candidate: AssetSlotCandidateRecord) => void
  onReject: (candidate: AssetSlotCandidateRecord) => void
  onUploadCandidate: () => void
  onOpenResourceLibrary: () => void
  busy: boolean
  uploading: boolean
  editingAssetSlotId: number | null
  onEditingAssetSlotChange: (slotId: number | null) => void
  onSelectSlot: (slotId: number) => void
  onOpenSlot: (slotId: number) => void
  onCardContextMenu?: (event: MouseEvent, target: PreProductionCardContextTarget) => void
}) {
  const title = selectedReference?.name || selectedReference?.alias || (selectedReference ? `设定 #${selectedReference.ID}` : '选择设定')
  return (
    <ResourcePrepInspectorRoot>
      <ResourcePrepInspectorPanel className="resource-prep-inspector__panel--nested-pane">
        <ResourcePrepInspectorHeader
          icon={<Sparkles size={16} />}
          title={title}
          subtitle={selectedReference ? '当前设定下的素材列表。字段信息和编辑入口都在素材卡片上。' : '从左侧设定列表选择一个设定。'}
        />
        <ResourcePrepInspectorBody className="resource-prep-inspector__body--nested-pane">
          <SettingAssetPane
            projectId={projectId}
            slotConfig={slotConfig}
            rows={rows}
            selected={selected}
            selectedReference={selectedReference}
            newSlotEditId={newSlotEditId}
            onSaved={onAssetSaved}
            onLock={onLock}
            onReject={onReject}
            onUploadCandidate={onUploadCandidate}
            onOpenResourceLibrary={onOpenResourceLibrary}
            busy={busy}
            uploading={uploading}
            editingAssetSlotId={editingAssetSlotId}
            onEditingAssetSlotChange={onEditingAssetSlotChange}
            onSelectSlot={onSelectSlot}
            onOpenSlot={onOpenSlot}
            onCardContextMenu={onCardContextMenu}
          />
        </ResourcePrepInspectorBody>
      </ResourcePrepInspectorPanel>
    </ResourcePrepInspectorRoot>
  )
}

function SettingAssetPane({
  projectId,
  slotConfig,
  rows,
  selected,
  selectedReference,
  newSlotEditId,
  onSaved,
  onLock,
  onReject,
  onUploadCandidate,
  onOpenResourceLibrary,
  busy,
  uploading,
  editingAssetSlotId,
  onEditingAssetSlotChange,
  onSelectSlot,
  onOpenSlot,
  onCardContextMenu,
}: {
  projectId?: number
  slotConfig: SemanticEntityConfig
  rows: AssetSlotViewModel[]
  selected: AssetSlotViewModel | null
  selectedReference: CreativeReferenceRecord | null
  newSlotEditId: number | null
  onSaved: (record: SemanticEntityRecord) => void
  onLock: (candidate: AssetSlotCandidateRecord) => void
  onReject: (candidate: AssetSlotCandidateRecord) => void
  onUploadCandidate: () => void
  onOpenResourceLibrary: () => void
  busy: boolean
  uploading: boolean
  editingAssetSlotId: number | null
  onEditingAssetSlotChange: (slotId: number | null) => void
  onSelectSlot: (slotId: number) => void
  onOpenSlot: (slotId: number) => void
  onCardContextMenu?: (event: MouseEvent, target: PreProductionCardContextTarget) => void
}) {
  const selectedInPane = selected && rows.some((row) => row.slot.ID === selected.slot.ID) ? selected : null
  const assetPane = usePersistentOverlapPaneController({
    storageKey: PREP_SETTING_ASSET_PANE_WIDTH_STORAGE_KEY,
    defaultSize: PREP_SETTING_ASSET_PANE_DEFAULT_WIDTH,
    minSize: PREP_SETTING_ASSET_PANE_MIN_WIDTH,
    maxSize: (rect) => Math.max(
      PREP_SETTING_ASSET_PANE_MIN_WIDTH,
      Math.min(PREP_SETTING_ASSET_PANE_MAX_WIDTH, rect.width - PREP_SETTING_ASSET_LIST_MIN_WIDTH),
    ),
    resizeEdge: 'left',
    collapseMode: 'after-min',
    expandMode: 'after-max',
    ariaLabel: '调整素材详情宽度',
  })
  const hasSelectedAsset = Boolean(selectedInPane)
  const assetPaneLayoutProps = hasSelectedAsset
    ? assetPane.groupProps
    : {
        ...assetPane.groupProps,
        'data-overlap-pane-collapsed': 'true' as const,
        'data-overlap-pane-expanded': undefined,
      }

  if (rows.length === 0) {
    return <EmptyPreview title="没有关联素材" description="为这个设定创建图片、视频、音频或文本素材。" />
  }

  return (
    <OverlapPaneGroup
      className="resource-prep-setting-assets"
      {...assetPaneLayoutProps}
    >
      <div className="resource-prep-setting-assets__list" aria-label="设定关联素材">
        <SettingAssetList
          projectId={projectId}
          slotConfig={slotConfig}
          rows={rows}
          selected={selectedInPane}
          selectedReference={selectedReference}
          editingAssetSlotId={editingAssetSlotId}
          newSlotEditId={newSlotEditId}
          onEditingAssetSlotChange={onEditingAssetSlotChange}
          onSaved={onSaved}
          onSelectSlot={onSelectSlot}
          onOpenSlot={onOpenSlot}
          onCardContextMenu={onCardContextMenu}
        />
      </div>
      {hasSelectedAsset && !assetPane.collapsed ? (
        <OverlapPane
          as="section"
          side="left"
          overlapState={assetPane.overlapState}
          resizeHandleSide="left"
          resizeHandleProps={{
            ...assetPane.resizeHandleProps,
          }}
          className="resource-prep-setting-assets__detail"
        >
          <PreProductionAssetDetailPanel
            selected={selectedInPane}
            selectedReference={selectedReference}
            onLock={onLock}
            onReject={onReject}
            onUploadCandidate={onUploadCandidate}
            onOpenResourceLibrary={onOpenResourceLibrary}
            busy={busy}
            uploading={uploading}
            nestedPane
          />
        </OverlapPane>
      ) : null}
      {hasSelectedAsset && assetPane.collapsed ? (
        <OverlapPaneRevealButton
          action="show"
          label="显示素材详情"
          onClick={assetPane.show}
        />
      ) : null}
      {hasSelectedAsset && assetPane.expanded ? (
        <OverlapPaneRevealButton
          action="restore"
          label="还原素材详情"
          onClick={assetPane.restore}
        />
      ) : null}
    </OverlapPaneGroup>
  )
}

function PreProductionAssetDetailPanel({
  selected,
  selectedReference,
  onLock,
  onReject,
  onUploadCandidate,
  onOpenResourceLibrary,
  busy,
  uploading,
  nestedPane = false,
}: {
  selected: AssetSlotViewModel | null
  selectedReference: CreativeReferenceRecord | null
  onLock: (candidate: AssetSlotCandidateRecord) => void
  onReject: (candidate: AssetSlotCandidateRecord) => void
  onUploadCandidate: () => void
  onOpenResourceLibrary: () => void
  busy: boolean
  uploading: boolean
  nestedPane?: boolean
}) {
  return (
    <ResourcePrepInspectorRoot className={nestedPane ? 'resource-prep-asset-detail-panel--nested' : undefined}>
      <ResourcePrepInspectorPanel>
        <ResourcePrepInspectorHeader
          icon={<PackageCheck size={16} />}
          title={selected?.slot.name || (selected ? `素材 #${selected.slot.ID}` : '选择素材')}
          subtitle={selected ? `${assetKindLabel(selected.kind)} · ${referenceTitle(selectedReference)}` : '从左侧素材列表选择素材后，在这里处理候选素材和锁定选择。'}
        />
        <ResourcePrepInspectorBody>
          {selected ? (
            <ResourcePrepInspectorStack>
              <AssetSlotDetail
                row={selected}
                onLock={onLock}
                onReject={onReject}
                onUploadCandidate={onUploadCandidate}
                onOpenResourceLibrary={onOpenResourceLibrary}
                busy={busy}
                uploading={uploading}
              />
            </ResourcePrepInspectorStack>
          ) : (
            <EmptyPreview title="选择素材" description="从左侧素材列表选择素材后，在这里维护字段和候选素材。" />
          )}
        </ResourcePrepInspectorBody>
      </ResourcePrepInspectorPanel>
    </ResourcePrepInspectorRoot>
  )
}

function SettingAssetList({
  projectId,
  slotConfig,
  rows,
  selected,
  selectedReference,
  editingAssetSlotId,
  newSlotEditId,
  onEditingAssetSlotChange,
  onSaved,
  onSelectSlot,
  onOpenSlot,
  onCardContextMenu,
}: {
  projectId?: number
  slotConfig: SemanticEntityConfig
  rows: AssetSlotViewModel[]
  selected: AssetSlotViewModel | null
  selectedReference: CreativeReferenceRecord | null
  editingAssetSlotId: number | null
  newSlotEditId: number | null
  onEditingAssetSlotChange: (slotId: number | null) => void
  onSaved: (record: SemanticEntityRecord) => void
  onSelectSlot: (slotId: number) => void
  onOpenSlot: (slotId: number) => void
  onCardContextMenu?: (event: MouseEvent, target: PreProductionCardContextTarget) => void
}) {
  if (rows.length === 0) {
    return <EmptyPreview title="没有关联素材" description="为这个设定创建图片、视频、音频或文本素材。" />
  }
  return (
    <ResourcePrepInspectorStack>
      {rows.map((row) => (
        <AssetSlotInlineCard
          key={row.slot.ID}
          projectId={projectId}
          slotConfig={slotConfig}
          row={row}
          reference={selectedReference}
          active={selected?.slot.ID === row.slot.ID}
          editing={editingAssetSlotId === row.slot.ID}
          editKey={row.slot.ID === newSlotEditId ? newSlotEditId : null}
          onSelect={() => onSelectSlot(row.slot.ID)}
          onEdit={() => onOpenSlot(row.slot.ID)}
          onEditingChange={(editing) => {
            onEditingAssetSlotChange(editing ? row.slot.ID : null)
          }}
          onSaved={(record) => {
            onSaved(record)
            onEditingAssetSlotChange(null)
          }}
          onDeleted={() => {
            onEditingAssetSlotChange(null)
          }}
          onContextMenu={(event) => onCardContextMenu?.(event, { type: 'asset', id: row.slot.ID })}
        />
      ))}
    </ResourcePrepInspectorStack>
  )
}

function referenceForRow(clusters: ReferenceAssetCluster[], row: AssetSlotViewModel) {
  if (!row.slot.creative_reference_id) return null
  return clusters.find((cluster) => cluster.reference?.ID === row.slot.creative_reference_id)?.reference ?? null
}

function referenceTitle(reference?: CreativeReferenceRecord | null) {
  if (!reference) return '未绑定设定'
  return reference.name || reference.alias || `设定 #${reference.ID}`
}

function referenceKindLabel(kind?: string) {
  const labels: Record<string, string> = {
    person: '人物',
    character: '人物',
    location: '地点',
    scene: '地点',
    object: '道具',
    prop: '道具',
    style: '风格',
    product: '产品',
    rule: '规则',
  }
  return labels[String(kind ?? '').toLowerCase()] ?? '设定资料'
}

function assetSlotRailMeta(row: AssetSlotViewModel, reference?: CreativeReferenceRecord | null) {
  const candidateLabel = row.candidates.length > 0 ? `候选 ${row.candidates.length}` : '暂无候选'
  const resourceLabel = row.lockedSlot || row.hasResource ? '已关联资源' : '未关联资源'
  return `${assetKindLabel(row.kind)} · ${candidateLabel} · ${resourceLabel} · ${referenceTitle(reference)}`
}

function normalizePreProductionWorkbenchView(value?: string): PreProductionWorkbenchView {
  return value === 'asset' ? 'asset' : 'setting'
}

function referenceCountLabel(referenceCount: number, assetCount: number) {
  return `${referenceCount} 个设定 · ${assetCount} 个素材`
}
