export const MOVSCRIPT_WORKSPACE_DIR_NAME = '.movscript'
export const MOVSCRIPT_DEFAULT_USER_WORKSPACE_DIR_NAME = 'MovScript'
export const MOVSCRIPT_WORKSPACE_MANIFEST_FILE_NAME = 'manifest.json'
export const MOVSCRIPT_WORKSPACE_CONFIG_TOML_FILE_NAME = 'config.toml'
export const MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA = 'movscript.project-workspace.v1'
export const MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME = 'providers'
export const MOVSCRIPT_WORKSPACE_BACKEND_DIR_NAME = 'backend'
export const MOVSCRIPT_WORKSPACE_BIN_DIR_NAME = 'bin'
export const MOVSCRIPT_WORKSPACE_REALMS_DIR_NAME = 'realms'

export type MovScriptWorkspaceScope = 'global' | 'project' | 'production'
export type MovScriptWorkspaceRealmKind = 'local' | 'cloud'

export interface MovScriptWorkspaceRealm {
  kind: MovScriptWorkspaceRealmKind
  id: string
}

export interface MovScriptWorkspaceRealmInput {
  kind?: MovScriptWorkspaceRealmKind
  id?: string | number
}

export interface MovScriptWorkspaceContextInput {
  workspaceDir?: string
  realm?: MovScriptWorkspaceRealmInput | string
  realmKind?: MovScriptWorkspaceRealmKind
  realmId?: string | number
  scope?: MovScriptWorkspaceScope
  userId?: string | number
  orgId?: string | number
  projectId?: string | number
}

export interface MovScriptWorkspaceContext {
  realm: MovScriptWorkspaceRealm
  scope: MovScriptWorkspaceScope
  userId?: string
  orgId?: string
  projectId?: string
}

export interface MovScriptWorkspaceRootPaths {
  workspaceDir: string
  rootDir: string
  controlDir: string
  configTomlPath: string
  manifestPath: string
  realmsDir: string
  providersDir: string
  backendDir: string
  binDir: string
}

export interface MovScriptWorkspaceRootManifest {
  schema: typeof MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA
  workspaceId: string
  createdAt: string
  updatedAt: string
  backend?: {
    kind?: 'local' | 'cloud' | 'custom'
    baseURL?: string
  }
  activeRealm?: MovScriptWorkspaceRealm
  activeUserId?: number
  layout: {
    providerConfigRoot: typeof MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME
  }
}

export interface MovScriptWorkspaceContextPaths {
  workspaceDir: string
  controlDir: string
  scope: MovScriptWorkspaceScope
  context: MovScriptWorkspaceContext
  contextKey: string
  realmDir: string
  projectCwd: string
  providerSessionCwd: string
}
