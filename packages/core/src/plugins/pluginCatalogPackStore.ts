import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export const PLUGIN_CATALOG_STORE_DIR_NAME = 'plugin-catalog'
export const PLUGIN_CATALOG_SKILLS_DIR_NAME = 'skills'
export const PLUGIN_CATALOG_TOOLS_DIR_NAME = 'tools'
export const PLUGIN_CATALOG_PACKS_DIR_NAME = 'packs'
export const PLUGIN_CATALOG_CONFIG_FILES_DIR_NAME = 'config-files'

export const MOVSCRIPT_PLUGIN_CATALOG_STORE_DIR_ENV = 'MOVSCRIPT_PLUGIN_CATALOG_STORE_DIR'
export const MOVSCRIPT_PLUGIN_CATALOG_SKILLS_DIR_ENV = 'MOVSCRIPT_PLUGIN_CATALOG_SKILLS_DIR'
export const MOVSCRIPT_PLUGIN_CATALOG_TOOLS_DIR_ENV = 'MOVSCRIPT_PLUGIN_CATALOG_TOOLS_DIR'
export const MOVSCRIPT_PLUGIN_CATALOG_PACKS_DIR_ENV = 'MOVSCRIPT_PLUGIN_CATALOG_PACKS_DIR'
export const MOVSCRIPT_PLUGIN_CATALOG_CONFIG_FILES_DIR_ENV = 'MOVSCRIPT_PLUGIN_CATALOG_CONFIG_FILES_DIR'

const MAX_PACK_FILES = 200
const MAX_PACK_FILE_CHARS = 256 * 1024
const MAX_PACK_TOTAL_CHARS = 2 * 1024 * 1024

export type PluginCatalogPackKind = 'skills' | 'tools' | 'packs' | 'configFiles'

export interface PluginCatalogPackStoreDirs {
  rootDir: string
  skillsDir: string
  toolsDir: string
  packsDir: string
  configFilesDir: string
}

export interface PluginCatalogPackFile {
  path: string
  content: string
}

export interface InstallPluginCatalogPackInput {
  pluginId: string
  files: PluginCatalogPackFile[]
  dirs?: PluginCatalogPackStoreDirs
}

export interface InstallPluginCatalogPackResult {
  pluginId: string
  dirs: PluginCatalogPackStoreDirs
  targetDirs: Partial<Record<PluginCatalogPackKind, string>>
  installedFiles: string[]
}

export interface UninstallPluginCatalogPackInput {
  pluginId: string
  dirs?: PluginCatalogPackStoreDirs
}

export interface UninstallPluginCatalogPackResult {
  pluginId: string
  dirs: PluginCatalogPackStoreDirs
  removed: boolean
}

export interface PluginCatalogPackPlugin {
  pluginId: string
  kinds: PluginCatalogPackKind[]
  paths: Partial<Record<PluginCatalogPackKind, string>>
}

export interface ResolvePluginCatalogPackStoreDirsInput {
  dataDir?: string
  env?: NodeJS.ProcessEnv
}

const CATALOG_PREFIX_TO_KIND: Record<string, PluginCatalogPackKind> = {
  'plugin-skills': 'skills',
  'plugin-tools': 'tools',
  'plugin-packs': 'packs',
  'plugin-config-files': 'configFiles',
}

export function resolvePluginCatalogPackStoreDirs(input: ResolvePluginCatalogPackStoreDirsInput = {}): PluginCatalogPackStoreDirs {
  const env = input.env ?? process.env
  const dataDir = input.dataDir ?? process.cwd()
  const rootDir = env[MOVSCRIPT_PLUGIN_CATALOG_STORE_DIR_ENV]
    || join(dataDir, PLUGIN_CATALOG_STORE_DIR_NAME)
  return {
    rootDir,
    skillsDir: env[MOVSCRIPT_PLUGIN_CATALOG_SKILLS_DIR_ENV] || join(rootDir, PLUGIN_CATALOG_SKILLS_DIR_NAME),
    toolsDir: env[MOVSCRIPT_PLUGIN_CATALOG_TOOLS_DIR_ENV] || join(rootDir, PLUGIN_CATALOG_TOOLS_DIR_NAME),
    packsDir: env[MOVSCRIPT_PLUGIN_CATALOG_PACKS_DIR_ENV] || join(rootDir, PLUGIN_CATALOG_PACKS_DIR_NAME),
    configFilesDir: env[MOVSCRIPT_PLUGIN_CATALOG_CONFIG_FILES_DIR_ENV] || join(rootDir, PLUGIN_CATALOG_CONFIG_FILES_DIR_NAME),
  }
}

