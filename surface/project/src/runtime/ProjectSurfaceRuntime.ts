import type { ProjectSurfaceRouteKey } from '../domain/index.js'
import type { MovScriptContextEnvelope } from '@movscript/shared'
import { movScriptContextProjectCwd, movScriptContextProjectId } from '@movscript/shared'

export type ProjectSurfaceProjectLocation = 'local' | 'remote'

export type { ProjectSurfaceRouteKey } from '../domain/index.js'

export interface ProjectSurfaceProjectContext {
  projectId: string
  location?: ProjectSurfaceProjectLocation
  projectDir?: string
  projectUid?: string
  title?: string
}

export interface ProjectSurfaceDiagnosticEndpoints {
  gateway?: string
  mcpApi?: string
  editing?: string
  mediaPipeline?: string
  [key: string]: string | undefined
}

export interface ProjectSurfaceDiagnostics {
  endpoints?: ProjectSurfaceDiagnosticEndpoints
}

export interface ProjectSurfaceCapabilities {
  nativeWindowControls: boolean
  localFilePicker: boolean
  localDirectoryPicker: boolean
  localGit: boolean
  resourceUpload: boolean
  generation: boolean
  editing: boolean
  mediaPipeline: boolean
}

export interface ProjectSurfaceRouteParams {
  [key: string]: string | number | boolean | undefined
}

export interface ProjectSurfaceNavigator {
  href(route: ProjectSurfaceRouteKey, params?: ProjectSurfaceRouteParams): string
  open(route: ProjectSurfaceRouteKey, params?: ProjectSurfaceRouteParams): void | Promise<void>
  openExternal?(url: string): void | Promise<void>
}

export interface ProjectSurfaceNotifier {
  success(message: string, detail?: string): void
  warning(message: string, detail?: string): void
  error(message: string, detail?: string): void
  info?(message: string, detail?: string): void
}

export interface ProjectSurfaceProjectRequest {
  projectId: string
  projectDir?: string
  projectUid?: string
}

export interface ProjectSurfaceWorkspaceOperationInput extends Partial<ProjectSurfaceProjectRequest> {
  input?: unknown
}

export interface ProjectSurfaceResourceViewInput extends Partial<ProjectSurfaceProjectRequest> {
  kind: string
  input?: unknown
}

export interface ProjectSurfaceCandidateViewInput extends Partial<ProjectSurfaceProjectRequest> {
  contentUnitIds: string[]
  input?: unknown
}

export type ProjectSurfaceGitAction = 'status' | 'init' | 'commit' | 'pull' | 'push'

export interface ProjectSurfaceGitActionInput extends Omit<Partial<ProjectSurfaceProjectRequest>, 'projectId'> {
  action: ProjectSurfaceGitAction
  remoteURL?: string
  projectId?: string | number
}

export interface ProjectSurfaceGitActionResult {
  ok?: boolean
  path?: string
  branch?: string
  hasGit?: boolean
  isDirty?: boolean
  changedFiles?: number
  remoteName?: string
  remoteURL?: string
  stdout?: string
  stderr?: string
  error?: string
  [key: string]: unknown
}

export type ProjectSurfaceDataScopeKind = 'user' | 'org' | 'local'

export interface ProjectSurfaceDataSpaceSummary {
  id?: number | string
  scope_kind?: ProjectSurfaceDataScopeKind
  scope_id?: string
  project_uid?: string
  title?: string
  status?: string
  decision_count?: number
  candidate_count?: number
  selection_count?: number
  updated_at?: string
  last_decision_at?: string
  [key: string]: unknown
}

export interface ProjectSurfaceDataSpacesResult {
  scopeKind?: ProjectSurfaceDataScopeKind
  scopeId?: string | number
  items: ProjectSurfaceDataSpaceSummary[]
  [key: string]: unknown
}

export interface ProjectSurfaceWorkspaceMetadata {
  projectId?: string | number
  gitRemoteUrl?: string
  gitRemoteStrategy?: string
  status?: string
  lastSyncError?: string
  [key: string]: unknown
}

export interface ProjectServiceGateway {
  readModel(input?: Partial<ProjectSurfaceProjectRequest>): Promise<unknown>
  homeReadModel?(input?: Partial<ProjectSurfaceProjectRequest>): Promise<unknown>
  standardsReadModel?(input?: Partial<ProjectSurfaceProjectRequest>): Promise<unknown>
  scriptsReadModel?(input?: Partial<ProjectSurfaceProjectRequest>): Promise<unknown>
  sourceSnapshot?(input?: Partial<ProjectSurfaceProjectRequest>): Promise<unknown>
  inspectSource?(input?: Partial<ProjectSurfaceProjectRequest>): Promise<unknown>
  overviewSource?(input?: Partial<ProjectSurfaceProjectRequest>): Promise<unknown>
  interpretSource?(input?: Partial<ProjectSurfaceProjectRequest>): Promise<unknown>
  regenerationPlan?(input?: Partial<ProjectSurfaceProjectRequest>): Promise<unknown>
  upsertProjectStandards?(input: ProjectSurfaceWorkspaceOperationInput): Promise<unknown>
  readScriptSource?(input: ProjectSurfaceWorkspaceOperationInput): Promise<unknown>
  upsertScript?(input: ProjectSurfaceWorkspaceOperationInput): Promise<unknown>
  snapshotScriptVersionFromMarkdown?(input: ProjectSurfaceWorkspaceOperationInput): Promise<unknown>
  listProductionEditingWorkspaces?(input: ProjectSurfaceWorkspaceOperationInput): Promise<unknown>
  createProductionEditingWorkspace?(input: ProjectSurfaceWorkspaceOperationInput): Promise<unknown>
  openProductionEditingWorkspace?(input: ProjectSurfaceWorkspaceOperationInput): Promise<unknown>
  deleteProductionEditingWorkspace?(input: ProjectSurfaceWorkspaceOperationInput): Promise<unknown>
  refreshProductionEditingResources?(input: ProjectSurfaceWorkspaceOperationInput): Promise<unknown>
  /** Debug/compat gateway. Product surfaces should prefer page-level read-model gateways. */
  resourceView?(input: ProjectSurfaceResourceViewInput): Promise<unknown>
  candidateView?(input: ProjectSurfaceCandidateViewInput): Promise<unknown>
  interpret?(input?: Partial<ProjectSurfaceProjectRequest>): Promise<unknown>
  readSource?(input?: Partial<ProjectSurfaceProjectRequest>): Promise<unknown>
  gitStatus?(input?: Omit<Partial<ProjectSurfaceProjectRequest>, 'projectId'> & { projectId?: string | number }): Promise<ProjectSurfaceGitActionResult>
  gitAction?(input: ProjectSurfaceGitActionInput): Promise<ProjectSurfaceGitActionResult>
  listDataSpaces?(input?: Partial<ProjectSurfaceProjectRequest>): Promise<ProjectSurfaceDataSpacesResult>
  readWorkspaceMetadata?(input?: Omit<Partial<ProjectSurfaceProjectRequest>, 'projectId'> & { projectId?: string | number }): Promise<ProjectSurfaceWorkspaceMetadata | undefined>
}

