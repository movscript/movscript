import type { RawResource, ResourceBinding } from '@/types'

export type TypeFilter = 'all' | 'image' | 'video' | 'audio' | 'text'
export type ResourceScopeFilter = 'all' | 'personal' | 'team' | 'project'

export const TYPE_TABS: { labelKey: string; value: TypeFilter }[] = [
  { labelKey: 'common.all', value: 'all' },
  { labelKey: 'pages.resources.types.image', value: 'image' },
  { labelKey: 'pages.resources.types.video', value: 'video' },
  { labelKey: 'pages.resources.types.audio', value: 'audio' },
  { labelKey: 'pages.resources.types.text', value: 'text' },
]

export const SCOPE_TABS: { labelKey: string; value: ResourceScopeFilter; requiresProject?: boolean }[] = [
  { labelKey: 'pages.resources.scopes.all', value: 'all' },
  { labelKey: 'pages.resources.scopes.personal', value: 'personal' },
  { labelKey: 'pages.resources.scopes.team', value: 'team' },
  { labelKey: 'pages.resources.scopes.project', value: 'project', requiresProject: true },
]

export const RESOURCE_PAGE_SIZE_OPTIONS = [12, 30, 60, 120]
export const DEFAULT_RESOURCE_PAGE_SIZE = 30

export function resourceIDs(resources: RawResource[]) {
  return Array.from(new Set(resources.map(resource => resource.ID).filter(id => Number.isFinite(id) && id > 0)))
}

export function adjacentResource(resources: RawResource[], current: RawResource, direction: -1 | 1) {
  const currentIndex = resources.findIndex(resource => resource.ID === current.ID)
  if (currentIndex < 0) return current
  return resources[(currentIndex + direction + resources.length) % resources.length]
}

export function projectScopeResources(bindings: ResourceBinding[], filter: TypeFilter, query: string) {
  const seen = new Set<number>()
  const keyword = query.trim().toLowerCase()
  return bindings
    .map(binding => binding.resource)
    .filter((resource): resource is RawResource => Boolean(resource))
    .filter(resource => {
      if (seen.has(resource.ID)) return false
      seen.add(resource.ID)
      if (filter !== 'all' && resource.type !== filter) return false
      if (keyword && !resource.name.toLowerCase().includes(keyword)) return false
      return true
    })
}

export function paginateResources(resources: RawResource[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize
  return resources.slice(start, start + pageSize)
}
