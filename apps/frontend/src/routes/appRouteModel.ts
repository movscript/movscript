import { ROUTES } from './projectRoutes'
import { routeLayoutSpecForPathname, type RouteLayoutSpec } from './routeLayoutRegistry'

export type AppRouteSurface = 'agent' | 'detail' | 'canvas'
export type AppWorkMode = 'agent' | 'detail'
export type CanvasRouteSource = 'agent' | 'detail'

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
  const surface = routeLayoutSpecForPathname(pathname).surface
  if (surface === 'agent') return 'agent'
  if (surface === 'detail') return 'detail'
  return fallback
}

export function routeForWorkMode(workMode: AppWorkMode, hasProject: boolean): string {
  if (workMode === 'agent') return ROUTES.project.agent
  return hasProject ? ROUTES.project.scripts : ROUTES.root
}

export function canvasEditorPath(canvasId: string | number, options?: { source?: CanvasRouteSource }): string {
  const pathname = `/canvases/${encodeURIComponent(String(canvasId))}`
  if (options?.source !== 'agent') return pathname
  const search = new URLSearchParams({ [CANVAS_SOURCE_PARAM]: 'agent' })
  return `${pathname}?${search.toString()}`
}

export function canvasRouteSourceFromSearch(search: string): CanvasRouteSource {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return params.get(CANVAS_SOURCE_PARAM) === 'agent' ? 'agent' : 'detail'
}

export function canvasListPathForSource(source: CanvasRouteSource): string {
  return source === 'agent' ? ROUTES.project.agentCanvases : ROUTES.canvases
}

export function canvasBackPath(search: string): string {
  return canvasListPathForSource(canvasRouteSourceFromSearch(search))
}
