import {
  CANVAS_SOURCE_PARAM,
  canvasBackSurfacePath,
  canvasEditorSurfacePath,
  canvasListSurfacePathForSource,
  canvasRouteSourceFromSearch,
  type CanvasRouteSource,
} from '@movscript/shared/surface-routes'
import { ROUTES } from './projectRoutes'
import { routeLayoutSpecForPathname, type RouteLayoutSpec } from './routeLayoutRegistry'

export type AppRouteSurface = 'home' | 'agent' | 'project' | 'resource' | 'tool' | 'canvas' | 'settings'
export type AppWorkMode = 'agent' | 'project' | 'tool'
export type { CanvasRouteSource }
export { CANVAS_SOURCE_PARAM, canvasRouteSourceFromSearch }

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
  return ROUTES.tools.image
}

export function canvasEditorPath(canvasId: string | number, options?: { source?: CanvasRouteSource }): string {
  return canvasEditorSurfacePath(canvasId, options)
}

export function editingProjectPath(editingProjectId: string): string {
  return `/editing/${encodeURIComponent(editingProjectId)}`
}

export function canvasListPathForSource(source: CanvasRouteSource): string {
  return canvasListSurfacePathForSource(source)
}

export function canvasBackPath(search: string): string {
  return canvasBackSurfacePath(search)
}
