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
  gatewayApiKeyId: string
  since: string
  until: string
}

export type AdminLogHrefValue = string | number | null | undefined

export type AuditLogHrefFilters = {
  [Key in keyof AuditLogFilters]?: AdminLogHrefValue
}

export type UsageLogHrefFilters = {
  [Key in keyof UsageFilters]?: AdminLogHrefValue
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
  gatewayApiKeyId: '',
  since: '',
  until: '',
}

export function dateToQueryInput(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function relativePastDateInput(days: number, now = new Date()): string {
  const date = new Date(now)
  date.setDate(date.getDate() - days)
  return dateToQueryInput(date)
}

export function queryDateToInput(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return dateToQueryInput(date)
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
    gatewayApiKeyId: params.get('gateway_api_key_id') ?? '',
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
    ['gateway_api_key_id', filters.gatewayApiKeyId.trim()],
    ['since', filters.since],
    ['until', filters.until],
  ], page)
}

export function auditLogsHref(filters: AuditLogHrefFilters = {}, page = 1): string {
  const params = auditSearchParams({
    actorId: hrefValue(filters.actorId),
    action: hrefValue(filters.action),
    targetType: hrefValue(filters.targetType),
    targetId: hrefValue(filters.targetId),
    orgId: hrefValue(filters.orgId),
    projectId: hrefValue(filters.projectId),
    since: hrefValue(filters.since),
    until: hrefValue(filters.until),
  }, page)
  return logHref('/audit-logs', params)
}

export function usageLogsHref(filters: UsageLogHrefFilters = {}, page = 1): string {
  const params = usageSearchParams({
    providerId: hrefValue(filters.providerId),
    modelConfigId: hrefValue(filters.modelConfigId),
    operationType: hrefValue(filters.operationType),
    userId: hrefValue(filters.userId),
    orgId: hrefValue(filters.orgId),
    projectId: hrefValue(filters.projectId),
    gatewayApiKeyId: hrefValue(filters.gatewayApiKeyId),
    since: hrefValue(filters.since),
    until: hrefValue(filters.until),
  }, page)
  return logHref('/usage-logs', params)
}

function searchParamsFromPairs(pairs: Array<[string, string]>, page: number): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of pairs) {
    if (value) params.set(key, value)
  }
  if (page > 1) params.set('page', String(page))
  return params
}

function hrefValue(value: AdminLogHrefValue): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function logHref(path: string, params: URLSearchParams): string {
  const query = params.toString()
  return query ? `${path}?${query}` : path
}
