export const MOVSCRIPT_WORKSPACE_DIR_NAME = '.movscript'
export const MOVSCRIPT_DEFAULT_USER_WORKSPACE_DIR_NAME = 'MovScript'
export const MOVSCRIPT_WORKSPACE_MANIFEST_FILE_NAME = 'manifest.json'
export const MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA = 'movscript.project-workspace.v1'
export const MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME = 'providers'
export const MOVSCRIPT_WORKSPACE_BACKEND_DIR_NAME = 'backend'

export type MovScriptWorkspaceScope = 'global' | 'project' | 'production'

export interface MovScriptWorkspaceContextInput {
  workspaceDir?: string
  scope?: MovScriptWorkspaceScope
  userId?: string | number
  projectId?: string | number
  productionId?: string | number
}

export interface MovScriptWorkspaceContext {
  scope: MovScriptWorkspaceScope
  userId?: string
  projectId?: string
  productionId?: string
}

export interface MovScriptWorkspaceRootPaths {
  workspaceDir: string
  rootDir: string
  controlDir: string
  manifestPath: string
  editDir: string
  buildDir: string
  buildCurrentDir: string
  buildIndexesDir: string
  buildReviewsDir: string
  buildManifestsDir: string
  providersDir: string
  backendDir: string
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
  activeUserId?: number
  layout: {
    editableRoot: 'edit'
    buildRoot: '.build'
    providerConfigRoot: typeof MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME
  }
}

export interface MovScriptWorkspaceContextPaths {
  workspaceDir: string
  controlDir: string
  scope: MovScriptWorkspaceScope
  context: MovScriptWorkspaceContext
  contextKey: string
  editableBaseDir: string
  buildBaseDir: string
  providerSessionCwd: string
}
