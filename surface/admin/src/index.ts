export const ADMIN_SURFACE_ROUTES = {
  overview: '/admin/overview',
  agents: '/admin/agents',
  jobs: '/admin/jobs',
  jobTrace: '/admin/jobs/:jobId',
  providers: '/admin/providers',
  users: '/admin/users',
  orgs: '/admin/orgs',
  audit: '/admin/audit',
  costs: '/admin/costs',
  incidents: '/admin/incidents',
} as const

export type AdminSurfaceRouteKey = keyof typeof ADMIN_SURFACE_ROUTES

export type AdminSurfaceName = AdminSurfaceRouteKey

export interface AdminSurfaceDescriptor {
  scope: 'admin'
  surface: AdminSurfaceName
  params?: Record<string, string | number | boolean | undefined>
  reason?: string
  source?: 'agent' | 'desktop' | 'web' | 'admin'
}

export function adminSurfacePath(
  route: AdminSurfaceRouteKey,
  params: Record<string, string | number> = {},
): string {
  let path: string = ADMIN_SURFACE_ROUTES[route]
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`:${key}`, encodeURIComponent(String(value)))
  }
  return path
}

export function adminSurfaceDescriptor(input: {
  surface: AdminSurfaceName
  params?: Record<string, string | number | boolean | undefined>
  reason?: string
  source?: AdminSurfaceDescriptor['source']
}): AdminSurfaceDescriptor {
  return {
    scope: 'admin',
    surface: input.surface,
    ...(input.params ? { params: input.params } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.source ? { source: input.source } : {}),
  }
}
