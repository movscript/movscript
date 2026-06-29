import {
  findRuntimeEndpoint,
  findRuntimeService,
  readRuntimeHomeSnapshot,
  resolveMovScriptHomeDir,
  type RuntimeEndpointRecord,
} from '@movscript/runtime-contracts'

const defaultFetch = globalThis.fetch

export const PROJECT_SERVICE_NAME = 'movscript.project.service'
export const PROJECT_SERVICE_CAPABILITIES_ENDPOINT = '/v1/project/capabilities'
export const PROJECT_SERVICE_SOURCE_SNAPSHOT_ENDPOINT = '/v1/project/source/snapshot'
export const PROJECT_SERVICE_SOURCE_INSPECT_ENDPOINT = '/v1/project/source/inspect'
export const PROJECT_SERVICE_SOURCE_OVERVIEW_ENDPOINT = '/v1/project/source/overview'
export const PROJECT_SERVICE_READ_MODEL_ENDPOINT = '/v1/project/read-model'
export const PROJECT_SERVICE_HOME_READ_MODEL_ENDPOINT = '/v1/project/home/read-model'
export const PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT = '/v1/project/standards/read-model'
export const PROJECT_SERVICE_CONTENT_CANVAS_READ_MODEL_ENDPOINT = '/v1/project/content-canvas/read-model'
export const PROJECT_SERVICE_SCRIPTS_READ_MODEL_ENDPOINT = '/v1/project/scripts/read-model'
export const PROJECT_SERVICE_CONTENT_UNITS_READ_MODEL_ENDPOINT = '/v1/project/content-units/read-model'
export const PROJECT_SERVICE_LOCATOR_RESOLVE_ENDPOINT = '/v1/project/locator/resolve'
export const PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT = '/v1/project/resources/view'
export const PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT = '/v1/project/lifecycle/command'
export const PROJECT_SERVICE_SOURCE_INTERPRET_ENDPOINT = '/v1/project/source/interpret'
export const PROJECT_SERVICE_SOURCE_REGENERATION_PLAN_ENDPOINT = '/v1/project/source/regeneration-plan'
export const PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT = '/v1/project/source/command'
export const PROJECT_SERVICE_ENTITIES_QUERY_ENDPOINT = '/v1/project/entities/query'
export const PROJECT_SERVICE_SETTINGS_QUERY_ENDPOINT = '/v1/project/settings/query'
export const PROJECT_SERVICE_ASSETS_QUERY_ENDPOINT = '/v1/project/assets/query'
export const PROJECT_SERVICE_CONTENT_WORKSPACE_SNAPSHOT_ENDPOINT = '/v1/project/content-workspace/snapshot'
export const PROJECT_SERVICE_CONTENT_WORKSPACE_READ_ENDPOINT = '/v1/project/content-workspace/read'
export const PROJECT_SERVICE_STANDARDS_UPSERT_ENDPOINT = '/v1/project/standards/upsert'
export const PROJECT_SERVICE_SCRIPT_SOURCE_READ_ENDPOINT = '/v1/project/scripts/source/read'
export const PROJECT_SERVICE_SCRIPT_UPSERT_ENDPOINT = '/v1/project/scripts/upsert'
export const PROJECT_SERVICE_SCRIPT_VERSION_SNAPSHOT_ENDPOINT = '/v1/project/scripts/versions/snapshot'
export const PROJECT_SERVICE_SETTING_UPSERT_ENDPOINT = '/v1/project/settings/upsert'
export const PROJECT_SERVICE_SETTING_CREATE_ENDPOINT = '/v1/project/settings/create'
export const PROJECT_SERVICE_SETTING_STATE_CREATE_ENDPOINT = '/v1/project/settings/states/create'
export const PROJECT_SERVICE_ASSET_UPSERT_ENDPOINT = '/v1/project/assets/upsert'
export const PROJECT_SERVICE_ASSET_CREATE_ENDPOINT = '/v1/project/assets/create'
export const PROJECT_SERVICE_PRODUCTION_SNAPSHOT_SAVE_ENDPOINT = '/v1/project/productions/snapshot/save'
export const PROJECT_SERVICE_CONTENT_UNIT_UPSERT_ENDPOINT = '/v1/project/content-units/upsert'
export const PROJECT_SERVICE_CONTENT_UNIT_CREATE_ENDPOINT = '/v1/project/content-units/create'
export const PROJECT_SERVICE_CONTENT_UNIT_ENSURE_ENDPOINT = '/v1/project/content-units/ensure'
export const PROJECT_SERVICE_TIMELINE_ASSEMBLY_CONTENT_UNIT_ENSURE_ENDPOINT = '/v1/project/timeline-assemblies/content-unit/ensure'
export const PROJECT_SERVICE_CONTENT_UNIT_EDIT_PROMPT_UPDATE_ENDPOINT = '/v1/project/content-units/edit-prompt/update'
export const PROJECT_SERVICE_PRODUCTION_CREATE_ENDPOINT = '/v1/project/productions/create'
export const PROJECT_SERVICE_SEGMENT_CREATE_ENDPOINT = '/v1/project/segments/create'
export const PROJECT_SERVICE_SCENE_MOMENT_CREATE_ENDPOINT = '/v1/project/scene-moments/create'
export const PROJECT_SERVICE_SCENE_MOMENT_SETTING_CONNECT_ENDPOINT = '/v1/project/scene-moments/settings/connect'
export const PROJECT_SERVICE_EXPRESSION_UNIT_CREATE_ENDPOINT = '/v1/project/expression-units/create'
export const PROJECT_SERVICE_EXPRESSION_UNIT_UPDATE_ENDPOINT = '/v1/project/expression-units/update'
export const PROJECT_SERVICE_KEYFRAME_CREATE_ENDPOINT = '/v1/project/keyframes/create'
export const PROJECT_SERVICE_STORYBOARD_CREATE_ENDPOINT = '/v1/project/storyboards/create'
export const PROJECT_SERVICE_STORYBOARD_TIMELINE_UPDATE_ENDPOINT = '/v1/project/storyboards/timeline/update'
export const PROJECT_SERVICE_AUDIO_CUE_CREATE_ENDPOINT = '/v1/project/audio-cues/create'
export const PROJECT_SERVICE_AUDIO_CUE_UPDATE_ENDPOINT = '/v1/project/audio-cues/update'
export const PROJECT_SERVICE_ENTITY_BASICS_UPDATE_ENDPOINT = '/v1/project/entities/basics/update'
export const PROJECT_SERVICE_ENTITY_TRANSITION_UPDATE_ENDPOINT = '/v1/project/entities/transition/update'
export const PROJECT_SERVICE_ENTITY_DELETE_ENDPOINT = '/v1/project/entities/delete'
export const PROJECT_SERVICE_HIERARCHY_WRITE_ENDPOINT = '/v1/project/hierarchy/write'
export const PROJECT_SERVICE_NAMESPACE_WRITE_ENDPOINT = '/v1/project/namespaces/write'
export const PROJECT_SERVICE_CONTENT_CANVASES_LIST_ENDPOINT = '/v1/project/content-canvases/list'
export const PROJECT_SERVICE_CONTENT_CANVAS_WRITE_ENDPOINT = '/v1/project/content-canvases/write'
export const PROJECT_SERVICE_CONTENT_CANVAS_RENAME_ENDPOINT = '/v1/project/content-canvases/rename'
export const PROJECT_SERVICE_CONTENT_CANVAS_RUN_ENDPOINT = '/v1/project/content-canvases/run'
export const PROJECT_SERVICE_CONTENT_CANVAS_DELETE_ENDPOINT = '/v1/project/content-canvases/delete'
export const PROJECT_SERVICE_WORKSPACE_CANDIDATE_SELECT_ENDPOINT = '/v1/project/workspace-candidates/select'
export const PROJECT_SERVICE_WORKSPACE_CANDIDATE_APPEND_ENDPOINT = '/v1/project/workspace-candidates/append'
export const PROJECT_SERVICE_WORKSPACE_ASSET_SLOT_CANDIDATE_CREATE_ENDPOINT = '/v1/project/workspace-candidates/asset-slots/create'
export const PROJECT_SERVICE_WORKSPACE_KEYFRAME_CANDIDATE_CREATE_ENDPOINT = '/v1/project/workspace-candidates/keyframes/create'
export const PROJECT_SERVICE_CONTENT_CANDIDATE_CREATE_ENDPOINT = '/v1/project/content-candidates/create'
export const PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_SELECT_ENDPOINT = '/v1/project/content-unit-candidates/select'
export const PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_DECIDE_ENDPOINT = '/v1/project/content-unit-candidates/decide'
export const PROJECT_SERVICE_CANDIDATE_COMMAND_ENDPOINT = '/v1/project/candidates/command'
export const PROJECT_SERVICE_CANDIDATE_VIEW_ENDPOINT = '/v1/project/candidates/view'
export const PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT = '/v1/project/prompt/context'

