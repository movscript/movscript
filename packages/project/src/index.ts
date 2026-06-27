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
export const PROJECT_SERVICE_LOCATOR_RESOLVE_ENDPOINT = '/v1/project/locator/resolve'
export const PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT = '/v1/project/resources/view'
export const PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT = '/v1/project/lifecycle/command'
export const PROJECT_SERVICE_SOURCE_INTERPRET_ENDPOINT = '/v1/project/source/interpret'
export const PROJECT_SERVICE_SOURCE_REGENERATION_PLAN_ENDPOINT = '/v1/project/source/regeneration-plan'
export const PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT = '/v1/project/source/command'
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

export interface ProjectCandidateViewRequest {
  projectDir: string
  contentUnitId?: string | number
  contentUnitIds?: Array<string | number>
  decisionStore: ProjectDecisionStoreConfig
}

export interface ProjectPromptContextRequest {
  projectDir: string
  contentUnitId: string | number
  decisionStore?: ProjectDecisionStoreConfig
}

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
  items: unknown[]
}

export type ProjectCandidateCommandResponse = ProjectServiceEnvelope<unknown> & {
  command: ProjectCandidateCommandName
  result: unknown
}

export type ProjectCandidateViewResponse = ProjectServiceEnvelope<unknown> & {
  contentUnitId?: string | number
  contentUnitIds?: Array<string | number>
  contexts: unknown[]
}

export type ProjectPromptContextResponse = ProjectServiceEnvelope<unknown> & {
  contentUnitId: string | number
  runtimePanel?: unknown
  generationPrompt?: unknown
  dependencyReport?: unknown
  selectionValidity?: unknown
  backendPrompt: unknown
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
      contentUnitId: request.contentUnitId,
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
    ...(request.includeContentUnitDecisionDocuments !== undefined ? {
      includeContentUnitDecisionDocuments: request.includeContentUnitDecisionDocuments,
    } : {}),
    ...(request.debugArtifacts !== undefined ? { debugArtifacts: request.debugArtifacts } : {}),
    ...(request.commit ? { commit: request.commit } : {}),
    ...(request.checkpointHash ? { checkpointHash: request.checkpointHash } : {}),
  }
}

function projectReadModelPayload(request: ProjectReadModelRequest): Record<string, unknown> {
  return {
    ...projectSourcePayload(request),
    ...(request.includeSource !== undefined ? { includeSource: request.includeSource } : {}),
    ...(request.includeInspection !== undefined ? { includeInspection: request.includeInspection } : {}),
  }
}
