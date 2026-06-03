import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export const AGENT_CATALOG_STORE_DIR_NAME = 'agent-catalog'
export const AGENT_CATALOG_SKILLS_DIR_NAME = 'skills'
export const AGENT_CATALOG_TOOLS_DIR_NAME = 'tools'
export const AGENT_CATALOG_PACKS_DIR_NAME = 'packs'
export const AGENT_CATALOG_CONFIG_FILES_DIR_NAME = 'config-files'

export const MOVSCRIPT_AGENT_CATALOG_STORE_DIR_ENV = 'MOVSCRIPT_AGENT_CATALOG_STORE_DIR'
export const MOVSCRIPT_AGENT_SKILLS_DIR_ENV = 'MOVSCRIPT_AGENT_SKILLS_DIR'
export const MOVSCRIPT_AGENT_TOOLS_DIR_ENV = 'MOVSCRIPT_AGENT_TOOLS_DIR'
export const MOVSCRIPT_AGENT_PACKS_DIR_ENV = 'MOVSCRIPT_AGENT_PACKS_DIR'
export const MOVSCRIPT_AGENT_CONFIG_FILES_DIR_ENV = 'MOVSCRIPT_AGENT_CONFIG_FILES_DIR'

const MAX_PACK_FILES = 200
const MAX_PACK_FILE_CHARS = 256 * 1024
const MAX_PACK_TOTAL_CHARS = 2 * 1024 * 1024

export type AgentCatalogPackKind = 'skills' | 'tools' | 'packs' | 'configFiles'

export interface AgentCatalogPackStoreDirs {
  rootDir: string
  skillsDir: string
  toolsDir: string
  packsDir: string
  configFilesDir: string
}

export interface AgentCatalogPackFile {
  path: string
  content: string
}

export interface InstallAgentCatalogPackInput {
  pluginId: string
  files: AgentCatalogPackFile[]
  dirs?: AgentCatalogPackStoreDirs
}

export interface InstallAgentCatalogPackResult {
  pluginId: string
  dirs: AgentCatalogPackStoreDirs
  targetDirs: Partial<Record<AgentCatalogPackKind, string>>
  installedFiles: string[]
}

export interface UninstallAgentCatalogPackInput {
  pluginId: string
  dirs?: AgentCatalogPackStoreDirs
}

export interface UninstallAgentCatalogPackResult {
  pluginId: string
  dirs: AgentCatalogPackStoreDirs
  removed: boolean
}

export interface AgentCatalogPackPlugin {
  pluginId: string
  kinds: AgentCatalogPackKind[]
  paths: Partial<Record<AgentCatalogPackKind, string>>
}

export interface ResolveAgentCatalogPackStoreDirsInput {
  dataDir?: string
  env?: NodeJS.ProcessEnv
}

const CATALOG_PREFIX_TO_KIND: Record<string, AgentCatalogPackKind> = {
  'agent-skills': 'skills',
  'agent-tools': 'tools',
  'agent-packs': 'packs',
  'agent-config-files': 'configFiles',
}

export function resolveAgentCatalogPackStoreDirs(input: ResolveAgentCatalogPackStoreDirsInput = {}): AgentCatalogPackStoreDirs {
  const env = input.env ?? process.env
  const dataDir = input.dataDir ?? process.cwd()
  const rootDir = env[MOVSCRIPT_AGENT_CATALOG_STORE_DIR_ENV] || join(dataDir, AGENT_CATALOG_STORE_DIR_NAME)
  return {
    rootDir,
    skillsDir: env[MOVSCRIPT_AGENT_SKILLS_DIR_ENV] || join(rootDir, AGENT_CATALOG_SKILLS_DIR_NAME),
    toolsDir: env[MOVSCRIPT_AGENT_TOOLS_DIR_ENV] || join(rootDir, AGENT_CATALOG_TOOLS_DIR_NAME),
    packsDir: env[MOVSCRIPT_AGENT_PACKS_DIR_ENV] || join(rootDir, AGENT_CATALOG_PACKS_DIR_NAME),
    configFilesDir: env[MOVSCRIPT_AGENT_CONFIG_FILES_DIR_ENV] || join(rootDir, AGENT_CATALOG_CONFIG_FILES_DIR_NAME),
  }
}

export function ensureAgentCatalogPackStoreDirs(dirs: AgentCatalogPackStoreDirs): AgentCatalogPackStoreDirs {
  mkdirSync(dirs.skillsDir, { recursive: true })
  mkdirSync(dirs.toolsDir, { recursive: true })
  mkdirSync(dirs.packsDir, { recursive: true })
  mkdirSync(dirs.configFilesDir, { recursive: true })
  return dirs
}

