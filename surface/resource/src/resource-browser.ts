import { createElement, Fragment, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DEFAULT_RESOURCE_LIBRARY_PAGE_SIZE,
  adjacentResource,
  paginateResources,
  projectScopeResources,
  resourceIDs,
  resourceScopeFilterFromParam,
  resourceTypeFilterFromParam,
  type ResourceLibraryResource,
  type ResourceLibraryScopeFilter,
  type ResourceLibraryTypeFilter,
  type ResourceLibraryViewProps,
} from './resourceLibrary.js'
import {
  resourceBindingKeys,
  resourceFolderKeys,
  resourceKeys,
  resourceShareTargetKeys,
} from './resourceQueryKeys.js'
import {
  resourceContextMenuPositionFromEvent,
  resourceViewportBoundaryFromWindow,
  startResourceDragSource,
  type ResourceClientPoint,
} from './resourceInteraction.js'

export interface ResourceLibraryPage<Resource> {
  items: Resource[]
  total: number
}

export interface ResourceLibraryProject {
  ID: number
}

export interface ResourceLibraryCurrentUser {
  ID: number
}

export interface ResourceLibraryOwnedResource extends ResourceLibraryResource {
  owner_id?: number
  org_id?: number
}

export interface ResourceLibraryProjectBinding<Resource extends ResourceLibraryResource = ResourceLibraryResource> {
  ID?: number
  resource_id?: number
  resource?: Resource | null
}

export interface ResourceLibraryDataAdapter<
  Resource extends ResourceLibraryOwnedResource,
  Binding extends ResourceLibraryProjectBinding<Resource>,
  Folder,
  Project extends ResourceLibraryProject,
> {
  listResourceFolders(): Promise<Folder[]>
  listShareTargetProjects(): Promise<Project[]>
  listResources(input: {
    scope: ResourceLibraryScopeFilter
    filter: ResourceLibraryTypeFilter
    search: string
    page: number
    pageSize: number
  }): Promise<ResourceLibraryPage<Resource>>
  listProjectResourceBindings(projectId: number): Promise<Binding[]>
  getResource(resourceId: number): Promise<Resource>
  uploadResource(file: File): Promise<Resource>
  removeResource(resourceId: number): Promise<unknown>
  adoptResourcesToTeam(resourceIds: number[]): Promise<unknown>
  shareResourcesToProject(input: { projectId: number; resourceIds: number[] }): Promise<unknown>
  revokeProjectResourceBinding(bindingId: number): Promise<unknown>
  certifyProviderAsset(resource: Resource): Promise<{ resource: Resource; updated?: Resource }>
}

export interface ResourceLibraryHTTPClient {
  get<Response>(url: string): Promise<{ data: Response }>
  post<Response = unknown>(url: string, body?: unknown): Promise<{ data: Response }>
  delete<Response = unknown>(url: string): Promise<{ data: Response }>
}

export function createResourceLibraryDataServiceAdapter<
  Resource extends ResourceLibraryOwnedResource,
  Binding extends ResourceLibraryProjectBinding<Resource>,
  Folder,
  Project extends ResourceLibraryProject,
