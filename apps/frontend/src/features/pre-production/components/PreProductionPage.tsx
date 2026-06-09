import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PackageCheck, Pencil, Plus, Sparkles, Trash2, UploadCloud } from 'lucide-react'

import { SemanticEntityInlineEditor } from '@/shared/ui/SemanticEntityInlineEditor'
import { EmptyPreview, SlotStatusBadge } from '@/features/pre-production/components/PreProductionAssetBoard'
import { AssetSlotDetail } from '@/features/pre-production/components/PreProductionAssetDetail'
import { PreProductionResourceLibraryDialog } from '@/features/pre-production/components/PreProductionResourceLibraryDialog'
import { PreProductionReviewWorkspace } from '@/features/pre-production/components/PreProductionReviewWorkspace'
import { useProjectWorkbenchShellProps } from '@/features/project-workbenches/application/useProjectWorkbenchShellProps'
import { type SemanticEntityConfig, type SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import { readStringParam } from '@/features/content/presentation/contentFilters'
import { apiErrorMessage } from '@/features/content/domain/contentWorkbenchStatus'
import { RESOURCE_UPLOAD_ACCEPT } from '@/shared/domain/mediaTypes'
import {
  normalizeSlotStatus,
  assetKindLabel,
  type AssetKind,
  type AssetSlotRecord,
  type AssetSlotCandidateRecord,
  type AssetSlotViewModel,
  type SettingRecord,
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
  preProductionSettingsQueryKey,
  preProductionWorkspaceDataQueryKey,
  usePreProductionWorkbenchData,
} from '@/features/pre-production/application/preProductionDataController'
import {
  deletePreProductionWorkspaceAssetSlot,
  deletePreProductionWorkspaceSetting,
  savePreProductionWorkspaceAssetSlot,
  savePreProductionWorkspaceSetting,
} from '@/features/pre-production/application/preProductionWorkspaceRepository'
import { usePreProductionPageController } from '@/features/pre-production/application/preProductionPageController'
import { refreshPreProductionWorkbenchContext } from '@/features/pre-production/application/preProductionRefreshController'
import { usePreProductionResourceLibrary } from '@/features/pre-production/application/preProductionResourceLibrary'
import { usePreProductionReviewController } from '@/features/pre-production/application/preProductionReviewController'
import { usePreProductionUploadInput } from '@/features/pre-production/application/preProductionUploadInput'
import { useRouteLayoutOverlapPaneController } from '@/features/app-shell/application/useRouteLayoutOverlapPaneController'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { toast } from '@/shared/ui/toastStore'
import { ROUTES } from '@/routes/projectRoutes'
import { routeLayoutSpecForPathname } from '@/routes/routeLayoutRegistry'
import {
  Dialog,
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
  ResourcePrepEntityCard,
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
} from '@movscript/ui'
import { preProductionMissingCountRecipe } from '@/features/pre-production/presentation/preProductionSemanticUi'
import {
  PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_ID,
} from '@/features/pre-production/presentation/preProductionWorkbenchLayoutSpec'

const PRE_PRODUCTION_ROUTE_LAYOUT = routeLayoutSpecForPathname(ROUTES.project.preProduction)

type PreProductionWorkbenchView = 'setting' | 'asset'
type PreProductionCardContextTarget = { type: 'asset'; id: number } | { type: 'reference'; id: number }
type PreProductionDeleteTarget =
  | { type: 'asset'; record: AssetSlotRecord }
  | { type: 'reference'; record: SettingRecord }

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
  const [workspaceBuildReview, setWorkspaceBuildReview] = useState<unknown>(null)
  const resourceLibrary = usePreProductionResourceLibrary()
  const reviewController = usePreProductionReviewController({ projectId, searchParams, setSearchParams })
  const { workspaceView, assetWorkspaceArtifactsQuery, settingWorkspaceArtifactsQuery, setWorkspaceView, openReviewWorkspace, openMainWorkspace } = reviewController
  const preProductionData = usePreProductionWorkbenchData(projectId)
  const {
    slotConfig,
    referenceConfig,
    settings,
    slots,
    visibleSlots,
    rows,
    referenceById,
    clusters,
  } = preProductionData
  const referenceLookupOptions = useMemo(() => ({
    setting_id: settings.map((reference) => ({
      value: String(reference.ID),
      label: reference.name || reference.alias || `设定 #${reference.ID}`,
    })),
    setting_state_id: [],
  }), [settings])
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
      return type === 'asset'
        ? deletePreProductionWorkspaceAssetSlot(projectId, record)
        : deletePreProductionWorkspaceSetting(projectId, record)
    },
    onSuccess: async (_result, target) => {
      if (target.type === 'asset') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: preProductionWorkspaceDataQueryKey(projectId) }),
          queryClient.invalidateQueries({ queryKey: preProductionAssetSlotsQueryKey(projectId) }),
          queryClient.invalidateQueries({ queryKey: preProductionAssetSlotCandidatesQueryKey(projectId) }),
        ])
        if (selected?.slot.ID === target.record.ID) handleSlotDeleted()
        toast.success('素材需求已从当前工作区删除')
        return
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: preProductionWorkspaceDataQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: preProductionSettingsQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: preProductionAssetSlotsQueryKey(projectId) }),
      ])
      if (selectedReference?.ID === target.record.ID) handleReferenceDeleted()
      toast.success('设定资料已从当前工作区删除')
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
  const previewWorkspaceMutation = useMutation({
    mutationFn: () => requireWorkspaceBuildAPI().review(),
    onSuccess: (preview) => setWorkspaceBuildReview(preview),
    onError: (error) => toast.error(apiErrorMessage(error, '工作区检查失败')),
  })
  const applyWorkspaceMutation = useMutation({
    mutationFn: () => requireWorkspaceBuildAPI().build(),
    onSuccess: async () => {
      setWorkspaceBuildReview(null)
      await refreshPreProduction()
      toast.success('工作区已构建生效')
    },
    onError: (error) => toast.error(apiErrorMessage(error, '工作区构建失败')),
  })

  const missingCount = visibleSlots.filter((slot) => normalizeSlotStatus(slot.status) === 'missing').length
  function openReferenceCreateDialog() {
    setReferenceCreateKey(`new-reference-${Date.now()}`)
    setReferenceCreateOpen(true)
  }

  function openAssetCreateDialog() {
    const defaultReferenceId = selectedReference?.ID ?? settings[0]?.ID
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

  function openWorkspaceSubmitPreview() {
    if (previewWorkspaceMutation.isPending) return
    previewWorkspaceMutation.mutate()
  }

  function submitWorkspaceToCloud() {
    if (!workspaceReviewReady(workspaceBuildReview) || applyWorkspaceMutation.isPending) return
    applyWorkspaceMutation.mutate()
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
    await queryClient.invalidateQueries({ queryKey: preProductionWorkspaceDataQueryKey(projectId) })
    await refreshPreProductionWorkbenchContext({
      projectId,
      queryClient,
      refetchSettingWorkspaceArtifacts: settingWorkspaceArtifactsQuery.refetch,
      refetchAssetWorkspaceArtifacts: assetWorkspaceArtifactsQuery.refetch,
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
      selectedReference={selectedReference}
      referenceConfig={referenceConfig}
      referenceLookupOptions={referenceLookupOptions}
      selected={selected}
      rows={filtered}
      projectId={projectId}
      slotConfig={slotConfig}
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
      onReferenceSaved={handleReferenceSaved}
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
      settingWorkspaceArtifacts={settingWorkspaceArtifactsQuery.data ?? []}
      settingWorkspaceArtifactsLoading={settingWorkspaceArtifactsQuery.isLoading}
      assetWorkspaceArtifacts={assetWorkspaceArtifactsQuery.data ?? []}
      assetWorkspaceArtifactsLoading={assetWorkspaceArtifactsQuery.isLoading}
      settings={settings}
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
  const workspaceSubmitDialog = (
    <Dialog open={Boolean(workspaceBuildReview)} onOpenChange={(open) => { if (!open) setWorkspaceBuildReview(null) }}>
      <ResourcePrepCreateReferenceDialogContent>
        <ResourcePrepDialogHeader title="构建工作区" description="构建前请确认当前工作区修改可以成为新的有效业务状态。" />
        <ResourcePrepDialogBody>
          <pre className="max-h-[420px] overflow-auto rounded border border-border bg-muted p-3 text-xs leading-5 text-muted-foreground">
            {workspacePreviewText(workspaceBuildReview)}
          </pre>
        </ResourcePrepDialogBody>
        <ResourcePrepDialogActions>
          <ResourcePrepActionButton type="button" variant="outline" onClick={() => setWorkspaceBuildReview(null)} disabled={applyWorkspaceMutation.isPending}>
            取消
          </ResourcePrepActionButton>
          <ResourcePrepActionButton type="button" onClick={submitWorkspaceToCloud} loading={applyWorkspaceMutation.isPending} disabled={!workspaceReviewReady(workspaceBuildReview)}>
            构建生效
          </ResourcePrepActionButton>
        </ResourcePrepDialogActions>
      </ResourcePrepCreateReferenceDialogContent>
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
            defaults={{ kind: 'person', importance: 'main', status: 'workspace', name: '未命名设定' }}
            queryKey={preProductionSettingsQueryKey(projectId)}
            editKey={referenceCreateKey}
            title="设定字段"
            primaryFieldKeys={['kind', 'name', 'alias', 'description', 'content', 'importance']}
            surface="embedded"
            hideDeleteAction
            hiddenFieldKeys={['status']}
            showAdvancedFields={false}
            saveRecord={(payload, record) => savePreProductionWorkspaceSetting(projectId!, record as SettingRecord | null, payload)}
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
              help={settings.length === 0 ? '还没有设定。请先新建设定，再创建素材。' : undefined}
            >
              <ResourcePrepSelect
                triggerId="pre-production-create-asset-reference"
                value={assetCreateReferenceId}
                onValueChange={setAssetCreateReferenceId}
                placeholder="选择人物、地点、道具或风格设定"
                options={settings.map((reference) => ({
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
    description: '沉淀设定资料、素材需求和候选素材，补齐剧本工作台和内容生成之前的可复用上下文。',
    badges: (
      <>
        <ResourcePrepShellBadge>{referenceCountLabel(settings.length, visibleSlots.length)}</ResourcePrepShellBadge>
        {missingCount > 0 ? <ResourcePrepShellStatusBadge {...preProductionMissingCountRecipe(missingCount)}>缺口 {missingCount}</ResourcePrepShellStatusBadge> : null}
      </>
    ),
    actions: (
      <div className="flex flex-wrap items-center gap-2">
        <ResourcePrepActionButton type="button" variant="outline" onClick={openWorkspaceSubmitPreview} loading={previewWorkspaceMutation.isPending}>
          <UploadCloud size={14} />
          检查工作区
        </ResourcePrepActionButton>
        <ResourcePrepViewTabs>
          <ResourcePrepViewButton active={workbenchView === 'setting'} count={filteredClusters.length} onClick={() => setWorkbenchView('setting')}>
            设定
          </ResourcePrepViewButton>
          <ResourcePrepViewButton active={workbenchView === 'asset'} count={filtered.length} onClick={() => setWorkbenchView('asset')}>
            素材
          </ResourcePrepViewButton>
        </ResourcePrepViewTabs>
      </div>
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
        {workspaceSubmitDialog}
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
      {workspaceSubmitDialog}
      {createDialogs}
      <ResourcePrepHiddenFileInput ref={uploadInput.inputRef} type="file" accept={RESOURCE_UPLOAD_ACCEPT} onChange={(e) => handleUpload(e.target.files?.[0])} />
    </WorkbenchProjectShell>
  )
}

function PreProductionWorkspace({
  workbenchView,
  loading,
  clusters,
  selectedReference,
  referenceConfig,
  referenceLookupOptions,
  selected,
  rows,
  projectId,
  slotConfig,
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
  onReferenceSaved,
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
  selectedReference: SettingRecord | null
  referenceConfig: SemanticEntityConfig
  referenceLookupOptions: Record<string, Array<{ value: string; label: string }>>
  selected: AssetSlotViewModel | null
  rows: AssetSlotViewModel[]
  projectId?: number
  slotConfig: SemanticEntityConfig
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
  onReferenceSaved: (record: SemanticEntityRecord) => void
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
  const detailPane = useRouteLayoutOverlapPaneController({
    routeLayout: PRE_PRODUCTION_ROUTE_LAYOUT,
    paneId: PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_ID,
    resizeEdge: 'left',
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
      setWorkbenchView('asset')
      onOpenSlot(target.id)
      return
    }
    setWorkbenchView('setting')
    onOpenReference(target.id)
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
                  disabled={!projectId || (workbenchView === 'asset' && createSlotPending)}
                >
                  <Plus size={14} />
                </ResourcePrepActionButton>
              )}
            />
            <ResourcePrepWorkbenchRailList>
              {loading ? <EmptyPreview title="加载中" description="正在读取设定和素材。" /> : null}
              {!loading && workbenchView === 'setting' && clusters.length === 0 ? (
                <EmptyPreview title="暂无设定" description="先创建设定，再为它添加要准备的素材。" />
              ) : null}
              {!loading && workbenchView === 'asset' && rows.length === 0 ? (
                <EmptyPreview title="暂无素材" description="先选择或创建设定，再添加素材需求。" />
              ) : null}
              {workbenchView === 'setting' ? (
                <>
                  {clusters.map((cluster) => {
                    const reference = cluster.reference
                    if (!reference) {
                      return cluster.rows.map((row) => (
                        <AssetSlotInlineCard
                          key={`unbound-${row.slot.ID}`}
                          row={row}
                          reference={null}
                          active={selected?.slot.ID === row.slot.ID}
                          onSelect={() => {
                            setWorkbenchView('asset')
                            onSelectSlot(row.slot.ID)
                          }}
                          onContextMenu={(event) => openCardContextMenu(event, { type: 'asset', id: row.slot.ID })}
                        />
                      ))
                    }
                    return (
                      <ReferenceInlineCard
                        key={reference.ID}
                        cluster={cluster}
                        active={selectedReference?.ID === reference.ID}
                        onSelect={() => {
                          setWorkbenchView('setting')
                          onSelectReference(reference.ID)
                        }}
                        onContextMenu={(event) => openCardContextMenu(event, { type: 'reference', id: reference.ID })}
                      />
                    )
                  })}
                </>
              ) : (
                rows.map((row) => (
                  <AssetSlotInlineCard
                    key={row.slot.ID}
                    row={row}
                    reference={referenceForRow(clusters, row)}
                    active={selected?.slot.ID === row.slot.ID}
                    onSelect={() => {
                      setWorkbenchView('asset')
                      onSelectSlot(row.slot.ID)
                    }}
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
              <ResourcePrepWorkbenchDetailContent>
                {workbenchView === 'setting' ? (
                  <PreProductionSettingEditPanel
                    projectId={projectId}
                    selectedReference={selectedReference}
                    referenceConfig={referenceConfig}
                    onSaved={onReferenceSaved}
                  />
                ) : (
                  <PreProductionAssetEditPanel
                    projectId={projectId}
                    selected={selected}
                    selectedReference={selectedReference}
                    slotConfig={slotConfig}
                    referenceLookupOptions={referenceLookupOptions}
                    onSaved={onSaved}
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
  cluster,
  active,
  onSelect,
  onContextMenu,
}: {
  cluster: ReferenceAssetCluster
  active?: boolean
  onSelect: () => void
  onContextMenu?: (event: MouseEvent) => void
}) {
  const reference = cluster.reference
  return (
    <section className="resource-prep-inline-card" data-active={active ? 'true' : undefined} onContextMenu={onContextMenu}>
      <ResourcePrepEntityCard
        className="resource-prep-inline-card__select"
        onClick={onSelect}
        title={referenceTitle(reference)}
        description={`${referenceKindLabel(reference?.kind)} · ${cluster.rows.length} 个素材`}
        status={<ResourcePrepShellBadge>{cluster.rows.length}</ResourcePrepShellBadge>}
      />
    </section>
  )
}

function AssetSlotInlineCard({
  row,
  reference,
  active,
  onSelect,
  onContextMenu,
}: {
  row: AssetSlotViewModel
  reference: SettingRecord | null
  active?: boolean
  onSelect: () => void
  onContextMenu?: (event: MouseEvent) => void
}) {
  const slot = row.slot
  return (
    <section className="resource-prep-inline-card resource-prep-inline-card--asset" data-active={active ? 'true' : undefined} onContextMenu={onContextMenu}>
      <ResourcePrepEntityCard
        className="resource-prep-inline-card__select"
        onClick={onSelect}
        title={slot.name || `素材 #${slot.ID}`}
        description={assetSlotRailMeta(row, reference)}
        status={<SlotStatusBadge status={normalizeSlotStatus(slot.status)} />}
      />
    </section>
  )
}

function PreProductionSettingEditPanel({
  projectId,
  selectedReference,
  referenceConfig,
  onSaved,
}: {
  projectId?: number
  selectedReference: SettingRecord | null
  referenceConfig: SemanticEntityConfig
  onSaved: (record: SemanticEntityRecord) => void
}) {
  const title = selectedReference?.name || selectedReference?.alias || (selectedReference ? `设定 #${selectedReference.ID}` : '选择设定')
  return (
    <ResourcePrepInspectorRoot>
      <ResourcePrepInspectorPanel>
        <ResourcePrepInspectorHeader
          icon={<Sparkles size={16} />}
          title={title}
          subtitle={selectedReference ? '编辑当前设定的元信息。' : '从左侧设定列表选择一个设定。'}
        />
        <ResourcePrepInspectorBody>
          <ResourcePrepInspectorStack>
            <SemanticEntityInlineEditor
              projectId={projectId}
              config={referenceConfig}
              record={selectedReference}
              queryKey={preProductionSettingsQueryKey(projectId)}
              editKey={selectedReference?.ID ?? null}
              title="设定信息"
              primaryFieldKeys={['kind', 'name', 'alias', 'description', 'content', 'importance']}
              surface="embedded"
              hideDeleteAction
              hiddenFieldKeys={['status']}
              showAdvancedFields={false}
              emptyTitle="选择设定"
              emptyDescription="从左侧选择人物、地点、道具或风格设定后，在这里编辑元信息。"
              idScope={`prep-reference-detail-${selectedReference?.ID ?? 'empty'}`}
              saveRecord={(payload, record) => savePreProductionWorkspaceSetting(projectId!, record as SettingRecord | null, payload)}
              onSaved={onSaved}
            />
          </ResourcePrepInspectorStack>
        </ResourcePrepInspectorBody>
      </ResourcePrepInspectorPanel>
    </ResourcePrepInspectorRoot>
  )
}

function PreProductionAssetEditPanel({
  projectId,
  selected,
  selectedReference,
  slotConfig,
  referenceLookupOptions,
  onSaved,
  onLock,
  onReject,
  onUploadCandidate,
  onOpenResourceLibrary,
  busy,
  uploading,
}: {
  projectId?: number
  selected: AssetSlotViewModel | null
  selectedReference: SettingRecord | null
  slotConfig: SemanticEntityConfig
  referenceLookupOptions: Record<string, Array<{ value: string; label: string }>>
  onSaved: (record: SemanticEntityRecord) => void
  onLock: (candidate: AssetSlotCandidateRecord) => void
  onReject: (candidate: AssetSlotCandidateRecord) => void
  onUploadCandidate: () => void
  onOpenResourceLibrary: () => void
  busy: boolean
  uploading: boolean
}) {
  return (
    <ResourcePrepInspectorRoot>
      <ResourcePrepInspectorPanel>
        <ResourcePrepInspectorHeader
          icon={<PackageCheck size={16} />}
          title={selected?.slot.name || (selected ? `素材 #${selected.slot.ID}` : '选择素材')}
          subtitle={selected ? `${assetKindLabel(selected.kind)} · ${referenceTitle(selectedReference)}` : '从左侧素材列表选择素材后，在这里编辑信息并处理候选。'}
        />
        <ResourcePrepInspectorBody>
          {selected ? (
            <ResourcePrepInspectorStack>
              <SemanticEntityInlineEditor
                projectId={projectId}
                config={slotConfig}
                record={selected.slot}
                queryKey={preProductionAssetSlotsQueryKey(projectId)}
                editKey={selected.slot.ID}
                title="素材信息"
                primaryFieldKeys={['name', 'kind', 'priority', 'description', 'prompt_hint', 'setting_id', 'setting_state_id']}
                surface="embedded"
                hideDeleteAction
                hiddenFieldKeys={['status']}
                showAdvancedFields={false}
                lookupOptions={referenceLookupOptions}
                idScope={`prep-asset-detail-${selected.slot.ID}`}
                saveRecord={(payload, record) => savePreProductionWorkspaceAssetSlot(projectId!, record as AssetSlotRecord | null, payload)}
                onSaved={onSaved}
              />
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
            <EmptyPreview title="选择素材" description="从左侧素材列表选择素材后，在这里维护字段、候选素材和锁定选择。" />
          )}
        </ResourcePrepInspectorBody>
      </ResourcePrepInspectorPanel>
    </ResourcePrepInspectorRoot>
  )
}

function requireWorkspaceBuildAPI() {
  const api = window.api
  if (!api?.reviewMovScriptWorkspace || !api.buildMovScriptWorkspace) {
    throw new Error('当前窗口没有 MovScript 工作区构建能力')
  }
  return {
    review: api.reviewMovScriptWorkspace,
    build: api.buildMovScriptWorkspace,
  }
}

function workspacePreviewText(value: unknown): string {
  if (!value) return '暂无提交预览。'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function workspaceReviewReady(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return record.readyToBuild === true
}

function referenceForRow(clusters: ReferenceAssetCluster[], row: AssetSlotViewModel) {
  if (!row.slot.setting_id) return null
  return clusters.find((cluster) => cluster.reference?.ID === row.slot.setting_id)?.reference ?? null
}

function referenceTitle(reference?: SettingRecord | null) {
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

function assetSlotRailMeta(row: AssetSlotViewModel, reference?: SettingRecord | null) {
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
