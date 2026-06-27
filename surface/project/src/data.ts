import {
  normalizeDomainFocus,
  type MovScriptNormalizedFocus,
} from '@movscript/domain'

export type AgentSurfaceSnapshot = {
  schema: 'movscript.agent_surface_snapshot.v1'
  status: 'ok' | 'error'
  surface: string
  generated_at: string
  target: Record<string, unknown> & { domain_focus?: MovScriptNormalizedFocus }
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
  addLegacyFocusParams(output)
  return output
}

export function agentSurfaceDomainFocus(
  params: URLSearchParams | Record<string, unknown>,
  extra: Record<string, string | number | undefined> = {},
): MovScriptNormalizedFocus {
  return normalizeDomainFocus({
    ...recordFromParams(params),
    ...compactParamRecord(extra),
  })
}

export function agentSurfaceSnapshotDomainFocus(snapshot?: AgentSurfaceSnapshot): MovScriptNormalizedFocus | undefined {
  const focus = recordValue(snapshot?.target?.domain_focus)
  if (!focus) return undefined
  return {
    ...(stringValue(focus.projectId) ? { projectId: stringValue(focus.projectId) } : {}),
    ...(recordValue(focus.target) ? { target: recordValue(focus.target) as MovScriptNormalizedFocus['target'] } : {}),
    ...(recordValue(focus.scope) ? { scope: recordValue(focus.scope) as MovScriptNormalizedFocus['scope'] } : {}),
    ...(recordValue(focus.entity) ? { entity: recordValue(focus.entity) as MovScriptNormalizedFocus['entity'] } : {}),
    diagnostics: arrayValue(focus.diagnostics) as MovScriptNormalizedFocus['diagnostics'],
  }
}

export function agentSurfaceFocusLabel(focus: MovScriptNormalizedFocus | undefined, fallback = ''): string {
  if (!focus) return fallback
  if (focus.scope?.kind && focus.scope.ref) return `${focus.scope.kind}: ${focus.scope.ref}`
  if (focus.target?.targetKind && focus.target.targetRef) return `${focus.target.targetKind}: ${focus.target.targetRef}`
  if (focus.target?.targetKind) return focus.target.targetKind
  if (focus.entity?.kind && focus.entity.id !== undefined) return `${focus.entity.kind}: ${focus.entity.id}`
  if (focus.projectId) return `project: ${focus.projectId}`
  return fallback
}

export function agentSurfaceFocusChips(focus: MovScriptNormalizedFocus | undefined): string[] {
  if (!focus) return []
  return [
    focus.projectId ? `project: ${focus.projectId}` : undefined,
    focus.scope?.kind && focus.scope.ref ? `scope: ${focus.scope.kind}:${focus.scope.ref}` : undefined,
    focus.target?.targetCategory && focus.target.targetKind ? `target: ${[
      focus.target.targetCategory,
      focus.target.targetKind,
      focus.target.targetRef,
    ].filter(Boolean).join(':')}` : undefined,
  ].filter((value): value is string => Boolean(value))
}

export function agentSurfaceLegacyProductionId(
  focus: MovScriptNormalizedFocus | undefined,
  fallback?: string | number,
): string | undefined {
  if (fallback !== undefined && String(fallback).trim()) return String(fallback)
  return focus?.scope?.kind === 'production' && focus.scope.ref ? focus.scope.ref : undefined
}

export function agentSurfaceHasTimelineFocus(
  focus: MovScriptNormalizedFocus | undefined,
  legacyProductionId?: string | number,
): boolean {
  return Boolean(
    legacyProductionId !== undefined
      || focus?.target?.targetCategory === 'timeline_assembly'
      || focus?.scope?.category === 'timeline_namespace',
  )
}

export function agentSurfaceTimelineFocusParams(
  focus: MovScriptNormalizedFocus | undefined,
  extra: { projectId?: string | number; productionId?: string | number } = {},
): AgentSurfaceParams {
  const output: AgentSurfaceParams = {}
  const projectId = stringValue(extra.projectId) ?? focus?.projectId
  const legacyProductionId = agentSurfaceLegacyProductionId(focus, extra.productionId)
  if (projectId) output.projectId = projectId
  if (legacyProductionId) output.productionId = legacyProductionId
  if (focus?.scope?.kind && focus.scope.ref) {
    output.scopeKind = focus.scope.kind
    output.scopeRef = focus.scope.ref
  }
  if (focus?.target?.targetCategory) output.targetCategory = focus.target.targetCategory
  if (focus?.target?.targetKind) output.targetKind = focus.target.targetKind
  if (focus?.target?.targetRef) output.targetRef = focus.target.targetRef
  return output
}

export function agentSurfaceTimelineFocusSearchParams(
  params: URLSearchParams,
  focus: MovScriptNormalizedFocus | undefined,
  extra: { projectId?: string | number; productionId?: string | number } = {},
): URLSearchParams {
  const next = new URLSearchParams(params)
  for (const key of AGENT_SURFACE_TIMELINE_FOCUS_QUERY_KEYS) next.delete(key)
  for (const [key, value] of Object.entries(agentSurfaceTimelineFocusParams(focus, extra))) {
    if (value !== undefined && String(value).trim()) next.set(key, String(value))
  }
  return next
}

export function agentSurfaceTimelineFocusHref(
  pathname: string,
  params: URLSearchParams,
  focus: MovScriptNormalizedFocus | undefined,
  extra: { projectId?: string | number; productionId?: string | number } = {},
): string {
  const query = agentSurfaceTimelineFocusSearchParams(params, focus, extra).toString()
  return query ? `${pathname}?${query}` : pathname
}

const AGENT_SURFACE_TIMELINE_FOCUS_QUERY_KEYS = [
  'productionId',
  'production_id',
  'scopeKind',
  'scope_kind',
  'scopeRef',
  'scope_ref',
  'namespaceKind',
  'namespace_kind',
  'namespaceRef',
  'namespace_ref',
  'namespacePath',
  'namespace_path',
  'targetCategory',
  'target_category',
  'targetKind',
  'target_kind',
  'targetRef',
  'target_ref',
  'domainTargetCategory',
  'domain_target_category',
  'domainTargetKind',
  'domain_target_kind',
  'domainTargetRef',
  'domain_target_ref',
] as const

function addLegacyFocusParams(output: AgentSurfaceParams): void {
  const focus = normalizeDomainFocus(output)
  if (output.productionId === undefined && output.production_id === undefined && focus.scope?.kind === 'production') {
    output.productionId = focus.scope.ref
  }
}

function recordFromParams(params: URLSearchParams | Record<string, unknown>): Record<string, unknown> {
  if (params instanceof URLSearchParams) {
    const record: Record<string, unknown> = {}
    for (const [key, value] of params.entries()) {
      if (key !== 'mcpApiBaseURL' && value.trim()) record[key] = value
    }
    return record
  }
  return params
}

function compactParamRecord(input: Record<string, string | number | undefined>): Record<string, string | number> {
  const output: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(input)) {
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
export * from './features/content/domain/contentCanvasDomainPolicy.js'
export * from './features/content/domain/contentCanvasWorkspaceSnapshot.js'
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
