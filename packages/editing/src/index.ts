import {
  findRuntimeEndpoint,
  findRuntimeService,
  readRuntimeHomeSnapshot,
  resolveMovScriptHomeDir,
  type RuntimeEndpointRecord,
} from '@movscript/runtime-contracts'
import type {
  EditingMediaPipelineTaskRequest,
  EditingMediaPipelineTaskState,
  EditingMediaPipelineTaskType,
  EditingRuntimeTaskLogs,
} from './runtime.js'

export {
  createMediaEditingProjectFromMovScriptEditPlan,
  createMediaEditingProjectService,
  clipFitsTrackType,
  createMediaEditingProjectFromProductionTimelineClips,
  mediaTimelineIsValid,
  MediaEditingProjectService,
  normalizeMediaClipVolumePercent,
  trackAllowsOverlap,
  validateMediaEditingProjectTimeline,
  type CropSpec,
  type MediaAssetDescriptor,
  type MediaAssetRegistry,
  type MediaAssetSourceKind,
  type MediaAssetType,
  type MediaClip,
  type MediaClipPatch,
  type MediaEditingProject,
  type MediaEditingProjectOptions,
  type MediaEditingProjectProvenance,
  type MediaEditingProjectServiceOptions,
  type MediaEditingProjectSource,
  type MediaEditingProjectSourceKind,
  type MediaProductionTimelineClip,
  type MediaProductionTimelineProjectOptions,
  type MediaTimelineCommand,
  type MediaTimelineCommandType,
  type MediaTimelineDiagnostic,
  type MediaTimelineFit,
  type MediaTimelineRecipe,
  type MediaTrack,
  type MediaTrackType,
  type MediaWorkspaceBinding,
  type SubtitleSpec,
  type TextSpec,
  type TransitionSpec,
} from './media-project.js'

export {
  createMediaEditingProjectFromEditDecisions,
  type MediaEditDecisionsProjectOptions,
  type MovScriptAssetManifest,
  type MovScriptEditDecisionAudio,
  type MovScriptEditDecisionAudioLayer,
  type MovScriptEditDecisionAudioSegment,
  type MovScriptEditDecisionCut,
  type MovScriptEditDecisionNarration,
  type MovScriptEditDecisionOverlay,
  type MovScriptEditDecisionSubtitleSegment,
  type MovScriptEditDecisionSubtitles,
  type MovScriptEditDecisionsArtifact,
  type MovScriptVideoComposeRenderRuntime,
} from './video-compose.js'

export type {
  EditingMediaPipelineAssetDescriptor,
  EditingMediaPipelineHlsVariantSpec,
  EditingMediaPipelineOutputSpec,
  EditingMediaPipelineReframeSpec,
  EditingMediaPipelineTaskRequest,
  EditingMediaPipelineTaskState,
  EditingMediaPipelineTaskStatus,
  EditingMediaPipelineTaskType,
  EditingMediaPipelineTranscodeSpec,
  EditingRuntimeCapabilities,
  EditingRuntimeExportImportRequest,
  EditingRuntimeExportImportResult,
  EditingRuntimeHlsPublishRequest,
  EditingRuntimeHlsPublishResult,
  EditingRuntimePort,
  EditingRuntimeProjectGetResult,
  EditingRuntimeProjectSaveResult,
  EditingRuntimeSaveLocalRequest,
  EditingRuntimeSaveLocalResult,
  EditingRuntimeTaskLogs,
} from './runtime.js'

export type {
  MovScriptEditPlanArtifact,
  MovScriptEditPlanOutputKind,
  MovScriptEditPlanTrack,
  MovScriptEditPlanTrackItem,
  MovScriptEditPlanTrackType,
} from './movscript-edit-plan.js'

const defaultFetch = globalThis.fetch

