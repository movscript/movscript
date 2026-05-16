export type AuditLogFilters = {
  actorId: string
  action: string
  targetType: string
  targetId: string
  orgId: string
  projectId: string
  since: string
  until: string
}

export type UsageFilters = {
  providerId: string
  modelConfigId: string
  operationType: string
  userId: string
  orgId: string
  projectId: string
  since: string
  until: string
}

export const emptyAuditLogFilters: AuditLogFilters = {
  actorId: '',
  action: '',
  targetType: '',
  targetId: '',
  orgId: '',
  projectId: '',
  since: '',
  until: '',
}

export const emptyUsageFilters: UsageFilters = {
  providerId: '',
  modelConfigId: '',
  operationType: '',
  userId: '',
  orgId: '',
  projectId: '',
  since: '',
  until: '',
}

export function queryDateToInput(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function pageFromSearchParams(params: URLSearchParams): number {
  const page = Number(params.get('page') || '1')
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

export function auditFiltersFromSearchParams(params: URLSearchParams): AuditLogFilters {
  return {
    actorId: params.get('actor_id') ?? '',
    action: params.get('action') ?? '',
    targetType: params.get('target_type') ?? '',
    targetId: params.get('target_id') ?? '',
    orgId: params.get('org_id') ?? '',
    projectId: params.get('project_id') ?? '',
    since: queryDateToInput(params.get('since') ?? ''),
    until: queryDateToInput(params.get('until') ?? ''),
  }
}

export function auditSearchParams(filters: AuditLogFilters, page: number): URLSearchParams {
  return searchParamsFromPairs([
    ['actor_id', filters.actorId.trim()],
    ['action', filters.action.trim()],
    ['target_type', filters.targetType.trim()],
    ['target_id', filters.targetId.trim()],
    ['org_id', filters.orgId.trim()],
    ['project_id', filters.projectId.trim()],
    ['since', filters.since],
    ['until', filters.until],
  ], page)
}

export function usageFiltersFromSearchParams(params: URLSearchParams): UsageFilters {
  return {
    providerId: params.get('provider_id') ?? '',
    modelConfigId: params.get('model_config_id') ?? '',
    operationType: params.get('operation_type') ?? '',
    userId: params.get('user_id') ?? '',
    orgId: params.get('org_id') ?? '',
    projectId: params.get('project_id') ?? '',
    since: queryDateToInput(params.get('since') ?? ''),
    until: queryDateToInput(params.get('until') ?? ''),
  }
}

export function usageSearchParams(filters: UsageFilters, page: number): URLSearchParams {
  return searchParamsFromPairs([
    ['provider_id', filters.providerId],
    ['model_config_id', filters.modelConfigId],
    ['operation_type', filters.operationType],
    ['user_id', filters.userId.trim()],
    ['org_id', filters.orgId.trim()],
    ['project_id', filters.projectId.trim()],
    ['since', filters.since],
    ['until', filters.until],
  ], page)
}

function searchParamsFromPairs(pairs: Array<[string, string]>, page: number): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of pairs) {
    if (value) params.set(key, value)
  }
  if (page > 1) params.set('page', String(page))
  return params
}
