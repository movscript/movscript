import { projectSurfacePath } from '@movscript/project-surface/routes'
import {
  EditingServiceClient,
  MediaPipelineServiceClient,
  type EditingMediaPipelineTaskRequest,
} from '@movscript/editing/browser'
import type { MovScriptContextEnvelope } from '@movscript/shared'
import { movScriptContextProjectCwd, movScriptContextProjectId } from '@movscript/shared'
import {
  recordValue,
  stringValue,
} from '@movscript/project-surface/data'
import {
  createHostedProjectSurfaceRuntime,
  projectSurfaceContextCommandEnvelope,
  type ProjectSurfaceRouteKey,
  type ProjectSurfaceRouteParams,
  type ProjectSurfaceRuntime,
  unwrapProjectSurfaceGatewayResult,
} from '@movscript/project-surface/runtime'
import {
  normalizeTimelineFocusQuery,
  removeProjectServiceBaseURLQuery,
} from '../routes/localRouteLinks'

export const LOCAL_PROJECT_READ_MODEL_ENDPOINT = '/v1/project/read-model'
export const LOCAL_PROJECT_STANDARDS_READ_MODEL_ENDPOINT = '/v1/project/standards/read-model'
export const LOCAL_PROJECT_SCRIPTS_READ_MODEL_ENDPOINT = '/v1/project/scripts/read-model'
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
  const projectDir = movScriptContextProjectCwd(input.context) ?? input.projectDir
  const editingService = typeof window === 'undefined'
    ? undefined
    : new EditingServiceClient({ baseUrl: window.location.origin })
  const mediaPipeline = typeof window === 'undefined'
    ? undefined
    : new MediaPipelineServiceClient({ baseUrl: window.location.origin })
  const postProjectWorkspaceOperation = async (
    endpoint: string,
    request: { projectDir?: string; projectUid?: string; input?: unknown } = {},
  ): Promise<unknown> => {
    const payload = await fetchProjectServiceEndpoint({
      endpoint,
      body: {
        projectDir: request.projectDir ?? projectDir ?? '',
        ...projectSurfaceContextCommandEnvelope(input.context),
        ...(recordValue(request.input) ?? {}),
        ...localProjectDecisionConfig(input, request),
      },
    })
    return unwrapProjectSurfaceGatewayResult(payload)
  }

  return createHostedProjectSurfaceRuntime({
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
    href: (route, params, runtimeProject) => localProjectSurfaceHref({
      route,
      projectId: runtimeProject.projectId,
      projectDir: runtimeProject.projectDir,
      productionId: input.productionId,
      search: input.search,
      params,
    }),
    openHref: (href) => {
      window.location.assign(href)
    },
    openExternal: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
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
        standardsReadModel: (request = {}) => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_STANDARDS_READ_MODEL_ENDPOINT,
          body: {
            projectDir: request.projectDir ?? projectDir ?? '',
            projectId: request.projectId ?? projectId,
            projectUid: request.projectUid ?? input.context?.session?.project?.uid ?? input.projectUid,
            ...projectSurfaceContextCommandEnvelope(input.context),
          },
        }),
        scriptsReadModel: (request = {}) => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SCRIPTS_READ_MODEL_ENDPOINT,
          body: {
            projectDir: request.projectDir ?? projectDir ?? '',
            projectId: request.projectId ?? projectId,
            projectUid: request.projectUid ?? input.context?.session?.project?.uid ?? input.projectUid,
            ...projectSurfaceContextCommandEnvelope(input.context),
          },
        }),
        sourceSnapshot: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_SNAPSHOT_ENDPOINT,
          body: { projectDir: projectDir ?? '', ...projectSurfaceContextCommandEnvelope(input.context) },
        }),
        readSource: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_SNAPSHOT_ENDPOINT,
          body: { projectDir: projectDir ?? '', ...projectSurfaceContextCommandEnvelope(input.context) },
        }),
        inspectSource: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_INSPECT_ENDPOINT,
          body: { projectDir: projectDir ?? '', ...projectSurfaceContextCommandEnvelope(input.context) },
        }),
        overviewSource: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_OVERVIEW_ENDPOINT,
          body: { projectDir: projectDir ?? '', ...projectSurfaceContextCommandEnvelope(input.context) },
        }),
        interpretSource: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_INTERPRET_ENDPOINT,
          body: { projectDir: projectDir ?? '', ...projectSurfaceContextCommandEnvelope(input.context) },
        }),
        interpret: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_INTERPRET_ENDPOINT,
          body: { projectDir: projectDir ?? '', ...projectSurfaceContextCommandEnvelope(input.context) },
        }),
        regenerationPlan: () => fetchProjectServiceEndpoint({
          endpoint: LOCAL_PROJECT_SOURCE_REGENERATION_PLAN_ENDPOINT,
          body: { projectDir: projectDir ?? '', ...projectSurfaceContextCommandEnvelope(input.context) },
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
            ...projectSurfaceContextCommandEnvelope(input.context),
          },
        }),
      },
      editing: {
        readProject: async (request = {}) => {
          if (!editingService) throw new Error('当前环境不支持 Editing Service')
          const response = await editingService.projectCommand({
            command: 'getProject',
            input: request,
          })
          return response.result
        },
        render: async (request) => {
          if (!editingService || !mediaPipeline) throw new Error('当前环境不支持 Editing Service / MediaPipeline')
          const payload = recordValue(request) ?? {}
          const editDecisions = recordValue(payload.editDecisions ?? payload.edit_decisions)
          const assetManifest = recordValue(payload.assetManifest ?? payload.asset_manifest)
          if (!editDecisions) throw new Error('editing render requires editDecisions')
          const renderRuntime = stringValue(payload.renderRuntime ?? payload.render_runtime ?? editDecisions.render_runtime ?? editDecisions.renderRuntime) ?? 'movscript_media_pipeline'
          if (renderRuntime !== 'movscript_media_pipeline' && renderRuntime !== 'ffmpeg') {
            return {
              status: 'unsupported_runtime',
              code: 'VIDEO_COMPOSE_RENDER_RUNTIME_UNSUPPORTED',
              message: `MovScript video compose currently supports movscript_media_pipeline/ffmpeg only. Requested runtime ${renderRuntime} must be handled by an explicit future adapter; no silent fallback was performed.`,
              render_runtime: renderRuntime,
              supported_render_runtimes: ['movscript_media_pipeline', 'ffmpeg'],
            }
          }
          const resourceDownload = localMediaPipelineResourceDownload(payload)
          const created = await editingService.projectCommand({
            command: 'createProjectFromEditDecisions',
            input: {
              ...payload,
              editDecisions,
              assetManifest,
              projectId,
              renderRuntime,
            },
          })
          const createdResult = recordValue(created.result) ?? {}
          if (createdResult.status === 'blocked') return createdResult
          const editingProject = recordValue(createdResult.editing_project ?? createdResult.editingProject)
          if (!editingProject) throw new Error('Editing Service did not return a MediaEditingProject')
          const saved = await editingService.projectCommand({
            command: 'saveProject',
            input: { editingProject },
          })
          const savedResult = recordValue(saved.result) ?? {}
          const savedProject = recordValue(savedResult.editingProject ?? savedResult.editing_project) ?? editingProject
          const validationResponse = await editingService.projectCommand({
            command: 'validateTimeline',
            input: { editingProject: savedProject },
          })
          const validation = recordValue(validationResponse.result) ?? {
            status: 'unknown',
            valid: false,
            diagnostics: [],
          }
          if (validation.valid === false) {
            return {
              status: 'blocked',
              code: 'VIDEO_COMPOSE_TIMELINE_INVALID',
              message: 'TimelineAssembly 已编译成 MediaEditingProject，但编辑时间线验证未通过，因此没有创建成片任务。',
              render_runtime: renderRuntime,
              editing_project: savedProject,
              saved_project: savedResult,
              compile_manifest: createdResult.compile_manifest,
              compile_result: createdResult.compile_result,
              validation,
              render_report: {
                schema: 'movscript.render_report.v1',
                status: 'blocked',
                render_runtime: renderRuntime,
                render_runtime_used: renderRuntime === 'ffmpeg' ? 'movscript_media_pipeline_ffmpeg' : renderRuntime,
                project_id: stringValue(savedProject.projectId),
                editing_project_id: stringValue(savedProject.id),
                compile_manifest_id: stringValue(recordValue(createdResult.compile_manifest)?.id),
                compile_input_hash: stringValue(recordValue(createdResult.compile_manifest)?.input_hash),
                candidate_created: false,
                adopted: false,
                selected: false,
              },
              candidate_created: false,
              adopted: false,
              selected: false,
            }
          }
          const output = recordValue(payload.output) ?? {}
          const format = stringValue(output.format ?? payload.format) === 'hls' ? 'hls' : 'mp4'
          const taskRequest = await editingService.taskRequest({
            taskType: format === 'hls' ? 'timeline_hls' : 'timeline_render',
            input: {
              ...payload,
              projectId,
              editingProject: savedProject,
              editing_project: savedProject,
              resourceDownload,
              output: {
                ...output,
                format,
                resourceDownload,
              },
            },
          })
          const task = await mediaPipeline.createTask({
            request: taskRequest.request as unknown as EditingMediaPipelineTaskRequest,
          })
          return {
            status: 'ok',
            render_runtime: renderRuntime,
            render_runtime_used: renderRuntime === 'ffmpeg' ? 'movscript_media_pipeline_ffmpeg' : renderRuntime,
            format,
            editing_project: savedProject,
            saved_project: savedResult,
            task: task.task,
            media_pipeline_task: task.task,
            compile_manifest: createdResult.compile_manifest,
            compile_result: createdResult.compile_result,
            validation,
            render_report: {
              schema: 'movscript.render_report.v1',
              status: task.task.status,
              render_runtime: renderRuntime,
              render_runtime_used: renderRuntime === 'ffmpeg' ? 'movscript_media_pipeline_ffmpeg' : renderRuntime,
              format,
              project_id: stringValue(savedProject.projectId),
              editing_project_id: stringValue(savedProject.id),
              compile_manifest_id: stringValue(recordValue(createdResult.compile_manifest)?.id),
              compile_input_hash: stringValue(recordValue(createdResult.compile_manifest)?.input_hash),
              task_id: task.task.taskId,
              output_path: stringValue(task.task.outputPath),
              output_resource_id: task.task.outputResourceId,
              candidate_created: false,
              adopted: false,
              selected: false,
            },
            candidate_created: false,
            adopted: false,
            selected: false,
          }
        },
        taskGet: async (request) => {
          if (!editingService || !mediaPipeline) throw new Error('当前环境不支持 Editing Service / MediaPipeline')
          const action = await editingService.taskAction({
            action: 'getTask',
            input: recordValue(request) ?? {},
          })
          const actionRequest = recordValue(action.request)
          if (!actionRequest) return action.result ?? action
          const response = await mediaPipeline.taskAction({
            action: 'getTask',
            taskId: stringValue(actionRequest.taskId ?? actionRequest.task_id) ?? '',
            options: recordValue(actionRequest.options) as { projectId?: string } | undefined,
          })
          return {
            status: response.task ? 'ok' : 'not_found',
            task: response.task,
            media_pipeline_task: response.task,
          }
        },
        taskLogs: async (request) => {
          if (!editingService || !mediaPipeline) throw new Error('当前环境不支持 Editing Service / MediaPipeline')
          const action = await editingService.taskAction({
            action: 'getTaskLogs',
            input: recordValue(request) ?? {},
          })
          const actionRequest = recordValue(action.request)
          if (!actionRequest) return action.result ?? action
          const response = await mediaPipeline.taskAction({
            action: 'getTaskLogs',
            taskId: stringValue(actionRequest.taskId ?? actionRequest.task_id) ?? '',
            options: recordValue(actionRequest.options) as { projectId?: string } | undefined,
          })
          return response.logs ?? response
        },
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

function localMediaPipelineResourceDownload(payload: Record<string, unknown>): Record<string, unknown> {
  const output = recordValue(payload.output)
  const explicit = recordValue(payload.resourceDownload)
    ?? recordValue(payload.resource_download)
    ?? recordValue(output?.resourceDownload)
    ?? recordValue(output?.resource_download)
    ?? {}
  return {
    ...explicit,
    baseUrl: stringValue(explicit.baseUrl ?? explicit.base_url ?? explicit.apiBaseUrl ?? explicit.api_base_url)
      ?? (typeof window === 'undefined' ? '' : window.location.origin),
  }
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
      ...projectSurfaceContextCommandEnvelope(context),
      ...localProjectDecisionConfig({ projectId: '', projectDir, projectUid, context }),
    },
  }) as Promise<ProjectReadModelResponse>
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