export const EDITING_SERVICE_NAME = 'movscript.editing.service'
export const EDITING_SERVICE_CAPABILITIES_ENDPOINT = '/v1/editing/capabilities'
export const EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT = '/v1/editing/project/command'
export const EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT = '/v1/editing/timeline/view'
export const EDITING_SERVICE_TASK_REQUEST_ENDPOINT = '/v1/editing/task/request'
export const EDITING_SERVICE_TASK_ACTION_ENDPOINT = '/v1/editing/task/action'
export const MEDIA_PIPELINE_SERVICE_NAME = 'movscript.media.pipeline'
export const MEDIA_PIPELINE_CAPABILITIES_ENDPOINT = '/v1/media-pipeline/capabilities'
export const MEDIA_PIPELINE_PROBE_ENDPOINT = '/v1/media-pipeline/probe'
export const MEDIA_PIPELINE_TASK_CREATE_ENDPOINT = '/v1/media-pipeline/task/create'
export const MEDIA_PIPELINE_TASK_ACTION_ENDPOINT = '/v1/media-pipeline/task/action'
export const MEDIA_PIPELINE_RESULT_REGISTER_ENDPOINT = '/v1/media-pipeline/results/register'
export const MEDIA_PIPELINE_RESULT_GET_ENDPOINT = '/v1/media-pipeline/results/get'
export const MEDIA_PIPELINE_RESULT_LIST_ENDPOINT = '/v1/media-pipeline/results/list'
export const MEDIA_PIPELINE_RESULT_WATCH_CREATE_ENDPOINT = '/v1/media-pipeline/results/watch/create'
export const MEDIA_PIPELINE_RESULT_WATCH_GET_ENDPOINT = '/v1/media-pipeline/results/watch/get'
export const MEDIA_PIPELINE_RESULT_WATCH_LIST_ENDPOINT = '/v1/media-pipeline/results/watch/list'
export const MEDIA_PIPELINE_RESULT_WATCH_CANCEL_ENDPOINT = '/v1/media-pipeline/results/watch/cancel'

export type EditingServiceProjectCommandName =
  | 'createProject'
  | 'createProjectFromPreviewTimeline'
  | 'saveProject'
  | 'getProject'
  | 'listProjects'
  | 'deleteProject'
  | 'updateProjectSettings'
  | 'addAsset'
  | 'removeAsset'
  | 'applyTimelineCommands'
  | 'validateTimeline'
  | 'addTrack'
  | 'removeTrack'
  | 'addClip'
  | 'updateClip'
  | 'splitClip'
  | 'moveClip'
  | 'deleteClip'

export interface EditingServiceProjectCommandRequest {
  command: EditingServiceProjectCommandName
  input?: Record<string, unknown>
}

export interface EditingServiceProjectCommandResponse {
  schema: 'movscript.editing-project-command-result.v1'
  command: EditingServiceProjectCommandName
  result: unknown
}

export type EditingServiceTimelineViewKind =
  | 'previewTimeline'
  | 'sceneMomentEditPlan'
  | 'sceneMomentTimelineBundle'
  | 'productionTimelineBundle'

export interface EditingServiceTimelineViewRequest {
  projectDir: string
  kind: EditingServiceTimelineViewKind
  targetKind?: string
  targetRef?: string
  scopeKind?: string
  scopeRef?: string | number
  productionId?: string | number
  sceneMomentId?: string | number
  decisionStore?: object
  projectName?: string
  title?: string
  now?: string
  defaultDurationMs?: number
  defaultDurationSec?: number
}

export interface EditingServiceTimelineViewResponse {
  schema: 'movscript.editing-timeline-view.v1'
  projectDir: string
  kind: EditingServiceTimelineViewKind
  result: unknown
}

export type EditingServiceTaskRequestType =
  | 'timeline_render'
  | 'timeline_hls'
  | 'media_transcode'
  | 'media_reframe'

export interface EditingServiceTaskRequestInput {
  taskType: EditingServiceTaskRequestType
  input?: Record<string, unknown>
}

export interface EditingServiceTaskRequestResponse {
  schema: 'movscript.editing-task-request.v1'
  taskType: EditingServiceTaskRequestType
  request: Record<string, unknown>
}

