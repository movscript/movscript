export type MovScriptWorkspaceKind =
  | 'setting_workspace'
  | 'asset_workspace'
  | 'project_standards_workspace'
  | 'production_workspace'
  | 'content_unit_workspace'

export type WorkspaceArtifactStatus = 'workspace' | 'accepted' | 'rejected' | 'applied' | 'superseded'

export interface WorkspaceArtifact {
  id: string
  filePath?: string
  projectId?: number
  kind: MovScriptWorkspaceKind
  title: string
  content: string
  status: WorkspaceArtifactStatus
  source?: Record<string, unknown>
  target?: Record<string, unknown>
  createdByRunId?: string
  createdByThreadId?: string
  appliedByUserId?: number | string
  appliedAt?: string
  rejectedReason?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface SurfaceWorkspaceArtifactRef {
  type: 'workspace'
  workspaceId: string
  projectId?: number
  workspaceKind?: MovScriptWorkspaceKind
  title?: string
  schema?: string
  source?: Record<string, unknown>
  target?: Record<string, unknown>
  metadata?: Record<string, unknown>
  filePath?: string
  sourceRunId?: string
  sourceThreadId?: string
  updatedAt?: string
}

export function selectLatestSurfaceWorkspaceArtifact(
  artifacts: SurfaceWorkspaceArtifactRef[] | undefined,
  kind?: MovScriptWorkspaceKind,
): SurfaceWorkspaceArtifactRef | undefined {
  if (!artifacts?.length) return undefined
  const filtered = kind ? artifacts.filter((artifact) => artifact.workspaceKind === kind) : artifacts
  return filtered.at(-1)
}

export interface WorkspaceArtifactApplyReview {
  workspaceId: string
  workspaceTitle: string
  workspaceKind: MovScriptWorkspaceKind
  target: Record<string, unknown>
  currentValue: unknown
  proposedValue: unknown
  risk: 'write'
  sideEffect: string
  requiresBackendApply: boolean
}

export interface WorkspaceArtifactApplyPreview {
  status: 'preview' | 'applied'
  review: WorkspaceArtifactApplyReview
  workspace: WorkspaceArtifact
  message: string
  backendApply?: Record<string, unknown>
}

export interface SurfaceWorkspaceArtifactListQuery {
  projectId?: number
  kind?: MovScriptWorkspaceKind
  status?: WorkspaceArtifactStatus | WorkspaceArtifactStatus[]
  threadId?: string
  runId?: string
  pageKey?: string
  pageType?: string
  pageRoute?: string
  pageEntityType?: string
  pageEntityId?: number | string
  current?: boolean
  limit?: number
}

export interface SurfaceWorkspaceArtifactUpdateInput {
  status?: WorkspaceArtifactStatus
  title?: string
  content?: string
  target?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface SurfaceWorkspaceArtifactClient {
  getWorkspaceArtifact(workspaceId: string): Promise<WorkspaceArtifact>
  listWorkspaceArtifacts(query?: SurfaceWorkspaceArtifactListQuery): Promise<{ workspaces: WorkspaceArtifact[] }>
  updateWorkspaceArtifact(workspaceId: string, input: SurfaceWorkspaceArtifactUpdateInput): Promise<WorkspaceArtifact>
  isNotFoundError?(error: unknown): boolean
}

let workspaceArtifactClient: SurfaceWorkspaceArtifactClient | undefined

export function configureSurfaceWorkspaceArtifactClient(client: SurfaceWorkspaceArtifactClient): void {
  workspaceArtifactClient = client
}

export function readSurfaceWorkspaceArtifactClient(): SurfaceWorkspaceArtifactClient {
  if (!workspaceArtifactClient) throw new Error('Surface workspace artifact client is not configured.')
  return workspaceArtifactClient
}

export function getSurfaceWorkspaceArtifact(workspaceId: string): Promise<WorkspaceArtifact> {
  return readSurfaceWorkspaceArtifactClient().getWorkspaceArtifact(workspaceId)
}

export function listSurfaceWorkspaceArtifacts(query: SurfaceWorkspaceArtifactListQuery = {}): Promise<{ workspaces: WorkspaceArtifact[] }> {
  return readSurfaceWorkspaceArtifactClient().listWorkspaceArtifacts(query)
}

export function updateSurfaceWorkspaceArtifact(
  workspaceId: string,
  input: SurfaceWorkspaceArtifactUpdateInput,
): Promise<WorkspaceArtifact> {
  return readSurfaceWorkspaceArtifactClient().updateWorkspaceArtifact(workspaceId, input)
}

export function isSurfaceWorkspaceArtifactNotFoundError(error: unknown): boolean {
  return readSurfaceWorkspaceArtifactClient().isNotFoundError?.(error) ?? false
}
