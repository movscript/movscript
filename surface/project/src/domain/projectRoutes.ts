export const PROJECT_SURFACE_ROUTES = {
  overview: '/studio/:projectId/overview',
  progress: '/studio/:projectId/progress',
  dailies: '/studio/:projectId/dailies',
  liveRoom: '/studio/:projectId/live-room',
  editDesk: '/studio/:projectId/edit-desk',
  impact: '/studio/:projectId/impact',
  timeline: '/studio/:projectId/timeline',
  resources: '/studio/:projectId/resources',
  scripts: '/studio/:projectId/scripts',
  standards: '/studio/:projectId/standards',
  content: '/studio/:projectId/content',
  contentCanvas: '/studio/:projectId/content/canvas',
  contentPreview: '/studio/:projectId/content/preview',
  settingPreview: '/studio/:projectId/settings/preview',
  settings: '/studio/:projectId/settings',
} as const

export type ProjectSurfaceRouteKey = keyof typeof PROJECT_SURFACE_ROUTES

export const PROJECT_SURFACE_ROUTE_KEYS = Object.keys(PROJECT_SURFACE_ROUTES) as ProjectSurfaceRouteKey[]

export type ProjectSurfaceScope = 'project'

export type ProjectSurfaceName = ProjectSurfaceRouteKey

export interface ProjectSurfaceRouteDefinition {
  key: ProjectSurfaceRouteKey
  label: string
  path: string
  segment: string
}

export const PROJECT_SURFACE_ROUTE_DEFINITIONS: readonly ProjectSurfaceRouteDefinition[] = [
  { label: 'Overview', key: 'overview', path: PROJECT_SURFACE_ROUTES.overview, segment: 'overview' },
  { label: 'Progress', key: 'progress', path: PROJECT_SURFACE_ROUTES.progress, segment: 'progress' },
  { label: 'Dailies', key: 'dailies', path: PROJECT_SURFACE_ROUTES.dailies, segment: 'dailies' },
  { label: 'Live room', key: 'liveRoom', path: PROJECT_SURFACE_ROUTES.liveRoom, segment: 'live-room' },
  { label: 'Edit desk', key: 'editDesk', path: PROJECT_SURFACE_ROUTES.editDesk, segment: 'edit-desk' },
  { label: 'Impact', key: 'impact', path: PROJECT_SURFACE_ROUTES.impact, segment: 'impact' },
  { label: 'Timeline', key: 'timeline', path: PROJECT_SURFACE_ROUTES.timeline, segment: 'timeline' },
  { label: 'Resources', key: 'resources', path: PROJECT_SURFACE_ROUTES.resources, segment: 'resources' },
  { label: 'Scripts', key: 'scripts', path: PROJECT_SURFACE_ROUTES.scripts, segment: 'scripts' },
  { label: 'Standards', key: 'standards', path: PROJECT_SURFACE_ROUTES.standards, segment: 'standards' },
  { label: 'Canvas', key: 'contentCanvas', path: PROJECT_SURFACE_ROUTES.contentCanvas, segment: 'content/canvas' },
  { label: 'Preview', key: 'contentPreview', path: PROJECT_SURFACE_ROUTES.contentPreview, segment: 'content/preview' },
  { label: 'Setting Preview', key: 'settingPreview', path: PROJECT_SURFACE_ROUTES.settingPreview, segment: 'settings/preview' },
  { label: 'Settings', key: 'settings', path: PROJECT_SURFACE_ROUTES.settings, segment: 'settings' },
]

export type SurfaceDescriptorScope = 'project' | 'admin'

export interface SurfaceDescriptor {
  scope: SurfaceDescriptorScope
  surface: string
  projectId?: string | number
  params?: Record<string, string | number | boolean | undefined>
  reason?: string
  source?: string
}

export function projectSurfaceRouteBySegment(segment: string | undefined): ProjectSurfaceRouteDefinition | undefined {
  if (!segment) return undefined
  return PROJECT_SURFACE_ROUTE_DEFINITIONS.find((definition) => definition.segment === segment)
}

export function projectSurfacePath(
  route: ProjectSurfaceRouteKey,
  projectId: string | number,
): string {
  return PROJECT_SURFACE_ROUTES[route].replace(':projectId', encodeURIComponent(String(projectId)))
}

export function projectSurfaceDescriptor(input: {
  surface: ProjectSurfaceName
  projectId: string | number
  params?: Record<string, string | number | boolean | undefined>
  reason?: string
  source?: SurfaceDescriptor['source']
}): SurfaceDescriptor {
  return {
    scope: 'project',
    surface: input.surface,
    projectId: input.projectId,
    ...(input.params ? { params: input.params } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.source ? { source: input.source } : {}),
  }
}