export type EditingServiceTaskActionName =
  | 'getTask'
  | 'cancelTask'
  | 'getTaskLogs'
  | 'importExportResource'
  | 'saveLocalExport'
  | 'publishHlsStream'

export interface EditingServiceTaskActionInput {
  action: EditingServiceTaskActionName
  input?: Record<string, unknown>
}

export interface EditingServiceTaskActionResponse {
  schema: 'movscript.editing-task-action.v1'
  action: EditingServiceTaskActionName
  status?: string
  result?: unknown
  request?: {
    action?: EditingServiceTaskActionName
    taskId?: string
    task_id?: string
    options?: {
      projectId?: string
      project_id?: string
    }
    [key: string]: unknown
  }
}

export interface MediaPipelineCapabilitiesResponse {
  serviceName: typeof MEDIA_PIPELINE_SERVICE_NAME
  capabilities: string[]
  runtimeContract: 'EditingRuntimePort'
  supportedTaskTypes: EditingMediaPipelineTaskType[]
  supportedOutputs: Array<'mp4' | 'hls'>
}

export interface MediaPipelineProbeRequest {
  taskType?: EditingMediaPipelineTaskType
  feature?: string
}

export interface MediaPipelineProbeResponse {
  schema: 'movscript.media-pipeline-probe.v1'
  serviceName: typeof MEDIA_PIPELINE_SERVICE_NAME
  status: 'available' | 'unavailable'
  available: boolean
  runtimeContract: 'EditingRuntimePort'
  capabilities: string[]
  supportedTaskTypes: EditingMediaPipelineTaskType[]
  supportedOutputs: Array<'mp4' | 'hls'>
  requestedTaskType?: EditingMediaPipelineTaskType
  requestedFeature?: string
  reason?: string
  ffmpeg?: {
    available: boolean
    path?: string
    version?: string
    code?: string
    error?: string
  }
  backendProjectRender?: Record<string, unknown>
  backend_project_render?: Record<string, unknown>
  backendProjectPreview?: Record<string, unknown>
  backend_project_preview?: Record<string, unknown>
}

export interface MediaPipelineTaskCreateRequest {
  request: EditingMediaPipelineTaskRequest
}

export interface MediaPipelineTaskCreateResponse {
  schema: 'movscript.media-pipeline-task-create.v1'
  task: EditingMediaPipelineTaskState
}

export type MediaPipelineTaskActionName = 'getTask' | 'cancelTask' | 'getTaskLogs'

export interface MediaPipelineTaskActionRequest {
  action: MediaPipelineTaskActionName
  taskId: string
  options?: {
    projectId?: string
  }
}

export interface MediaPipelineTaskActionResponse {
  schema: 'movscript.media-pipeline-task-action.v1'
  action: MediaPipelineTaskActionName
  task?: EditingMediaPipelineTaskState | null
  logs?: EditingRuntimeTaskLogs
}

export interface MediaPipelineResultRecord {
  schema: 'movscript.media-pipeline-result.v1'
  resultId: string
  result_id: string
  projectId?: string
  project_id?: string
  taskId?: string
  task_id?: string
  backend: string
  kind: string
  outputKind: string
  output_kind: string
  status: string
  source?: string
  outputPath?: string
  output_path?: string
  outputName?: string
  output_name?: string
  hlsManifestPath?: string
  hls_manifest_path?: string
  hlsDirectory?: string
  hls_directory?: string
  hlsSegmentPaths?: string[]
  hls_segment_paths?: string[]
  hlsVariants?: unknown[]
  hls_variants?: unknown[]
  resourceId?: string | number
  resource_id?: string | number
  streamId?: string | number
  stream_id?: string | number
  candidateId?: string | number
  candidate_id?: string | number
  artifacts?: unknown[]
  provenance?: Record<string, unknown>
  metadata?: Record<string, unknown>
  createdAt: string
  created_at: string
  updatedAt: string
  updated_at: string
}

export interface MediaPipelineResultRegisterRequest {
  result?: Partial<MediaPipelineResultRecord> & Record<string, unknown>
  [key: string]: unknown
}

