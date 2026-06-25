import { createHash } from 'node:crypto'
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type {
  ElectronProjectLocalSkill,
  ElectronProjectSkillProviderTarget,
} from '../../src/shared/contracts/electronApi'
import {
  normalizeProjectSkillProviderTargets,
  PROJECT_SKILL_PROVIDER_TARGETS,
} from './projectSkillProviderTargets'

const SKILLS_DIR_NAME = 'skills'
const DESKTOP_PLUGIN_CACHE_METADATA_FILE_NAME = 'metadata.json'

export type ProjectPluginSkillIndexPaths = {
  providerSkillDirs: Record<ElectronProjectSkillProviderTarget, string>
  desktopPluginCacheRoot: string
  catalogSkillsDir: string
}

export type ProjectPluginSkillIndexLock = {
  plugins: Array<{
    pluginKey: string
    displayName?: string
    name: string
    version?: string
    prepared: {
      providerTargets: ElectronProjectSkillProviderTarget[]
      desktopPluginCacheDir?: string
      projectPluginBundleDir?: string
    }
  }>
}

export function listProjectPluginSkills(
  paths: ProjectPluginSkillIndexPaths,
  lock: ProjectPluginSkillIndexLock,
): ElectronProjectLocalSkill[] {
  const byId = new Map<string, ElectronProjectLocalSkill>()
  const add = (skill: ElectronProjectLocalSkill) => {
    const existing = byId.get(skill.id)
    if (!existing || skillSourceRank(skill.sourceType) < skillSourceRank(existing.sourceType)) {
      byId.set(skill.id, skill)
    } else if (existing && skill.enabled && !existing.enabled) {
      byId.set(skill.id, { ...existing, enabled: true, enabledProviderPath: skill.enabledProviderPath })
    }
  }

  for (const plugin of lock.plugins) {
    const sourceRoot = plugin.prepared.desktopPluginCacheDir ?? plugin.prepared.projectPluginBundleDir
    if (!sourceRoot) continue
    const skillsRoot = join(sourceRoot, SKILLS_DIR_NAME)
    if (existsSync(skillsRoot)) {
      for (const skill of collectSkillsFromRoot(skillsRoot, {
        sourceType: plugin.prepared.desktopPluginCacheDir ? 'desktop-cache' : 'plugin-source',
        pluginKey: plugin.pluginKey,
        pluginName: plugin.displayName ?? plugin.name,
        version: plugin.version,
        providerTargets: plugin.prepared.providerTargets,
      }, paths)) add(skill)
    }
  }

  if (existsSync(paths.desktopPluginCacheRoot)) {
    for (const skillDoc of findSkillDocs(paths.desktopPluginCacheRoot)) {
      const skillsRoot = nearestNamedAncestor(dirname(skillDoc), SKILLS_DIR_NAME)
      if (!skillsRoot) continue
      const metadata = readNearestPluginCacheMetadata(skillsRoot, paths.desktopPluginCacheRoot)
      for (const skill of collectSkillsFromRoot(skillsRoot, {
        sourceType: 'desktop-cache',
        pluginKey: stringField(metadata?.pluginKey),
        pluginName: stringField(metadata?.name),
        version: stringField(metadata?.version),
        providerTargets: normalizeProjectSkillProviderTargets((metadata as { providerTargets?: unknown } | undefined)?.providerTargets),
      }, paths)) add(skill)
    }
  }

  if (existsSync(paths.catalogSkillsDir)) {
    for (const skill of collectSkillsFromRoot(paths.catalogSkillsDir, {
      sourceType: 'project-catalog',
      providerTargets: PROJECT_SKILL_PROVIDER_TARGETS,
    }, paths)) add(skill)
  }

  for (const target of PROJECT_SKILL_PROVIDER_TARGETS) {
    const providerSkillsDir = paths.providerSkillDirs[target]
    if (existsSync(providerSkillsDir)) {
      for (const skill of collectSkillsFromRoot(providerSkillsDir, {
        sourceType: 'project',
        providerTargets: [target],
      }, paths)) add(skill)
    }
  }

  return [...byId.values()].sort((left, right) => {
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1
    return left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  })
}

