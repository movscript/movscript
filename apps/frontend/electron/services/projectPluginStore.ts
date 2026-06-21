import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import {
  ensureMovScriptWorkspaceRoot,
  resolveMovScriptWorkspaceRootPaths,
} from '@movscript/core/workspace/node'
import { resolveMovScriptBundledPluginSource } from './movscriptBundledPluginSource'
import { resolveMovScriptHomeDir } from './movscriptHomeInput'
import type {
  ElectronMovScriptHomeInput,
  ElectronProjectPluginInstallInput,
  ElectronProjectPluginToggleInput,
  ElectronProjectPluginSnapshot,
  ElectronProjectSkillProviderTarget,
  ElectronProjectSkillToggleInput,
  ElectronSystemPluginInstallInput,
  ElectronSystemPluginUninstallInput,
} from '../../src/shared/contracts/electronApi'
import {
  isProjectSkillProviderTarget,
  normalizeProjectSkillProviderTargets,
  PROJECT_SKILL_PROVIDER_TARGETS,
  projectProviderConfigPaths,
  projectProviderPluginCacheDirs,
  projectProviderSkillDirs,
} from './projectSkillProviderTargets'
import {
  listProjectPluginSkills,
  projectProviderSkillTarget,
} from './projectPluginSkillIndex'
import {
  materializeProjectPluginProjection,
  materializeSystemPluginCache,
  replaceDirectory,
  setProviderPluginEnabled,
  type ProjectPluginPreparedPaths,
} from './projectPluginInstallMaterializer'

const PROJECT_PLUGIN_MANIFEST_SCHEMA = 'movscript.project-plugins.v1'
const PROJECT_PLUGIN_LOCK_SCHEMA = 'movscript.project-plugin-lock.v1'
const AGENTS_DIR_NAME = '.agents'
const PLUGINS_DIR_NAME = 'plugins'
const DESKTOP_PLUGIN_CACHE_DIR_NAME = 'plugin-cache'
const PROJECT_PLUGIN_BUNDLES_DIR_NAME = 'bundles'
const MOVSCRIPT_PLUGIN_NAME = 'movscript'
const MOVSCRIPT_BUNDLED_MARKETPLACE_NAME = 'movscript-bundled'
const MOVSCRIPT_BUNDLED_PLUGIN_KEY = `${MOVSCRIPT_PLUGIN_NAME}@${MOVSCRIPT_BUNDLED_MARKETPLACE_NAME}`
const DESKTOP_PLUGIN_CACHE_METADATA_FILE_NAME = 'metadata.json'

type ProjectPluginRecord = {
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
}

type ProjectPluginManifest = {
  schema: typeof PROJECT_PLUGIN_MANIFEST_SCHEMA
  updatedAt: string
  plugins: ProjectPluginRecord[]
}

type ProjectPluginLock = {
  schema: typeof PROJECT_PLUGIN_LOCK_SCHEMA
  updatedAt: string
  plugins: Array<ProjectPluginRecord & {
    installedAt: string
    prepared: ProjectPluginPreparedPaths
  }>
}

type SystemPluginRecord = ProjectPluginRecord & {
  installed: boolean
  cacheDir: string
  contentHash?: string
  cachedAt?: string
}

type ProjectPluginPathInput = ElectronMovScriptHomeInput & {
  projectDir?: string
  userId?: string | number
  orgId?: string | number
}

