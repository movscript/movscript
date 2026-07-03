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
  shell: boolean
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

export type ProjectSurfaceShellScope = 'window' | 'workspace' | 'home'
export type ProjectSurfaceShellOwner = 'user' | 'system'
export type ProjectSurfaceShellStatus = 'idle' | 'starting' | 'running' | 'blocked' | 'failed' | 'exited' | 'needs_external_shell'
export type ProjectSurfaceShellReveal = boolean | 'always' | 'on_error' | 'silent'
export type ProjectSurfaceShellSessionSchema = 'movscript.shell_session.v1'
export type ProjectSurfaceShellJobSchema = 'movscript.shell_job.v1'
export type ProjectSurfaceShellIntentSchema = 'movscript.shell_intent.v1'
export type ProjectSurfaceShellJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'stopped'

export interface ProjectSurfaceShellSession {
  schema: ProjectSurfaceShellSessionSchema
  id: string
  jobId?: string
  title?: string
  owner?: ProjectSurfaceShellOwner
  scope?: ProjectSurfaceShellScope
  ownerFeature?: string
  status?: ProjectSurfaceShellStatus
  cwd?: string
  command?: string
  exitCode?: number
  signal?: number
  projectId?: string
  projectUid?: string
  projectDir?: string
  previewUrl?: string
  createdAt?: number
  updatedAt?: number
}

export interface ProjectSurfaceShellIntent {
  schema: ProjectSurfaceShellIntentSchema
  intentId: string
  intent_id?: string
  title?: string
  reason: string
  cwd: string
  command: string[]
  commandText: string
  command_text?: string
  ownerFeature: string
  owner_feature?: string
  expectedPreviewUrl?: string
  expected_preview_url?: string
  destructive: boolean
  status?: ProjectSurfaceShellStatus
}

export interface ProjectSurfaceShellJob {
  schema: ProjectSurfaceShellJobSchema
  jobId: string
  sessionId: string
  title?: string
  ownerFeature: string
  scope: ProjectSurfaceShellScope
  status: ProjectSurfaceShellJobStatus
  cwd: string
  command: string[]
  commandText: string
  command_text?: string
  reveal: 'always' | 'on_error' | 'silent'
  pid?: number
  exitCode?: number
  signal?: number
  projectId?: string
  projectUid?: string
  projectDir?: string
  previewUrl?: string
  startedAt?: number
  updatedAt?: number
  endedAt?: number
}

export type ProjectSurfaceRemotionStudioSessionSchema = 'movscript.remotion_studio_session.v1'
export type ProjectSurfaceRemotionStudioSessionLogsSchema = 'movscript.remotion_studio_session_logs.v1'
export type ProjectSurfaceRemotionStudioStatus =
  | 'checking'
  | 'installing'
  | 'starting'
  | 'ready'
  | 'failed'
  | 'stopped'
  | 'blocked'
  | 'needs_external_shell'

export interface ProjectSurfaceRemotionStudioSessionLogEntry {
  cursor?: string
  at?: string
  stream: string
  text: string
}

export interface ProjectSurfaceRemotionStudioSessionBlocker {
  code: string
  message: string
  command?: string[]
  installCommand?: string[]
  install_command?: string[]
  projectDirectory?: string
  project_directory?: string
  shellIntent?: ProjectSurfaceShellIntent
  shell_intent?: ProjectSurfaceShellIntent
}

export interface ProjectSurfaceRemotionStudioSession {
  schema: ProjectSurfaceRemotionStudioSessionSchema
  sessionId: string
  session_id?: string
  workspaceId?: string
  workspace_id?: string
  productionId?: string
  production_id?: string
  status: ProjectSurfaceRemotionStudioStatus
  previewUrl?: string
  preview_url?: string
  projectDirectory?: string
  project_directory?: string
  entrypoint?: string
  compositionId?: string
  composition_id?: string
  port?: number
  command?: string[]
  commandText?: string
  command_text?: string
  shellOwner?: string
  shell_owner?: string
  shellIntent?: ProjectSurfaceShellIntent
  shell_intent?: ProjectSurfaceShellIntent
  shellSessionId?: string
  shell_session_id?: string
  shellJobId?: string
  shell_job_id?: string
  shellStatus?: ProjectSurfaceShellStatus
  shell_status?: ProjectSurfaceShellStatus
  blockers?: ProjectSurfaceRemotionStudioSessionBlocker[]
  logs?: ProjectSurfaceRemotionStudioSessionLogEntry[]
  error?: string
  startedAt?: string
  started_at?: string
  updatedAt?: string
  updated_at?: string
  readyAt?: string
  ready_at?: string
  stoppedAt?: string
  stopped_at?: string
  exitCode?: number | null
  exit_code?: number | null
}