export interface MediaPipelineResultRegisterResponse {
  schema: 'movscript.media-pipeline-result-register.v1'
  status: 'registered'
  result: MediaPipelineResultRecord
}

export interface MediaPipelineResultGetRequest {
  resultId?: string
  result_id?: string
}

export interface MediaPipelineResultGetResponse {
  schema: 'movscript.media-pipeline-result-get.v1'
  status: 'found' | 'not_found'
  result: MediaPipelineResultRecord | null
}

export interface MediaPipelineResultListRequest {
  filter?: {
    projectId?: string
    project_id?: string
    taskId?: string
    task_id?: string
    backend?: string
    kind?: string
    outputKind?: string
    output_kind?: string
    status?: string
    limit?: number
  }
  projectId?: string
  project_id?: string
  taskId?: string
  task_id?: string
  backend?: string
  kind?: string
  outputKind?: string
  output_kind?: string
  status?: string
  limit?: number
}

export interface MediaPipelineResultListResponse {
  schema: 'movscript.media-pipeline-result-list.v1'
  status: 'ok'
  results: MediaPipelineResultRecord[]
  count: number
}

export interface MediaPipelineResultWatchRecord {
  schema: 'movscript.media-pipeline-result-watch.v1'
  watchId: string
  watch_id: string
  projectId?: string
  project_id?: string
  taskId?: string
  task_id?: string
  resultId?: string
  result_id?: string
  backend: 'external_nle'
  status: 'watching' | 'succeeded' | 'canceled' | 'failed'
  outputDirectory?: string
  output_directory?: string
  outputPath?: string
  output_path?: string
  hlsManifestPath?: string
  hls_manifest_path?: string
  hlsDirectory?: string
  hls_directory?: string
  hlsSegmentPaths?: string[]
  hls_segment_paths?: string[]
  exchangeProjectPath?: string
  exchange_project_path?: string
  externalApp?: string
  external_app?: string
  reviewer?: string
  reviewStatus?: string
  review_status?: string
  outputKind?: string
  output_kind?: string
  pollIntervalMs: number
  poll_interval_ms: number
  timeoutMs?: number
  timeout_ms?: number
  attempts: number
  detected?: Record<string, unknown>
  result?: MediaPipelineResultRecord
  error?: {
    code?: string
    message?: string
  } & Record<string, unknown>
  provenance?: Record<string, unknown>
  metadata?: Record<string, unknown>
  createdAt: string
  created_at: string
  updatedAt: string
  updated_at: string
  completedAt?: string
  completed_at?: string
}

export interface MediaPipelineResultWatchCreateRequest {
  watch?: Partial<MediaPipelineResultWatchRecord> & Record<string, unknown>
  [key: string]: unknown
}

export interface MediaPipelineResultWatchCreateResponse {
  schema: 'movscript.media-pipeline-result-watch-create.v1'
  status: 'watching' | 'succeeded'
  watch: MediaPipelineResultWatchRecord
}

export interface MediaPipelineResultWatchGetRequest {
  watchId?: string
  watch_id?: string
}

export interface MediaPipelineResultWatchGetResponse {
  schema: 'movscript.media-pipeline-result-watch-get.v1'
  status: 'found' | 'not_found'
  watch: MediaPipelineResultWatchRecord | null
}

export interface MediaPipelineResultWatchListRequest {
  filter?: {
    projectId?: string
    project_id?: string
    taskId?: string
    task_id?: string
    resultId?: string
    result_id?: string
    backend?: string
    status?: string
    limit?: number
  }
  projectId?: string
  project_id?: string
  taskId?: string
  task_id?: string
  resultId?: string
  result_id?: string
  backend?: string
  status?: string
  limit?: number
}

export interface MediaPipelineResultWatchListResponse {
  schema: 'movscript.media-pipeline-result-watch-list.v1'
  status: 'ok'
  watches: MediaPipelineResultWatchRecord[]
  count: number
}

export interface MediaPipelineResultWatchCancelRequest {
  watchId?: string
  watch_id?: string
}

