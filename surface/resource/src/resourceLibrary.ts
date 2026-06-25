export type ResourceLibraryTypeFilter = 'all' | 'image' | 'video' | 'audio' | 'text'
export type ResourceLibraryScopeFilter = 'all' | 'personal' | 'team' | 'project'

export type ResourceLibraryResource = {
  ID: number
  name: string
  type: string
}

export type ResourceLibraryBinding<Resource extends ResourceLibraryResource = ResourceLibraryResource> = {
  resource?: Resource | null
}

export interface ResourceLibraryViewProps {
  variant?: 'page' | 'pane'
  initialSearch?: string
  initialType?: string
  initialScope?: string
  focusResourceId?: number
  agentReferenceActions?: boolean
}

export const RESOURCE_LIBRARY_TYPE_TABS: { labelKey: string; value: ResourceLibraryTypeFilter }[] = [
  { labelKey: 'common.all', value: 'all' },
  { labelKey: 'pages.resources.types.image', value: 'image' },
  { labelKey: 'pages.resources.types.video', value: 'video' },
  { labelKey: 'pages.resources.types.audio', value: 'audio' },
  { labelKey: 'pages.resources.types.text', value: 'text' },
]

export const RESOURCE_LIBRARY_SCOPE_TABS: { labelKey: string; value: ResourceLibraryScopeFilter; requiresProject?: boolean }[] = [
  { labelKey: 'pages.resources.scopes.all', value: 'all' },
  { labelKey: 'pages.resources.scopes.personal', value: 'personal' },
  { labelKey: 'pages.resources.scopes.team', value: 'team' },
  { labelKey: 'pages.resources.scopes.project', value: 'project', requiresProject: true },
]

export const RESOURCE_LIBRARY_PAGE_SIZE_OPTIONS = [12, 30, 60, 120]
export const DEFAULT_RESOURCE_LIBRARY_PAGE_SIZE = 30

export function resourceIDs<Resource extends Pick<ResourceLibraryResource, 'ID'>>(resources: Resource[]): number[] {
  return Array.from(new Set(resources.map(resource => resource.ID).filter(id => Number.isFinite(id) && id > 0)))
}

export function adjacentResource<Resource extends Pick<ResourceLibraryResource, 'ID'>>(resources: Resource[], current: Resource, direction: -1 | 1): Resource {
  const currentIndex = resources.findIndex(resource => resource.ID === current.ID)
  if (currentIndex < 0) return current
  return resources[(currentIndex + direction + resources.length) % resources.length] ?? current
}

export function projectScopeResources<Resource extends ResourceLibraryResource>(
  bindings: Array<ResourceLibraryBinding<Resource>>,
  filter: ResourceLibraryTypeFilter,
  query: string,
): Resource[] {
  const seen = new Set<number>()
  const keyword = query.trim().toLowerCase()
  return bindings
    .map(binding => binding.resource)
    .filter((resource): resource is Resource => Boolean(resource))
    .filter(resource => {
      if (seen.has(resource.ID)) return false
      seen.add(resource.ID)
      if (filter !== 'all' && resource.type !== filter) return false
      if (keyword && !resource.name.toLowerCase().includes(keyword)) return false
      return true
    })
}

export function paginateResources<Resource>(resources: Resource[], page: number, pageSize: number): Resource[] {
  const start = (page - 1) * pageSize
  return resources.slice(start, start + pageSize)
}

export function resourceScopeFilterFromParam(value: string | undefined): ResourceLibraryScopeFilter {
  if (value === 'mine') return 'personal'
  if (value === 'personal' || value === 'team' || value === 'project' || value === 'all') return value
  return 'all'
}

export function resourceTypeFilterFromParam(value: string | undefined): ResourceLibraryTypeFilter {
  if (value === 'image' || value === 'video' || value === 'audio' || value === 'text' || value === 'all') return value
  return 'all'
}
