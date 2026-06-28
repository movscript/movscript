import { projectSurfacePath } from '@movscript/project-surface/routes'
import type { MovScriptContextEnvelope } from '@movscript/shared'
import { movScriptContextProjectCwd, movScriptContextProjectId } from '@movscript/shared'
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
import {
  normalizeTimelineFocusQuery,
  removeProjectServiceBaseURLQuery,
} from '../routes/localRouteLinks'

export const LOCAL_PROJECT_READ_MODEL_ENDPOINT = '/v1/project/read-model'
export const LOCAL_PROJECT_SOURCE_SNAPSHOT_ENDPOINT = '/v1/project/source/snapshot'
export const LOCAL_PROJECT_SOURCE_INSPECT_ENDPOINT = '/v1/project/source/inspect'
export const LOCAL_PROJECT_SOURCE_OVERVIEW_ENDPOINT = '/v1/project/source/overview'
export const LOCAL_PROJECT_SOURCE_INTERPRET_ENDPOINT = '/v1/project/source/interpret'
export const LOCAL_PROJECT_SOURCE_REGENERATION_PLAN_ENDPOINT = '/v1/project/source/regeneration-plan'
export const LOCAL_PROJECT_STANDARDS_UPSERT_ENDPOINT = '/v1/project/standards/upsert'
export const LOCAL_PROJECT_SCRIPT_SOURCE_READ_ENDPOINT = '/v1/project/scripts/source/read'
export const LOCAL_PROJECT_SCRIPT_UPSERT_ENDPOINT = '/v1/project/scripts/upsert'
export const LOCAL_PROJECT_SCRIPT_VERSION_SNAPSHOT_ENDPOINT = '/v1/project/scripts/versions/snapshot'
export const LOCAL_PROJECT_RESOURCE_VIEW_ENDPOINT = '/v1/project/resources/view'

export interface LocalHostProjectSurfaceRuntimeInput {
  projectId: string
  projectDir?: string
  projectUid?: string
  productionId?: string
  mcpApiBaseURL?: string
  search?: URLSearchParams
  context?: MovScriptContextEnvelope
}

export interface ProjectReadModelResponse {
  schema?: string
  projectDir?: string
  projectReadModel?: unknown
  [key: string]: unknown
}

