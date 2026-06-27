import type { MovScriptNormalizedFocus } from '@movscript/domain'

export interface MCPContextSnapshot {
  route: {
    pathname: string
    search: string
    hash: string
  }
  project: {
    id: number
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
