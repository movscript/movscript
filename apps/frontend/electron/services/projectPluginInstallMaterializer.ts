import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import type { ElectronProjectSkillProviderTarget } from '../../src/shared/contracts/electronApi'

const SKILLS_DIR_NAME = 'skills'
const PLUGINS_DIR_NAME = 'plugins'
const PROJECT_PLUGIN_BUNDLES_DIR_NAME = 'bundles'
const DESKTOP_PLUGIN_CACHE_METADATA_FILE_NAME = 'metadata.json'

export type ProjectPluginMaterializerPlugin = {
  name: string
  marketplaceName: string
  sourceMarketplaceName?: string
  sourceMarketplacePath?: string
  pluginKey: string
  displayName?: string
  version?: string
  description?: string
  providerTargets: ElectronProjectSkillProviderTarget[]
}

export type ProjectPluginMaterializerPaths = {
  pluginsDir: string
  providerConfigPaths: Partial<Record<ElectronProjectSkillProviderTarget, string>>
  providerSkillDirs: Record<ElectronProjectSkillProviderTarget, string>
  catalogSkillsDir: string
  desktopPluginCacheRoot: string
  projectMarketplacePath: string
  projectPluginBundlesDir: string
}

export type ProjectPluginPreparedPaths = {
  providerTargets: ElectronProjectSkillProviderTarget[]
  providerConfigPaths?: Partial<Record<ElectronProjectSkillProviderTarget, string>>
  providerSkillDirs?: Partial<Record<ElectronProjectSkillProviderTarget, string>>
  desktopPluginCacheDir?: string
  projectMarketplacePath?: string
  projectPluginBundleDir?: string
  catalogSkillsDir?: string
}

export function materializeProjectPluginInstall(input: {
  paths: ProjectPluginMaterializerPaths
  plugin: ProjectPluginMaterializerPlugin
  sourcePath?: string
}): ProjectPluginPreparedPaths {
  const { paths, plugin, sourcePath } = input
  if (plugin.providerTargets.length === 0) {
    throw new Error('Project plugin materialization requires at least one provider target.')
  }
  mkdirSync(paths.pluginsDir, { recursive: true })
  for (const target of plugin.providerTargets) mkdirSync(paths.providerSkillDirs[target], { recursive: true })
  mkdirSync(paths.catalogSkillsDir, { recursive: true })
  mkdirSync(paths.desktopPluginCacheRoot, { recursive: true })
  mkdirSync(paths.projectPluginBundlesDir, { recursive: true })

  const prepared: ProjectPluginPreparedPaths = {
    providerTargets: plugin.providerTargets,
  }
  const providerConfigPaths: Partial<Record<ElectronProjectSkillProviderTarget, string>> = {}
  for (const target of plugin.providerTargets) {
    const configPath = paths.providerConfigPaths[target]
    if (!configPath) continue
    ensureProviderPluginEnabled(configPath, plugin.pluginKey)
    providerConfigPaths[target] = configPath
  }
  if (Object.keys(providerConfigPaths).length > 0) prepared.providerConfigPaths = providerConfigPaths

  const cachedSource = sourcePath && existsSync(sourcePath)
    ? materializeDesktopPluginCache(paths.desktopPluginCacheRoot, plugin, sourcePath)
    : undefined
  if (cachedSource) prepared.desktopPluginCacheDir = cachedSource.cacheDir
  const materializedSourcePath = cachedSource?.cacheDir ?? sourcePath

  const sourceSkillsDir = materializedSourcePath ? join(materializedSourcePath, SKILLS_DIR_NAME) : undefined
  if (sourceSkillsDir && existsSync(sourceSkillsDir)) {
    const skillSegment = safePathSegment(plugin.pluginKey)
    const providerSkillDirs: Partial<Record<ElectronProjectSkillProviderTarget, string>> = {}
    const catalogTarget = join(paths.catalogSkillsDir, PLUGINS_DIR_NAME, skillSegment)
    for (const target of plugin.providerTargets) {
      const providerTarget = join(paths.providerSkillDirs[target], PLUGINS_DIR_NAME, skillSegment)
      replaceDirectory(sourceSkillsDir, providerTarget)
      providerSkillDirs[target] = providerTarget
    }
    replaceDirectory(sourceSkillsDir, catalogTarget)
    prepared.providerSkillDirs = providerSkillDirs
    prepared.catalogSkillsDir = catalogTarget
  }
  if (materializedSourcePath && existsSync(materializedSourcePath)) {
    const bundleSegment = safePathSegment(plugin.pluginKey)
    const bundleTarget = join(paths.projectPluginBundlesDir, bundleSegment)
    replaceDirectory(materializedSourcePath, bundleTarget)
    ensureProjectMarketplacePlugin(paths.projectMarketplacePath, plugin, `./${PROJECT_PLUGIN_BUNDLES_DIR_NAME}/${bundleSegment}`)
    prepared.projectMarketplacePath = paths.projectMarketplacePath
    prepared.projectPluginBundleDir = bundleTarget
  }
  return prepared
}

export function replaceDirectory(source: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true })
  const tmp = `${destination}.${process.pid}.${Date.now()}.tmp`
  rmSync(tmp, { recursive: true, force: true })
  cpSync(source, tmp, {
    recursive: true,
    dereference: true,
    filter: (path) => !/[/\\](node_modules|dist)([/\\]|$)/.test(path),
  })
  rmSync(destination, { recursive: true, force: true })
  renameSync(tmp, destination)
}

