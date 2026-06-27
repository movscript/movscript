export interface SurfaceWorkspaceDomainContext {
  workspaceDir?: string
  projectDir?: string
  userId?: string | number
  orgId?: string | number
  projectId?: string | number
  projectUid?: string
  projectServiceBaseURL?: string
  expectedWorkspaceVersions?: Record<string, string | null>
}

export type SurfaceWorkspaceDomainQuery = Record<string, unknown> | undefined
export type SurfaceWorkspaceDomainRecord = Record<string, unknown>

export interface SurfaceWorkspaceDomainService {
  queryEntities(query?: SurfaceWorkspaceDomainQuery): Promise<any[]>
  querySettings(query?: SurfaceWorkspaceDomainQuery): Promise<any[]>
  queryAssets(query?: SurfaceWorkspaceDomainQuery): Promise<any>
  readScriptSource(input: SurfaceWorkspaceDomainRecord): Promise<string>
  upsertScript(input: SurfaceWorkspaceDomainRecord): Promise<any>
  upsertProjectStandards(input: SurfaceWorkspaceDomainRecord): Promise<any>
  updateContentUnitEditPrompt(input: SurfaceWorkspaceDomainRecord): Promise<any>
  readContentUnitGenerationPrompt(contentUnitId: string | number): Promise<SurfaceWorkspaceDomainRecord | undefined>
}

export interface SurfaceWorkspaceDomainClient {
  createWorkspaceDomainService(context?: SurfaceWorkspaceDomainContext): SurfaceWorkspaceDomainService
}

let workspaceDomainClient: SurfaceWorkspaceDomainClient | undefined

export function configureSurfaceWorkspaceDomainClient(client: SurfaceWorkspaceDomainClient): void {
  workspaceDomainClient = client
}

export function readSurfaceWorkspaceDomainClient(): SurfaceWorkspaceDomainClient {
  if (!workspaceDomainClient) throw new Error('Surface workspace domain client is not configured.')
  return workspaceDomainClient
}

export function createSurfaceWorkspaceDomainService(
  context: SurfaceWorkspaceDomainContext = {},
): SurfaceWorkspaceDomainService {
  return readSurfaceWorkspaceDomainClient().createWorkspaceDomainService(context)
}

export function __setSurfaceWorkspaceDomainClientForTests(
  client: SurfaceWorkspaceDomainClient | undefined,
): () => void {
  const previous = workspaceDomainClient
  workspaceDomainClient = client
  return () => {
    workspaceDomainClient = previous
  }
}
