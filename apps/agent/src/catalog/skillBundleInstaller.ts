import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export interface AgentSkillBundleFile {
  path: string
  content: string
}

export interface InstallAgentSkillBundleInput {
  skillsDir: string
  pluginId: string
  files: AgentSkillBundleFile[]
}

export interface InstallAgentSkillBundleResult {
  pluginId: string
  targetDir: string
  installedFiles: string[]
}

export interface UninstallAgentSkillBundleInput {
  skillsDir: string
  pluginId: string
}

export interface UninstallAgentSkillBundleResult {
  pluginId: string
  targetDir: string
  removed: boolean
}

export interface AgentSkillBundlePlugin {
  pluginId: string
  path: string
}

const MAX_SKILL_BUNDLE_FILES = 200
const MAX_SKILL_BUNDLE_FILE_CHARS = 256 * 1024
const MAX_SKILL_BUNDLE_TOTAL_CHARS = 2 * 1024 * 1024

export function installAgentSkillBundle(input: InstallAgentSkillBundleInput): InstallAgentSkillBundleResult {
  const pluginSegment = safePathSegment(input.pluginId)
  if (!pluginSegment) throw new Error('pluginId is required')
  if (!Array.isArray(input.files) || input.files.length === 0) throw new Error('files are required')
  if (input.files.length > MAX_SKILL_BUNDLE_FILES) throw new Error(`agent skill bundle has too many files; max ${MAX_SKILL_BUNDLE_FILES}`)

  const rootDir = resolve(input.skillsDir)
  const targetDir = resolve(rootDir, 'plugins', pluginSegment)
  assertPathInside(rootDir, targetDir)

  const normalizedFiles = input.files.map((file) => normalizeSkillBundleFile(file))
  const totalChars = normalizedFiles.reduce((total, file) => total + file.content.length, 0)
  if (totalChars > MAX_SKILL_BUNDLE_TOTAL_CHARS) throw new Error(`agent skill bundle is too large; max ${MAX_SKILL_BUNDLE_TOTAL_CHARS} chars`)

  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(targetDir, { recursive: true })

  const installedFiles: string[] = []
  for (const file of normalizedFiles) {
    const absolutePath = resolve(targetDir, file.path)
    assertPathInside(targetDir, absolutePath)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, file.content, 'utf8')
    installedFiles.push(relative(rootDir, absolutePath).split(sep).join('/'))
  }

  return {
    pluginId: input.pluginId,
    targetDir,
    installedFiles: installedFiles.sort(),
  }
}

export function uninstallAgentSkillBundle(input: UninstallAgentSkillBundleInput): UninstallAgentSkillBundleResult {
  const pluginSegment = safePathSegment(input.pluginId)
  if (!pluginSegment) throw new Error('pluginId is required')

  const rootDir = resolve(input.skillsDir)
  const targetDir = resolve(rootDir, 'plugins', pluginSegment)
  assertPathInside(rootDir, targetDir)

  const removed = existsSync(targetDir)
  rmSync(targetDir, { recursive: true, force: true })

  return {
    pluginId: input.pluginId,
    targetDir,
    removed,
  }
}

export function listAgentSkillBundlePlugins(skillsDir: string): AgentSkillBundlePlugin[] {
  const rootDir = resolve(skillsDir)
  const pluginsDir = resolve(rootDir, 'plugins')
  assertPathInside(rootDir, pluginsDir)
  if (!existsSync(pluginsDir)) return []

  return readdirSync(pluginsDir)
    .filter((entry) => {
      const target = resolve(pluginsDir, entry)
      assertPathInside(pluginsDir, target)
      try {
        return statSync(target).isDirectory()
      } catch {
        return false
      }
    })
    .sort((a, b) => a.localeCompare(b))
    .map((pluginId) => ({
      pluginId,
      path: relative(rootDir, resolve(pluginsDir, pluginId)).split(sep).join('/'),
    }))
}

function normalizeSkillBundleFile(file: AgentSkillBundleFile): AgentSkillBundleFile {
  if (!file || typeof file !== 'object') throw new Error('agent skill bundle file must be an object')
  if (typeof file.path !== 'string' || !file.path.trim()) throw new Error('agent skill bundle file path is required')
  if (typeof file.content !== 'string') throw new Error(`agent skill bundle file ${file.path} content must be a string`)
  if (file.content.length > MAX_SKILL_BUNDLE_FILE_CHARS) throw new Error(`agent skill bundle file ${file.path} is too large`)

  const normalizedPath = normalizeBundlePath(file.path)
  return { path: normalizedPath, content: file.content }
}

function normalizeBundlePath(value: string): string {
  const rawParts = value.replace(/\\/g, '/').split('/').filter(Boolean)
  const parts = rawParts[0] === 'agent-skills' ? rawParts.slice(1) : rawParts
  if (parts.length === 0) throw new Error('agent skill bundle file path is empty')
  if (parts.some((part) => part === '.' || part === '..')) throw new Error(`unsafe agent skill bundle path: ${value}`)
  if (parts.some((part) => part.includes('\0'))) throw new Error(`unsafe agent skill bundle path: ${value}`)
  const leaf = parts.at(-1) ?? ''
  if (!/^(SKILL\.md|README\.md|[^/]+\.(md|json|txt))$/i.test(leaf)) throw new Error(`unsupported agent skill bundle file: ${value}`)
  return parts.join('/')
}

function safePathSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120)
}

function assertPathInside(rootDir: string, targetPath: string): void {
  const relativePath = relative(rootDir, targetPath)
  if (relativePath === '' || (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath))) return
  throw new Error(`unsafe target path outside skills directory: ${targetPath}`)
}