export type ProjectSourceCommandName =
  | 'queryEntities'
  | 'querySettings'
  | 'queryAssets'
  | 'readContentUnitGenerationPrompt'
  | 'buildContentUnitBackendPrompt'
  | 'loadContentWorkspaceSnapshot'
  | 'loadContentWorkspace'
  | 'listContentCanvases'
  | 'writeContentCanvas'
  | 'renameContentCanvas'
  | 'runContentCanvas'
  | 'deleteContentCanvas'
  | 'upsertProjectStandards'
  | 'createSetting'
  | 'createSettingState'
  | 'createAsset'
  | 'upsertScript'
  | 'snapshotScriptVersionFromMarkdown'
  | 'createContentUnit'
  | 'ensureContentUnitForEntity'
  | 'ensureTimelineAssemblyContentUnit'
  | 'createProduction'
  | 'createSegment'
  | 'createSceneMoment'
  | 'createStoryboard'
  | 'createKeyframe'
  | 'createAudioCue'
  | 'createExpressionUnit'
  | 'updateContentUnitEditPrompt'
  | 'updateExpressionUnit'
  | 'updateAudioCue'
  | 'updateEntityBasics'
  | 'connectSceneMomentSetting'
  | 'updateEntityTransition'
  | 'updateStoryboardTimeline'
  | 'writeHierarchyNode'
  | 'writeNamespaceNode'
  | 'syncContentWorkspace'
  | 'deleteEntity'

