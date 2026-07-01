import type { MovScriptNormalizedFocus } from '@movscript/domain'

export interface MCPContextSnapshot {
  route: {
    pathname: string
    search: string
    hash: string
  }
  project: {
    id?: string | number
    backendProjectId?: number
    backend_project_id?: number
    uid?: string
    projectUid?: string
    project_uid?: string
    projectKey?: string
    project_key?: string
    routeProjectKey?: string
    route_project_key?: string
    name: string
    description?: string
    projectDir?: string
    projectPath?: string
    workspacePath?: string
    project_path?: string
    workspace_path?: string
    totalEpisodes?: number
  } | null
  productionId?: string | number | null
  domainFocus?: MovScriptNormalizedFocus
  user: {
    id: number
    username: string
    systemRole: string
  } | null
  selection: {
    entityKind?: string
    entityId?: number
    label?: string
  } | null
  updatedAt: string
}

export type MCPContextUpdate = MCPContextSnapshot & {
  auth?: {
    token: string
    gitCredential?: {
      provider: 'gitea'
      username: string
      token?: string
      maskedToken?: string
      status?: string
      lastError?: string
    }
  } | null
}