export function installAgentCatalogPack(input: InstallAgentCatalogPackInput): InstallAgentCatalogPackResult {
  const pluginSegment = safePathSegment(input.pluginId)
  if (!pluginSegment) throw new Error('pluginId is required')
  if (!Array.isArray(input.files) || input.files.length === 0) throw new Error('files are required')
  if (input.files.length > MAX_PACK_FILES) throw new Error(`agent catalog pack has too many files; max ${MAX_PACK_FILES}`)

  const dirs = ensureAgentCatalogPackStoreDirs(input.dirs ?? resolveAgentCatalogPackStoreDirs())
  const normalizedFiles = input.files.map(normalizeCatalogPackFile)
  const totalChars = normalizedFiles.reduce((total, file) => total + file.content.length, 0)
  if (totalChars > MAX_PACK_TOTAL_CHARS) throw new Error(`agent catalog pack is too large; max ${MAX_PACK_TOTAL_CHARS} chars`)

  for (const kind of catalogKinds()) rmSync(resolve(kindRootDir(dirs, kind), 'plugins', pluginSegment), { recursive: true, force: true })

  const installedFiles: string[] = []
  const targetDirs: InstallAgentCatalogPackResult['targetDirs'] = {}
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

export function uninstallAgentCatalogPack(input: UninstallAgentCatalogPackInput): UninstallAgentCatalogPackResult {
  const pluginSegment = safePathSegment(input.pluginId)
  if (!pluginSegment) throw new Error('pluginId is required')

  const dirs = ensureAgentCatalogPackStoreDirs(input.dirs ?? resolveAgentCatalogPackStoreDirs())
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

export function listAgentCatalogPackPlugins(dirs = ensureAgentCatalogPackStoreDirs(resolveAgentCatalogPackStoreDirs())): { dirs: AgentCatalogPackStoreDirs; plugins: AgentCatalogPackPlugin[] } {
  const byId = new Map<string, AgentCatalogPackPlugin>()
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
      const current = byId.get(entry) ?? { pluginId: entry, kinds: [], paths: {} }
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

function catalogKinds(): AgentCatalogPackKind[] {
  return ['skills', 'tools', 'packs', 'configFiles']
}

function kindRootDir(dirs: AgentCatalogPackStoreDirs, kind: AgentCatalogPackKind): string {
  if (kind === 'skills') return dirs.skillsDir
  if (kind === 'tools') return dirs.toolsDir
  if (kind === 'packs') return dirs.packsDir
  return dirs.configFilesDir
}

function kindExternalPrefix(kind: AgentCatalogPackKind): string {
  if (kind === 'skills') return 'agent-skills'
  if (kind === 'tools') return 'agent-tools'
  if (kind === 'packs') return 'agent-packs'
  return 'agent-config-files'
}

function normalizeCatalogPackFile(file: AgentCatalogPackFile): AgentCatalogPackFile & { kind: AgentCatalogPackKind } {
  if (!file || typeof file !== 'object') throw new Error('agent catalog pack file must be an object')
  if (typeof file.path !== 'string' || !file.path.trim()) throw new Error('agent catalog pack file path is required')
  if (typeof file.content !== 'string') throw new Error(`agent catalog pack file ${file.path} content must be a string`)
  if (file.content.length > MAX_PACK_FILE_CHARS) throw new Error(`agent catalog pack file ${file.path} is too large`)

  const rawParts = file.path.replace(/\\/g, '/').split('/').filter(Boolean)
  const prefix = rawParts[0]
  const kind = prefix ? CATALOG_PREFIX_TO_KIND[prefix] : undefined
  if (!kind) throw new Error(`unsupported agent catalog pack path: ${file.path}`)
  const parts = rawParts.slice(1)
  if (parts.length === 0) throw new Error('agent catalog pack file path is empty')
  if (parts.some((part) => part === '.' || part === '..')) throw new Error(`unsafe agent catalog pack path: ${file.path}`)
  if (parts.some((part) => part.includes('\0'))) throw new Error(`unsafe agent catalog pack path: ${file.path}`)
  const leaf = parts.at(-1) ?? ''
  if (!isSupportedCatalogFile(kind, leaf)) throw new Error(`unsupported agent catalog pack file: ${file.path}`)
  return { path: parts.join('/'), content: file.content, kind }
}

function catalogPackFileContentForInstall(file: AgentCatalogPackFile & { kind: AgentCatalogPackKind }, pluginId: string, pluginSegment: string): string {
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

function isSupportedCatalogFile(kind: AgentCatalogPackKind, leaf: string): boolean {
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
  throw new Error(`unsafe target path outside agent catalog directory: ${targetPath}`)
}
