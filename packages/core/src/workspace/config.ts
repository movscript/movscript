export const MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA = 'movscript.workspace-config.v2'

export interface MovScriptWorkspaceConfig {
  schema: typeof MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA
  updatedAt: string
  modelConfig?: Record<string, unknown>
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
