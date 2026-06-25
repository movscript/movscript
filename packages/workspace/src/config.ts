export const MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA = 'movscript.workspace-config.v2'

export type MovScriptWorkspaceJSONValue =
  | string
  | number
  | boolean
  | null
  | MovScriptWorkspaceJSONValue[]
  | { [key: string]: MovScriptWorkspaceJSONValue }

export type MovScriptWorkspaceProviderToolRiskLevel = 'read' | 'workspace' | 'write' | 'generate' | 'destructive' | 'ui'
export type MovScriptWorkspaceProviderToolApprovalMode = 'never' | 'always' | 'on_write'
export type MovScriptWorkspaceProviderToolGrantMode = 'allow' | 'deny'
export type MovScriptWorkspaceProviderToolApprovalDefaults = Partial<
  Record<MovScriptWorkspaceProviderToolRiskLevel | 'default', MovScriptWorkspaceProviderToolApprovalMode>
>

export type MovScriptWorkspaceAgentConfigFile = {
  schema: 'movscript.agent.config_file.v1'
  id: string
  name: string
  description?: string
  version?: string | number
  enabledPackIds: string[]
  skillIds: string[]
  toolGrants: object[]
  limits?: object
  approvalDefaults?: object
  metadata?: object
}

export interface MovScriptWorkspaceAgentCatalogConfig {
  activeConfigFileId?: string
  configFiles?: MovScriptWorkspaceAgentConfigFile[]
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