export function getProjectPluginSnapshot(input: ProjectPluginPathInput & { desktopDataDir?: string } = {}): ElectronProjectPluginSnapshot {
  const paths = resolveProjectPluginPaths(input, input.desktopDataDir)
  const manifest = readProjectPluginManifest(paths.manifestPath)
  const lock = readProjectPluginLock(paths.lockPath)
  const globalPaths = paths.projectCwd === paths.workspaceDir
    ? paths
    : resolveProjectPluginPaths({ workspaceDir: paths.workspaceDir }, input.desktopDataDir)
  const globalManifest = paths.projectCwd === paths.workspaceDir ? manifest : readProjectPluginManifest(globalPaths.manifestPath)
  const globalLock = paths.projectCwd === paths.workspaceDir ? lock : readProjectPluginLock(globalPaths.lockPath)
  const lockedByKey = new Map(lock.plugins.map((plugin) => [plugin.pluginKey, plugin]))
  const skills = listProjectPluginSkills(paths, lock)
  const systemPlugins = projectSystemPluginRecords({
    paths,
    systemPlugins: listSystemPluginRecords(paths.desktopPluginCacheRoot),
    projectManifest: manifest,
    projectLock: lock,
    globalManifest,
    globalLock,
  })
  return {
    schema: PROJECT_PLUGIN_MANIFEST_SCHEMA,
    movScriptHomeDir: paths.workspaceDir,
    workspaceDir: paths.workspaceDir,
    projectCwd: paths.projectCwd,
    manifestPath: paths.manifestPath,
    lockPath: paths.lockPath,
    providerConfigPaths: paths.providerConfigPaths,
    providerSkillDirs: paths.providerSkillDirs,
    providerPluginCacheDirs: paths.providerPluginCacheDirs,
    desktopPluginCacheRoot: paths.desktopPluginCacheRoot,
    projectMarketplacePath: paths.projectMarketplacePath,
    catalogSkillsDir: paths.catalogSkillsDir,
    skills,
    systemPlugins,
    plugins: manifest.plugins.map((plugin) => {
      const locked = lockedByKey.get(plugin.pluginKey)
      return {
        ...plugin,
        declared: true,
        prepared: Boolean(locked),
        preparedPaths: locked?.prepared,
      }
    }),
  }
}

export function installProjectPlugin(input: ElectronProjectPluginInstallInput & { desktopDataDir?: string }): ElectronProjectPluginSnapshot {
  const plugin = normalizeProjectPluginRecord(input)
  if (plugin.providerTargets.length === 0) {
    throw new Error('Project plugin install requires at least one provider target.')
  }
  installSystemPlugin(input)
  return setProjectPluginEnabled({
    ...input,
    pluginKey: plugin.pluginKey,
    enabled: input.enabled !== false,
    providerTargets: plugin.providerTargets,
  })
}

export function installSystemPlugin(input: ElectronSystemPluginInstallInput & { desktopDataDir?: string }): ElectronProjectPluginSnapshot {
  const paths = resolveProjectPluginPaths(input, input.desktopDataDir)
  ensureMovScriptWorkspaceRoot(resolveMovScriptWorkspaceRootPaths(paths.workspaceDir))
  const plugin = normalizeProjectPluginRecord(input, PROJECT_SKILL_PROVIDER_TARGETS)
  if (plugin.providerTargets.length === 0) {
    throw new Error('System plugin install requires at least one provider target.')
  }
  const sourcePath = resolveProjectPluginSourcePath(input)
  if (!sourcePath) throw new Error(`System plugin install requires a source path for ${plugin.pluginKey}.`)

  materializeSystemPluginCache({ cacheRoot: paths.desktopPluginCacheRoot, plugin, sourcePath })

  return getProjectPluginSnapshot({ ...input, workspaceDir: paths.workspaceDir, desktopDataDir: input.desktopDataDir })
}

export function uninstallSystemPlugin(input: ElectronSystemPluginUninstallInput & { desktopDataDir?: string }): ElectronProjectPluginSnapshot {
  const paths = resolveProjectPluginPaths(input, input.desktopDataDir)
  if (isBundledMovScriptPluginKey(input.pluginKey)) {
    throw new Error('MovScript bundled plugin is managed by the application and cannot be removed.')
  }
  const plugin = systemPluginRecord(paths.desktopPluginCacheRoot, input.pluginKey)
  if (plugin?.cacheDir) {
    const pluginBaseDir = dirname(plugin.cacheDir)
    rmSync(pluginBaseDir, { recursive: true, force: true })
  }
  return getProjectPluginSnapshot({ ...input, workspaceDir: paths.workspaceDir, desktopDataDir: input.desktopDataDir })
}

export function setProjectPluginEnabled(input: ElectronProjectPluginToggleInput & { desktopDataDir?: string }): ElectronProjectPluginSnapshot {
  return input.enabled ? enableProjectPlugin(input) : disableProjectPlugin(input)
}

