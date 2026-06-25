export type OrgListFilters = {
  query: string
  orgId: string
  plan: string
  status: string
  isPersonal: string
}

export type OrgListHrefValue = string | number | boolean | null | undefined

export type OrgListHrefFilters = {
  [Key in keyof OrgListFilters]?: OrgListHrefValue
}

export const emptyOrgListFilters: OrgListFilters = {
  query: '',
  orgId: '',
  plan: '',
  status: '',
  isPersonal: '',
}

export function orgPageFromSearchParams(params: URLSearchParams): number {
  const page = Number(params.get('page') || '1')
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

export function orgFiltersFromSearchParams(params: URLSearchParams): OrgListFilters {
  return {
    query: params.get('q') ?? '',
    orgId: params.get('org_id') ?? '',
    plan: params.get('plan') ?? '',
    status: params.get('status') ?? '',
    isPersonal: params.get('is_personal') ?? '',
  }
}

export function orgSearchParams(filters: OrgListFilters, page: number): URLSearchParams {
  const params = new URLSearchParams()
  const pairs: Array<[string, string]> = [
    ['q', filters.query.trim()],
    ['org_id', filters.orgId.trim()],
    ['plan', filters.plan.trim()],
    ['status', filters.status.trim()],
    ['is_personal', filters.isPersonal.trim()],
  ]
  for (const [key, value] of pairs) {
    if (value) params.set(key, value)
  }
  if (page > 1) params.set('page', String(page))
  return params
}

export function orgListHref(filters: OrgListHrefFilters = {}, page = 1): string {
  const params = orgSearchParams({
    query: hrefValue(filters.query),
    orgId: hrefValue(filters.orgId),
    plan: hrefValue(filters.plan),
    status: hrefValue(filters.status),
    isPersonal: hrefValue(filters.isPersonal),
  }, page)
  const query = params.toString()
  return query ? `/orgs?${query}` : '/orgs'
}

function hrefValue(value: OrgListHrefValue): string {
  if (value === null || value === undefined) return ''
  return String(value)
}