export function createLocalHostProjectSurfaceRuntime(input: LocalHostProjectSurfaceRuntimeInput): ProjectSurfaceRuntime {
  const projectId = (movScriptContextProjectId(input.context) ?? input.projectId) || 'sample-project'
  const projectDir = movScriptContextProjectCwd(input.context)
  const postProjectWorkspaceOperation = async (
    endpoint: string,
    request: { projectDir?: string; projectUid?: string; input?: unknown } = {},
  ): Promise<unknown> => {
    const payload = await fetchProjectServiceEndpoint({
      endpoint,
      body: {
        projectDir: request.projectDir ?? projectDir ?? '',
        ...localContextCommandEnvelope(input.context),
        ...(recordValue(request.input) ?? {}),
        ...localProjectDecisionConfig(input, request),
      },
    })
    return Object.prototype.hasOwnProperty.call(payload, 'result') ? payload.result : payload
  }

  return createProjectSurfaceRuntime({
    context: input.context,
    project: {
      projectId,
      location: projectDir ? 'local' : 'remote',
      ...(projectDir ? { projectDir } : {}),
      ...(input.context?.session?.project?.uid ?? input.projectUid ? { projectUid: input.context?.session?.project?.uid ?? input.projectUid } : {}),
      ...(input.context?.session?.project?.title ? { title: input.context.session.project.title } : {}),
    },
    diagnostics: {
      endpoints: {
        ...(input.mcpApiBaseURL ? { mcpApi: input.mcpApiBaseURL } : {}),
      },
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
        projectDir,
        productionId: input.productionId,
        search: input.search,
        params,
      }),
      open: (route, params) => {
        window.location.assign(localProjectSurfaceHref({
          route,
          projectId,
          projectDir,
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
          projectDir: projectDir ?? '',
          projectUid: input.context?.session?.project?.uid ?? input.projectUid,
          context: input.context,
        }),
        sourceSnapshot: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_SNAPSHOT_ENDPOINT,
          body: { projectDir: projectDir ?? '', ...localContextCommandEnvelope(input.context) },
        }),
        readSource: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_SNAPSHOT_ENDPOINT,
          body: { projectDir: projectDir ?? '', ...localContextCommandEnvelope(input.context) },
        }),
        inspectSource: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_INSPECT_ENDPOINT,
          body: { projectDir: projectDir ?? '', ...localContextCommandEnvelope(input.context) },
        }),
        overviewSource: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_OVERVIEW_ENDPOINT,
          body: { projectDir: projectDir ?? '', ...localContextCommandEnvelope(input.context) },
        }),
        interpretSource: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_INTERPRET_ENDPOINT,
          body: { projectDir: projectDir ?? '', ...localContextCommandEnvelope(input.context) },
        }),
        interpret: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_INTERPRET_ENDPOINT,
          body: { projectDir: projectDir ?? '', ...localContextCommandEnvelope(input.context) },
        }),
        regenerationPlan: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_REGENERATION_PLAN_ENDPOINT,
          body: { projectDir: projectDir ?? '', ...localContextCommandEnvelope(input.context) },
        }),
        upsertProjectStandards: (request) => postProjectWorkspaceOperation(LOCAL_PROJECT_STANDARDS_UPSERT_ENDPOINT, request),
        readScriptSource: (request) => postProjectWorkspaceOperation(LOCAL_PROJECT_SCRIPT_SOURCE_READ_ENDPOINT, request),
        upsertScript: (request) => postProjectWorkspaceOperation(LOCAL_PROJECT_SCRIPT_UPSERT_ENDPOINT, request),
        snapshotScriptVersionFromMarkdown: (request) => postProjectWorkspaceOperation(LOCAL_PROJECT_SCRIPT_VERSION_SNAPSHOT_ENDPOINT, request),
        resourceView: (request) => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_RESOURCE_VIEW_ENDPOINT,
          body: {
            projectDir: projectDir ?? '',
            kind: request.kind,
            input: request.input,
            ...localContextCommandEnvelope(input.context),
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
  const projectUid = stringValue(request?.projectUid) ?? input.context?.session?.project?.uid ?? input.projectUid
  if (!projectUid) return undefined
  const principal = input.context?.principal
  const scopeId = principal?.scopeId ?? principal?.userId ?? 1
  return {
    kind: 'scoped-project-data',
    baseUrl: window.location.origin,
    projectUid,
    scopeKind: principal?.scopeKind === 'org' ? 'org' : 'user',
    scopeId,
  }
}

function localProjectDecisionConfig(
  input: LocalHostProjectSurfaceRuntimeInput,
  request?: { projectUid?: string },
): Record<string, unknown> {
  const decisionStore = localProjectDecisionStoreConfig(input, request)
  if (decisionStore) return { decisionStore }
  return {}
}

export async function fetchProjectReadModel({
  projectDir,
  projectUid,
  context,
}: {
  projectDir: string
  projectUid?: string
  context?: MovScriptContextEnvelope
}): Promise<ProjectReadModelResponse> {
  return fetchProjectServiceEndpoint({
    endpoint: LOCAL_PROJECT_READ_MODEL_ENDPOINT,
    body: {
      projectDir,
      includeSource: false,
      includeInspection: false,
      ...localContextCommandEnvelope(context),
      ...localProjectDecisionConfig({ projectId: '', projectDir, projectUid, context }),
    },
  }) as Promise<ProjectReadModelResponse>
}

function localContextCommandEnvelope(context: MovScriptContextEnvelope | undefined): Record<string, unknown> {
  const sessionId = context?.session?.sessionId
  if (!sessionId) return {}
  return {
    context: {
      sessionId,
      revision: context.revision,
    },
  }
}

async function fetchProjectServiceEndpoint({
  endpoint,
  body,
}: {
  endpoint: string
  body: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = stringValue(recordValue(payload)?.message)
      ?? stringValue(recordValue(payload)?.error)
      ?? `Project runtime request failed with HTTP ${response.status}.`
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
  removeProjectServiceBaseURLQuery(next)
  if (projectDir) next.set('projectDir', projectDir)
  if (productionId) next.set('productionId', productionId)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue
    next.set(key, String(value))
  }
  normalizeTimelineFocusQuery(next)

  const pathname = projectSurfacePath(route, projectId)
  const query = next.toString()
  return query ? `${pathname}?${query}` : pathname
}
