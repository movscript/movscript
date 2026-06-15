import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import './ResourcesPage.css'
import { api } from '@/shared/infrastructure/api'
import type { Project, RawResource, ResourceBinding, ResourceFolder, PaginatedResponse } from '@/types'
import {
  Upload, Trash2, Search,
  FolderOpen, Share2,
  ChevronRight,
  X as XIcon,
  LayoutGrid, List, ChevronLeft,
  CheckSquare,
} from 'lucide-react'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import { downloadResource } from '@/shared/ui/resourceDownload'
import { ResourceCandidateAttachPanel, candidateResourceFromRawResource } from '@/shared/ui/ResourceCandidateAttachPanel'
import {
  ResourcePageActionButton,
  ResourcePageActionGroup,
  ResourcePageBulkActions,
  ResourcePageFilterBar,
  ResourcePageFlexibleSpace,
  ResourcePageHiddenFileInput,
  ResourcePageLayout,
  ResourcePageMain,
  ResourcePageMutedText,
  ResourcePagePager,
  ResourcePageSearchField,
  ResourceDialogSelect,
} from '@/features/resources/components/ResourcePageUi'
import { ProjectSurfaceHeader } from '@movscript/ui/layout'
import { useTranslation } from 'react-i18next'
import { RESOURCE_UPLOAD_ACCEPT } from '@/shared/domain/mediaTypes'
import { toast } from '@/shared/ui/toastStore'
import {
  resourceContextMenuPositionFromEvent,
  resourceViewportBoundaryFromWindow,
  startResourceDragSource,
  type ResourceClientPoint,
} from '@/features/resources/domain/resourceInteraction'
import {
  resourceBindingKeys,
  resourceFolderKeys,
  resourceKeys,
  resourceShareTargetKeys,
} from '@/features/resources/application/resourceQueryKeys'
import { invalidateResourceMutationResult, resourceBindingChangedResult, resourceLibraryChangedResult } from '@/features/resources/application/resourceMutationInvalidation'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { MoveDialog, RenameResourceDialog, ShareToProjectDialog } from '@/features/resources/components/ResourcesPageDialogs'
import { ResourceBulkContextMenu } from '@/features/resources/components/ResourcesPageItems'
import { ResourcesPageLibraryContent } from '@/features/resources/components/ResourcesPageLibraryContent'
import { VideoClipDialog } from '@/features/resources/components/ResourcesPageVideoClipDialog'
import {
  DEFAULT_RESOURCE_PAGE_SIZE,
  RESOURCE_PAGE_SIZE_OPTIONS,
  SCOPE_TABS,
  TYPE_TABS,
  adjacentResource,
  paginateResources,
  projectScopeResources,
  resourceIDs,
  type ResourceScopeFilter,
  type TypeFilter,
} from '@/features/resources/components/resourceLibraryModel'
import type { ResourceLibraryViewProps } from '@/features/resources/components/resourceLibraryViewTypes'