export function ensurePluginCatalogPackStoreDirs(dirs: PluginCatalogPackStoreDirs): PluginCatalogPackStoreDirs {
  mkdirSync(dirs.skillsDir, { recursive: true })
  mkdirSync(dirs.toolsDir, { recursive: true })
  mkdirSync(dirs.packsDir, { recursive: true })
  mkdirSync(dirs.configFilesDir, { recursive: true })
  return dirs
}

export function installPluginCatalogPack(input: InstallPluginCatalogPackInput): InstallPluginCatalogPackResult {
  const pluginSegment = safePathSegment(input.pluginId)
  if (!pluginSegment) throw new Error('pluginId is required')
  if (!Array.isArray(input.files) || input.files.length === 0) throw new Error('files are required')
  if (input.files.length > MAX_PACK_FILES) throw new Error(`plugin catalog pack has too many files; max ${MAX_PACK_FILES}`)

  const dirs = ensurePluginCatalogPackStoreDirs(input.dirs ?? resolvePluginCatalogPackStoreDirs())
  const normalizedFiles = input.files.map(normalizeCatalogPackFile)
  const totalChars = normalizedFiles.reduce((total, file) => total + file.content.length, 0)
  if (totalChars > MAX_PACK_TOTAL_CHARS) throw new Error(`plugin catalog pack is too large; max ${MAX_PACK_TOTAL_CHARS} chars`)

  for (const kind of catalogKinds()) rmSync(resolve(kindRootDir(dirs, kind), 'plugins', pluginSegment), { recursive: true, force: true })

  const installedFiles: string[] = []
  const targetDirs: InstallPluginCatalogPackResult['targetDirs'] = {}
  for (const file of normalizedFiles) {
    const rootDir = kindRootDir(dirs, file.kind)
    const targetDir = resolve(rootDir, 'plugins', pluginSegment)
    const absolutePath = resolve(targetDir, file.path)
    assertPathInside(targetDir, absolutePath)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, catalogPackFileContentForInstall(file, input.pluginId, pluginSegment), 'utf8')
    targetDirs[file.kind] = targetDir
    installedFiles.push(`${kindExternalPrefix(file.kind)}/${relative(rootDir, absolutePath).split(sep).join('/')}`)
  }

  return {
    pluginId: input.pluginId,
    dirs,
    targetDirs,
    installedFiles: installedFiles.sort(),
  }
}

export function uninstallPluginCatalogPack(input: UninstallPluginCatalogPackInput): UninstallPluginCatalogPackResult {
  const pluginSegment = safePathSegment(input.pluginId)
  if (!pluginSegment) throw new Error('pluginId is required')

  const dirs = ensurePluginCatalogPackStoreDirs(input.dirs ?? resolvePluginCatalogPackStoreDirs())
  let removed = false
  for (const kind of catalogKinds()) {
    const pluginsDir = resolve(kindRootDir(dirs, kind), 'plugins')
    const targetDir = resolve(pluginsDir, pluginSegment)
    assertPathInside(pluginsDir, targetDir)
    if (existsSync(targetDir)) removed = true
    rmSync(targetDir, { recursive: true, force: true })
  }

  return { pluginId: input.pluginId, dirs, removed }
}

export function listPluginCatalogPackPlugins(dirs = ensurePluginCatalogPackStoreDirs(resolvePluginCatalogPackStoreDirs())): { dirs: PluginCatalogPackStoreDirs; plugins: PluginCatalogPackPlugin[] } {
  const byId = new Map<string, PluginCatalogPackPlugin>()
  for (const kind of catalogKinds()) {
    const rootDir = kindRootDir(dirs, kind)
    const pluginsDir = resolve(rootDir, 'plugins')
    assertPathInside(rootDir, pluginsDir)
    if (!existsSync(pluginsDir)) continue
    for (const entry of readdirSync(pluginsDir).sort()) {
      const target = resolve(pluginsDir, entry)
      assertPathInside(pluginsDir, target)
      try {
        if (!statSync(target).isDirectory()) continue
      } catch {
        continue
      }
      const current: PluginCatalogPackPlugin = byId.get(entry) ?? { pluginId: entry, kinds: [], paths: {} }
      if (!current.kinds.includes(kind)) current.kinds.push(kind)
      current.paths[kind] = relative(rootDir, target).split(sep).join('/')
      byId.set(entry, current)
    }
  }
  return {
    dirs,
    plugins: Array.from(byId.values()).sort((left, right) => left.pluginId.localeCompare(right.pluginId)),
  }
}

