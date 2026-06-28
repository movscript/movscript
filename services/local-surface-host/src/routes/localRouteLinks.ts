import {
  projectSurfacePath,
  projectSurfaceRouteBySegment,
  type ProjectSurfaceRouteKey,
} from '@movscript/project-surface/routes'
import {
  normalizeDomainFocus,
  type MovScriptNormalizedFocus,
} from '@movscript/domain'

const STUDIO_ROOT = '/studio'
const PROJECT_SERVICE_BASE_URL_QUERY_KEYS = [
  'projectServiceBaseURL',
  'projectServiceBaseUrl',
  'projectServiceURL',
  'projectServiceUrl',
] as const

export interface LocalProjectRouteProject {
  ID?: number | string
  name?: string
  description?: string
  project_uid?: string
  workspace_path?: string
  project_path?: string
}

export function hrefWithSearch(pathname: string, query: URLSearchParams): string {
  const search = query.toString()
  return search ? `${pathname}?${search}` : pathname
}

export function removeProjectServiceBaseURLQuery(query: URLSearchParams): URLSearchParams {
  for (const key of PROJECT_SERVICE_BASE_URL_QUERY_KEYS) query.delete(key)
  return query
}

export function localDataAPIV1BaseURL(): string {
  if (typeof window === 'undefined') return '/api/v1'
  return `${window.location.origin}/api/v1`
}

export function projectHomeHrefForProject(project: LocalProjectRouteProject, baseQuery: URLSearchParams): string {
  return projectSurfaceHrefForLocalProject(project, 'overview', baseQuery)
}

export function projectSurfaceHrefForLocalProject(
  project: LocalProjectRouteProject,
  route: ProjectSurfaceRouteKey,
  baseQuery: URLSearchParams,
  params: Record<string, string | number | boolean | undefined> = {},
): string {
  const query = new URLSearchParams(baseQuery)
  query.delete('projectDir')
  query.delete('projectPath')
  query.delete('projectUid')
  query.delete('project_uid')
  query.delete('projectId')
  query.delete('project_id')
  query.delete('projectName')
  query.delete('project_name')
  removeProjectServiceBaseURLQuery(query)
  const projectPath = projectPathFromProject(project)
  const routeProjectId = localProjectRouteId(project, projectPath)
  if (projectPath) query.set('projectDir', projectPath)
  if (project.project_uid?.trim()) query.set('projectUid', project.project_uid.trim())
  if (hasPositiveProjectId(project.ID)) query.set('projectId', String(project.ID))
  if (project.name?.trim()) query.set('projectName', project.name.trim())
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value))
  }
  normalizeTimelineFocusQuery(query)
  return hrefWithSearch(projectSurfacePath(route, routeProjectId), query)
}

export function projectHostHref(projectId: string, query: URLSearchParams): string {
  return hrefWithSearch(projectSurfacePath('overview', projectId), withCompatibleProjectId(query, projectId))
}

export function projectRouteHref(segment: string, projectId: string, query: URLSearchParams): string {
  const route = projectSurfaceRouteBySegment(segment)
  const pathname = route
    ? projectSurfacePath(route.key, projectId)
    : `${STUDIO_ROOT}/${encodeURIComponent(projectId)}/${encodeURIComponent(segment)}`
  return hrefWithSearch(pathname, withCompatibleProjectId(query, projectId))
}

export function projectRouteContext(pathname: string, query: URLSearchParams) {
  const studioTail = pathname.replace(/^\/studio\/?/, '').split('/').filter(Boolean)
  const routeProjectId = studioTail[0]
  const segment = studioTail.slice(1).join('/')
  const route = projectSurfaceRouteBySegment(segment)
  const projectDir = query.get('projectDir') ?? query.get('projectPath') ?? ''
  const projectId = query.get('projectId')
    ?? query.get('project_id')
    ?? query.get('projectKey')
    ?? query.get('project_key')
    ?? routeProjectId
    ?? localProjectIdFromPath(projectDir)
  const domainFocus = routeDomainFocus(query, projectId)
  return {
    route,
    segment,
    projectId,
    projectDir,
    domainFocus,
    productionId: routeProductionId(query),
  }
}

export function routeDomainFocus(query: URLSearchParams, projectId?: string): MovScriptNormalizedFocus {
  return normalizeDomainFocus({
    ...recordFromQuery(query),
    ...(projectId ? { projectId } : {}),
  })
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

function withCompatibleProjectId(query: URLSearchParams, projectId: string): URLSearchParams {
  const next = new URLSearchParams(query)
  removeProjectServiceBaseURLQuery(next)
  if (projectId && projectId !== 'local-project' && !next.get('projectId')) next.set('projectId', projectId)
  normalizeTimelineFocusQuery(next)
  return next
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
  'timelineAssemblyRef',
  'timeline_assembly_ref',
  'domainTargetCategory',
  'domain_target_category',
  'domainTargetKind',
  'domain_target_kind',
  'domainTargetRef',
  'domain_target_ref',
] as const

function localProjectRouteId(project: LocalProjectRouteProject, projectPath: string | undefined): string {
  if (hasPositiveProjectId(project.ID)) return String(project.ID)
  const projectUid = project.project_uid?.trim()
  if (projectUid) return projectUid
  return localProjectIdFromPath(projectPath ?? '')
}

function hasPositiveProjectId(value: number | string | undefined): boolean {
  if (value === undefined) return false
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0
}

function projectPathFromProject(project: LocalProjectRouteProject): string | undefined {
  const explicit = project.workspace_path?.trim() || project.project_path?.trim()
  if (explicit) return explicit
  const description = project.description?.trim()
  if (description?.startsWith('/')) return description
  return undefined
}

function localProjectIdFromPath(projectDir: string): string {
  if (!projectDir.trim()) return 'local-project'
  let hash = 0
  for (let index = 0; index < projectDir.length; index += 1) {
    hash = (hash * 31 + projectDir.charCodeAt(index)) >>> 0
  }
  return `local-${hash.toString(36)}`
}
