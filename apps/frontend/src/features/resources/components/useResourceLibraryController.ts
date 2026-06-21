import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/shared/infrastructure/api'
import { toast } from '@/shared/ui/toastStore'
import { downloadResource } from '@/shared/ui/resourceDownload'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import type { PaginatedResponse, Project, RawResource, ResourceBinding, ResourceFolder } from '@/types'
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
import {
  invalidateResourceMutationResult,
  resourceBindingChangedResult,
  resourceLibraryChangedResult,
} from '@/features/resources/application/resourceMutationInvalidation'
import {
  DEFAULT_RESOURCE_PAGE_SIZE,
  adjacentResource,
  paginateResources,
  projectScopeResources,
  resourceIDs,
  type ResourceScopeFilter,
  type TypeFilter,
} from '@/features/resources/components/resourceLibraryModel'

export function useResourceLibraryController() {
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

  const { data: myFolders = [] } = useQuery<ResourceFolder[]>({
    queryKey: resourceFolderKeys.mine,
    queryFn: () => api.get('/resource-folders').then(r => r.data),
  })

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: resourceShareTargetKeys.projects,
    queryFn: () => api.get('/projects').then(r => r.data),
  })

  const isProjectScope = scope === 'project'

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

  function clearSelection() {
    setSelectedResourceIDs(new Set())
  }

  function toggleSelectionMode() {
    if (selectionMode) clearSelection()
    setSelectionMode(current => !current)
  }

  function setTab(tab: 'mine' | 'team' | 'project') {
    setScope(tab === 'mine' ? 'personal' : tab)
    setPage(1)
    setSelectedResourceIDs(new Set())
  }

  function setScopeFilter(nextScope: ResourceScopeFilter) {
    setScope(nextScope)
    setPage(1)
    setSelectedResourceIDs(new Set())
  }

  function setTypeFilter(nextFilter: TypeFilter) {
    setFilter(nextFilter)
    setPage(1)
  }

  function setSearchFilter(nextSearch: string) {
    setSearch(nextSearch)
    setPage(1)
  }

  function setLibraryPageSize(nextPageSize: number) {
    setPageSize(nextPageSize)
    setPage(1)
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

  function revokeSelectedProjectBindings() {
    selectedProjectBindingIDs.forEach(id => revoke.mutate(id))
  }

  function canAdoptToTeam(resource: RawResource) {
    return Boolean(currentOrgID && currentUser?.ID && resource.owner_id === currentUser.ID && !resource.org_id)
  }

  function uploadFiles(files: FileList | null) {
    if (!files) return
    Array.from(files).forEach(file => upload.mutate(file))
  }

  function clipCreated(created: RawResource) {
    invalidateResourceMutationResult(qc, resourceLibraryChangedResult({ changedIds: [created.ID] }))
    setClipResource(null)
  }

  return {
    adoptToTeam,
    canAdoptToTeam,
    clearSelection,
    clipCreated,
    clipResource,
    contextMenu,
    currentOrgID,
    currentProject,
    currentUser,
    downloadResource,
    fileRef,
    filter,
    handleResourceRowDragStart,
    isLoading,
    isProjectScope,
    isSharedView: isProjectScope,
    moveResource,
    myFolders,
    openResourceContextMenu,
    openShareToProject,
    page,
    pageCount,
    pageSize,
    previewResource,
    projectBindingByResourceID,
    projects,
    remove,
    renameResource,
    revoke,
    revokeSelectedProjectBindings,
    scope,
    search,
    selectedIDs,
    selectedPersonalStagingResources,
    selectedProjectBindingIDs,
    selectedResourceIDs,
    selectedResources,
    selectionMode,
    setClipResource,
    setContextMenu,
    setLibraryPageSize,
    setMoveResource,
    setPage,
    setPreviewResource,
    setRenameResource,
    setResourceSelected,
    setScopeFilter,
    setSearchFilter,
    setShareProjectResources,
    setTab,
    setTypeFilter,
    setViewMode,
    shareProjectResources,
    shareResourcesToTeam,
    shareToProject,
    switchPreviewImage,
    toggleSelectionMode,
    total,
    upload,
    uploadFiles,
    viewMode,
    visible,
    visibleImageResources,
  }
}