export function projectProviderSkillTarget(
  paths: Pick<ProjectPluginSkillIndexPaths, 'providerSkillDirs'>,
  skill: ElectronProjectLocalSkill,
  providerTarget: ElectronProjectSkillProviderTarget,
): string {
  return join(paths.providerSkillDirs[providerTarget], ...projectSkillRelativePathForSkill(skill).split('/'))
}

function collectSkillsFromRoot(
  skillsRoot: string,
  source: {
    sourceType: ElectronProjectLocalSkill['sourceType']
    pluginKey?: string
    pluginName?: string
    version?: string
    providerTargets: ElectronProjectSkillProviderTarget[]
  },
  paths: ProjectPluginSkillIndexPaths,
): ElectronProjectLocalSkill[] {
  const root = resolve(skillsRoot)
  return findSkillDocs(root).flatMap((skillDoc) => {
    const skillDir = dirname(skillDoc)
    const rawRelativeSkillDir = normalizeRelativePath(relative(root, skillDir)) || safePathSegment(dirname(skillDoc).split(sep).pop() ?? 'skill')
    const projected = projectedSkillParts(rawRelativeSkillDir, source.sourceType)
    const pluginKey = source.pluginKey ?? projected.pluginKey
    const relativeSkillDir = projected.relativeSkillDir
    const metadata = readSkillMetadata(skillDoc)
    return source.providerTargets.map((providerTarget) => {
      const projectRelativePath = projectSkillRelativePath(providerTarget, pluginKey, relativeSkillDir, paths, skillDir)
      const id = projectSkillId(providerTarget, pluginKey, relativeSkillDir, metadata.name, skillDir)
      const providerTargetDir = join(paths.providerSkillDirs[providerTarget], ...projectRelativePath.split('/'))
      const enabledProviderPath = existsSync(join(providerTargetDir, 'SKILL.md')) ? providerTargetDir : undefined
      return {
        id,
        name: metadata.name ?? relativeSkillDir.split('/').pop() ?? id,
        ...(metadata.description ? { description: metadata.description } : {}),
        sourceType: source.sourceType,
        sourceScope: projectSkillSourceScope(source.sourceType),
        providerTarget,
        providerScope: providerTarget,
        sourcePath: skillDoc,
        sourceSkillDir: skillDir,
        contentHash: hashDirectory(skillDir),
        projectRelativePath,
        ...(pluginKey ? { pluginKey } : {}),
        ...(source.pluginName ? { pluginName: source.pluginName } : {}),
        ...(source.version ? { version: source.version } : {}),
        enabled: Boolean(enabledProviderPath),
        ...(enabledProviderPath ? { enabledProviderPath } : {}),
      }
    })
  })
}

function projectedSkillParts(relativeSkillDir: string, sourceType: ElectronProjectLocalSkill['sourceType']): { pluginKey?: string; relativeSkillDir: string } {
  if ((sourceType === 'project' || sourceType === 'project-catalog') && relativeSkillDir.startsWith('plugins/')) {
    const parts = relativeSkillDir.split('/')
    if (parts.length >= 3) return { pluginKey: parts[1], relativeSkillDir: parts.slice(2).join('/') }
  }
  return { relativeSkillDir }
}

function projectSkillRelativePathForSkill(skill: ElectronProjectLocalSkill): string {
  return skill.projectRelativePath ?? safePathSegment(skill.id)
}

function projectSkillRelativePath(
  providerTarget: ElectronProjectSkillProviderTarget,
  pluginKey: string | undefined,
  relativeSkillDir: string,
  paths: ProjectPluginSkillIndexPaths,
  skillDir: string,
): string {
  const normalizedSkillDir = resolve(skillDir)
  const normalizedProviderRoot = resolve(paths.providerSkillDirs[providerTarget])
  if (normalizedSkillDir === normalizedProviderRoot || normalizedSkillDir.startsWith(`${normalizedProviderRoot}${sep}`)) {
    return normalizeRelativePath(relative(normalizedProviderRoot, normalizedSkillDir)) || safePathSegment(pluginKey ?? normalizedSkillDir)
  }
  if (pluginKey) return `plugins/${safePathSegment(pluginKey)}/${relativeSkillDir}`
  return safePathSegment(relativeSkillDir)
}

