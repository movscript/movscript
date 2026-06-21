export type ElectronMovScriptWorkspaceScope = 'global' | 'project' | 'production'
export type ElectronMovScriptWorkspaceRealmKind = 'local' | 'cloud'

export type ElectronMovScriptWorkspaceRealm = {
  kind: ElectronMovScriptWorkspaceRealmKind
  id: string
}

export type ElectronMovScriptWorkspaceContext = {
  realm?: ElectronMovScriptWorkspaceRealm
  realmKind?: ElectronMovScriptWorkspaceRealmKind
  realmId?: string | number
  scope?: ElectronMovScriptWorkspaceScope
  userId?: string | number
  orgId?: string | number
  projectId?: string | number
  projectUid?: string
  projectDir?: string
  projectTitle?: string
  productionId?: string | number
}
