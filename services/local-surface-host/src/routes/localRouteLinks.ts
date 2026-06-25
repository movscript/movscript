import {
  projectSurfacePath,
  projectSurfaceRouteBySegment,
  type ProjectSurfaceRouteKey,
} from '@movscript/project-surface/routes'

const STUDIO_ROOT = '/studio'

export interface LocalProjectRouteProject {
  ID?: number | string
  name?: string
  description?: string
  project_uid?: string
  workspace_path?: string
  project_path?: string
}

export function serviceBaseURLFromSearch(kind: 'editing' | 'mediaPipeline', query: URLSearchParams): string {
  if (kind === 'editing') {
    return normalizeBaseURL(query.get('editingServiceBaseURL') ?? query.get('editingServiceBaseUrl') ?? query.get('editingServiceURL') ?? query.get('editingServiceUrl')) ?? ''
  }
  return normalizeBaseURL(query.get('mediaPipelineBaseURL') ?? query.get('mediaPipelineBaseUrl') ?? query.get('mediaPipelineURL') ?? query.get('mediaPipelineUrl')) ?? ''
}

export function normalizeProjectServiceBaseURL(query: URLSearchParams): string | undefined {
  return normalizeBaseURL(
    query.get('projectServiceBaseURL')
      ?? query.get('projectServiceBaseUrl')
      ?? query.get('projectServiceURL')
      ?? query.get('projectServiceUrl'),
  )
}

export function hrefWithSearch(pathname: string, query: URLSearchParams): string {
  const search = query.toString()
  return search ? `${pathname}?${search}` : pathname
}

export function localDataAPIV1BaseURL(): string {
  if (typeof window === 'undefined') return '/local-api/data/api/v1'
  return `${window.location.origin}/local-api/data/api/v1`
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
  const projectPath = projectPathFromProject(project)
  const routeProjectId = localProjectRouteId(project, projectPath)
  if (projectPath) query.set('projectDir', projectPath)
  if (project.project_uid?.trim()) query.set('projectUid', project.project_uid.trim())
  if (hasPositiveProjectId(project.ID)) query.set('projectId', String(project.ID))
  if (project.name?.trim()) query.set('projectName', project.name.trim())
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value))
  }
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
  const segment = studioTail[1]
  const route = projectSurfaceRouteBySegment(segment)
  const projectDir = query.get('projectDir') ?? query.get('projectPath') ?? ''
  const projectId = query.get('projectId')
    ?? query.get('project_id')
    ?? query.get('projectKey')
    ?? query.get('project_key')
    ?? routeProjectId
    ?? localProjectIdFromPath(projectDir)
  return {
    route,
    segment,
    projectId,
    projectDir,
    productionId: query.get('productionId') ?? undefined,
  }
}

export function normalizeBaseURL(value: string | null | undefined): string | undefined {
  if (!value?.trim()) return undefined
  return value.trim().replace(/\/+$/, '')
}

function withCompatibleProjectId(query: URLSearchParams, projectId: string): URLSearchParams {
  const next = new URLSearchParams(query)
  if (projectId && projectId !== 'local-project' && !next.get('projectId')) next.set('projectId', projectId)
  return next
}

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