export interface MediaPipelineResultWatchCancelResponse {
  schema: 'movscript.media-pipeline-result-watch-cancel.v1'
  status: 'canceled' | 'not_found'
  watch: MediaPipelineResultWatchRecord | null
}

export interface EditingServiceClientOptions {
  baseUrl: string
  fetch?: typeof fetch
}

export interface EditingServiceDiscoveryOptions {
  baseUrl?: string
  env?: NodeJS.ProcessEnv
  homeDir?: string
}

export interface MediaPipelineServiceClientOptions {
  baseUrl: string
  fetch?: typeof fetch
}

export interface MediaPipelineServiceDiscoveryOptions {
  baseUrl?: string
  env?: NodeJS.ProcessEnv
  homeDir?: string
}

export class EditingServiceClient {
  readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(options: EditingServiceClientOptions) {
    const baseUrl = normalizeEditingServiceBaseUrl(options.baseUrl)
    if (!baseUrl) throw new Error('editing service baseUrl is required')
    this.baseUrl = baseUrl
    this.fetchImpl = options.fetch ?? defaultFetch
  }

  async capabilities(signal?: AbortSignal): Promise<unknown> {
    return this.request('GET', EDITING_SERVICE_CAPABILITIES_ENDPOINT, undefined, signal)
  }

  async projectCommand(
    request: EditingServiceProjectCommandRequest,
    signal?: AbortSignal,
  ): Promise<EditingServiceProjectCommandResponse> {
    return this.request('POST', EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT, {
      command: request.command,
      input: request.input ?? {},
    }, signal)
  }

  async timelineView(
    request: EditingServiceTimelineViewRequest,
    signal?: AbortSignal,
  ): Promise<EditingServiceTimelineViewResponse> {
    return this.request('POST', EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT, {
      projectDir: request.projectDir,
      kind: request.kind,
      ...(request.targetKind !== undefined ? { targetKind: request.targetKind } : {}),
      ...(request.targetRef !== undefined ? { targetRef: request.targetRef } : {}),
      ...(request.scopeKind !== undefined ? { scopeKind: request.scopeKind } : {}),
      ...(request.scopeRef !== undefined ? { scopeRef: request.scopeRef } : {}),
      ...(request.productionId !== undefined ? { productionId: request.productionId } : {}),
      ...(request.sceneMomentId !== undefined ? { sceneMomentId: request.sceneMomentId } : {}),
      ...(request.decisionStore !== undefined ? { decisionStore: request.decisionStore } : {}),
      ...(request.projectName !== undefined ? { projectName: request.projectName } : {}),
      ...(request.title !== undefined ? { title: request.title } : {}),
      ...(request.now !== undefined ? { now: request.now } : {}),
      ...(request.defaultDurationMs !== undefined ? { defaultDurationMs: request.defaultDurationMs } : {}),
      ...(request.defaultDurationSec !== undefined ? { defaultDurationSec: request.defaultDurationSec } : {}),
    }, signal)
  }

  async taskRequest(
    request: EditingServiceTaskRequestInput,
    signal?: AbortSignal,
  ): Promise<EditingServiceTaskRequestResponse> {
    return this.request('POST', EDITING_SERVICE_TASK_REQUEST_ENDPOINT, {
      taskType: request.taskType,
      input: request.input ?? {},
    }, signal)
  }

  async taskAction(
    request: EditingServiceTaskActionInput,
    signal?: AbortSignal,
  ): Promise<EditingServiceTaskActionResponse> {
    return this.request('POST', EDITING_SERVICE_TASK_ACTION_ENDPOINT, {
      action: request.action,
      input: request.input ?? {},
    }, signal)
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : {
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
    if (!response.ok) {
      throw new EditingServiceHTTPError(response.status, await response.text())
    }
    return response.json() as Promise<T>
  }
}

export class MediaPipelineServiceClient {
  readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(options: MediaPipelineServiceClientOptions) {
    const baseUrl = normalizeMediaPipelineServiceBaseUrl(options.baseUrl)
    if (!baseUrl) throw new Error('media pipeline service baseUrl is required')
    this.baseUrl = baseUrl
    this.fetchImpl = options.fetch ?? defaultFetch
  }

