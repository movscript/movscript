export const RESOURCE_SURFACE_ROUTES = {
  resources: '/resources',
  externalResources: '/resources/external',
  providerAssetLibrary: '/tools/private-assets',
  projectResources: '/studio/:projectId/resources',
  agentResources: '/agent/resources',
  agentResourceDetail: '/agent/resources/:resourceId',
} as const

export type ResourceSurfaceRouteKey = keyof typeof RESOURCE_SURFACE_ROUTES

export function resourceSurfacePath(
  route: Extract<ResourceSurfaceRouteKey, 'projectResources'>,
  projectId: string | number,
): string
export function resourceSurfacePath(route: Exclude<ResourceSurfaceRouteKey, 'projectResources'>): string
export function resourceSurfacePath(route: ResourceSurfaceRouteKey, projectId?: string | number): string {
  const pattern = RESOURCE_SURFACE_ROUTES[route]
  if (route === 'projectResources') {
    if (projectId === undefined) throw new Error('projectResources requires projectId')
    return pattern.replace(':projectId', encodeURIComponent(String(projectId)))
  }
  return pattern
}

export function agentResourceDetailPath(resourceId: string | number): string {
  return `/agent/resources/${encodeURIComponent(String(resourceId))}`
}