export interface ProjectSourceRequest {
  projectDir: string
  projectId?: string | number
  projectUid?: string
  includeContentUnitDecisionDocuments?: boolean
  debugArtifacts?: boolean
  commit?: string
  checkpointHash?: string
}

export interface ProjectSourceCommandRequest {
  projectDir: string
  command: ProjectSourceCommandName
  input?: Record<string, unknown>
}

export interface ProjectSourceOperationRequest {
  projectDir: string
  input?: Record<string, unknown>
}

export type ProjectCandidateCommandName =
  | 'createContentCandidate'
  | 'selectContentUnitCandidate'
  | 'decideContentUnitCandidate'

export type ProjectLifecycleCommandName =
  | 'openProject'
  | 'createProject'
  | 'importProject'

export type ProjectResourceViewKind =
  | 'summary'
  | 'scripts'
  | 'settings'
  | 'setting-states'
  | 'states'
  | 'assets'
  | 'project-context'
  | 'namespace-vocabulary'
  | 'timeline-namespaces'
  | 'setting-namespaces'
  | 'system-primitives'
  | 'domain-nodes'
  | 'domain-edges'
  | 'episodes'
  | 'productions'
  | 'scenes'
  | 'segments'
  | 'storyboards'
  | 'content-units'
  | 'script-versions'