>(
  client: ResourceLibraryHTTPClient,
  options: {
    providerAssetCertificationProvider?: string
  } = {},
): ResourceLibraryDataAdapter<Resource, Binding, Folder, Project> {
  const providerAssetCertificationProvider = options.providerAssetCertificationProvider ?? 'volcengine_ark_official'
  return {
    listResourceFolders: () => client.get<Folder[]>('/resource-folders').then(r => r.data),
    listShareTargetProjects: () => client.get<Project[]>('/projects').then(r => r.data),
    listResources: ({ scope, filter, search, page, pageSize }) => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('page_size', String(pageSize))
      if (scope === 'personal' || scope === 'team') params.set('scope', scope)
      if (filter !== 'all') params.set('type', filter)
      if (search.trim()) params.set('q', search.trim())
      return client.get<ResourceLibraryPage<Resource>>(`/resources?${params}`).then(r => r.data)
    },
    listProjectResourceBindings: (projectId) => client.get<Binding[]>(`/projects/${projectId}/resource-bindings`).then(r => r.data),
    getResource: (resourceId) => client.get<Resource>(`/resources/${resourceId}`).then(r => r.data),
    uploadResource: (file) => {
      const formData = new FormData()
      formData.append('file', file)
      return client.post<Resource>('/resources/upload', formData).then(r => r.data)
    },
    removeResource: (resourceId) => client.delete(`/resources/${resourceId}`),
    adoptResourcesToTeam: async (resourceIds) => {
      await Promise.all(resourceIds.map(id => client.post(`/resources/${id}/adopt-to-team`)))
    },
    shareResourcesToProject: async ({ projectId, resourceIds }) => {
      await Promise.all(resourceIds.map(id => client.post(`/projects/${projectId}/resource-bindings`, {
        resource_id: id,
        owner_type: 'project',
        owner_id: projectId,
        role: 'reference',
        status: 'selected',
        source_type: 'manual',
      })))
    },
    revokeProjectResourceBinding: (bindingId) => client.delete(`/resource-bindings/${bindingId}`),
    certifyProviderAsset: async (resource) => {
      const result = await client.post<{ resource?: Resource }>(`/provider-assets/providers/${encodeURIComponent(providerAssetCertificationProvider)}/certify`, {
        resource_id: resource.ID,
        name: resource.name,
      })
      return { resource, updated: result.data?.resource }
    },
  }
}

export interface ResourceLibraryBrowserControllerInput<
  Resource extends ResourceLibraryOwnedResource,
  Binding extends ResourceLibraryProjectBinding<Resource>,
  Folder,
  Project extends ResourceLibraryProject,
> extends ResourceLibraryViewProps {
  adapter: ResourceLibraryDataAdapter<Resource, Binding, Folder, Project>
  currentOrgID?: number | null
  currentUser?: ResourceLibraryCurrentUser | null
  currentProject?: Project | null
  downloadResource(resource: Resource): void | Promise<void>
  notify?: {
    success(message: string): void
    error(message: string): void
  }
  messages?: {
    sharedToTeamSuccess?: string
    sharedToProjectSuccess?: string
    revokedFromProjectSuccess?: string
    providerAssetCertified?: string
    providerAssetCertifyFailed?: string
  }
  onResourceLibraryChanged?(input: { changedIds?: number[] }): void
  onResourceBindingChanged?(input: { projectId?: number; changedIds?: number[] }): void
  projectScopeEnabled?: boolean
}

export type ResourceLibraryViewMode = 'grid' | 'list'

export type ResourceLibraryBrowserController<
  Resource extends ResourceLibraryOwnedResource,
  Binding extends ResourceLibraryProjectBinding<Resource>,
  Folder,
  Project extends ResourceLibraryProject,
> = ReturnType<typeof useResourceLibraryBrowserController<Resource, Binding, Folder, Project>>

export interface ResourceLibraryBrowserViewSlots<
  Resource extends ResourceLibraryOwnedResource,
  Binding extends ResourceLibraryProjectBinding<Resource>,
  Folder,
  Project extends ResourceLibraryProject,
> {
  renderLayout(input: { variant: ResourceLibraryViewProps['variant']; children: ReactNode }): ReactNode
  renderMain(input: { children: ReactNode }): ReactNode
  renderUploadInput(input: { controller: ResourceLibraryBrowserController<Resource, Binding, Folder, Project> }): ReactNode
  renderToolbar(input: { controller: ResourceLibraryBrowserController<Resource, Binding, Folder, Project> }): ReactNode
  renderContent(input: {
    controller: ResourceLibraryBrowserController<Resource, Binding, Folder, Project>
    agentReferenceActions?: boolean
  }): ReactNode
  renderPager(input: { controller: ResourceLibraryBrowserController<Resource, Binding, Folder, Project> }): ReactNode
  renderDialogs(input: { controller: ResourceLibraryBrowserController<Resource, Binding, Folder, Project> }): ReactNode
}

export interface ResourceLibraryBrowserViewInput<
  Resource extends ResourceLibraryOwnedResource,
  Binding extends ResourceLibraryProjectBinding<Resource>,
  Folder,
  Project extends ResourceLibraryProject,