function enableProjectPlugin(input: ElectronProjectPluginToggleInput & { desktopDataDir?: string }): ElectronProjectPluginSnapshot {
  const paths = resolveProjectPluginPaths(input, input.desktopDataDir)
  ensureMovScriptWorkspaceRoot(resolveMovScriptWorkspaceRootPaths(paths.workspaceDir))
  const systemPlugin = systemPluginRecord(paths.desktopPluginCacheRoot, input.pluginKey)
  if (!systemPlugin) throw new Error(`System plugin is not installed: ${input.pluginKey}`)
  const providerTargets = normalizeProjectSkillProviderTargets(input.providerTargets, systemPlugin.providerTargets)
  if (providerTargets.length === 0) throw new Error(`Plugin ${input.pluginKey} does not declare provider targets.`)
  const plugin = { ...systemPlugin, providerTargets, enabled: true }
  const prepared = materializeProjectPluginProjection({ paths, plugin, sourcePath: systemPlugin.cacheDir })
  const now = new Date().toISOString()
  const manifest = readProjectPluginManifest(paths.manifestPath)
  writeJSONAtomic(paths.manifestPath, {
    ...manifest,
    updatedAt: now,
    plugins: upsertByPluginKey(manifest.plugins, plugin),
  } satisfies ProjectPluginManifest)
  const lock = readProjectPluginLock(paths.lockPath)
  writeJSONAtomic(paths.lockPath, {
    ...lock,
    updatedAt: now,
    plugins: upsertByPluginKey(lock.plugins, {
      ...plugin,
      installedAt: now,
      prepared,
    }),
  } satisfies ProjectPluginLock)
  return getProjectPluginSnapshot({ ...input, workspaceDir: paths.workspaceDir, desktopDataDir: input.desktopDataDir })
}

function disableProjectPlugin(input: ElectronProjectPluginToggleInput & { desktopDataDir?: string }): ElectronProjectPluginSnapshot {
  const paths = resolveProjectPluginPaths(input, input.desktopDataDir)
  const manifest = readProjectPluginManifest(paths.manifestPath)
  const lock = readProjectPluginLock(paths.lockPath)
  const locked = lock.plugins.find((plugin) => plugin.pluginKey === input.pluginKey)
  const systemPlugin = systemPluginRecord(paths.desktopPluginCacheRoot, input.pluginKey)
  const current = manifest.plugins.find((plugin) => plugin.pluginKey === input.pluginKey)
    ?? locked
    ?? systemPlugin
  if (!current) throw new Error(`Project plugin is not known: ${input.pluginKey}`)
  const targets = normalizeProjectSkillProviderTargets(input.providerTargets, locked?.prepared.providerTargets ?? current.providerTargets)
  removePreparedProjection(locked?.prepared, targets)
  for (const target of targets) {
    const configPath = paths.providerConfigPaths[target]
    if (configPath) setProviderPluginEnabled(configPath, input.pluginKey, false)
  }
  writeJSONAtomic(paths.manifestPath, {
    ...manifest,
    updatedAt: new Date().toISOString(),
    plugins: upsertByPluginKey(manifest.plugins, {
      ...current,
      providerTargets: targets.length > 0 ? targets : current.providerTargets,
      enabled: false,
    }),
  } satisfies ProjectPluginManifest)
  writeJSONAtomic(paths.lockPath, {
    ...lock,
    updatedAt: new Date().toISOString(),
    plugins: lock.plugins.filter((plugin) => plugin.pluginKey !== input.pluginKey),
  } satisfies ProjectPluginLock)
  return getProjectPluginSnapshot({ ...input, workspaceDir: paths.workspaceDir, desktopDataDir: input.desktopDataDir })
}

export function setProjectSkillEnabled(input: ElectronProjectSkillToggleInput & { desktopDataDir?: string }): ElectronProjectPluginSnapshot {
  const paths = resolveProjectPluginPaths(input, input.desktopDataDir)
  const snapshot = getProjectPluginSnapshot({ ...input, workspaceDir: paths.workspaceDir, desktopDataDir: input.desktopDataDir })
  const skill = snapshot.skills.find((item) => item.id === input.skillId)
  if (!skill) throw new Error(`Local skill not found: ${input.skillId}`)
  const targets = normalizeProjectSkillProviderTargets(input.providerTargets, [skill.providerTarget])
  if (input.enabled) {
    for (const target of targets) replaceDirectory(skill.sourceSkillDir, projectProviderSkillTarget(paths, skill, target))
  } else {
    for (const target of targets) rmSync(projectProviderSkillTarget(paths, skill, target), { recursive: true, force: true })
  }
  return getProjectPluginSnapshot({ ...input, workspaceDir: paths.workspaceDir, desktopDataDir: input.desktopDataDir })
}