export interface ProjectLifecycleCommandRequest {
  projectDir: string
  command: ProjectLifecycleCommandName
  input?: Record<string, unknown>
}

export interface ProjectResourceViewRequest {
  projectDir: string
  kind: ProjectResourceViewKind
}

export interface ProjectLocatorResolveRequest {
  projectDir: string
  workspaceDir?: string
  projectUid?: string
}

export interface ProjectDecisionStoreConfig {
  kind: 'scoped-project-data'
  baseUrl: string
  projectUid: string
  title?: string
  scopeKind?: 'user' | 'org'
  scopeId?: string | number
  token?: string
  headers?: Record<string, string>
}

export interface ProjectCandidateCommandRequest {
  projectDir: string
  command: ProjectCandidateCommandName
  input?: Record<string, unknown>
  decisionStore: ProjectDecisionStoreConfig
}

export interface ProjectCandidateActionRequest {
  projectDir: string
  input?: Record<string, unknown>
  decisionStore: ProjectDecisionStoreConfig
}

export interface ProjectCandidateViewRequest {
  projectDir: string
  contentUnitId?: string | number
  contentUnitIds?: Array<string | number>
  decisionStore: ProjectDecisionStoreConfig
}

export interface ProjectPromptContextRequest {
  projectDir: string
  contentUnitId?: string | number
  contentUnitIds?: Array<string | number>
  include?: ProjectPromptContextInclude[]
  promptText?: string
  decisionStore?: ProjectDecisionStoreConfig
}

export interface ProjectContentUnitsReadModelRequest extends ProjectSourceRequest {
  contentUnitIds: Array<string | number>
  decisionStore?: ProjectDecisionStoreConfig
}

export type ProjectPromptContextInclude =
  | 'runtimePanel'
  | 'generationPrompt'
  | 'dependencyReport'
  | 'selectionValidity'
  | 'backendPrompt'

export interface ProjectServiceEnvelope<T> {
  schema: string
  projectDir: string
  [key: string]: unknown
}

export type ProjectSourceSnapshotResponse = ProjectServiceEnvelope<unknown> & {
  source: unknown
}

export type ProjectSourceInspectionResponse = ProjectServiceEnvelope<unknown> & {
  inspection: unknown
}

export type ProjectSourceOverviewResponse = ProjectServiceEnvelope<unknown> & {
  overview: unknown
}

export interface ProjectReadModelRequest extends ProjectSourceRequest {
  includeSource?: boolean
  includeInspection?: boolean
}

export type ProjectReadModelResponse = ProjectServiceEnvelope<unknown> & {
  projectReadModel: unknown
}

export type ProjectHomeReadModelResponse = ProjectServiceEnvelope<unknown> & {
  projectHomeReadModel: unknown
}

export type ProjectStandardsReadModelResponse = ProjectServiceEnvelope<unknown> & {
  projectStandardsReadModel: unknown
}

export type ProjectContentCanvasReadModelResponse = ProjectServiceEnvelope<unknown> & {
  projectContentCanvasReadModel: unknown
}

export type ProjectScriptsReadModelResponse = ProjectServiceEnvelope<unknown> & {
  projectScriptsReadModel: unknown
}

export type ProjectContentUnitsReadModelResponse = ProjectServiceEnvelope<unknown> & {
  projectContentUnitsReadModel: unknown
}

export type ProjectSourceInterpretationResponse = ProjectServiceEnvelope<unknown> & {
  interpretation: unknown
}

export type ProjectSourceRegenerationPlanResponse = ProjectServiceEnvelope<unknown> & {
  regenerationPlan: unknown
}

export type ProjectSourceCommandResponse = ProjectServiceEnvelope<unknown> & {
  command: ProjectSourceCommandName
  result: unknown
}

export type ProjectSourceOperationResponse = ProjectServiceEnvelope<unknown> & {
  result: unknown
}

export type ProjectLifecycleCommandResponse = ProjectServiceEnvelope<unknown> & {
  command: ProjectLifecycleCommandName
  result: unknown
}

