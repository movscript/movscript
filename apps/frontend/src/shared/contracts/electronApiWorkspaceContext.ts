export type ElectronMovScriptWorkspaceScope = 'global' | 'project' | 'production'

export type ElectronMovScriptWorkspaceContext = {
  scope?: ElectronMovScriptWorkspaceScope
  userId?: string | number
  orgId?: string | number
  projectId?: string | number
  productionId?: string | number
}