  async capabilities(signal?: AbortSignal): Promise<MediaPipelineCapabilitiesResponse> {
    return this.request('GET', MEDIA_PIPELINE_CAPABILITIES_ENDPOINT, undefined, signal)
  }

  async probe(request: MediaPipelineProbeRequest = {}, signal?: AbortSignal): Promise<MediaPipelineProbeResponse> {
    return this.request('POST', MEDIA_PIPELINE_PROBE_ENDPOINT, request, signal)
  }

  async createTask(
    request: MediaPipelineTaskCreateRequest,
    signal?: AbortSignal,
  ): Promise<MediaPipelineTaskCreateResponse> {
    return this.request('POST', MEDIA_PIPELINE_TASK_CREATE_ENDPOINT, {
      request: request.request,
    }, signal)
  }

  async taskAction(
    request: MediaPipelineTaskActionRequest,
    signal?: AbortSignal,
  ): Promise<MediaPipelineTaskActionResponse> {
    return this.request('POST', MEDIA_PIPELINE_TASK_ACTION_ENDPOINT, {
      action: request.action,
      taskId: request.taskId,
      ...(request.options ? { options: request.options } : {}),
    }, signal)
  }

  async registerResult(
    request: MediaPipelineResultRegisterRequest,
    signal?: AbortSignal,
  ): Promise<MediaPipelineResultRegisterResponse> {
    return this.request('POST', MEDIA_PIPELINE_RESULT_REGISTER_ENDPOINT, request, signal)
  }

  async getResult(
    request: MediaPipelineResultGetRequest,
    signal?: AbortSignal,
  ): Promise<MediaPipelineResultGetResponse> {
    return this.request('POST', MEDIA_PIPELINE_RESULT_GET_ENDPOINT, request, signal)
  }

  async listResults(
    request: MediaPipelineResultListRequest = {},
    signal?: AbortSignal,
  ): Promise<MediaPipelineResultListResponse> {
    return this.request('POST', MEDIA_PIPELINE_RESULT_LIST_ENDPOINT, request, signal)
  }

  async createResultWatch(
    request: MediaPipelineResultWatchCreateRequest,
    signal?: AbortSignal,
  ): Promise<MediaPipelineResultWatchCreateResponse> {
    return this.request('POST', MEDIA_PIPELINE_RESULT_WATCH_CREATE_ENDPOINT, request, signal)
  }

  async getResultWatch(
    request: MediaPipelineResultWatchGetRequest,
    signal?: AbortSignal,
  ): Promise<MediaPipelineResultWatchGetResponse> {
    return this.request('POST', MEDIA_PIPELINE_RESULT_WATCH_GET_ENDPOINT, request, signal)
  }

  async listResultWatches(
    request: MediaPipelineResultWatchListRequest = {},
    signal?: AbortSignal,
  ): Promise<MediaPipelineResultWatchListResponse> {
    return this.request('POST', MEDIA_PIPELINE_RESULT_WATCH_LIST_ENDPOINT, request, signal)
  }

  async cancelResultWatch(
    request: MediaPipelineResultWatchCancelRequest,
    signal?: AbortSignal,
  ): Promise<MediaPipelineResultWatchCancelResponse> {
    return this.request('POST', MEDIA_PIPELINE_RESULT_WATCH_CANCEL_ENDPOINT, request, signal)
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : {
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
    if (!response.ok) {
      throw new MediaPipelineServiceHTTPError(response.status, await response.text())
    }
    return response.json() as Promise<T>
  }
}

export class EditingServiceHTTPError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, body: string) {
    super(`editing service request failed: ${status}${body ? ` ${body}` : ''}`)
    this.name = 'EditingServiceHTTPError'
    this.status = status
    this.body = body
  }
}