export type ProjectLocatorResolveResponse = ProjectServiceEnvelope<unknown> & {
  locator: {
    status: 'ready' | 'missing_metadata'
    projectDir: string
    projectPath: string
    workspaceDir?: string
    projectId?: string
    projectUid?: string
    projectTitle?: string
    description?: string
  }
}

export type ProjectResourceViewResponse = ProjectServiceEnvelope<unknown> & {
  kind: ProjectResourceViewKind
  usage?: 'debug_compat'
  viewMode?: 'debug_compat'
  view_mode?: 'debug_compat'
  preferredEndpoint?: string
  preferred_endpoint?: string
  items: unknown[]
}

export type ProjectCandidateCommandResponse = ProjectServiceEnvelope<unknown> & {
  command: ProjectCandidateCommandName
  result: unknown
}

export type ProjectCandidateActionResponse = ProjectServiceEnvelope<unknown> & {
  result: unknown
}

export type ProjectCandidateViewResponse = ProjectServiceEnvelope<unknown> & {
  contentUnitId?: string | number
  contentUnitIds?: Array<string | number>
  contexts: unknown[]
}

export type ProjectPromptContextResponse = ProjectServiceEnvelope<unknown> & {
  contentUnitId?: string | number
  contentUnitIds?: Array<string | number>
  contexts?: Array<{
    contentUnitId: string | number
    context: Record<string, unknown>
  }>
  runtimePanel?: unknown
  generationPrompt?: unknown
  dependencyReport?: unknown
  selectionValidity?: unknown
  backendPrompt?: unknown
}

export interface ProjectServiceClientOptions {
  baseUrl: string
  fetch?: typeof fetch
}

export interface ProjectServiceDiscoveryOptions {
  baseUrl?: string
  env?: NodeJS.ProcessEnv
  homeDir?: string
}

export class ProjectServiceClient {
  readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(options: ProjectServiceClientOptions) {
    const baseUrl = normalizeProjectServiceBaseUrl(options.baseUrl)
    if (!baseUrl) throw new Error('project service baseUrl is required')
    this.baseUrl = baseUrl
    this.fetchImpl = options.fetch ?? defaultFetch
  }

  async capabilities(signal?: AbortSignal): Promise<unknown> {
    return this.request('GET', PROJECT_SERVICE_CAPABILITIES_ENDPOINT, undefined, signal)
  }

  async sourceSnapshot(request: ProjectSourceRequest, signal?: AbortSignal): Promise<ProjectSourceSnapshotResponse> {
    return this.request('POST', PROJECT_SERVICE_SOURCE_SNAPSHOT_ENDPOINT, projectSourcePayload(request), signal)
  }

  async inspectSource(request: ProjectSourceRequest, signal?: AbortSignal): Promise<ProjectSourceInspectionResponse> {
    return this.request('POST', PROJECT_SERVICE_SOURCE_INSPECT_ENDPOINT, projectSourcePayload(request), signal)
  }

  async overviewSource(request: ProjectSourceRequest, signal?: AbortSignal): Promise<ProjectSourceOverviewResponse> {
    return this.request('POST', PROJECT_SERVICE_SOURCE_OVERVIEW_ENDPOINT, projectSourcePayload(request), signal)
  }

  async readModel(request: ProjectReadModelRequest, signal?: AbortSignal): Promise<ProjectReadModelResponse> {
    return this.request('POST', PROJECT_SERVICE_READ_MODEL_ENDPOINT, projectReadModelPayload(request), signal)
  }

  async homeReadModel(request: ProjectSourceRequest, signal?: AbortSignal): Promise<ProjectHomeReadModelResponse> {
    return this.request('POST', PROJECT_SERVICE_HOME_READ_MODEL_ENDPOINT, projectSourcePayload(request), signal)
  }

  async standardsReadModel(request: ProjectSourceRequest, signal?: AbortSignal): Promise<ProjectStandardsReadModelResponse> {
    return this.request('POST', PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT, projectSourcePayload(request), signal)
  }