// ─── Main Page ────────────────────────────────────────────────────────────────
export function ResourceLibraryView({
  variant = 'page',
}: ResourceLibraryViewProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const currentOrgID = useUserStore(state => state.currentOrgID)
  const currentUser = useUserStore(state => state.currentUser)
  const currentProject = useProjectStore(state => state.current)
  const fileRef = useRef<HTMLInputElement>(null)
  const [scope, setScope] = useState<ResourceScopeFilter>('all')
  const [filter, setFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')
  const [moveResource, setMoveResource] = useState<RawResource | null>(null)
  const [renameResource, setRenameResource] = useState<RawResource | null>(null)
  const [clipResource, setClipResource] = useState<RawResource | null>(null)
  const [previewResource, setPreviewResource] = useState<RawResource | null>(null)
  const [selectedResourceIDs, setSelectedResourceIDs] = useState<Set<number>>(() => new Set())
  const [contextMenu, setContextMenu] = useState<{ position: ResourceClientPoint; resources: RawResource[] } | null>(null)
  const [shareProjectResources, setShareProjectResources] = useState<RawResource[] | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectionMode, setSelectionMode] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_RESOURCE_PAGE_SIZE)

  useEffect(() => {
    if ((scope === 'team' && !currentOrgID) || (scope === 'project' && !currentProject?.ID)) {
      setScope('all')
      setPage(1)
      setSelectedResourceIDs(new Set())
      setSelectionMode(false)
    }
  }, [scope, currentOrgID, currentProject?.ID])

  // My folders
  const { data: myFolders = [] } = useQuery<ResourceFolder[]>({
    queryKey: resourceFolderKeys.mine,
    queryFn: () => api.get('/resource-folders').then(r => r.data),
  })

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: resourceShareTargetKeys.projects,
    queryFn: () => api.get('/projects').then(r => r.data),
  })

  const isProjectScope = scope === 'project'

  // Resources: unified library view without folder or shared tab filtering.
  const { data: resourcesData, isLoading: isResourceLoading } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: resourceKeys.libraryPage({ scope, filter, search, page, pageSize }),
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('page_size', String(pageSize))
      if (scope === 'personal' || scope === 'team') params.set('scope', scope)
      if (filter !== 'all') params.set('type', filter)
      if (search.trim()) params.set('q', search.trim())
      return api.get(`/resources?${params}`).then(r => r.data)
    },
    enabled: !isProjectScope,
  })

  const { data: projectBindings = [], isLoading: isProjectResourcesLoading } = useQuery<ResourceBinding[]>({
    queryKey: resourceBindingKeys.projectLibraryScope(currentProject?.ID),
    queryFn: () => api.get(`/projects/${currentProject!.ID}/resource-bindings`).then(r => r.data),
    enabled: isProjectScope && Boolean(currentProject?.ID),
  })
  const projectResources = isProjectScope ? projectScopeResources(projectBindings, filter, search) : []
  const projectBindingByResourceID = useMemo(() => {
    const map = new Map<number, number>()
    projectBindings.forEach(binding => {
      if (binding.resource_id && binding.ID) map.set(binding.resource_id, binding.ID)
    })
    return map
  }, [projectBindings])
  const resources = isProjectScope ? paginateResources(projectResources, page, pageSize) : resourcesData?.items ?? []
  const total = isProjectScope ? projectResources.length : resourcesData?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const isLoading = isProjectScope ? isProjectResourcesLoading : isResourceLoading

  useEffect(() => {
    setPage(current => Math.min(current, pageCount))
  }, [pageCount])

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post('/resources/upload', fd).then(r => r.data as RawResource)
    },
    onSuccess: (created) => invalidateResourceMutationResult(qc, resourceLibraryChangedResult({ changedIds: [created.ID] })),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/resources/${id}`),
    onSuccess: (_, id) => {
      setSelectedResourceIDs(current => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
      invalidateResourceMutationResult(qc, resourceLibraryChangedResult({ changedIds: [id] }))
    },
  })

  const adoptToTeam = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map(id => api.post(`/resources/${id}/adopt-to-team`)))
    },
    onSuccess: (_, ids) => {
      setContextMenu(null)
      setSelectedResourceIDs(new Set())
      invalidateResourceMutationResult(qc, resourceLibraryChangedResult({ changedIds: ids }))
      toast.success(t('pages.resources.sharedToTeamSuccess', { defaultValue: '已加入团队资源库' }))
    },
  })

  const shareToProject = useMutation({
    mutationFn: async ({ projectID, ids }: { projectID: number; ids: number[] }) => {
      await Promise.all(ids.map(id => api.post(`/projects/${projectID}/resource-bindings`, {
        resource_id: id,
        owner_type: 'project',
        owner_id: projectID,
        role: 'reference',
        status: 'selected',
        source_type: 'manual',
      })))
    },
    onSuccess: (_, { projectID, ids }) => {
      setContextMenu(null)
      setShareProjectResources(null)
      setSelectedResourceIDs(new Set())
      invalidateResourceMutationResult(qc, resourceLibraryChangedResult({ changedIds: ids }))
      invalidateResourceMutationResult(qc, resourceBindingChangedResult({ projectId: projectID, changedIds: ids }))
      toast.success(t('pages.resources.sharedToProjectSuccess', { defaultValue: '已分享给项目' }))
    },
  })

  const revoke = useMutation({
    mutationFn: (bindingID: number) => api.delete(`/resource-bindings/${bindingID}`),
    onSuccess: (_, bindingID) => {
      setContextMenu(null)
      setSelectedResourceIDs(new Set())
      invalidateResourceMutationResult(qc, resourceBindingChangedResult({ projectId: currentProject?.ID, changedIds: [bindingID] }))
      toast.success(t('pages.resources.revokedFromProjectSuccess', { defaultValue: '已从项目移除引用' }))
    },
  })

  const isSharedView = isProjectScope

  const visible = resources
  const visibleImageResources = visible.filter(resource => resource.type === 'image')
  const selectedResources = visible.filter(resource => selectedResourceIDs.has(resource.ID))
  const selectedIDs = resourceIDs(selectedResources)
  const selectedProjectBindingIDs = selectedIDs
    .map(id => projectBindingByResourceID.get(id))
    .filter((id): id is number => Boolean(id))
  const selectedPersonalStagingResources = selectedResources.filter(canAdoptToTeam)

  useEffect(() => {
    setSelectedResourceIDs(current => {
      const visibleIDs = new Set(visible.map(resource => resource.ID))
      const next = new Set(Array.from(current).filter(id => visibleIDs.has(id)))
      return next.size === current.size ? current : next
    })
  }, [visible])

  function setResourceSelected(resource: RawResource, selected: boolean) {
    setSelectedResourceIDs(current => {
      const next = new Set(current)
      if (selected) next.add(resource.ID)
      else next.delete(resource.ID)
      return next
    })
  }

  function toggleSelectionMode() {
    if (selectionMode) setSelectedResourceIDs(new Set())
    setSelectionMode(current => !current)
  }

  function setTab(tab: 'mine' | 'team' | 'project') {
    setScope(tab === 'mine' ? 'personal' : tab)
    setPage(1)
    setSelectedResourceIDs(new Set())
  }

  function contextMenuResources(resource: RawResource) {
    if (selectedResourceIDs.has(resource.ID)) {
      const selected = visible.filter(item => selectedResourceIDs.has(item.ID))
      return selected.length > 0 ? selected : [resource]
    }
    return [resource]
  }

  function openResourceContextMenu(event: MouseEvent, resource: RawResource) {
    event.preventDefault()
    setContextMenu({
      position: resourceContextMenuPositionFromEvent(event, resourceViewportBoundaryFromWindow(window)),
      resources: contextMenuResources(resource),
    })
  }

  function handleResourceRowDragStart(event: DragEvent<HTMLDivElement>, resource: RawResource) {
    startResourceDragSource({
      dataTransfer: event.dataTransfer,
      resource,
      target: event.target,
      preventDefault: () => event.preventDefault(),
    })
  }

  function switchPreviewImage(direction: -1 | 1) {
    setPreviewResource(current => {
      if (!current || current.type !== 'image' || visibleImageResources.length < 2) return current
      return adjacentResource(visibleImageResources, current, direction)
    })
  }

  function shareResourcesToTeam(resourcesToShare: RawResource[]) {
    const ids = resourceIDs(resourcesToShare.filter(canAdoptToTeam))
    if (ids.length === 0) return
    adoptToTeam.mutate(ids)
  }

  function openShareToProject(resourcesToShare: RawResource[]) {
    if (resourcesToShare.length === 0) return
    setContextMenu(null)
    setShareProjectResources(resourcesToShare)
  }

  function canAdoptToTeam(resource: RawResource) {
    return Boolean(currentOrgID && currentUser?.ID && resource.owner_id === currentUser.ID && !resource.org_id)
  }

  return (
    <ResourcePageLayout data-resource-variant={variant}>
      <ResourcePageMain>
        <ResourcePageHiddenFileInput
          ref={fileRef}
          type="file"
          accept={RESOURCE_UPLOAD_ACCEPT}
          multiple
          onChange={e => {
            if (!e.target.files) return
            Array.from(e.target.files).forEach(f => upload.mutate(f))
            e.target.value = ''
          }}
        />

        <ProjectSurfaceHeader
          icon={FolderOpen}
          title={t('pages.resources.title', { defaultValue: '资源库' })}
          description={t('pages.resources.description', { defaultValue: '统一管理个人、团队和项目引用资源。' })}
          meta={<ResourcePageMutedText>{t('pages.resources.filesCount', { count: total })}</ResourcePageMutedText>}
          actions={(
            <>
              <ResourcePageActionGroup>
                <ResourcePageActionButton
                  size="xs"
                  variant={scope === 'personal' ? 'solid' : 'ghost'}
                  onClick={() => setTab('mine')}
                >
                  {t('pages.resources.scopes.personal')}
                </ResourcePageActionButton>
                <ResourcePageActionButton
                  size="xs"
                  variant={scope === 'team' ? 'solid' : 'ghost'}
                  onClick={() => setTab('team')}
                  disabled={!currentOrgID}
                >
                  {t('pages.resources.scopes.team')}
                </ResourcePageActionButton>
                <ResourcePageActionButton
                  size="xs"
                  variant={scope === 'project' ? 'solid' : 'ghost'}
                  onClick={() => setTab('project')}
                  disabled={!currentProject?.ID}
                >
                  {t('pages.resources.scopes.project')}
                </ResourcePageActionButton>
              </ResourcePageActionGroup>
              <ResourcePageActionGroup>
                <ResourcePageActionButton
                  size="icon-xs"
                  variant={viewMode === 'grid' ? 'solid' : 'ghost'}
                  onClick={() => setViewMode('grid')}
                  title={t('pages.resources.gridTitle')}
                >
                  <LayoutGrid size={14} />
                </ResourcePageActionButton>
                <ResourcePageActionButton
                  size="icon-xs"
                  variant={viewMode === 'list' ? 'solid' : 'ghost'}
                  onClick={() => setViewMode('list')}
                  title={t('pages.resources.listTitle')}
                >
                  <List size={14} />
                </ResourcePageActionButton>
              </ResourcePageActionGroup>
            </>
          )}
        />

        <ResourcePageFilterBar>
          <ResourcePageSearchField
            icon={Search}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder={t('pages.resources.searchFilesPlaceholder')}
          />
          <ResourcePageActionButton
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            hidden={isProjectScope}
          >
            <Upload size={14} />
            {upload.isPending ? t('pages.resources.uploading') : t('pages.resources.uploadFile')}
          </ResourcePageActionButton>
          <ResourcePageActionButton
            size="sm"
            variant={selectionMode ? 'solid' : 'outline'}
            onClick={toggleSelectionMode}
          >
            {selectionMode ? <XIcon size={14} /> : <CheckSquare size={14} />}
            {selectionMode ? t('common.cancel') : t('pages.resources.selectMode', { defaultValue: '选择' })}
          </ResourcePageActionButton>
          <ResourcePageActionGroup>
            {SCOPE_TABS.map(tabItem => {
              const disabled = (tabItem.requiresProject && !currentProject?.ID) || (tabItem.value === 'team' && !currentOrgID)
              return (
                <ResourcePageActionButton
                  key={tabItem.value}
                  size="xs"
                  variant={scope === tabItem.value ? 'solid' : 'ghost'}
                  onClick={() => { if (!disabled) { setScope(tabItem.value); setPage(1); setSelectedResourceIDs(new Set()) } }}
                  disabled={disabled}
                >
                  {t(tabItem.labelKey)}
                </ResourcePageActionButton>
              )
            })}
          </ResourcePageActionGroup>
          <ResourcePageActionGroup>
            {TYPE_TABS.map(tabItem => (
              <ResourcePageActionButton
                key={tabItem.value}
                size="xs"
                variant={filter === tabItem.value ? 'solid' : 'ghost'}
                onClick={() => { setFilter(tabItem.value); setPage(1) }}
              >
                {t(tabItem.labelKey)}
              </ResourcePageActionButton>
            ))}
          </ResourcePageActionGroup>
          <ResourcePageFlexibleSpace />
          {selectedIDs.length > 0 && (
            <ResourcePageBulkActions>
              <ResourcePageMutedText>
                {t('pages.resources.selectedCount', { count: selectedIDs.length, defaultValue: `${selectedIDs.length} selected` })}
              </ResourcePageMutedText>
              {selectedPersonalStagingResources.length > 0 && (
                <ResourcePageActionButton variant="outline" size="sm" onClick={() => shareResourcesToTeam(selectedResources)} disabled={adoptToTeam.isPending}>
                  <Share2 size={14} />
                  {t('pages.resources.shareToTeam', { defaultValue: '加入团队资源库' })}
                </ResourcePageActionButton>
              )}
              <ResourcePageActionButton variant="outline" size="sm" onClick={() => openShareToProject(selectedResources)} disabled={shareToProject.isPending}>
                <FolderOpen size={14} />
                {t('pages.resources.shareToProject', { defaultValue: '分享给项目' })}
              </ResourcePageActionButton>
              {isProjectScope && selectedProjectBindingIDs.length > 0 && (
                <ResourcePageActionButton variant="ghost" tone="danger" size="sm" onClick={() => selectedProjectBindingIDs.forEach(id => revoke.mutate(id))} disabled={revoke.isPending}>
                  <Trash2 size={14} />
                  {t('pages.resources.revokeFromProject', { defaultValue: '移出项目' })}
                </ResourcePageActionButton>
              )}
              <ResourcePageActionButton variant="outline" size="sm" onClick={() => setSelectedResourceIDs(new Set())}>
                {t('common.cancel')}
              </ResourcePageActionButton>
            </ResourcePageBulkActions>
          )}
          <ResourcePageMutedText>{t('pages.resources.filesCount', { count: total })}</ResourcePageMutedText>
        </ResourcePageFilterBar>

        <ResourcesPageLibraryContent
          isLoading={isLoading}
          resources={visible}
          search={search}
          viewMode={viewMode}
          currentUserID={currentUser?.ID}
          currentOrgID={currentOrgID ?? undefined}
          isSharedView={isSharedView}
          isProjectScope={isProjectScope}
          selectionMode={selectionMode}
          selectedResourceIDs={selectedResourceIDs}
          projectBindingByResourceID={projectBindingByResourceID}
          canAdoptToTeam={canAdoptToTeam}
          onRemoveResource={id => remove.mutate(id)}
          onRevokeProjectBinding={id => revoke.mutate(id)}
          onMoveResource={setMoveResource}
          onRenameResource={setRenameResource}
          onClipResource={setClipResource}
          onShareResourcesToTeam={shareResourcesToTeam}
          onShareResourcesToProject={openShareToProject}
          onDownloadResource={downloadResource}
          onSelectResource={setResourceSelected}
          onContextMenu={openResourceContextMenu}
          onPreviewResource={setPreviewResource}
          onResourceRowDragStart={handleResourceRowDragStart}
        />

        <ResourcePagePager
          status={t('pages.resources.pageStatus', { page, pageCount })}
          actions={(
            <>
            <label className="resource-page__page-size-field">
              <span>{t('pages.resources.pageSize', { defaultValue: '每页' })}</span>
              <ResourceDialogSelect
                className="resource-page__page-size-select"
                value={pageSize}
                onChange={event => {
                  setPageSize(Number(event.target.value))
                  setPage(1)
                }}
              >
                {RESOURCE_PAGE_SIZE_OPTIONS.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </ResourceDialogSelect>
            </label>
            <ResourcePageActionButton variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
              <ChevronLeft size={14} />
              {t('pages.resources.previousPage')}
            </ResourcePageActionButton>
            <ResourcePageActionButton variant="outline" size="sm" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>
              {t('pages.resources.nextPage')}
              <ChevronRight size={14} />
            </ResourcePageActionButton>
            </>
          )}
        />
      </ResourcePageMain>

      {/* Dialogs */}
      {moveResource && (
        <MoveDialog
          resource={moveResource}
          folders={myFolders}
          onClose={() => setMoveResource(null)}
        />
      )}
      {renameResource && (
        <RenameResourceDialog
          resource={renameResource}
          onClose={() => setRenameResource(null)}
        />
      )}
      {clipResource && (
        <VideoClipDialog
          resource={clipResource}
          onClose={() => setClipResource(null)}
          onCreated={(created) => {
            invalidateResourceMutationResult(qc, resourceLibraryChangedResult({ changedIds: [created.ID] }))
            setClipResource(null)
          }}
        />
      )}
      {shareProjectResources && (
        <ShareToProjectDialog
          resources={shareProjectResources}
          projects={projects}
          onClose={() => setShareProjectResources(null)}
          isSharing={shareToProject.isPending}
          onShare={(projectID) => shareToProject.mutate({ projectID, ids: resourceIDs(shareProjectResources) })}
        />
      )}
      {previewResource && (
        <MediaViewer
          resource={previewResource}
          open
          onOpenChange={open => !open && setPreviewResource(null)}
          onPrevious={previewResource.type === 'image' && visibleImageResources.length > 1 ? () => switchPreviewImage(-1) : undefined}
          onNext={previewResource.type === 'image' && visibleImageResources.length > 1 ? () => switchPreviewImage(1) : undefined}
          fit="contain"
          sidePanel={(
            <ResourceCandidateAttachPanel
              resources={[candidateResourceFromRawResource(previewResource)]}
              projectId={currentProject?.ID}
              compact
            />
          )}
        />
      )}
      {contextMenu && (
        <ResourceBulkContextMenu
          x={contextMenu.position.x}
          y={contextMenu.position.y}
          resources={contextMenu.resources}
          canShareToTeam={contextMenu.resources.some(canAdoptToTeam)}
          onClose={() => setContextMenu(null)}
          onShareToTeam={() => shareResourcesToTeam(contextMenu.resources)}
          onShareToProject={() => openShareToProject(contextMenu.resources)}
        />
      )}
    </ResourcePageLayout>
  )
}

export default function ResourcesPage() {
  return <ResourceLibraryView />
}
