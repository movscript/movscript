export type ElectronPluginCatalogPackStoreDirs = {
  rootDir: string
  skillsDir: string
  toolsDir: string
  packsDir: string
  configFilesDir: string
}

export type ElectronPluginCatalogPackFile = {
  path: string
  content: string
}

export type ElectronPluginCatalogPackInstallInput = {
  pluginId: string
  files: ElectronPluginCatalogPackFile[]
}

export type ElectronPluginCatalogPackInstallResult = {
  pluginId: string
  dirs: ElectronPluginCatalogPackStoreDirs
  targetDirs: Partial<Record<'skills' | 'tools' | 'packs' | 'configFiles', string>>
  installedFiles: string[]
}

export type ElectronPluginCatalogPackUninstallInput = {
  pluginId: string
}

export type ElectronPluginCatalogPackUninstallResult = {
  pluginId: string
  dirs: ElectronPluginCatalogPackStoreDirs
  removed: boolean
}

export type ElectronPluginCatalogPackPlugin = {
  pluginId: string
  kinds: Array<'skills' | 'tools' | 'packs' | 'configFiles'>
  paths: Partial<Record<'skills' | 'tools' | 'packs' | 'configFiles', string>>
}

export type ElectronProjectPluginInstallInput = {
  workspaceDir?: string
  projectId?: string | number
  userId?: string | number
  orgId?: string | number
  id?: string
  name?: string
  displayName?: string
  version?: string
  description?: string
  marketplaceName?: string
  marketplacePath?: string
  sourceMarketplaceName?: string
  sourceMarketplacePath?: string
  pluginKey?: string
  sourceType?: string
  sourcePath?: string
  enabled?: boolean
}

export type ElectronProjectLocalSkill = {
  id: string
  name: string
  description?: string
  sourceType: 'desktop-cache' | 'project' | 'project-catalog' | 'plugin-source'
  sourcePath: string
  sourceSkillDir: string
  projectRelativePath?: string
  pluginKey?: string
  pluginName?: string
  version?: string
  enabled: boolean
  enabledCodexPath?: string
  enabledRepoPath?: string
}

export type ElectronProjectSkillToggleInput = {
  workspaceDir?: string
  projectId?: string | number
  userId?: string | number
  orgId?: string | number
  skillId: string
  enabled: boolean
}

export type ElectronProjectPluginSnapshot = {
  schema: 'movscript.project-plugins.v1'
  workspaceDir: string
  projectCwd: string
  manifestPath: string
  lockPath: string
  codexConfigPath: string
  codexSkillsDir: string
  repoSkillsDir: string
  desktopPluginCacheRoot: string
  projectMarketplacePath: string
  catalogSkillsDir: string
  skills: ElectronProjectLocalSkill[]
  plugins: Array<{
    id: string
    name: string
    marketplaceName: string
    sourceMarketplaceName?: string
    sourceMarketplacePath?: string
    pluginKey: string
    displayName?: string
    version?: string
    description?: string
    sourceType?: string
    sourcePath?: string
    enabled: boolean
    declared: boolean
    prepared: boolean
    preparedPaths?: {
      codexConfigPath: string
      codexSkillsDir?: string
      repoSkillsDir?: string
      desktopPluginCacheDir?: string
      projectMarketplacePath?: string
      projectPluginBundleDir?: string
      catalogSkillsDir?: string
    }
  }>
}