  async contentCanvasReadModel(request: ProjectSourceRequest, signal?: AbortSignal): Promise<ProjectContentCanvasReadModelResponse> {
    return this.request('POST', PROJECT_SERVICE_CONTENT_CANVAS_READ_MODEL_ENDPOINT, projectSourcePayload(request), signal)
  }

  async scriptsReadModel(request: ProjectSourceRequest, signal?: AbortSignal): Promise<ProjectScriptsReadModelResponse> {
    return this.request('POST', PROJECT_SERVICE_SCRIPTS_READ_MODEL_ENDPOINT, projectSourcePayload(request), signal)
  }

  async contentUnitsReadModel(request: ProjectContentUnitsReadModelRequest, signal?: AbortSignal): Promise<ProjectContentUnitsReadModelResponse> {
    return this.request('POST', PROJECT_SERVICE_CONTENT_UNITS_READ_MODEL_ENDPOINT, {
      ...projectSourcePayload(request),
      contentUnitIds: request.contentUnitIds,
      ...(request.decisionStore ? { decisionStore: request.decisionStore } : {}),
    }, signal)
  }

  async interpretSource(request: ProjectSourceRequest, signal?: AbortSignal): Promise<ProjectSourceInterpretationResponse> {
    return this.request('POST', PROJECT_SERVICE_SOURCE_INTERPRET_ENDPOINT, projectSourcePayload(request), signal)
  }

  async regenerationPlan(request: ProjectSourceRequest, signal?: AbortSignal): Promise<ProjectSourceRegenerationPlanResponse> {
    return this.request('POST', PROJECT_SERVICE_SOURCE_REGENERATION_PLAN_ENDPOINT, projectSourcePayload(request), signal)
  }

  async sourceCommand(request: ProjectSourceCommandRequest, signal?: AbortSignal): Promise<ProjectSourceCommandResponse> {
    return this.request('POST', PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT, {
      projectDir: request.projectDir,
      command: request.command,
      input: request.input ?? {},
    }, signal)
  }

  async upsertProjectStandards(request: ProjectSourceOperationRequest, signal?: AbortSignal): Promise<ProjectSourceOperationResponse> {
    return this.request('POST', PROJECT_SERVICE_STANDARDS_UPSERT_ENDPOINT, projectSourceOperationPayload(request), signal)
  }

  async readScriptSource(request: ProjectSourceOperationRequest, signal?: AbortSignal): Promise<ProjectSourceOperationResponse> {
    return this.request('POST', PROJECT_SERVICE_SCRIPT_SOURCE_READ_ENDPOINT, projectSourceOperationPayload(request), signal)
  }

  async upsertScript(request: ProjectSourceOperationRequest, signal?: AbortSignal): Promise<ProjectSourceOperationResponse> {
    return this.request('POST', PROJECT_SERVICE_SCRIPT_UPSERT_ENDPOINT, projectSourceOperationPayload(request), signal)
  }

  async snapshotScriptVersionFromMarkdown(request: ProjectSourceOperationRequest, signal?: AbortSignal): Promise<ProjectSourceOperationResponse> {
    return this.request('POST', PROJECT_SERVICE_SCRIPT_VERSION_SNAPSHOT_ENDPOINT, projectSourceOperationPayload(request), signal)
  }

  async sourceOperation(endpoint: string, request: ProjectSourceOperationRequest, signal?: AbortSignal): Promise<ProjectSourceOperationResponse> {
    return this.request('POST', endpoint, projectSourceOperationPayload(request), signal)
  }

  async selectWorkspaceCandidate(request: ProjectSourceOperationRequest, signal?: AbortSignal): Promise<ProjectSourceOperationResponse> {
    return this.sourceOperation(PROJECT_SERVICE_WORKSPACE_CANDIDATE_SELECT_ENDPOINT, request, signal)
  }