export class MediaPipelineServiceHTTPError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, body: string) {
    super(`media pipeline service request failed: ${status}${body ? ` ${body}` : ''}`)
    this.name = 'MediaPipelineServiceHTTPError'
    this.status = status
    this.body = body
  }
}

export function createEditingServiceClientFromRuntime(options: EditingServiceDiscoveryOptions = {}): EditingServiceClient {
  const baseUrl = resolveEditingServiceBaseUrl(options)
  if (!baseUrl) {
    throw new Error('movscript.editing.service endpoint was not found; start the local runtime daemon or set MOVSCRIPT_EDITING_SERVICE_URL')
  }
  return new EditingServiceClient({ baseUrl })
}

export function createMediaPipelineServiceClientFromRuntime(options: MediaPipelineServiceDiscoveryOptions = {}): MediaPipelineServiceClient {
  const baseUrl = resolveMediaPipelineServiceBaseUrl(options)
  if (!baseUrl) {
    throw new Error('movscript.media.pipeline endpoint was not found; start the local runtime daemon or set MOVSCRIPT_MEDIA_PIPELINE_URL')
  }
  return new MediaPipelineServiceClient({ baseUrl })
}

export function resolveEditingServiceBaseUrl(options: EditingServiceDiscoveryOptions = {}): string | undefined {
  const env = options.env ?? process.env
  const explicit = normalizeEditingServiceBaseUrl(options.baseUrl)
    ?? normalizeEditingServiceBaseUrl(env.MOVSCRIPT_EDITING_SERVICE_URL)
    ?? normalizeEditingServiceBaseUrl(env.MOVSCRIPT_EDITING_SERVICE_BASE_URL)
  if (explicit) return explicit

  const homeDir = options.homeDir ?? resolveMovScriptHomeDir({ env })
  const snapshot = readRuntimeHomeSnapshot(homeDir)
  const endpoint = findRuntimeEndpoint(snapshot, EDITING_SERVICE_NAME)
    ?? findRuntimeService(snapshot, EDITING_SERVICE_NAME)?.endpoint
  return normalizeEditingServiceBaseUrl(endpointURL(endpoint))
}

export function resolveMediaPipelineServiceBaseUrl(options: MediaPipelineServiceDiscoveryOptions = {}): string | undefined {
  const env = options.env ?? process.env
  const explicit = normalizeMediaPipelineServiceBaseUrl(options.baseUrl)
    ?? normalizeMediaPipelineServiceBaseUrl(env.MOVSCRIPT_MEDIA_PIPELINE_URL)
    ?? normalizeMediaPipelineServiceBaseUrl(env.MOVSCRIPT_MEDIA_PIPELINE_BASE_URL)
  if (explicit) return explicit

  const homeDir = options.homeDir ?? resolveMovScriptHomeDir({ env })
  const snapshot = readRuntimeHomeSnapshot(homeDir)
  const endpoint = findRuntimeEndpoint(snapshot, MEDIA_PIPELINE_SERVICE_NAME)
    ?? findRuntimeService(snapshot, MEDIA_PIPELINE_SERVICE_NAME)?.endpoint
  return normalizeMediaPipelineServiceBaseUrl(endpointURL(endpoint))
}

export function normalizeEditingServiceBaseUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return undefined
  const url = new URL(trimmed)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('editing service baseUrl must use http or https')
  }
  return url.toString().replace(/\/+$/, '')
}

export function normalizeMediaPipelineServiceBaseUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return undefined
  const url = new URL(trimmed)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('media pipeline service baseUrl must use http or https')
  }
  return url.toString().replace(/\/+$/, '')
}

function endpointURL(endpoint: RuntimeEndpointRecord | undefined): string | undefined {
  if (!endpoint) return undefined
  if (endpoint.url) return endpoint.url
  if (endpoint.baseURL) return endpoint.baseURL
  if (endpoint.port && endpoint.protocol === 'http') return `http://127.0.0.1:${endpoint.port}`
  if (endpoint.port) return `http://127.0.0.1:${endpoint.port}`
  return undefined
}