export interface ResourceServiceGateway {
  list?(input?: Record<string, unknown>): Promise<unknown>
  upload?(input: unknown): Promise<unknown>
  bind?(input: unknown): Promise<unknown>
}

export interface GenerationServiceGateway {
  generate?(input: unknown): Promise<unknown>
  readJob?(input: unknown): Promise<unknown>
}

export interface EditingServiceGateway {
  readProject?(input?: Record<string, unknown>): Promise<unknown>
  render?(input: unknown): Promise<unknown>
  taskGet?(input: Record<string, unknown>): Promise<unknown>
  taskLogs?(input: Record<string, unknown>): Promise<unknown>
  export?(input: unknown): Promise<unknown>
}

export interface ProjectSurfaceGateways {
  project: ProjectServiceGateway
  resources?: ResourceServiceGateway
  generation?: GenerationServiceGateway
  editing?: EditingServiceGateway
}

export interface ProjectSurfaceRuntime {
  context?: MovScriptContextEnvelope
  project: ProjectSurfaceProjectContext
  diagnostics: ProjectSurfaceDiagnostics
  capabilities: ProjectSurfaceCapabilities
  navigator: ProjectSurfaceNavigator
  notifier: ProjectSurfaceNotifier
  gateways: ProjectSurfaceGateways
}

export interface ProjectSurfaceRuntimeInput {
  context?: MovScriptContextEnvelope
  project: ProjectSurfaceProjectContext
  diagnostics?: ProjectSurfaceDiagnostics
  capabilities?: Partial<ProjectSurfaceCapabilities>
  navigator: ProjectSurfaceNavigator
  notifier?: ProjectSurfaceNotifier
  gateways: ProjectSurfaceGateways
}

export const defaultProjectSurfaceCapabilities: ProjectSurfaceCapabilities = {
  nativeWindowControls: false,
  localFilePicker: false,
  localDirectoryPicker: false,
  localGit: false,
  resourceUpload: false,
  generation: false,
  editing: false,
  mediaPipeline: false,
}

export const noopProjectSurfaceNotifier: ProjectSurfaceNotifier = {
  success() {},
  warning() {},
  error() {},
  info() {},
}

export function createProjectSurfaceRuntime(input: ProjectSurfaceRuntimeInput): ProjectSurfaceRuntime {
  const project = projectSurfaceProjectFromContext(input.context, input.project)
  return {
    ...(input.context ? { context: input.context } : {}),
    project,
    diagnostics: input.diagnostics ?? {},
    capabilities: {
      ...defaultProjectSurfaceCapabilities,
      ...input.capabilities,
    },
    navigator: input.navigator,
    notifier: input.notifier ?? noopProjectSurfaceNotifier,
    gateways: input.gateways,
  }
}

export function projectSurfaceProjectFromContext(
  context: MovScriptContextEnvelope | undefined,
  fallback: ProjectSurfaceProjectContext,
): ProjectSurfaceProjectContext {
  const projectId = movScriptContextProjectId(context) ?? fallback.projectId
  const projectDir = movScriptContextProjectCwd(context) ?? fallback.projectDir
  const workspaceKind = context?.session?.workspace?.kind
  const contextProject = context?.session?.project
  return {
    ...fallback,
    projectId,
    location: workspaceKind === 'local-fs'
      ? 'local'
      : workspaceKind === 'cloud' || workspaceKind === 'external'
        ? 'remote'
        : fallback.location,
    ...(projectDir ? { projectDir } : {}),
    ...(contextProject?.uid ? { projectUid: contextProject.uid } : {}),
    ...(contextProject?.title ? { title: contextProject.title } : {}),
  }
}

export function withProjectSurfaceProjectRequest(
  runtime: Pick<ProjectSurfaceRuntime, 'project'>,
  input: Partial<ProjectSurfaceProjectRequest> = {},
): ProjectSurfaceProjectRequest {
  return {
    projectId: input.projectId ?? runtime.project.projectId,
    projectDir: input.projectDir ?? runtime.project.projectDir,
    projectUid: input.projectUid ?? runtime.project.projectUid,
  }
}
