import { ROUTES } from './projectRoutes'
import { routeLayoutSpecForPathname, type RouteLayoutSpec } from './routeLayoutRegistry'

export type AppRouteSurface = 'home' | 'agent' | 'project' | 'tool' | 'canvas' | 'settings'
export type AppWorkMode = 'agent' | 'project' | 'tool'
export type CanvasRouteSource = 'agent' | 'project' | 'tool'

export const CANVAS_SOURCE_PARAM = 'from'

export function isProjectAgentRoute(pathname: string): boolean {
  return pathname === ROUTES.project.agent || pathname.startsWith(`${ROUTES.project.agent}/`)
}

export function isCanvasEditorRoute(pathname: string): boolean {
  return /^\/canvases\/[^/]+\/?$/.test(pathname)
}

export function getAppRouteLayoutSpec(pathname: string): RouteLayoutSpec {
  return routeLayoutSpecForPathname(pathname)
}

export function workModeForRoute(pathname: string, fallback: AppWorkMode): AppWorkMode {
  const routeLayout = routeLayoutSpecForPathname(pathname)
  if (routeLayout.preserveWorkMode) return fallback
  const surface = routeLayout.surface
  if (surface === 'agent') return 'agent'
  if (surface === 'project') return 'project'
  if (surface === 'tool') return 'tool'
  return fallback
}

export function routeForWorkMode(workMode: AppWorkMode, hasProject: boolean): string {
  if (workMode === 'agent') return ROUTES.project.agent
  if (workMode === 'project') return hasProject ? ROUTES.project.home : ROUTES.projects
  return ROUTES.tools.refImageGen
}

export function canvasEditorPath(canvasId: string | number, options?: { source?: CanvasRouteSource }): string {
  const pathname = `/canvases/${encodeURIComponent(String(canvasId))}`
  if (!options?.source || options.source === 'tool') return pathname
  const search = new URLSearchParams({ [CANVAS_SOURCE_PARAM]: options.source })
  return `${pathname}?${search.toString()}`
}

export function editingProjectPath(editingProjectId: string): string {
  return `/editing/${encodeURIComponent(editingProjectId)}`
}

export function canvasRouteSourceFromSearch(search: string): CanvasRouteSource {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const source = params.get(CANVAS_SOURCE_PARAM)
  return source === 'agent' || source === 'project' ? source : 'tool'
}

export function canvasListPathForSource(source: CanvasRouteSource): string {
  if (source === 'agent') return ROUTES.project.agentCanvases
  if (source === 'project') return ROUTES.project.home
  return ROUTES.canvases
}

export function canvasBackPath(search: string): string {
  return canvasListPathForSource(canvasRouteSourceFromSearch(search))
}