> extends Pick<ResourceLibraryViewProps, 'variant' | 'agentReferenceActions'> {
  controller: ResourceLibraryBrowserController<Resource, Binding, Folder, Project>
  slots: ResourceLibraryBrowserViewSlots<Resource, Binding, Folder, Project>
}

export function ResourceLibraryBrowserView<
  Resource extends ResourceLibraryOwnedResource,
  Binding extends ResourceLibraryProjectBinding<Resource>,
  Folder,
  Project extends ResourceLibraryProject,
>({
  variant = 'page',
  agentReferenceActions,
  controller,
  slots,
}: ResourceLibraryBrowserViewInput<Resource, Binding, Folder, Project>): ReactNode {
  const main = slots.renderMain({
    children: createElement(
      Fragment,
      null,
      slots.renderUploadInput({ controller }),
      slots.renderToolbar({ controller }),
      slots.renderContent({ controller, agentReferenceActions }),
      slots.renderPager({ controller }),
    ),
  })
  return slots.renderLayout({
    variant,
    children: createElement(Fragment, null, main, slots.renderDialogs({ controller })),
  })
}

export function useResourceLibraryBrowserController<
  Resource extends ResourceLibraryOwnedResource,
  Binding extends ResourceLibraryProjectBinding<Resource>,
  Folder,
  Project extends ResourceLibraryProject,
