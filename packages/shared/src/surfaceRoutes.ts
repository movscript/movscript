import { getSurfaceHostStateSnapshot } from './surfaceHostState.js'

export type SurfaceRouteKey =
  | 'project.home'
  | 'project.agentCanvases'
  | 'project.scripts'
  | 'project.standards'
  | 'project.content'
  | 'project.contentCanvas'
  | 'project.contentPreview'
  | 'project.settings'
  | 'resources'
  | 'canvas.list'
  | 'canvas.editor'
  | 'canvas.projectBack'
  | 'canvas.agentBack'
  | 'agent.console'

export type CanvasRouteSource = 'agent' | 'project' | 'tool'

export type SurfaceRouteParams = Record<string, string | number | boolean | null | undefined>

export interface SurfaceRouteClient {
  routePattern(key: SurfaceRouteKey): string | undefined
}

const defaultRoutePatterns: Record<SurfaceRouteKey, string> = {
  'project.home': '/project/home',
  'project.agentCanvases': '/project/agent/canvases',
  'project.scripts': '/project/scripts/workbench',
  'project.standards': '/project/standards',
  'project.content': '/project/content',
  'project.contentCanvas': '/project/content/canvas',
  'project.contentPreview': '/project/content/preview',
  'project.settings': '/project/settings',
  resources: '/resources',
  'canvas.list': '/canvases',
  'canvas.editor': '/canvases/:canvasId',
  'canvas.projectBack': '/project/home',
  'canvas.agentBack': '/project/agent/canvases',
  'agent.console': '/agent',
}

let surfaceRouteClient: SurfaceRouteClient | undefined

export function configureSurfaceRouteClient(client: SurfaceRouteClient): void {
  surfaceRouteClient = client
}

export function surfaceRoutePattern(key: SurfaceRouteKey): string {
  return surfaceRouteClient?.routePattern(key) ?? defaultRoutePatterns[key]
}

export function surfaceRoutePath(key: SurfaceRouteKey, params: SurfaceRouteParams = {}): string {
  const routeParams = {
    ...params,
    projectId: params.projectId ?? getSurfaceHostStateSnapshot().currentProject?.ID,
  }
  return routePathWithParams(surfaceRoutePattern(key), routeParams)
}

export function routePathWithParams(pathname: string, params: SurfaceRouteParams = {}): string {
  const consumed = new Set<string>()
  const path = pathname.replace(/:([A-Za-z0-9_]+)/g, (match, key) => {
    const value = params[key]
    if (value === undefined || value === null) return match
    consumed.add(key)
    return encodeURIComponent(String(value))
  })
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (consumed.has(key) || value === undefined || value === null) continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `${path}?${query}` : path
}

export const CANVAS_SOURCE_PARAM = 'from'

export function canvasEditorSurfacePath(
  canvasId: string | number,
  options?: { source?: CanvasRouteSource },
): string {
  const pathname = surfaceRoutePath('canvas.editor', { canvasId })
  if (!options?.source || options.source === 'tool') return pathname
  const separator = pathname.includes('?') ? '&' : '?'
  return `${pathname}${separator}${CANVAS_SOURCE_PARAM}=${encodeURIComponent(options.source)}`
}

export function canvasRouteSourceFromSearch(search: string): CanvasRouteSource {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const source = params.get(CANVAS_SOURCE_PARAM)
  return source === 'agent' || source === 'project' ? source : 'tool'
}

export function canvasListSurfacePathForSource(source: CanvasRouteSource): string {
  if (source === 'agent') return surfaceRoutePath('canvas.agentBack')
  if (source === 'project') return surfaceRoutePath('canvas.projectBack')
  return surfaceRoutePath('canvas.list')
}

export function canvasBackSurfacePath(search: string): string {
  return canvasListSurfacePathForSource(canvasRouteSourceFromSearch(search))
}