export interface ProjectSurfaceRemotionStudioSessionLogs {
  schema: ProjectSurfaceRemotionStudioSessionLogsSchema
  sessionId: string
  session_id?: string
  logs: ProjectSurfaceRemotionStudioSessionLogEntry[]
  cursor?: string | null
  shellSessionId?: string
  shell_session_id?: string
  shellJobId?: string
  shell_job_id?: string
}

export interface RemotionStudioSessionGateway {
  open(input: Record<string, unknown>): Promise<ProjectSurfaceRemotionStudioSession>
  get(input: Record<string, unknown>): Promise<ProjectSurfaceRemotionStudioSession>
  logs(input: Record<string, unknown>): Promise<ProjectSurfaceRemotionStudioSessionLogs>
  stop(input: Record<string, unknown>): Promise<ProjectSurfaceRemotionStudioSession>
}

export interface ProjectSurfaceShellListInput {
  scope?: ProjectSurfaceShellScope
  projectId?: string
  projectUid?: string
  projectDir?: string
}

export interface ProjectSurfaceShellJobListInput extends ProjectSurfaceShellListInput {
  ownerFeature?: string
}

export interface ProjectSurfaceShellCreateInput extends ProjectSurfaceShellListInput {
  title?: string
  owner?: ProjectSurfaceShellOwner
  ownerFeature?: string
  cwd?: string
}

export interface ProjectSurfaceShellRunInput extends ProjectSurfaceShellCreateInput {
  command: string
  previewUrl?: string
  reveal?: ProjectSurfaceShellReveal
}

export interface ProjectSurfaceShellSessionInput {
  sessionId: string
}

export interface ProjectSurfaceShellJobInput {
  jobId?: string
  sessionId?: string
}

export interface ProjectSurfaceShellWriteInput extends ProjectSurfaceShellSessionInput {
  data: string
}

export interface ProjectSurfaceShellLogsResult {
  sessionId: string
  text: string
}

export interface ProjectSurfaceShellJobLogsResult {
  jobId: string
  sessionId: string
  text: string
}

export interface ShellGateway {
  list(input?: ProjectSurfaceShellListInput): Promise<{ sessions: ProjectSurfaceShellSession[] }>
  create(input?: ProjectSurfaceShellCreateInput): Promise<ProjectSurfaceShellSession>
  run(input: ProjectSurfaceShellRunInput): Promise<ProjectSurfaceShellSession>
  get(input: ProjectSurfaceShellSessionInput): Promise<ProjectSurfaceShellSession | undefined>
  logs(input: ProjectSurfaceShellSessionInput): Promise<ProjectSurfaceShellLogsResult>
  listJobs(input?: ProjectSurfaceShellJobListInput): Promise<{ jobs: ProjectSurfaceShellJob[] }>
  getJob(input: ProjectSurfaceShellJobInput): Promise<ProjectSurfaceShellJob | undefined>
  jobLogs(input: ProjectSurfaceShellJobInput): Promise<ProjectSurfaceShellJobLogsResult>
  write(input: ProjectSurfaceShellWriteInput): Promise<void>
  stop(input: ProjectSurfaceShellSessionInput): Promise<void>
  reveal?(input: ProjectSurfaceShellSessionInput): Promise<void>
}

export interface ProjectSurfaceGateways {
  project: ProjectServiceGateway
  resources?: ResourceServiceGateway
  generation?: GenerationServiceGateway
  editing?: EditingServiceGateway
  remotionStudio?: RemotionStudioSessionGateway
  shell?: ShellGateway
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
  shell: false,
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