function projectSkillId(
  providerTarget: ElectronProjectSkillProviderTarget,
  pluginKey: string | undefined,
  relativeSkillDir: string,
  skillName: string | undefined,
  skillDir: string,
): string {
  if (pluginKey) return `${providerTarget}:${safePathSegment(pluginKey)}__${safePathSegment(relativeSkillDir)}`
  return `${providerTarget}:${safePathSegment(skillName ?? relativeSkillDir)}__${hashText(resolve(skillDir)).slice(0, 8)}`
}

function findSkillDocs(root: string): string[] {
  const docs: string[] = []
  function walk(dir: string, depth: number): void {
    if (depth > 8) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    if (entries.includes('SKILL.md')) {
      docs.push(join(dir, 'SKILL.md'))
      return
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue
      const path = join(dir, entry)
      try {
        if (statSync(path).isDirectory()) walk(path, depth + 1)
      } catch {
        // Ignore disappearing cache entries.
      }
    }
  }
  walk(root, 0)
  return docs.sort()
}

function nearestNamedAncestor(start: string, name: string): string | undefined {
  let current = resolve(start)
  while (true) {
    if (current.split(sep).pop() === name) return current
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

function readNearestPluginCacheMetadata(start: string, stop: string): Record<string, unknown> | undefined {
  let current = resolve(start)
  const stopAt = resolve(stop)
  while (current.startsWith(stopAt)) {
    const metadata = readJSON(join(current, DESKTOP_PLUGIN_CACHE_METADATA_FILE_NAME))
    if (isRecord(metadata)) return metadata
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return undefined
}

function readSkillMetadata(skillDoc: string): { name?: string; description?: string } {
  let content = ''
  try {
    content = readFileSync(skillDoc, 'utf8')
  } catch {
    return {}
  }
  const match = /^---\s*\n([\s\S]*?)\n---/.exec(content)
  if (!match) return {}
  return {
    name: frontmatterString(match[1], 'name'),
    description: frontmatterString(match[1], 'description'),
  }
}

function frontmatterString(frontmatter: string, key: string): string | undefined {
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*:\\s*(.+?)\\s*$`, 'm')
  const match = pattern.exec(frontmatter)
  if (!match) return undefined
  return match[1].replace(/^['"]|['"]$/g, '').trim() || undefined
}

function normalizeRelativePath(value: string): string {
  return value.split(sep).filter(Boolean).join('/')
}

function skillSourceRank(sourceType: ElectronProjectLocalSkill['sourceType']): number {
  if (sourceType === 'desktop-cache') return 0
  if (sourceType === 'plugin-source') return 1
  if (sourceType === 'project-catalog') return 2
  return 3
}

function projectSkillSourceScope(sourceType: ElectronProjectLocalSkill['sourceType']): ElectronProjectLocalSkill['sourceScope'] {
  return sourceType === 'desktop-cache' ? 'global' : 'project'
}

function hashDirectory(root: string): string {
  const normalizedRoot = resolve(root)
  const hash = createHash('sha256')
  function walk(dir: string): void {
    let entries: string[]
    try {
      entries = readdirSync(dir).sort()
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue
      const path = join(dir, entry)
      const key = normalizeRelativePath(relative(normalizedRoot, path))
      try {
        const stat = statSync(path)
        if (stat.isDirectory()) {
          hash.update(`dir:${key}\0`)
          walk(path)
        } else if (stat.isFile()) {
          hash.update(`file:${key}\0`)
          hash.update(readFileSync(path))
          hash.update('\0')
        }
      } catch {
        // Ignore disappearing cache entries.
      }
    }
  }
  walk(normalizedRoot)
  return hash.digest('hex')
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function readJSON(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch (error) {
    if (isNotFoundError(error)) return undefined
    throw error
  }
}

function safePathSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'plugin'
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
