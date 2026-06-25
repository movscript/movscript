export type AgentSurfaceSnapshot = {
  schema: 'movscript.agent_surface_snapshot.v1'
  status: 'ok' | 'error'
  surface: string
  generated_at: string
  target: Record<string, unknown>
  data?: Record<string, unknown>
  error?: string
}

export type AgentSurfaceParamValue = string | number
export type AgentSurfaceParams = Record<string, AgentSurfaceParamValue>

export type AgentSurfaceHTTPClient = {
  get<T>(url: string, config?: { params?: AgentSurfaceParams }): Promise<{ data: T }>
  post<T>(url: string, body: Record<string, unknown>, config?: { params?: AgentSurfaceParams }): Promise<{ data: T }>
}

export type AgentSurfaceQueryClient = {
  invalidateQueries(input: { predicate: (query: { queryKey: unknown }) => boolean }): unknown
}

export function agentSurfaceParams(params: URLSearchParams, extra: Record<string, string | number | undefined> = {}): AgentSurfaceParams {
  const output: AgentSurfaceParams = {}
  for (const [key, value] of params.entries()) {
    if (key === 'mcpApiBaseURL') continue
    if (value.trim()) output[key] = value
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && String(value).trim()) output[key] = value
  }
  return output
}

export function createAgentSurfaceDataAdapter(client: AgentSurfaceHTTPClient) {
  return {
    fetchAgentSurfaceSnapshot(surface: string, params: AgentSurfaceParams): Promise<AgentSurfaceSnapshot> {
      return fetchAgentSurfaceSnapshot(client, surface, params)
    },
    postAgentSurfaceAction(
      surface: string,
      action: string,
      params: AgentSurfaceParams,
      body: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
      return postAgentSurfaceAction(client, surface, action, params, body)
    },
  }
}

export async function fetchAgentSurfaceSnapshot(
  client: AgentSurfaceHTTPClient,
  surface: string,
  params: AgentSurfaceParams,
): Promise<AgentSurfaceSnapshot> {
  const response = await client.get<AgentSurfaceSnapshot>(`/agent/surfaces/${surface}`, { params })
  return response.data
}

export async function postAgentSurfaceAction(
  client: AgentSurfaceHTTPClient,
  surface: string,
  action: string,
  params: AgentSurfaceParams,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await client.post<Record<string, unknown>>(`/agent/surfaces/${surface}/${action}`, body, { params })
  return response.data
}

export function invalidateAgentSurfaceQueries(queryClient: AgentSurfaceQueryClient, surfaces: string[]): void {
  for (const surface of surfaces) {
    void queryClient.invalidateQueries({
      predicate: (query) => Array.isArray(query.queryKey)
        && query.queryKey[0] === 'agent-surface'
        && query.queryKey[1] === surface,
    })
  }
}

export function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return undefined
}

export function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

export * from './features/content/application/contentCanvasMutationInvalidation.js'
export * from './features/content/application/contentCanvasQueryKeys.js'
export * from './features/content/integrations/contentSourceWorkspaceElectron.js'
export * from './features/content/integrations/sourceWorkspaceTypes.js'
export * from './features/project/application/localProjectLifecycle.js'
export * from './features/project/application/projectGitWorkspace.js'
export * from './features/project/application/projectMutationInvalidation.js'
export * from './features/project/application/projectQueries.js'
export * from './features/project/domain/projectEntryRegistry.js'
export * from './features/project-standards/domain/projectStandardsWorkspaceWorkspace.js'
export * from './features/scripts/application/scriptMutationInvalidation.js'
export * from './features/scripts/application/scriptQueryKeys.js'
export * from './features/scripts/application/scriptWorkspaceRepository.js'
