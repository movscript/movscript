export const MOVSCRIPT_WORKSPACE_DIR_NAME = '.movscript'
export const MOVSCRIPT_DEFAULT_WORKSPACE_DIR_NAME = 'MovScript'
export const MOVSCRIPT_WORKSPACE_MANIFEST_FILE_NAME = 'manifest.json'
export const MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA = 'movscript.project-workspace.v1'
export const MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME = 'providers'

export type MovScriptWorkspaceScope = 'global' | 'project' | 'production'

export interface MovScriptWorkspaceContextInput {
  workspaceDir?: string
  scope?: MovScriptWorkspaceScope
  productionId?: string | number
}

export interface MovScriptWorkspaceContext {
  scope: MovScriptWorkspaceScope
  productionId?: string
}

export interface MovScriptWorkspaceRootPaths {
  workspaceDir: string
  rootDir: string
  controlDir: string
  manifestPath: string
  interpretDir: string
  interpretCurrentDir: string
  interpretIndexesDir: string
  interpretReviewsDir: string
  interpretManifestsDir: string
  providersDir: string
}

export interface MovScriptWorkspaceRootManifest {
  schema: typeof MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA
  project_id: string
  title: string
  createdAt: string
  updatedAt: string
  layout: {
    editableRoot: '.'
    interpretRoot: '.interpret'
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
  interpretBaseDir: string
  providerSessionCwd: string
}