function resolveProjectPluginPaths(input?: ProjectPluginPathInput | string, desktopDataDirInput?: string) {
  const workspaceDir = resolveMovScriptHomeDir(input)
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  const projectCwd = typeof input === 'object' && input?.projectDir?.trim()
    ? resolve(input.projectDir)
    : workspaceDir
  const pluginsDir = join(projectCwd, AGENTS_DIR_NAME, PLUGINS_DIR_NAME)
  const desktopDataDir = desktopDataDirInput?.trim() ? resolve(desktopDataDirInput) : root.controlDir
  return {
    workspaceDir,
    projectCwd,
    pluginsDir,
    manifestPath: join(pluginsDir, 'manifest.json'),
    lockPath: join(pluginsDir, 'lock.json'),
    providerConfigPaths: projectProviderConfigPaths(projectCwd),
    providerSkillDirs: projectProviderSkillDirs(projectCwd),
    providerPluginCacheDirs: projectProviderPluginCacheDirs(projectCwd),
    desktopPluginCacheRoot: process.env.MOVSCRIPT_DESKTOP_PLUGIN_CACHE_DIR?.trim()
      ? resolve(process.env.MOVSCRIPT_DESKTOP_PLUGIN_CACHE_DIR)
      : join(desktopDataDir, DESKTOP_PLUGIN_CACHE_DIR_NAME),
    projectMarketplacePath: join(projectCwd, AGENTS_DIR_NAME, PLUGINS_DIR_NAME, 'marketplace.json'),
    projectPluginBundlesDir: join(projectCwd, AGENTS_DIR_NAME, PLUGINS_DIR_NAME, PROJECT_PLUGIN_BUNDLES_DIR_NAME),
    catalogSkillsDir: join(projectCwd, AGENTS_DIR_NAME, PLUGINS_DIR_NAME, 'catalog', 'skills'),
  }
}

function listSystemPluginRecords(cacheRoot: string): SystemPluginRecord[] {
  const cacheRecords = existsSync(cacheRoot) ? findCacheMetadataFiles(cacheRoot)
    .flatMap((metadataPath) => {
      const metadata = readJSON(metadataPath)
      if (!isRecord(metadata)) return []
      const cacheDir = dirname(metadataPath)
      const name = stringField(metadata.name) ?? basename(dirname(cacheDir))
      const marketplaceName = stringField(metadata.marketplaceName)
        ?? stringField(metadata.sourceMarketplaceName)
        ?? basename(dirname(dirname(cacheDir)))
      const pluginKey = stringField(metadata.pluginKey) ?? `${name}@${marketplaceName}`
      return [{
        id: pluginKey,
        name,
        marketplaceName,
        pluginKey,
        ...(stringField(metadata.sourceMarketplaceName) ? { sourceMarketplaceName: stringField(metadata.sourceMarketplaceName) } : {}),
        ...(stringField(metadata.sourceMarketplacePath) ? { sourceMarketplacePath: stringField(metadata.sourceMarketplacePath) } : {}),
        ...(stringField(metadata.displayName) ? { displayName: stringField(metadata.displayName) } : {}),
        ...(stringField(metadata.version) ? { version: stringField(metadata.version) } : {}),
        ...(stringField(metadata.description) ? { description: stringField(metadata.description) } : {}),
        ...(stringField(metadata.sourceType) ? { sourceType: stringField(metadata.sourceType) } : {}),
        ...(stringField(metadata.sourcePath) ? { sourcePath: stringField(metadata.sourcePath) } : {}),
        providerTargets: normalizeProjectSkillProviderTargets(metadata.providerTargets, PROJECT_SKILL_PROVIDER_TARGETS),
        enabled: true,
        installed: true,
        cacheDir,
        ...(stringField(metadata.contentHash) ? { contentHash: stringField(metadata.contentHash) } : {}),
        ...(stringField(metadata.cachedAt) ? { cachedAt: stringField(metadata.cachedAt) } : {}),
      } satisfies SystemPluginRecord]
    })
    : []
  const byKey = new Map<string, SystemPluginRecord>()
  for (const plugin of [...cacheRecords, bundledMovScriptSystemPluginRecord()]) byKey.set(plugin.pluginKey, plugin)
  return [...byKey.values()].sort((left, right) => left.pluginKey.localeCompare(right.pluginKey))
}