  async appendWorkspaceCandidate(request: ProjectSourceOperationRequest, signal?: AbortSignal): Promise<ProjectSourceOperationResponse> {
    return this.sourceOperation(PROJECT_SERVICE_WORKSPACE_CANDIDATE_APPEND_ENDPOINT, request, signal)
  }

  async createWorkspaceAssetSlotCandidate(request: ProjectSourceOperationRequest, signal?: AbortSignal): Promise<ProjectSourceOperationResponse> {
    return this.sourceOperation(PROJECT_SERVICE_WORKSPACE_ASSET_SLOT_CANDIDATE_CREATE_ENDPOINT, request, signal)
  }

  async createWorkspaceKeyframeCandidate(request: ProjectSourceOperationRequest, signal?: AbortSignal): Promise<ProjectSourceOperationResponse> {
    return this.sourceOperation(PROJECT_SERVICE_WORKSPACE_KEYFRAME_CANDIDATE_CREATE_ENDPOINT, request, signal)
  }

  async createContentCandidate(request: ProjectCandidateActionRequest, signal?: AbortSignal): Promise<ProjectCandidateActionResponse> {
    return this.candidateAction(PROJECT_SERVICE_CONTENT_CANDIDATE_CREATE_ENDPOINT, request, signal)
  }

  async selectContentUnitCandidate(request: ProjectCandidateActionRequest, signal?: AbortSignal): Promise<ProjectCandidateActionResponse> {
    return this.candidateAction(PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_SELECT_ENDPOINT, request, signal)
  }

  async decideContentUnitCandidate(request: ProjectCandidateActionRequest, signal?: AbortSignal): Promise<ProjectCandidateActionResponse> {
    return this.candidateAction(PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_DECIDE_ENDPOINT, request, signal)
  }

  async lifecycleCommand(request: ProjectLifecycleCommandRequest, signal?: AbortSignal): Promise<ProjectLifecycleCommandResponse> {
    return this.request('POST', PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT, {
      projectDir: request.projectDir,
      command: request.command,
      input: request.input ?? {},
    }, signal)
  }

  async resolveLocator(request: ProjectLocatorResolveRequest, signal?: AbortSignal): Promise<ProjectLocatorResolveResponse> {
    return this.request('POST', PROJECT_SERVICE_LOCATOR_RESOLVE_ENDPOINT, {
      projectDir: request.projectDir,
      ...(request.workspaceDir ? { workspaceDir: request.workspaceDir } : {}),
      ...(request.projectUid ? { projectUid: request.projectUid } : {}),
    }, signal)
  }

  async resourceView(request: ProjectResourceViewRequest, signal?: AbortSignal): Promise<ProjectResourceViewResponse> {
    return this.request('POST', PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT, {
      projectDir: request.projectDir,
      kind: request.kind,
    }, signal)
  }

  async candidateCommand(request: ProjectCandidateCommandRequest, signal?: AbortSignal): Promise<ProjectCandidateCommandResponse> {
    return this.request('POST', PROJECT_SERVICE_CANDIDATE_COMMAND_ENDPOINT, {
      projectDir: request.projectDir,
      command: request.command,
      input: request.input ?? {},
      decisionStore: request.decisionStore,
    }, signal)
  }

  async candidateAction(endpoint: string, request: ProjectCandidateActionRequest, signal?: AbortSignal): Promise<ProjectCandidateActionResponse> {
    return this.request('POST', endpoint, {
      projectDir: request.projectDir,
      input: request.input ?? {},
      decisionStore: request.decisionStore,
    }, signal)
  }

  async candidateView(request: ProjectCandidateViewRequest, signal?: AbortSignal): Promise<ProjectCandidateViewResponse> {
    return this.request('POST', PROJECT_SERVICE_CANDIDATE_VIEW_ENDPOINT, {
      projectDir: request.projectDir,
      ...(request.contentUnitId !== undefined ? { contentUnitId: request.contentUnitId } : {}),
      ...(request.contentUnitIds !== undefined ? { contentUnitIds: request.contentUnitIds } : {}),
      decisionStore: request.decisionStore,
    }, signal)
  }