function catalogKinds(): PluginCatalogPackKind[] {
  return ['skills', 'tools', 'packs', 'configFiles']
}

function kindRootDir(dirs: PluginCatalogPackStoreDirs, kind: PluginCatalogPackKind): string {
  if (kind === 'skills') return dirs.skillsDir
  if (kind === 'tools') return dirs.toolsDir
  if (kind === 'packs') return dirs.packsDir
  return dirs.configFilesDir
}

function kindExternalPrefix(kind: PluginCatalogPackKind): string {
  if (kind === 'skills') return 'plugin-skills'
  if (kind === 'tools') return 'plugin-tools'
  if (kind === 'packs') return 'plugin-packs'
  return 'plugin-config-files'
}

function normalizeCatalogPackFile(file: PluginCatalogPackFile): PluginCatalogPackFile & { kind: PluginCatalogPackKind } {
  if (!file || typeof file !== 'object') throw new Error('plugin catalog pack file must be an object')
  if (typeof file.path !== 'string' || !file.path.trim()) throw new Error('plugin catalog pack file path is required')
  if (typeof file.content !== 'string') throw new Error(`plugin catalog pack file ${file.path} content must be a string`)
  if (file.content.length > MAX_PACK_FILE_CHARS) throw new Error(`plugin catalog pack file ${file.path} is too large`)

  const rawParts = file.path.replace(/\\/g, '/').split('/').filter(Boolean)
  const prefix = rawParts[0]
  const kind = prefix ? CATALOG_PREFIX_TO_KIND[prefix] : undefined
  if (!kind) throw new Error(`unsupported plugin catalog pack path: ${file.path}`)
  const parts = rawParts.slice(1)
  if (parts.length === 0) throw new Error('plugin catalog pack file path is empty')
  if (parts.some((part) => part === '.' || part === '..')) throw new Error(`unsafe plugin catalog pack path: ${file.path}`)
  if (parts.some((part) => part.includes('\0'))) throw new Error(`unsafe plugin catalog pack path: ${file.path}`)
  const leaf = parts.at(-1) ?? ''
  if (!isSupportedCatalogFile(kind, leaf)) throw new Error(`unsupported plugin catalog pack file: ${file.path}`)
  return { path: parts.join('/'), content: file.content, kind }
}

function catalogPackFileContentForInstall(file: PluginCatalogPackFile & { kind: PluginCatalogPackKind }, pluginId: string, pluginSegment: string): string {
  if (file.kind !== 'packs') return file.content
  let parsed: unknown
  try {
    parsed = JSON.parse(file.content)
  } catch {
    return file.content
  }
  if (!isJSONRecord(parsed)) return file.content
  const next: Record<string, unknown> = { ...parsed, source: 'plugin', pluginId }
  const resources = isJSONRecord(next.resources) ? next.resources : undefined
  if (resources) {
    next.resources = {
      ...resources,
      ...(Array.isArray(resources.skills) ? { skills: resources.skills.map((item: unknown) => pluginResourcePath(item, pluginSegment)) } : {}),
      ...(Array.isArray(resources.tools) ? { tools: resources.tools.map((item: unknown) => pluginResourcePath(item, pluginSegment)) } : {}),
    }
  }
  return `${JSON.stringify(next, null, 2)}\n`
}

function pluginResourcePath(value: unknown, pluginSegment: string): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (!trimmed || trimmed.startsWith('../') || trimmed.includes('/../')) return value
  const prefix = `plugins/${pluginSegment}/`
  return trimmed === `plugins/${pluginSegment}` || trimmed.startsWith(prefix)
    ? trimmed
    : `${prefix}${trimmed}`
}

function isJSONRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isSupportedCatalogFile(kind: PluginCatalogPackKind, leaf: string): boolean {
  if (kind === 'skills') return /^(SKILL\.md|README\.md|[^/]+\.(md|json|txt))$/i.test(leaf)
  if (kind === 'tools') return /^[^/]+\.tool\.json$/i.test(leaf)
  if (kind === 'packs') return /^[^/]+\.json$/i.test(leaf)
  return /^[^/]+\.json$/i.test(leaf)
}

function safePathSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120)
}

function assertPathInside(rootDir: string, targetPath: string): void {
  const relativePath = relative(resolve(rootDir), resolve(targetPath))
  if (relativePath === '' || (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath))) return
  throw new Error(`unsafe target path outside plugin catalog directory: ${targetPath}`)
}