function materializeDesktopPluginCache(
  cacheRoot: string,
  plugin: ProjectPluginMaterializerPlugin,
  sourcePath: string,
): { cacheDir: string; contentHash: string } {
  const contentHash = hashDirectory(sourcePath)
  const versionSegment = safePathSegment(plugin.version ?? contentHash.slice(0, 16))
  const cacheDir = join(
    cacheRoot,
    safePathSegment(plugin.sourceMarketplaceName ?? plugin.marketplaceName),
    safePathSegment(plugin.name),
    versionSegment,
  )
  replaceDirectory(sourcePath, cacheDir)
  writeJSONAtomic(join(cacheDir, DESKTOP_PLUGIN_CACHE_METADATA_FILE_NAME), {
    schema: 'movscript.desktop-plugin-cache.v1',
    pluginKey: plugin.pluginKey,
    name: plugin.name,
    marketplaceName: plugin.marketplaceName,
    ...(plugin.sourceMarketplaceName ? { sourceMarketplaceName: plugin.sourceMarketplaceName } : {}),
    ...(plugin.sourceMarketplacePath ? { sourceMarketplacePath: plugin.sourceMarketplacePath } : {}),
    ...(plugin.version ? { version: plugin.version } : {}),
    providerTargets: plugin.providerTargets,
    contentHash,
    sourcePath,
    cachedAt: new Date().toISOString(),
  })
  return { cacheDir, contentHash }
}

function ensureProviderPluginEnabled(configPath: string, pluginKey: string): void {
  const current = existsSync(configPath) ? readFileSync(configPath, 'utf8') : ''
  let next = current
  next = setTomlSectionValue(next, '[features]', /^plugins\s*=/, 'plugins = true')
  next = setTomlSectionValue(next, `[plugins.${tomlString(pluginKey)}]`, /^enabled\s*=/, 'enabled = true')
  if (next !== current) writeTextAtomic(configPath, next)
}

function ensureProjectMarketplacePlugin(marketplacePath: string, plugin: ProjectPluginMaterializerPlugin, sourcePath: string): void {
  const current = readProjectMarketplace(marketplacePath, plugin.marketplaceName)
  const nextPlugin = {
    name: plugin.name,
    ...(plugin.version ? { local_version: plugin.version } : {}),
    source: {
      source: 'local',
      path: sourcePath,
    },
    interface: {
      ...(plugin.displayName ? { display_name: plugin.displayName } : {}),
      ...(plugin.description ? { short_description: plugin.description } : {}),
    },
    keywords: ['movscript', 'project'],
  }
  writeJSONAtomic(marketplacePath, {
    ...current,
    updated_at: new Date().toISOString(),
    plugins: upsertMarketplacePlugin(current.plugins, nextPlugin),
  })
}

function readProjectMarketplace(path: string, marketplaceName: string): {
  name: string
  interface: { display_name: string }
  updated_at?: string
  plugins: Array<Record<string, unknown> & { name: string }>
} {
  const parsed = readJSON(path)
  if (!isRecord(parsed) || !Array.isArray(parsed.plugins)) {
    return {
      name: marketplaceName,
      interface: { display_name: 'MovScript Project Plugins' },
      plugins: [],
    }
  }
  return {
    name: stringField(parsed.name) ?? marketplaceName,
    interface: isRecord(parsed.interface)
      ? { display_name: stringField(parsed.interface.display_name) ?? stringField(parsed.interface.displayName) ?? 'MovScript Project Plugins' }
      : { display_name: 'MovScript Project Plugins' },
    ...(stringField(parsed.updated_at) ? { updated_at: stringField(parsed.updated_at) } : {}),
    plugins: parsed.plugins
      .filter(isRecord)
      .map((item) => ({ ...item, name: stringField(item.name) ?? stringField(item.id) ?? 'unknown' })),
  }
}

function upsertMarketplacePlugin<T extends { name: string }>(items: T[], next: T): T[] {
  return [...items.filter((item) => item.name !== next.name), next]
    .sort((left, right) => left.name.localeCompare(right.name))
}

function setTomlSectionValue(input: string, sectionHeader: string, keyPattern: RegExp, line: string): string {
  const lines = input ? input.replace(/\s+$/g, '').split('\n') : []
  const sectionPattern = new RegExp(`^\\s*${escapeRegExp(sectionHeader)}\\s*$`)
  let sectionStart = lines.findIndex((item) => sectionPattern.test(item))
  if (sectionStart < 0) {
    if (lines.length > 0) lines.push('')
    lines.push(sectionHeader, line)
    return `${lines.join('\n')}\n`
  }
  let sectionEnd = lines.length
  for (let index = sectionStart + 1; index < lines.length; index += 1) {
    if (/^\s*\[.*]\s*$/.test(lines[index])) {
      sectionEnd = index
      break
    }
  }
  for (let index = sectionStart + 1; index < sectionEnd; index += 1) {
    if (keyPattern.test(lines[index].trim())) {
      lines[index] = line
      return `${lines.join('\n')}\n`
    }
  }
  lines.splice(sectionEnd, 0, line)
  return `${lines.join('\n')}\n`
}

function hashDirectory(root: string): string {
  const hash = createHash('sha256')
  const files = listHashableFiles(root)
  for (const file of files) {
    const rel = relative(root, file).split(sep).join('/')
    hash.update(rel)
    hash.update('\0')
    hash.update(readFileSync(file))
    hash.update('\0')
  }
  return hash.digest('hex')
}

function listHashableFiles(root: string): string[] {
  const files: string[] = []
  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue
      if (entry === DESKTOP_PLUGIN_CACHE_METADATA_FILE_NAME) continue
      const path = join(dir, entry)
      const stat = statSync(path)
      if (stat.isDirectory()) {
        walk(path)
      } else if (stat.isFile()) {
        files.push(path)
      }
    }
  }
  walk(root)
  return files.sort()
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

function safePathSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'plugin'
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}
