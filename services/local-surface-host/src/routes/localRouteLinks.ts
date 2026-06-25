import { projectSurfaceRouteBySegment } from '@movscript/project-surface/routes'
import { projectPathFromProject, type ProjectHomeProject } from '@movscript/project-surface/react'

const STUDIO_ROOT = '/studio'

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

export function projectHomeHrefForProject(project: ProjectHomeProject, baseQuery: URLSearchParams): string {
  const query = new URLSearchParams(baseQuery)
  query.delete('projectDir')
  query.delete('projectPath')
  const projectPath = projectPathFromProject(project)
  if (projectPath) query.set('projectDir', projectPath)
  if (!projectPath && project.ID) query.set('projectId', String(project.ID))
  if (project.name) query.set('projectName', project.name)
  return hrefWithSearch(STUDIO_ROOT, query)
}

export function projectHostHref(projectId: string, query: URLSearchParams): string {
  return hrefWithSearch(STUDIO_ROOT, withCompatibleProjectId(query, projectId))
}

export function projectRouteHref(segment: string, projectId: string, query: URLSearchParams): string {
  return hrefWithSearch(`${STUDIO_ROOT}/${segment}`, withCompatibleProjectId(query, projectId))
}

export function projectRouteContext(pathname: string, query: URLSearchParams) {
  const studioTail = pathname.replace(/^\/studio\/?/, '').split('/').filter(Boolean)
  const firstSegment = studioTail[0]
  const firstSegmentRoute = projectSurfaceRouteBySegment(firstSegment)
  const legacyProjectId = firstSegmentRoute ? undefined : firstSegment
  const segment = firstSegmentRoute ? firstSegment : studioTail[1]
  const route = firstSegmentRoute ?? projectSurfaceRouteBySegment(segment)
  const projectDir = query.get('projectDir') ?? query.get('projectPath') ?? ''
  const projectId = query.get('projectId')
    ?? query.get('project_id')
    ?? query.get('projectKey')
    ?? query.get('project_key')
    ?? legacyProjectId
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

function localProjectIdFromPath(projectDir: string): string {
  if (!projectDir.trim()) return 'local-project'
  let hash = 0
  for (let index = 0; index < projectDir.length; index += 1) {
    hash = (hash * 31 + projectDir.charCodeAt(index)) >>> 0
  }
  return `local-${hash.toString(36)}`
}
