export type ProjectListFilters = {
  query: string
  projectId: string
  status: string
  ownerId: string
  orgId: string
}

export type ProjectListHrefValue = string | number | null | undefined

export type ProjectListHrefFilters = {
  [Key in keyof ProjectListFilters]?: ProjectListHrefValue
}

export const emptyProjectListFilters: ProjectListFilters = {
  query: '',
  projectId: '',
  status: '',
  ownerId: '',
  orgId: '',
}

export function projectPageFromSearchParams(params: URLSearchParams): number {
  const page = Number(params.get('page') || '1')
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

export function projectFiltersFromSearchParams(params: URLSearchParams): ProjectListFilters {
  return {
    query: params.get('q') ?? '',
    projectId: params.get('project_id') ?? '',
    status: params.get('status') ?? '',
    ownerId: params.get('owner_id') ?? '',
    orgId: params.get('org_id') ?? '',
  }
}

export function projectSearchParams(filters: ProjectListFilters, page: number): URLSearchParams {
  const params = new URLSearchParams()
  const pairs: Array<[string, string]> = [
    ['q', filters.query.trim()],
    ['project_id', filters.projectId.trim()],
    ['status', filters.status.trim()],
    ['owner_id', filters.ownerId.trim()],
    ['org_id', filters.orgId.trim()],
  ]
  for (const [key, value] of pairs) {
    if (value) params.set(key, value)
  }
  if (page > 1) params.set('page', String(page))
  return params
}

export function projectListHref(filters: ProjectListHrefFilters = {}, page = 1): string {
  const params = projectSearchParams({
    query: hrefValue(filters.query),
    projectId: hrefValue(filters.projectId),
    status: hrefValue(filters.status),
    ownerId: hrefValue(filters.ownerId),
    orgId: hrefValue(filters.orgId),
  }, page)
  const query = params.toString()
  return query ? `/projects?${query}` : '/projects'
}

function hrefValue(value: ProjectListHrefValue): string {
  if (value === null || value === undefined) return ''
  return String(value)
}
