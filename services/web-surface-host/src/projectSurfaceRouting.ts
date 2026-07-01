import {
  normalizeDomainFocus,
  type MovScriptNormalizedFocus,
} from '@movscript/domain'
import {
  projectSurfacePath,
  projectSurfaceRouteBySegment,
  type ProjectSurfaceRouteKey,
  type ProjectSurfaceRouteParams,
} from '@movscript/project-surface'

export interface WebProjectRouteContext {
  route: ReturnType<typeof projectSurfaceRouteBySegment>
  projectId: string
  domainFocus: MovScriptNormalizedFocus
  productionId?: string
}

export function projectRouteContext(pathname: string, query: URLSearchParams): WebProjectRouteContext {
  const studioTail = pathname.replace(/^\/studio\/?/, '').split('/').filter(Boolean)
  const projectIdFromPath = studioTail[0] ? decodeURIComponent(studioTail[0]) : undefined
  const segment = studioTail.slice(1).join('/')
  const projectId = projectIdFromPath ?? query.get('projectId') ?? 'sample-project'
  return {
    route: projectSurfaceRouteBySegment(segment),
    projectId,
    domainFocus: routeDomainFocus(query, projectId),
    productionId: routeProductionId(query),
  }
}

export function webProjectSurfaceHref({
  route,
  projectId,
  projectUid,
  search,
  params,
}: {
  route: ProjectSurfaceRouteKey
  projectId: string
  projectUid?: string
  search?: URLSearchParams
  params?: ProjectSurfaceRouteParams
}): string {
  const next = new URLSearchParams(search)
  next.set('projectId', projectId)
  if (projectUid) next.set('projectUid', projectUid)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue
    next.set(key, String(value))
  }
  normalizeTimelineFocusQuery(next)

  const query = next.toString()
  const pathname = projectSurfacePath(route, projectId)
  return query ? `${pathname}?${query}` : pathname
}

export function routeDomainFocus(query: URLSearchParams, projectId?: string): MovScriptNormalizedFocus {
  return normalizeDomainFocus({
    ...recordFromQuery(query),
    ...(projectId ? { projectId } : {}),
  })
}

export function normalizeTimelineFocusQuery(query: URLSearchParams): URLSearchParams {
  const record = recordFromQuery(query)
  if (!hasNormalizedFocus(record)) return query
  query.delete('productionId')
  query.delete('production_id')
  const productionId = legacyProductionIdFromFocusRecord(record)
  if (productionId) query.set('productionId', productionId)
  return query
}

function routeProductionId(query: URLSearchParams): string | undefined {
  const record = recordFromQuery(query)
  if (hasNormalizedFocus(record)) return legacyProductionIdFromFocusRecord(record)
  return query.get('productionId') ?? query.get('production_id') ?? legacyProductionIdFromFocusRecord(record)
}

function legacyProductionIdFromFocusRecord(record: Record<string, string>): string | undefined {
  const focus = normalizeDomainFocus(record)
  return focus.scope?.kind === 'production' ? focus.scope.ref : undefined
}

function recordFromQuery(query: URLSearchParams): Record<string, string> {
  const record: Record<string, string> = {}
  for (const [key, value] of query.entries()) {
    if (value.trim()) record[key] = value
  }
  return record
}

function hasNormalizedFocus(record: Record<string, string>): boolean {
  return NORMALIZED_FOCUS_KEYS.some((key) => record[key] !== undefined)
}

const NORMALIZED_FOCUS_KEYS = [
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