function systemPluginRecord(cacheRoot: string, pluginKey: string): SystemPluginRecord | undefined {
  return listSystemPluginRecords(cacheRoot).find((plugin) => plugin.pluginKey === pluginKey)
}

function bundledMovScriptSystemPluginRecord(): SystemPluginRecord {
  const sourcePath = resolveMovScriptBundledPluginSource()
  return {
    id: MOVSCRIPT_BUNDLED_PLUGIN_KEY,
    name: MOVSCRIPT_PLUGIN_NAME,
    marketplaceName: MOVSCRIPT_BUNDLED_MARKETPLACE_NAME,
    pluginKey: MOVSCRIPT_BUNDLED_PLUGIN_KEY,
    displayName: 'MovScript',
    description: 'Built-in MovScript agent capabilities managed by the application.',
    sourceType: 'builtin',
    sourcePath,
    providerTargets: PROJECT_SKILL_PROVIDER_TARGETS,
    enabled: true,
    installed: true,
    cacheDir: sourcePath,
  }
}

function projectSystemPluginRecords(input: {
  paths: ReturnType<typeof resolveProjectPluginPaths>
  systemPlugins: SystemPluginRecord[]
  projectManifest: ProjectPluginManifest
  projectLock: ProjectPluginLock
  globalManifest: ProjectPluginManifest
  globalLock: ProjectPluginLock
}): ElectronProjectPluginSnapshot['systemPlugins'] {
  const projectManifestByKey = new Map(input.projectManifest.plugins.map((plugin) => [plugin.pluginKey, plugin]))
  const projectLockByKey = new Map(input.projectLock.plugins.map((plugin) => [plugin.pluginKey, plugin]))
  const globalManifestByKey = new Map(input.globalManifest.plugins.map((plugin) => [plugin.pluginKey, plugin]))
  const globalLockByKey = new Map(input.globalLock.plugins.map((plugin) => [plugin.pluginKey, plugin]))
  const systemByKey = new Map(input.systemPlugins.map((plugin) => [plugin.pluginKey, plugin]))
  const keys = new Set([
    ...systemByKey.keys(),
    ...projectManifestByKey.keys(),
    ...projectLockByKey.keys(),
  ])
  return [...keys].sort().flatMap((pluginKey) => {
    const system = systemByKey.get(pluginKey)
    const projectManifest = projectManifestByKey.get(pluginKey)
    const projectLock = projectLockByKey.get(pluginKey)
    const globalManifest = globalManifestByKey.get(pluginKey)
    const globalLock = globalLockByKey.get(pluginKey)
    const base = system ?? projectManifest ?? projectLock
    if (!base) return []
    const bundledMovScript = isBundledMovScriptPluginKey(pluginKey)
    const projectEnabled = Boolean(projectLock) && projectManifest?.enabled !== false
    const globalEnabled = bundledMovScript || (Boolean(globalLock) && globalManifest?.enabled !== false)
    return [{
      id: base.id,
      name: base.name,
      marketplaceName: base.marketplaceName,
      ...(base.sourceMarketplaceName ? { sourceMarketplaceName: base.sourceMarketplaceName } : {}),
      ...(base.sourceMarketplacePath ? { sourceMarketplacePath: base.sourceMarketplacePath } : {}),
      pluginKey: base.pluginKey,
      ...(base.displayName ? { displayName: base.displayName } : {}),
      ...(base.version ? { version: base.version } : {}),
      ...(base.description ? { description: base.description } : {}),
      ...(base.sourceType ? { sourceType: base.sourceType } : {}),
      ...(base.sourcePath ? { sourcePath: base.sourcePath } : {}),
      providerTargets: base.providerTargets,
      installed: Boolean(system),
      cacheDir: system?.cacheDir ?? '',
      ...(system?.contentHash ? { contentHash: system.contentHash } : {}),
      globalEnabled,
      projectEnabled,
      enabled: projectEnabled || globalEnabled,
      declared: Boolean(projectManifest),
      prepared: Boolean(projectLock),
      preparedPaths: projectLock?.prepared,
    }]
  })
}

