import { projectSurfacePath } from '@movscript/project-surface/routes'
import {
  recordValue,
  stringValue,
} from '@movscript/project-surface/data'
import {
  createProjectSurfaceRuntime,
  type ProjectSurfaceRouteKey,
  type ProjectSurfaceRouteParams,
  type ProjectSurfaceRuntime,
} from '@movscript/project-surface/runtime'

export const LOCAL_PROJECT_READ_MODEL_ENDPOINT = '/local-api/project/read-model'
export const LOCAL_PROJECT_SOURCE_SNAPSHOT_ENDPOINT = '/local-api/project/source/snapshot'
export const LOCAL_PROJECT_SOURCE_INSPECT_ENDPOINT = '/local-api/project/source/inspect'
export const LOCAL_PROJECT_SOURCE_OVERVIEW_ENDPOINT = '/local-api/project/source/overview'
export const LOCAL_PROJECT_SOURCE_INTERPRET_ENDPOINT = '/local-api/project/source/interpret'
export const LOCAL_PROJECT_SOURCE_REGENERATION_PLAN_ENDPOINT = '/local-api/project/source/regeneration-plan'
export const LOCAL_PROJECT_SOURCE_COMMAND_ENDPOINT = '/local-api/project/source/command'
export const LOCAL_PROJECT_RESOURCE_VIEW_ENDPOINT = '/local-api/project/resources/view'

export interface LocalHostProjectSurfaceRuntimeInput {
  projectId: string
  projectDir?: string
  projectUid?: string
  productionId?: string
  mcpApiBaseURL?: string
  projectServiceBaseURL?: string
  search?: URLSearchParams
}

export interface ProjectReadModelResponse {
  schema?: string
  projectDir?: string
  projectReadModel?: unknown
  [key: string]: unknown
}

export function createLocalHostProjectSurfaceRuntime(input: LocalHostProjectSurfaceRuntimeInput): ProjectSurfaceRuntime {
  const projectId = input.projectId || 'sample-project'

  return createProjectSurfaceRuntime({
    project: {
      projectId,
      location: 'local',
      ...(input.projectDir ? { projectDir: input.projectDir } : {}),
    },
    services: {
      ...(input.mcpApiBaseURL ? { mcpApiBaseURL: input.mcpApiBaseURL } : {}),
      ...(input.projectServiceBaseURL ? { projectServiceBaseURL: input.projectServiceBaseURL } : {}),
    },
    capabilities: {
      localGit: true,
      resourceUpload: true,
      generation: true,
      editing: true,
      mediaPipeline: true,
    },
    navigator: {
      href: (route, params) => localProjectSurfaceHref({
        route,
        projectId,
        projectDir: input.projectDir,
        productionId: input.productionId,
        search: input.search,
        params,
      }),
      open: (route, params) => {
        window.location.assign(localProjectSurfaceHref({
          route,
          projectId,
          projectDir: input.projectDir,
          productionId: input.productionId,
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
        readModel: () => fetchProjectReadModel({
          projectDir: input.projectDir ?? '',
          projectUid: input.projectUid,
          projectServiceBaseURL: input.projectServiceBaseURL,
        }),
        sourceSnapshot: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_SNAPSHOT_ENDPOINT,
          projectServiceBaseURL: input.projectServiceBaseURL,
          projectServicePath: '/v1/project/source/snapshot',
          body: { projectDir: input.projectDir ?? '' },
        }),
        readSource: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_SNAPSHOT_ENDPOINT,
          projectServiceBaseURL: input.projectServiceBaseURL,
          projectServicePath: '/v1/project/source/snapshot',
          body: { projectDir: input.projectDir ?? '' },
        }),
        inspectSource: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_INSPECT_ENDPOINT,
          projectServiceBaseURL: input.projectServiceBaseURL,
          projectServicePath: '/v1/project/source/inspect',
          body: { projectDir: input.projectDir ?? '' },
        }),
        overviewSource: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_OVERVIEW_ENDPOINT,
          projectServiceBaseURL: input.projectServiceBaseURL,
          projectServicePath: '/v1/project/source/overview',
          body: { projectDir: input.projectDir ?? '' },
        }),
        interpretSource: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_INTERPRET_ENDPOINT,
          projectServiceBaseURL: input.projectServiceBaseURL,
          projectServicePath: '/v1/project/source/interpret',
          body: { projectDir: input.projectDir ?? '' },
        }),
        interpret: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_INTERPRET_ENDPOINT,
          projectServiceBaseURL: input.projectServiceBaseURL,
          projectServicePath: '/v1/project/source/interpret',
          body: { projectDir: input.projectDir ?? '' },
        }),
        regenerationPlan: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_REGENERATION_PLAN_ENDPOINT,
          projectServiceBaseURL: input.projectServiceBaseURL,
          projectServicePath: '/v1/project/source/regeneration-plan',
          body: { projectDir: input.projectDir ?? '' },
        }),
        sourceCommand: (request) => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_COMMAND_ENDPOINT,
          projectServiceBaseURL: input.projectServiceBaseURL,
          projectServicePath: '/v1/project/source/command',
          body: {
            projectDir: request.projectDir ?? input.projectDir ?? '',
            command: request.command,
            input: request.input,
            decisionStore: localProjectDecisionStoreConfig(input, request),
          },
        }),
        upsertSource: (request) => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_COMMAND_ENDPOINT,
          projectServiceBaseURL: input.projectServiceBaseURL,
          projectServicePath: '/v1/project/source/command',
          body: {
            projectDir: request.projectDir ?? input.projectDir ?? '',
            command: 'upsertSource',
            input: { source: request.source },
          },
        }),
        resourceView: (request) => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_RESOURCE_VIEW_ENDPOINT,
          projectServiceBaseURL: input.projectServiceBaseURL,
          projectServicePath: '/v1/project/resources/view',
          body: {
            projectDir: request.projectDir ?? input.projectDir ?? '',
            kind: request.kind,
            input: request.input,
          },
        }),
      },
    },
  })
}

