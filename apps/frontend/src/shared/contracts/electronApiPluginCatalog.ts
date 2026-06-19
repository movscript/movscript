import type { ElectronMovScriptHomeInput } from './electronApiWorkspace'

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

export type ElectronProjectPluginInstallInput = ElectronMovScriptHomeInput & {
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
  providerTargets?: ElectronProjectSkillProviderTarget[]
  enabled?: boolean
}

export type ElectronProjectSkillProviderTarget = 'codex' | 'mova' | 'claude'

export type ElectronProjectLocalSkill = {
  id: string
  name: string
  description?: string
  sourceType: 'desktop-cache' | 'project' | 'project-catalog' | 'plugin-source'
  sourceScope: 'global' | 'project' | 'builtin'
  providerTarget: ElectronProjectSkillProviderTarget
  providerScope: ElectronProjectSkillProviderTarget
  sourcePath: string
  sourceSkillDir: string
  contentHash: string
  projectRelativePath?: string
  pluginKey?: string
  pluginName?: string
  version?: string
  enabled: boolean
  enabledProviderPath?: string
}

export type ElectronProjectSkillToggleInput = ElectronMovScriptHomeInput & {
  projectId?: string | number
  userId?: string | number
  orgId?: string | number
  skillId: string
  enabled: boolean
  providerTargets?: ElectronProjectSkillProviderTarget[]
}

export type ElectronProjectPluginSnapshot = {
  schema: 'movscript.project-plugins.v1'
  movScriptHomeDir: string
  /** @deprecated Use movScriptHomeDir for the desktop control/home directory. */
  workspaceDir: string
  projectCwd: string
  manifestPath: string
  lockPath: string
  providerConfigPaths: Partial<Record<ElectronProjectSkillProviderTarget, string>>
  providerSkillDirs: Record<ElectronProjectSkillProviderTarget, string>
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
    providerTargets: ElectronProjectSkillProviderTarget[]
    enabled: boolean
    declared: boolean
    prepared: boolean
    preparedPaths?: {
      providerTargets: ElectronProjectSkillProviderTarget[]
      providerConfigPaths?: Partial<Record<ElectronProjectSkillProviderTarget, string>>
      providerSkillDirs?: Partial<Record<ElectronProjectSkillProviderTarget, string>>
      desktopPluginCacheDir?: string
      projectMarketplacePath?: string
      projectPluginBundleDir?: string
      catalogSkillsDir?: string
    }
  }>
}
