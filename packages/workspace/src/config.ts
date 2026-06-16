export const MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA = 'movscript.workspace-config.v2'

export type MovScriptWorkspaceAgentConfigFile = {
  schema: 'movscript.agent.config_file.v1'
  id: string
  name: string
  description?: string
  version?: number
  enabledPackIds: string[]
  skillIds: string[]
  toolGrants: Array<Record<string, unknown>>
  limits?: Record<string, unknown>
  approvalDefaults?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface MovScriptWorkspaceAgentCatalogConfig {
  activeConfigFileId?: string
  configFiles?: MovScriptWorkspaceAgentConfigFile[]
}

export interface MovScriptWorkspaceConfig {
  schema: typeof MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA
  updatedAt: string
  modelConfig?: Record<string, unknown>
  agentCatalog?: MovScriptWorkspaceAgentCatalogConfig
  catalog?: {
    skillsDir?: string
    toolsDir?: string
    packsDir?: string
    configFilesDir?: string
  }
  toolProviders?: Array<Record<string, unknown>>
  modelProviders?: Array<Record<string, unknown>>
  permissions?: Record<string, unknown>
  environment?: Record<string, string>
  providers?: Record<string, Record<string, unknown>>
}
