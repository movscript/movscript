export type UserListFilters = {
  query: string
  userId: string
  systemRole: string
  status: string
}

export type UserListHrefValue = string | number | null | undefined

export type UserListHrefFilters = {
  [Key in keyof UserListFilters]?: UserListHrefValue
}

export const emptyUserListFilters: UserListFilters = {
  query: '',
  userId: '',
  systemRole: '',
  status: '',
}

export function userPageFromSearchParams(params: URLSearchParams): number {
  const page = Number(params.get('page') || '1')
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

export function userFiltersFromSearchParams(params: URLSearchParams): UserListFilters {
  return {
    query: params.get('q') ?? '',
    userId: params.get('user_id') ?? '',
    systemRole: params.get('system_role') ?? '',
    status: params.get('status') ?? '',
  }
}

export function userSearchParams(filters: UserListFilters, page: number): URLSearchParams {
  const params = new URLSearchParams()
  const pairs: Array<[string, string]> = [
    ['q', filters.query.trim()],
    ['user_id', filters.userId.trim()],
    ['system_role', filters.systemRole.trim()],
    ['status', filters.status.trim()],
  ]
  for (const [key, value] of pairs) {
    if (value) params.set(key, value)
  }
  if (page > 1) params.set('page', String(page))
  return params
}

export function userListHref(filters: UserListHrefFilters = {}, page = 1): string {
  const params = userSearchParams({
    query: hrefValue(filters.query),
    userId: hrefValue(filters.userId),
    systemRole: hrefValue(filters.systemRole),
    status: hrefValue(filters.status),
  }, page)
  const query = params.toString()
  return query ? `/user-management?${query}` : '/user-management'
}

function hrefValue(value: UserListHrefValue): string {
  if (value === null || value === undefined) return ''
  return String(value)
}