function isBundledMovScriptPluginKey(pluginKey: string): boolean {
  return pluginKey === MOVSCRIPT_BUNDLED_PLUGIN_KEY
}

function findCacheMetadataFiles(cacheRoot: string): string[] {
  const files: string[] = []
  function walk(dir: string, depth: number): void {
    if (depth > 5) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    if (entries.includes(DESKTOP_PLUGIN_CACHE_METADATA_FILE_NAME)) {
      files.push(join(dir, DESKTOP_PLUGIN_CACHE_METADATA_FILE_NAME))
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry)
      try {
        if (statSync(path).isDirectory()) walk(path, depth + 1)
      } catch {
        // Ignore disappearing cache entries.
      }
    }
  }
  walk(cacheRoot, 0)
  return files.sort()
}

function removePreparedProjection(prepared: ProjectPluginPreparedPaths | undefined, targets: ElectronProjectSkillProviderTarget[]): void {
  if (!prepared) return
  const targetSet = new Set(targets.length ? targets : prepared.providerTargets)
  for (const target of targetSet) {
    const skillDir = prepared.providerSkillDirs?.[target]
    if (skillDir) rmSync(skillDir, { recursive: true, force: true })
    const pluginCacheDir = prepared.providerPluginCacheDirs?.[target]
    if (pluginCacheDir) rmSync(pluginCacheDir, { recursive: true, force: true })
  }
  if (prepared.catalogSkillsDir) rmSync(prepared.catalogSkillsDir, { recursive: true, force: true })
  if (prepared.projectPluginBundleDir) rmSync(prepared.projectPluginBundleDir, { recursive: true, force: true })
}

function normalizeProjectPluginRecord(
  input: ElectronProjectPluginInstallInput | ElectronSystemPluginInstallInput | Record<string, unknown>,
  providerTargetFallback: ElectronProjectSkillProviderTarget[] = [],
): ProjectPluginRecord {
  const name = stringField(input.name) ?? stringField(input.id) ?? MOVSCRIPT_PLUGIN_NAME
  const marketplaceName = stringField(input.marketplaceName) ?? MOVSCRIPT_BUNDLED_MARKETPLACE_NAME
  const pluginKey = stringField(input.pluginKey) ?? `${name}@${marketplaceName}`
  return {
    id: stringField(input.id) ?? pluginKey,
    name,
    marketplaceName,
    pluginKey,
    ...(stringField(input.sourceMarketplaceName) ? { sourceMarketplaceName: stringField(input.sourceMarketplaceName) } : {}),
    ...(stringField(input.sourceMarketplacePath) ? { sourceMarketplacePath: stringField(input.sourceMarketplacePath) } : {}),
    ...(stringField(input.displayName) ? { displayName: stringField(input.displayName) } : {}),
    ...(stringField(input.version) ? { version: stringField(input.version) } : {}),
    ...(stringField(input.description) ? { description: stringField(input.description) } : {}),
    ...(stringField(input.sourceType) ? { sourceType: stringField(input.sourceType) } : {}),
    ...(stringField(input.sourcePath) ? { sourcePath: stringField(input.sourcePath) } : {}),
    providerTargets: normalizeProjectSkillProviderTargets((input as { providerTargets?: unknown }).providerTargets, providerTargetFallback),
    enabled: (input as { enabled?: unknown }).enabled !== false,
  }
}

function resolveProjectPluginSourcePath(input: ElectronProjectPluginInstallInput | ElectronSystemPluginInstallInput): string | undefined {
  const name = stringField(input.name) ?? stringField(input.id)
  const marketplaceName = stringField(input.marketplaceName)
  if (name === MOVSCRIPT_PLUGIN_NAME && (!marketplaceName || marketplaceName === MOVSCRIPT_BUNDLED_MARKETPLACE_NAME)) {
    return resolveMovScriptBundledPluginSource()
  }
  const sourcePath = stringField(input.sourcePath)
  if (!sourcePath) return undefined
  if (sourcePath.startsWith('/')) return sourcePath
  const marketplacePath = stringField(input.marketplacePath)
  if (!marketplacePath) return resolve(sourcePath)
  const base = marketplacePath.endsWith('marketplace.json')
    ? dirname(dirname(dirname(marketplacePath)))
    : marketplacePath
  return resolve(base, sourcePath)
}

