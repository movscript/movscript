export const PROJECT_SURFACE_ROUTES = {
  overview: '/studio/:projectKey/overview',
  progress: '/studio/:projectKey/progress',
  dailies: '/studio/:projectKey/dailies',
  liveRoom: '/studio/:projectKey/live-room',
  impact: '/studio/:projectKey/impact',
  timeline: '/studio/:projectKey/timeline',
  resources: '/studio/:projectKey/resources',
  scripts: '/studio/:projectKey/scripts',
  standards: '/studio/:projectKey/standards',
  content: '/studio/:projectKey/content',
  contentCanvas: '/studio/:projectKey/content/canvas',
  contentPreview: '/studio/:projectKey/content/preview',
  remotionStudio: '/studio/:projectKey/remotion-studio',
  settingPreview: '/studio/:projectKey/settings/preview',
  settings: '/studio/:projectKey/settings',
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
  { label: 'Impact', key: 'impact', path: PROJECT_SURFACE_ROUTES.impact, segment: 'impact' },
  { label: 'Timeline', key: 'timeline', path: PROJECT_SURFACE_ROUTES.timeline, segment: 'timeline' },
  { label: 'Resources', key: 'resources', path: PROJECT_SURFACE_ROUTES.resources, segment: 'resources' },
  { label: 'Scripts', key: 'scripts', path: PROJECT_SURFACE_ROUTES.scripts, segment: 'scripts' },
  { label: 'Standards', key: 'standards', path: PROJECT_SURFACE_ROUTES.standards, segment: 'standards' },
  { label: 'Canvas', key: 'contentCanvas', path: PROJECT_SURFACE_ROUTES.contentCanvas, segment: 'content/canvas' },
  { label: 'Preview', key: 'contentPreview', path: PROJECT_SURFACE_ROUTES.contentPreview, segment: 'content/preview' },
  { label: 'Remotion Studio', key: 'remotionStudio', path: PROJECT_SURFACE_ROUTES.remotionStudio, segment: 'remotion-studio' },
  { label: 'Setting Preview', key: 'settingPreview', path: PROJECT_SURFACE_ROUTES.settingPreview, segment: 'settings/preview' },
  { label: 'Settings', key: 'settings', path: PROJECT_SURFACE_ROUTES.settings, segment: 'settings' },
]

export type SurfaceDescriptorScope = 'project' | 'admin'

export interface SurfaceDescriptor {
  scope: SurfaceDescriptorScope
  surface: string
  projectKey?: string | number
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
  projectKey: string | number,
): string {
  return PROJECT_SURFACE_ROUTES[route].replace(':projectKey', encodeURIComponent(String(projectKey)))
}

export function projectSurfaceDescriptor(input: {
  surface: ProjectSurfaceName
  projectKey?: string | number
  projectId: string | number
  params?: Record<string, string | number | boolean | undefined>
  reason?: string
  source?: SurfaceDescriptor['source']
}): SurfaceDescriptor {
  return {
    scope: 'project',
    surface: input.surface,
    projectKey: input.projectKey ?? input.projectId,
    projectId: input.projectId,
    ...(input.params ? { params: input.params } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.source ? { source: input.source } : {}),
  }
}
