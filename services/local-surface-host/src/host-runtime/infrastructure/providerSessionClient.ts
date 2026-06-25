import type { MovScriptWorkspaceKind, WorkspaceArtifact } from '../contracts/workspaceArtifact'

export type { MovScriptWorkspaceKind, WorkspaceArtifact }

export const AGENT_TRACE_EVENT_KINDS = [] as const

export class ProviderSessionHTTPError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ProviderSessionHTTPError'
  }
}

export class ProviderSessionClient {
  async getWorkspaceArtifact(_workspaceId: string): Promise<WorkspaceArtifact> {
    throw new ProviderSessionHTTPError('Provider session workspace artifacts are unavailable in local surface host.', 404)
  }

  async listWorkspaceArtifacts(_input?: {
    projectId?: number
    kind?: MovScriptWorkspaceKind
    pageKey?: string
    limit?: number
  }): Promise<{ workspaces: WorkspaceArtifact[] }> {
    return { workspaces: [] }
  }

  async updateWorkspaceArtifact(_workspaceId: string, _input: Partial<WorkspaceArtifact>): Promise<WorkspaceArtifact> {
    throw new ProviderSessionHTTPError('Provider session workspace artifacts are unavailable in local surface host.', 404)
  }
}

export const providerSessionClient = new ProviderSessionClient()

export function isProviderSessionNotFoundError(error: unknown): boolean {
  return error instanceof ProviderSessionHTTPError && error.status === 404
}

export type AgentRun = Record<string, unknown>
export type ProviderPluginFile = Record<string, unknown>
export type ProviderPluginFileManifest = Record<string, unknown>