function localProjectDecisionStoreConfig(
  input: LocalHostProjectSurfaceRuntimeInput,
  request?: { projectUid?: string },
): Record<string, unknown> | undefined {
  const projectUid = stringValue(request?.projectUid) ?? input.projectUid
  if (!projectUid) return undefined
  return {
    kind: 'scoped-project-data',
    baseUrl: `${window.location.origin}/local-api/data`,
    projectUid,
    scopeKind: 'user',
    scopeId: 1,
  }
}

export async function fetchProjectReadModel({
  projectDir,
  projectUid,
  projectServiceBaseURL,
}: {
  projectDir: string
  projectUid?: string
  projectServiceBaseURL?: string
}): Promise<ProjectReadModelResponse> {
  return fetchProjectServiceEndpoint({
    endpoint: LOCAL_PROJECT_READ_MODEL_ENDPOINT,
    projectServiceBaseURL,
    projectServicePath: '/v1/project/read-model',
    body: {
      projectDir,
      includeSource: false,
      includeInspection: false,
      ...(projectUid ? { decisionStore: localProjectDecisionStoreConfig({ projectId: '', projectDir, projectUid }) } : {}),
    },
  }) as Promise<ProjectReadModelResponse>
}

async function fetchProjectServiceEndpoint({
  endpoint,
  projectServiceBaseURL,
  projectServicePath,
  body,
}: {
  endpoint: string
  projectServiceBaseURL?: string
  projectServicePath: string
  body: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  const url = projectServiceBaseURL
    ? `${projectServiceBaseURL}${projectServicePath}`
    : endpoint
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = stringValue(recordValue(payload)?.message)
      ?? stringValue(recordValue(payload)?.error)
      ?? `Project Service request failed with HTTP ${response.status}.`
    throw new Error(message)
  }
  return recordValue(payload) ?? {}
}

function localProjectSurfaceHref({
  route,
  projectId,
  projectDir,
  productionId,
  search,
  params,
}: {
  route: ProjectSurfaceRouteKey
  projectId: string
  projectDir?: string
  productionId?: string
  search?: URLSearchParams
  params?: ProjectSurfaceRouteParams
}): string {
  const next = new URLSearchParams(search)
  if (projectDir) next.set('projectDir', projectDir)
  if (productionId) next.set('productionId', productionId)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue
    next.set(key, String(value))
  }

  const pathname = projectSurfacePath(route, projectId)
  const query = next.toString()
  return query ? `${pathname}?${query}` : pathname
}
