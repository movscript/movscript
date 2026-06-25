export type JobMonitorFilters = {
  jobId: string
  status: string
  jobType: string
  featureKey: string
  modelId: string
  userId: string
  orgId: string
  projectId: string
}

export type DebugTab = 'system' | 'llm-calls' | 'provider-sandbox' | 'raw-call' | 'jobs'

export const DEBUG_TABS: DebugTab[] = ['system', 'llm-calls', 'provider-sandbox', 'raw-call', 'jobs']

export const emptyJobMonitorFilters: JobMonitorFilters = {
  jobId: '',
  status: '',
  jobType: '',
  featureKey: '',
  modelId: '',
  userId: '',
  orgId: '',
  projectId: '',
}

const JOB_FILTER_QUERY_KEYS = [
  'job_id',
  'status',
  'job_type',
  'feature_key',
  'model_id',
  'user_id',
  'org_id',
  'project_id',
  'page',
]

export function hasJobFilterSearchParams(params: URLSearchParams): boolean {
  return JOB_FILTER_QUERY_KEYS.some((key) => params.has(key))
}

export function debugTabFromSearchParams(params: URLSearchParams): DebugTab {
  const tab = params.get('tab')
  if (tab && DEBUG_TABS.includes(tab as DebugTab)) return tab as DebugTab
  return hasJobFilterSearchParams(params) ? 'jobs' : 'system'
}

export function jobMonitorPageFromSearchParams(params: URLSearchParams): number {
  const page = Number(params.get('page') || '1')
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

export function jobFiltersFromSearchParams(params: URLSearchParams): JobMonitorFilters {
  return {
    jobId: params.get('job_id') ?? '',
    status: params.get('status') ?? '',
    jobType: params.get('job_type') ?? '',
    featureKey: params.get('feature_key') ?? '',
    modelId: params.get('model_id') ?? '',
    userId: params.get('user_id') ?? '',
    orgId: params.get('org_id') ?? '',
    projectId: params.get('project_id') ?? '',
  }
}

export function jobSearchParams(filters: JobMonitorFilters, page: number): URLSearchParams {
  const params = new URLSearchParams()
  const pairs: Array<[string, string]> = [
    ['job_id', filters.jobId.trim()],
    ['status', filters.status],
    ['job_type', filters.jobType.trim()],
    ['feature_key', filters.featureKey.trim()],
    ['model_id', filters.modelId.trim()],
    ['user_id', filters.userId.trim()],
    ['org_id', filters.orgId.trim()],
    ['project_id', filters.projectId.trim()],
  ]
  for (const [key, value] of pairs) {
    if (value) params.set(key, value)
  }
  if (page > 1) params.set('page', String(page))
  return params
}

export function jobUrlSearchParams(filters: JobMonitorFilters, page: number): URLSearchParams {
  const params = jobSearchParams(filters, page)
  params.set('tab', 'jobs')
  return params
}
