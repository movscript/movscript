export type ResourceListFilters = {
  q: string
  type: string
  storageBackend: string
  userId: string
  orgId: string
}

export type ResourceListHrefValue = string | number | null | undefined

export type ResourceListHrefFilters = {
  [Key in keyof ResourceListFilters]?: ResourceListHrefValue
}

export const emptyResourceListFilters: ResourceListFilters = {
  q: '',
  type: '',
  storageBackend: '',
  userId: '',
  orgId: '',
}

export function resourcePageFromSearchParams(params: URLSearchParams): number {
  const page = Number(params.get('page') || '1')
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

export function resourceFiltersFromSearchParams(params: URLSearchParams): ResourceListFilters {
  return {
    q: params.get('q') ?? '',
    type: params.get('type') ?? '',
    storageBackend: params.get('storage_backend') ?? '',
    userId: params.get('user_id') ?? '',
    orgId: params.get('org_id') ?? '',
  }
}

export function resourceSearchParams(filters: ResourceListFilters, page: number): URLSearchParams {
  const params = new URLSearchParams()
  const pairs: Array<[string, string]> = [
    ['q', filters.q.trim()],
    ['type', filters.type.trim()],
    ['storage_backend', filters.storageBackend.trim()],
    ['user_id', filters.userId.trim()],
    ['org_id', filters.orgId.trim()],
  ]
  for (const [key, value] of pairs) {
    if (value) params.set(key, value)
  }
  if (page > 1) params.set('page', String(page))
  return params
}

export function resourceListHref(filters: ResourceListHrefFilters = {}, page = 1): string {
  const params = resourceSearchParams({
    q: hrefValue(filters.q),
    type: hrefValue(filters.type),
    storageBackend: hrefValue(filters.storageBackend),
    userId: hrefValue(filters.userId),
    orgId: hrefValue(filters.orgId),
  }, page)
  const query = params.toString()
  return query ? `/storage?${query}` : '/storage'
}

function hrefValue(value: ResourceListHrefValue): string {
  if (value === null || value === undefined) return ''
  return String(value)
}
