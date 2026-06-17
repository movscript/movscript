import type { ProviderCatalogConfigFile } from '../agent/protocol.js'

export const MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA = 'movscript.workspace-config.v2'

export interface MovScriptWorkspaceAgentCatalogConfig {
  activeConfigFileId?: string
  configFiles?: ProviderCatalogConfigFile[]
}

export interface MovScriptWorkspaceAgentSelectionConfig {
  defaultProviderId?: string
  newConversationProviderId?: string
}

export interface MovScriptWorkspaceConfig {
  schema: typeof MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA
  updatedAt: string
  modelConfig?: Record<string, unknown>
  agentCatalog?: MovScriptWorkspaceAgentCatalogConfig
  agentSelection?: MovScriptWorkspaceAgentSelectionConfig
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
  movscriptLang?: {
    cwd?: string
  }
}