function defaultProjectPluginManifest(): ProjectPluginManifest {
  return {
    schema: PROJECT_PLUGIN_MANIFEST_SCHEMA,
    updatedAt: new Date().toISOString(),
    plugins: [],
  }
}

function defaultProjectPluginLock(): ProjectPluginLock {
  return {
    schema: PROJECT_PLUGIN_LOCK_SCHEMA,
    updatedAt: new Date().toISOString(),
    plugins: [],
  }
}

function readProjectPluginManifest(path: string): ProjectPluginManifest {
  const parsed = readJSON(path)
  if (!isRecord(parsed) || parsed.schema !== PROJECT_PLUGIN_MANIFEST_SCHEMA || !Array.isArray(parsed.plugins)) {
    return defaultProjectPluginManifest()
  }
  return {
    schema: PROJECT_PLUGIN_MANIFEST_SCHEMA,
    updatedAt: stringField(parsed.updatedAt) ?? new Date().toISOString(),
    plugins: parsed.plugins.filter(isRecord).map((plugin) => normalizeProjectPluginRecord(plugin)),
  }
}

function readProjectPluginLock(path: string): ProjectPluginLock {
  const parsed = readJSON(path)
  if (!isRecord(parsed) || parsed.schema !== PROJECT_PLUGIN_LOCK_SCHEMA || !Array.isArray(parsed.plugins)) {
    return defaultProjectPluginLock()
  }
  return {
    schema: PROJECT_PLUGIN_LOCK_SCHEMA,
    updatedAt: stringField(parsed.updatedAt) ?? new Date().toISOString(),
    plugins: parsed.plugins.filter(isRecord).map((plugin) => ({
      ...normalizeProjectPluginRecord(plugin),
      installedAt: stringField(plugin.installedAt) ?? new Date().toISOString(),
      prepared: isRecord(plugin.prepared)
        ? {
            providerTargets: normalizeProjectSkillProviderTargets(plugin.prepared.providerTargets),
            ...(isRecord(plugin.prepared.providerConfigPaths) ? { providerConfigPaths: stringRecord(plugin.prepared.providerConfigPaths, isProjectSkillProviderTarget) } : {}),
            ...(isRecord(plugin.prepared.providerSkillDirs) ? { providerSkillDirs: stringRecord(plugin.prepared.providerSkillDirs, isProjectSkillProviderTarget) } : {}),
            ...(isRecord(plugin.prepared.providerPluginCacheDirs) ? { providerPluginCacheDirs: stringRecord(plugin.prepared.providerPluginCacheDirs, isProjectSkillProviderTarget) } : {}),
            ...(stringField(plugin.prepared.desktopPluginCacheDir) ? { desktopPluginCacheDir: stringField(plugin.prepared.desktopPluginCacheDir) } : {}),
            ...(stringField(plugin.prepared.projectMarketplacePath) ? { projectMarketplacePath: stringField(plugin.prepared.projectMarketplacePath) } : {}),
            ...(stringField(plugin.prepared.projectPluginBundleDir) ? { projectPluginBundleDir: stringField(plugin.prepared.projectPluginBundleDir) } : {}),
            ...(stringField(plugin.prepared.catalogSkillsDir) ? { catalogSkillsDir: stringField(plugin.prepared.catalogSkillsDir) } : {}),
          }
        : { providerTargets: normalizeProjectSkillProviderTargets(plugin.providerTargets) },
    })),
  }
}

function upsertByPluginKey<T extends { pluginKey: string }>(items: T[], next: T): T[] {
  return [...items.filter((item) => item.pluginKey !== next.pluginKey), next]
    .sort((left, right) => left.pluginKey.localeCompare(right.pluginKey))
}

function readJSON(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch (error) {
    if (isNotFoundError(error)) return undefined
    throw error
  }
}

function writeJSONAtomic(path: string, value: unknown): void {
  writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`)
}

function writeTextAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, path)
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringRecord<K extends string>(
  value: Record<string, unknown>,
  isKey: (key: string) => key is K,
): Partial<Record<K, string>> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    const next = stringField(entry)
    return isKey(key) && next ? [[key, next]] : []
  })) as Partial<Record<K, string>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}
