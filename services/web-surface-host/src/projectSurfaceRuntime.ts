import {
  projectSurfacePath,
  type ProjectSurfaceRouteKey,
  type ProjectSurfaceRouteParams,
} from '@movscript/project-surface'
import {
  createProjectSurfaceRuntime,
  type ProjectSurfaceRuntime,
} from '@movscript/project-surface/runtime'

export interface WebHostProjectSurfaceRuntimeInput {
  projectId: string
  projectUid?: string
  projectServiceBaseURL?: string
  dataServiceBaseURL?: string
  editingServiceBaseURL?: string
  mediaPipelineBaseURL?: string
  mcpApiBaseURL?: string
  search?: URLSearchParams
}

export function createWebHostProjectSurfaceRuntime(input: WebHostProjectSurfaceRuntimeInput): ProjectSurfaceRuntime {
  const projectId = input.projectId || 'sample-project'

  return createProjectSurfaceRuntime({
    project: {
      projectId,
      location: 'remote',
      ...(input.projectUid ? { projectUid: input.projectUid } : {}),
    },
    services: {
      ...(input.projectServiceBaseURL ? { projectServiceBaseURL: input.projectServiceBaseURL } : {}),
      ...(input.dataServiceBaseURL ? { dataServiceBaseURL: input.dataServiceBaseURL } : {}),
      ...(input.editingServiceBaseURL ? { editingServiceBaseURL: input.editingServiceBaseURL } : {}),
      ...(input.mediaPipelineBaseURL ? { mediaPipelineBaseURL: input.mediaPipelineBaseURL } : {}),
      ...(input.mcpApiBaseURL ? { mcpApiBaseURL: input.mcpApiBaseURL } : {}),
    },
    capabilities: {
      resourceUpload: true,
      generation: true,
      editing: true,
      mediaPipeline: true,
    },
    navigator: {
      href: (route, params) => webProjectSurfaceHref({
        route,
        projectId,
        projectUid: input.projectUid,
        search: input.search,
        params,
      }),
      open: (route, params) => {
        window.location.assign(webProjectSurfaceHref({
          route,
          projectId,
          projectUid: input.projectUid,
          search: input.search,
          params,
        }))
      },
      openExternal: (url) => {
        window.open(url, '_blank', 'noopener,noreferrer')
      },
    },
    notifier: {
      success: (message, detail) => console.info(message, detail ?? ''),
      warning: (message, detail) => console.warn(message, detail ?? ''),
      error: (message, detail) => console.error(message, detail ?? ''),
      info: (message, detail) => console.info(message, detail ?? ''),
    },
    gateways: {
      project: {
        readModel: async () => {
          throw new Error('Web Project Service read-model gateway is not configured yet.')
        },
      },
    },
  })
}

function webProjectSurfaceHref({
  route,
  projectId,
  projectUid,
  search,
  params,
}: {
  route: ProjectSurfaceRouteKey
  projectId: string
  projectUid?: string
  search?: URLSearchParams
  params?: ProjectSurfaceRouteParams
}): string {
  const next = new URLSearchParams(search)
  next.set('projectId', projectId)
  if (projectUid) next.set('projectUid', projectUid)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue
    next.set(key, String(value))
  }

  const query = next.toString()
  const pathname = projectSurfacePath(route, projectId)
  return query ? `${pathname}?${query}` : pathname
}