  async promptContext(request: ProjectPromptContextRequest, signal?: AbortSignal): Promise<ProjectPromptContextResponse> {
    return this.request('POST', PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT, {
      projectDir: request.projectDir,
      ...(request.contentUnitId !== undefined ? { contentUnitId: request.contentUnitId } : {}),
      ...(request.contentUnitIds !== undefined ? { contentUnitIds: request.contentUnitIds } : {}),
      ...(request.include !== undefined ? { include: request.include } : {}),
      ...(request.promptText !== undefined ? { promptText: request.promptText } : {}),
      ...(request.decisionStore ? { decisionStore: request.decisionStore } : {}),
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
      throw new ProjectServiceHTTPError(response.status, await response.text())
    }
    return response.json() as Promise<T>
  }
}

export class ProjectServiceHTTPError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, body: string) {
    super(`project service request failed: ${status}${body ? ` ${body}` : ''}`)
    this.name = 'ProjectServiceHTTPError'
    this.status = status
    this.body = body
  }
}

export function createProjectServiceClientFromRuntime(options: ProjectServiceDiscoveryOptions = {}): ProjectServiceClient {
  const baseUrl = resolveProjectServiceBaseUrl(options)
  if (!baseUrl) {
    throw new Error('movscript.project.service endpoint was not found; start the local runtime daemon or set MOVSCRIPT_PROJECT_SERVICE_URL')
  }
  return new ProjectServiceClient({ baseUrl })
}

export function resolveProjectServiceBaseUrl(options: ProjectServiceDiscoveryOptions = {}): string | undefined {
  const env = options.env ?? process.env
  const explicit = normalizeProjectServiceBaseUrl(options.baseUrl)
    ?? normalizeProjectServiceBaseUrl(env.MOVSCRIPT_PROJECT_SERVICE_URL)
    ?? normalizeProjectServiceBaseUrl(env.MOVSCRIPT_PROJECT_SERVICE_BASE_URL)
  if (explicit) return explicit

  const homeDir = options.homeDir ?? resolveMovScriptHomeDir({ env })
  const snapshot = readRuntimeHomeSnapshot(homeDir)
  const endpoint = findRuntimeEndpoint(snapshot, PROJECT_SERVICE_NAME)
    ?? findRuntimeService(snapshot, PROJECT_SERVICE_NAME)?.endpoint
  return normalizeProjectServiceBaseUrl(endpointURL(endpoint))
}

export function normalizeProjectServiceBaseUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return undefined
  const url = new URL(trimmed)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('project service baseUrl must use http or https')
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

function projectSourcePayload(request: ProjectSourceRequest): Record<string, unknown> {
  return {
    projectDir: request.projectDir,
    ...(request.projectId !== undefined ? { projectId: request.projectId } : {}),
    ...(request.projectUid ? { projectUid: request.projectUid } : {}),
    ...(request.includeContentUnitDecisionDocuments !== undefined ? {
      includeContentUnitDecisionDocuments: request.includeContentUnitDecisionDocuments,
    } : {}),
    ...(request.debugArtifacts !== undefined ? { debugArtifacts: request.debugArtifacts } : {}),
    ...(request.commit ? { commit: request.commit } : {}),
    ...(request.checkpointHash ? { checkpointHash: request.checkpointHash } : {}),
  }
}

function projectSourceOperationPayload(request: ProjectSourceOperationRequest): Record<string, unknown> {
  return {
    projectDir: request.projectDir,
    ...(request.input ?? {}),
  }
}

function projectReadModelPayload(request: ProjectReadModelRequest): Record<string, unknown> {
  return {
    ...projectSourcePayload(request),
    ...(request.includeSource !== undefined ? { includeSource: request.includeSource } : {}),
    ...(request.includeInspection !== undefined ? { includeInspection: request.includeInspection } : {}),
  }
}