>({
  adapter,
  currentOrgID,
  currentUser,
  currentProject,
  downloadResource,
  notify,
  messages,
  onResourceLibraryChanged,
  onResourceBindingChanged,
  projectScopeEnabled = true,
  initialSearch,
  initialType,
  initialScope,
  focusResourceId,
}: ResourceLibraryBrowserControllerInput<Resource, Binding, Folder, Project>) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [scope, setScope] = useState<ResourceLibraryScopeFilter>(() => {
    const initial = resourceScopeFilterFromParam(initialScope)
    return !projectScopeEnabled && initial === 'project' ? 'all' : initial
  })
  const [filter, setFilter] = useState<ResourceLibraryTypeFilter>(() => resourceTypeFilterFromParam(initialType))
  const [search, setSearch] = useState(initialSearch ?? '')
  const [moveResource, setMoveResource] = useState<Resource | null>(null)
  const [renameResource, setRenameResource] = useState<Resource | null>(null)
  const [clipResource, setClipResource] = useState<Resource | null>(null)
  const [previewResource, setPreviewResource] = useState<Resource | null>(null)
  const [selectedResourceIDs, setSelectedResourceIDs] = useState<Set<number>>(() => new Set())
  const [contextMenu, setContextMenu] = useState<{ position: ResourceClientPoint; resources: Resource[] } | null>(null)
  const [shareProjectResources, setShareProjectResources] = useState<Resource[] | null>(null)
  const [viewMode, setViewMode] = useState<ResourceLibraryViewMode>('grid')
  const [selectionMode, setSelectionMode] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_RESOURCE_LIBRARY_PAGE_SIZE)

  useEffect(() => {
    const nextScope = resourceScopeFilterFromParam(initialScope)
    setScope(!projectScopeEnabled && nextScope === 'project' ? 'all' : nextScope)
    setFilter(resourceTypeFilterFromParam(initialType))
    setSearch(initialSearch ?? '')
    setPage(1)
    setSelectedResourceIDs(new Set())
  }, [initialScope, initialSearch, initialType, projectScopeEnabled])

  useEffect(() => {
    if ((scope === 'team' && !currentOrgID) || (scope === 'project' && (!projectScopeEnabled || !currentProject?.ID))) {
      setScope('all')
      setPage(1)
      setSelectedResourceIDs(new Set())
      setSelectionMode(false)
    }
  }, [scope, currentOrgID, currentProject?.ID, projectScopeEnabled])

  const { data: myFolders = [] } = useQuery<Folder[]>({
    queryKey: resourceFolderKeys.mine,
    queryFn: () => adapter.listResourceFolders(),
  })

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: resourceShareTargetKeys.projects,
    queryFn: () => adapter.listShareTargetProjects(),
  })

  const isProjectScope = scope === 'project'

  const { data: resourcesData, isLoading: isResourceLoading } = useQuery<ResourceLibraryPage<Resource>>({
    queryKey: resourceKeys.libraryPage({ scope, filter, search, page, pageSize }),
    queryFn: () => adapter.listResources({ scope, filter, search, page, pageSize }),
    enabled: !isProjectScope,
  })

  const { data: projectBindings = [], isLoading: isProjectResourcesLoading } = useQuery<Binding[]>({
    queryKey: resourceBindingKeys.projectLibraryScope(currentProject?.ID),
    queryFn: () => adapter.listProjectResourceBindings(currentProject!.ID),
    enabled: isProjectScope && Boolean(currentProject?.ID),
  })

  const { data: focusedResource } = useQuery<Resource>({
    queryKey: resourceKeys.detail(focusResourceId),
    queryFn: () => adapter.getResource(focusResourceId!),
    enabled: focusResourceId !== undefined,
  })

  const projectResources: Resource[] = isProjectScope ? projectScopeResources(projectBindings, filter, search) : []
  const projectBindingByResourceID = useMemo(() => {
    const map = new Map<number, number>()
    projectBindings.forEach((binding: Binding) => {
      if (binding.resource_id && binding.ID) map.set(binding.resource_id, binding.ID)
    })
    return map
  }, [projectBindings])
  const resources: Resource[] = isProjectScope ? paginateResources(projectResources, page, pageSize) : resourcesData?.items ?? []
  const total = isProjectScope ? projectResources.length : resourcesData?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const isLoading = isProjectScope ? isProjectResourcesLoading : isResourceLoading

  useEffect(() => {
    setPage(current => Math.min(current, pageCount))
  }, [pageCount])

  useEffect(() => {
    if (!focusedResource) return
    setPreviewResource(current => current?.ID === focusedResource.ID ? current : focusedResource)
  }, [focusedResource])

  const upload = useMutation<Resource, Error, File>({
    mutationFn: (file: File) => adapter.uploadResource(file),
    onSuccess: (created: Resource) => onResourceLibraryChanged?.({ changedIds: [created.ID] }),
  })

  const remove = useMutation<unknown, Error, number>({
    mutationFn: (id: number) => adapter.removeResource(id),
    onSuccess: (_: unknown, id: number) => {
      setSelectedResourceIDs(current => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
      onResourceLibraryChanged?.({ changedIds: [id] })
    },
  })

  const adoptToTeam = useMutation<unknown, Error, number[]>({
    mutationFn: (ids: number[]) => adapter.adoptResourcesToTeam(ids),
    onSuccess: (_: unknown, ids: number[]) => {
      setContextMenu(null)
      setSelectedResourceIDs(new Set())
      onResourceLibraryChanged?.({ changedIds: ids })
      notify?.success(messages?.sharedToTeamSuccess ?? 'Shared to team library')
    },
  })

  const shareToProject = useMutation<unknown, Error, { projectID: number; ids: number[] }>({
    mutationFn: ({ projectID, ids }: { projectID: number; ids: number[] }) => adapter.shareResourcesToProject({ projectId: projectID, resourceIds: ids }),
    onSuccess: (_: unknown, { projectID, ids }: { projectID: number; ids: number[] }) => {
      setContextMenu(null)
      setShareProjectResources(null)
      setSelectedResourceIDs(new Set())
      onResourceLibraryChanged?.({ changedIds: ids })
      onResourceBindingChanged?.({ projectId: projectID, changedIds: ids })
      notify?.success(messages?.sharedToProjectSuccess ?? 'Shared to project')
    },
  })

  const revoke = useMutation<unknown, Error, number>({
    mutationFn: (bindingID: number) => adapter.revokeProjectResourceBinding(bindingID),
    onSuccess: (_: unknown, bindingID: number) => {
      setContextMenu(null)
      setSelectedResourceIDs(new Set())
      onResourceBindingChanged?.({ projectId: currentProject?.ID, changedIds: [bindingID] })
      notify?.success(messages?.revokedFromProjectSuccess ?? 'Removed project reference')
    },
  })

  const certifyProviderAsset = useMutation<{ resource: Resource; updated?: Resource }, Error, Resource>({
    mutationFn: (resource: Resource) => adapter.certifyProviderAsset(resource),
    onSuccess: ({ resource, updated }: { resource: Resource; updated?: Resource }) => {
      onResourceLibraryChanged?.({ changedIds: [updated?.ID ?? resource.ID] })
      notify?.success(messages?.providerAssetCertified ?? 'Provider asset certified')
    },
    onError: () => {
      notify?.error(messages?.providerAssetCertifyFailed ?? 'Provider asset certification failed')
    },
  })

  const visible = resources
  const visibleImageResources = visible.filter((resource: Resource) => resource.type === 'image')
  const selectedResources = visible.filter((resource: Resource) => selectedResourceIDs.has(resource.ID))
  const selectedIDs = resourceIDs(selectedResources)
  const selectedProjectBindingIDs = selectedIDs
    .map(id => projectBindingByResourceID.get(id))
    .filter((id): id is number => Boolean(id))
  const selectedPersonalStagingResources = selectedResources.filter(canAdoptToTeam)

  useEffect(() => {
    setSelectedResourceIDs(current => {
      const visibleIDs = new Set(visible.map((resource: Resource) => resource.ID))
      const next = new Set(Array.from(current).filter(id => visibleIDs.has(id)))
      return next.size === current.size ? current : next
    })
  }, [visible])

  function setResourceSelected(resource: Resource, selected: boolean) {
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
    if (tab === 'project' && !projectScopeEnabled) return
    setScope(tab === 'mine' ? 'personal' : tab)
    setPage(1)
    setSelectedResourceIDs(new Set())
  }

  function setScopeFilter(nextScope: ResourceLibraryScopeFilter) {
    if (nextScope === 'project' && !projectScopeEnabled) return
    setScope(nextScope)
    setPage(1)
    setSelectedResourceIDs(new Set())
  }

  function setTypeFilter(nextFilter: ResourceLibraryTypeFilter) {
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

  function contextMenuResources(resource: Resource) {
    if (selectedResourceIDs.has(resource.ID)) {
      const selected = visible.filter((item: Resource) => selectedResourceIDs.has(item.ID))
      return selected.length > 0 ? selected : [resource]
    }
    return [resource]
  }

  function openResourceContextMenu(event: MouseEvent, resource: Resource) {
    event.preventDefault()
    setContextMenu({
      position: resourceContextMenuPositionFromEvent(event, resourceViewportBoundaryFromWindow(window)),
      resources: contextMenuResources(resource),
    })
  }

  function handleResourceRowDragStart(event: DragEvent<HTMLDivElement>, resource: Resource) {
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

  function shareResourcesToTeam(resourcesToShare: Resource[]) {
    const ids = resourceIDs(resourcesToShare.filter(canAdoptToTeam))
    if (ids.length === 0) return
    adoptToTeam.mutate(ids)
  }

  function openShareToProject(resourcesToShare: Resource[]) {
    if (!projectScopeEnabled) return
    if (resourcesToShare.length === 0) return
    setContextMenu(null)
    setShareProjectResources(resourcesToShare)
  }

  function revokeSelectedProjectBindings() {
    selectedProjectBindingIDs.forEach(id => revoke.mutate(id))
  }

  function canAdoptToTeam(resource: Resource) {
    return Boolean(currentOrgID && currentUser?.ID && resource.owner_id === currentUser.ID && !resource.org_id)
  }

  function uploadFiles(files: FileList | null) {
    if (!files) return
    Array.from(files).forEach(file => upload.mutate(file))
  }

  function clipCreated(created: Resource) {
    onResourceLibraryChanged?.({ changedIds: [created.ID] })
    setClipResource(null)
    queryClient.invalidateQueries({ queryKey: resourceKeys.detail(created.ID) })
  }

  return {
    adoptToTeam,
    canAdoptToTeam,
    clearSelection,
    certifyProviderAsset,
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
    projectScopeEnabled,
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
