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
import { dirname, join, relative, resolve, sep } from 'node:path'
import {
  ensureMovScriptWorkspaceRoot,
  resolveMovScriptProjectCwd,
  resolveMovScriptWorkspaceRootPaths,
} from '@movscript/core/workspace/node'
import { resolveMovScriptAppServerPluginSource } from './appServerPluginBootstrap'
import { resolveMovScriptHomeDir } from './movscriptHomeInput'
import type {
  ElectronMovScriptHomeInput,
  ElectronProjectLocalSkill,
  ElectronProjectPluginInstallInput,
  ElectronProjectPluginSnapshot,
  ElectronProjectSkillToggleInput,
} from '../../src/shared/contracts/electronApi'

const PROJECT_PLUGIN_MANIFEST_SCHEMA = 'movscript.project-plugins.v1'
const PROJECT_PLUGIN_LOCK_SCHEMA = 'movscript.project-plugin-lock.v1'
const CODEX_CONFIG_DIR_NAME = '.codex'
const CODEX_CONFIG_FILE_NAME = 'config.toml'
const AGENTS_DIR_NAME = '.agents'
const SKILLS_DIR_NAME = 'skills'
const PLUGINS_DIR_NAME = 'plugins'
const DESKTOP_PLUGIN_CACHE_DIR_NAME = 'plugin-cache'
const PROJECT_PLUGIN_BUNDLES_DIR_NAME = 'bundles'
const DESKTOP_PLUGIN_CACHE_METADATA_FILE_NAME = 'metadata.json'
const MOVSCRIPT_PLUGIN_NAME = 'movscript'
const MOVSCRIPT_BUNDLED_MARKETPLACE_NAME = 'movscript-bundled'

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
    prepared: {
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

type ProjectPluginPathInput = ElectronMovScriptHomeInput & {
  projectId?: string | number
  userId?: string | number
  orgId?: string | number
}

export function getProjectPluginSnapshot(input: ProjectPluginPathInput & { desktopDataDir?: string } = {}): ElectronProjectPluginSnapshot {
  const paths = resolveProjectPluginPaths(input, input.desktopDataDir)
  const manifest = readProjectPluginManifest(paths.manifestPath)
  const lock = readProjectPluginLock(paths.lockPath)
  const lockedByKey = new Map(lock.plugins.map((plugin) => [plugin.pluginKey, plugin]))
  const skills = listLocalProjectSkills(paths, lock)
  return {
    schema: PROJECT_PLUGIN_MANIFEST_SCHEMA,
    movScriptHomeDir: paths.workspaceDir,
    workspaceDir: paths.workspaceDir,
    projectCwd: paths.projectCwd,
    manifestPath: paths.manifestPath,
    lockPath: paths.lockPath,
    codexConfigPath: paths.codexConfigPath,
    codexSkillsDir: paths.codexSkillsDir,
    repoSkillsDir: paths.repoSkillsDir,
    desktopPluginCacheRoot: paths.desktopPluginCacheRoot,
    projectMarketplacePath: paths.projectMarketplacePath,
    catalogSkillsDir: paths.catalogSkillsDir,
    skills,
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
  const paths = resolveProjectPluginPaths(input, input.desktopDataDir)
  ensureMovScriptWorkspaceRoot(resolveMovScriptWorkspaceRootPaths(paths.workspaceDir))
  const now = new Date().toISOString()
  const plugin = normalizeProjectPluginRecord(input)
  const sourcePath = resolveProjectPluginSourcePath(input)

  mkdirSync(paths.pluginsDir, { recursive: true })
  mkdirSync(paths.codexSkillsDir, { recursive: true })
  mkdirSync(paths.repoSkillsDir, { recursive: true })
  mkdirSync(paths.catalogSkillsDir, { recursive: true })
  mkdirSync(paths.desktopPluginCacheRoot, { recursive: true })
  mkdirSync(paths.projectPluginBundlesDir, { recursive: true })
  ensureCodexPluginEnabled(paths.codexConfigPath, plugin.pluginKey)

  const prepared: ProjectPluginLock['plugins'][number]['prepared'] = {
    codexConfigPath: paths.codexConfigPath,
  }
  const cachedSource = sourcePath && existsSync(sourcePath)
    ? materializeDesktopPluginCache(paths.desktopPluginCacheRoot, plugin, sourcePath)
    : undefined
  if (cachedSource) prepared.desktopPluginCacheDir = cachedSource.cacheDir
  const materializedSourcePath = cachedSource?.cacheDir ?? sourcePath

  const sourceSkillsDir = materializedSourcePath ? resolve(materializedSourcePath, SKILLS_DIR_NAME) : undefined
  if (sourceSkillsDir && existsSync(sourceSkillsDir)) {
    const skillSegment = safePathSegment(plugin.pluginKey)
    const codexTarget = join(paths.codexSkillsDir, PLUGINS_DIR_NAME, skillSegment)
    const repoTarget = join(paths.repoSkillsDir, 'plugins', skillSegment)
    const catalogTarget = join(paths.catalogSkillsDir, 'plugins', skillSegment)
    replaceDirectory(sourceSkillsDir, codexTarget)
    replaceDirectory(sourceSkillsDir, repoTarget)
    replaceDirectory(sourceSkillsDir, catalogTarget)
    prepared.codexSkillsDir = codexTarget
    prepared.repoSkillsDir = repoTarget
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

export function setProjectSkillEnabled(input: ElectronProjectSkillToggleInput & { desktopDataDir?: string }): ElectronProjectPluginSnapshot {
  const paths = resolveProjectPluginPaths(input, input.desktopDataDir)
  const snapshot = getProjectPluginSnapshot({ ...input, workspaceDir: paths.workspaceDir, desktopDataDir: input.desktopDataDir })
  const skill = snapshot.skills.find((item) => item.id === input.skillId)
  if (!skill) throw new Error(`Local skill not found: ${input.skillId}`)
  if (input.enabled) {
    replaceDirectory(skill.sourceSkillDir, projectCodexSkillTarget(paths, skill))
    replaceDirectory(skill.sourceSkillDir, projectRepoSkillTarget(paths, skill))
  } else {
    rmSync(projectCodexSkillTarget(paths, skill), { recursive: true, force: true })
    rmSync(projectRepoSkillTarget(paths, skill), { recursive: true, force: true })
  }
  return getProjectPluginSnapshot({ ...input, workspaceDir: paths.workspaceDir, desktopDataDir: input.desktopDataDir })
}

function resolveProjectPluginPaths(input?: ProjectPluginPathInput | string, desktopDataDirInput?: string) {
  const workspaceDir = resolveMovScriptHomeDir(input)
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  const projectCwd = typeof input === 'object' && input?.projectId !== undefined
    ? resolveMovScriptProjectCwd({
        workspaceDir,
        projectId: input.projectId,
        userId: input.userId,
        orgId: input.orgId,
      })
    : workspaceDir
  const pluginsDir = join(projectCwd, AGENTS_DIR_NAME, PLUGINS_DIR_NAME)
  const desktopDataDir = desktopDataDirInput?.trim() ? resolve(desktopDataDirInput) : root.controlDir
  return {
    workspaceDir,
    projectCwd,
    pluginsDir,
    manifestPath: join(pluginsDir, 'manifest.json'),
    lockPath: join(pluginsDir, 'lock.json'),
    codexConfigPath: join(projectCwd, CODEX_CONFIG_DIR_NAME, CODEX_CONFIG_FILE_NAME),
    codexSkillsDir: join(projectCwd, CODEX_CONFIG_DIR_NAME, SKILLS_DIR_NAME),
    repoSkillsDir: join(projectCwd, AGENTS_DIR_NAME, SKILLS_DIR_NAME),
    desktopPluginCacheRoot: process.env.MOVSCRIPT_DESKTOP_PLUGIN_CACHE_DIR?.trim()
      ? resolve(process.env.MOVSCRIPT_DESKTOP_PLUGIN_CACHE_DIR)
      : join(desktopDataDir, DESKTOP_PLUGIN_CACHE_DIR_NAME),
    projectMarketplacePath: join(projectCwd, AGENTS_DIR_NAME, PLUGINS_DIR_NAME, 'marketplace.json'),
    projectPluginBundlesDir: join(projectCwd, AGENTS_DIR_NAME, PLUGINS_DIR_NAME, PROJECT_PLUGIN_BUNDLES_DIR_NAME),
    catalogSkillsDir: join(projectCwd, AGENTS_DIR_NAME, PLUGINS_DIR_NAME, 'catalog', SKILLS_DIR_NAME),
  }
}

function normalizeProjectPluginRecord(input: ElectronProjectPluginInstallInput | Record<string, unknown>): ProjectPluginRecord {
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
    enabled: input.enabled !== false,
  }
}

function listLocalProjectSkills(
  paths: ReturnType<typeof resolveProjectPluginPaths>,
  lock: ProjectPluginLock,
): ElectronProjectLocalSkill[] {
  const byId = new Map<string, ElectronProjectLocalSkill>()
  const add = (skill: ElectronProjectLocalSkill) => {
    const existing = byId.get(skill.id)
    if (!existing || skillSourceRank(skill.sourceType) < skillSourceRank(existing.sourceType)) {
      byId.set(skill.id, skill)
    } else if (existing && skill.enabled && !existing.enabled) {
      byId.set(skill.id, { ...existing, enabled: true, enabledCodexPath: skill.enabledCodexPath, enabledRepoPath: skill.enabledRepoPath })
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
      }, paths)) add(skill)
    }
  }

  if (existsSync(paths.catalogSkillsDir)) {
    for (const skill of collectSkillsFromRoot(paths.catalogSkillsDir, { sourceType: 'project-catalog' }, paths)) add(skill)
  }

  if (existsSync(paths.codexSkillsDir)) {
    for (const skill of collectSkillsFromRoot(paths.codexSkillsDir, { sourceType: 'project' }, paths)) add(skill)
  }
  if (existsSync(paths.repoSkillsDir)) {
    for (const skill of collectSkillsFromRoot(paths.repoSkillsDir, { sourceType: 'project' }, paths)) add(skill)
  }

  return [...byId.values()].sort((left, right) => {
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1
    return left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  })
}

function collectSkillsFromRoot(
  skillsRoot: string,
  source: {
    sourceType: ElectronProjectLocalSkill['sourceType']
    pluginKey?: string
    pluginName?: string
    version?: string
  },
  paths: ReturnType<typeof resolveProjectPluginPaths>,
): ElectronProjectLocalSkill[] {
  const root = resolve(skillsRoot)
  return findSkillDocs(root).map((skillDoc) => {
    const skillDir = dirname(skillDoc)
    const rawRelativeSkillDir = normalizeRelativePath(relative(root, skillDir)) || safePathSegment(dirname(skillDoc).split(sep).pop() ?? 'skill')
    const projected = projectedSkillParts(rawRelativeSkillDir, source.sourceType)
    const pluginKey = source.pluginKey ?? projected.pluginKey
    const relativeSkillDir = projected.relativeSkillDir
    const metadata = readSkillMetadata(skillDoc)
    const projectRelativePath = projectSkillRelativePath(pluginKey, relativeSkillDir, paths, skillDir)
    const id = projectSkillId(pluginKey, relativeSkillDir, metadata.name, skillDir)
    const codexTarget = join(paths.codexSkillsDir, ...projectRelativePath.split('/'))
    const repoTarget = join(paths.repoSkillsDir, ...projectRelativePath.split('/'))
    const enabledCodexPath = existsSync(join(codexTarget, 'SKILL.md')) ? codexTarget : undefined
    const enabledRepoPath = existsSync(join(repoTarget, 'SKILL.md')) ? repoTarget : undefined
    return {
      id,
      name: metadata.name ?? relativeSkillDir.split('/').pop() ?? id,
      ...(metadata.description ? { description: metadata.description } : {}),
      sourceType: source.sourceType,
      sourcePath: skillDoc,
      sourceSkillDir: skillDir,
      projectRelativePath,
      ...(pluginKey ? { pluginKey } : {}),
      ...(source.pluginName ? { pluginName: source.pluginName } : {}),
      ...(source.version ? { version: source.version } : {}),
      enabled: Boolean(enabledCodexPath || enabledRepoPath),
      ...(enabledCodexPath ? { enabledCodexPath } : {}),
      ...(enabledRepoPath ? { enabledRepoPath } : {}),
    }
  })
}

function projectedSkillParts(relativeSkillDir: string, sourceType: ElectronProjectLocalSkill['sourceType']): { pluginKey?: string; relativeSkillDir: string } {
  if ((sourceType === 'project' || sourceType === 'project-catalog') && relativeSkillDir.startsWith('plugins/')) {
    const parts = relativeSkillDir.split('/')
    if (parts.length >= 3) return { pluginKey: parts[1], relativeSkillDir: parts.slice(2).join('/') }
  }
  return { relativeSkillDir }
}

function projectCodexSkillTarget(paths: ReturnType<typeof resolveProjectPluginPaths>, skill: ElectronProjectLocalSkill): string {
  return join(paths.codexSkillsDir, ...projectSkillRelativePathForSkill(skill).split('/'))
}

function projectRepoSkillTarget(paths: ReturnType<typeof resolveProjectPluginPaths>, skill: ElectronProjectLocalSkill): string {
  return join(paths.repoSkillsDir, ...projectSkillRelativePathForSkill(skill).split('/'))
}

function projectSkillRelativePathForSkill(skill: ElectronProjectLocalSkill): string {
  return skill.projectRelativePath ?? safePathSegment(skill.id)
}

function projectSkillRelativePath(pluginKey: string | undefined, relativeSkillDir: string, paths: ReturnType<typeof resolveProjectPluginPaths>, skillDir: string): string {
  const normalizedSkillDir = resolve(skillDir)
  for (const root of [paths.codexSkillsDir, paths.repoSkillsDir]) {
    const normalizedRoot = resolve(root)
    if (normalizedSkillDir === normalizedRoot || normalizedSkillDir.startsWith(`${normalizedRoot}${sep}`)) {
      return normalizeRelativePath(relative(normalizedRoot, normalizedSkillDir)) || safePathSegment(pluginKey ?? normalizedSkillDir)
    }
  }
  if (pluginKey) return `plugins/${safePathSegment(pluginKey)}/${relativeSkillDir}`
  return safePathSegment(relativeSkillDir)
}

function projectSkillId(pluginKey: string | undefined, relativeSkillDir: string, skillName: string | undefined, skillDir: string): string {
  if (pluginKey) return `${safePathSegment(pluginKey)}__${safePathSegment(relativeSkillDir)}`
  return `${safePathSegment(skillName ?? relativeSkillDir)}__${hashText(resolve(skillDir)).slice(0, 8)}`
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

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function resolveProjectPluginSourcePath(input: ElectronProjectPluginInstallInput): string | undefined {
  const name = stringField(input.name) ?? stringField(input.id)
  const marketplaceName = stringField(input.marketplaceName)
  if (name === MOVSCRIPT_PLUGIN_NAME && (!marketplaceName || marketplaceName === MOVSCRIPT_BUNDLED_MARKETPLACE_NAME)) {
    return resolveMovScriptAppServerPluginSource()
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
    plugins: parsed.plugins.filter(isRecord).map(normalizeProjectPluginRecord),
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
            codexConfigPath: stringField(plugin.prepared.codexConfigPath) ?? '',
            ...(stringField(plugin.prepared.codexSkillsDir) ? { codexSkillsDir: stringField(plugin.prepared.codexSkillsDir) } : {}),
            ...(stringField(plugin.prepared.repoSkillsDir) ? { repoSkillsDir: stringField(plugin.prepared.repoSkillsDir) } : {}),
            ...(stringField(plugin.prepared.desktopPluginCacheDir) ? { desktopPluginCacheDir: stringField(plugin.prepared.desktopPluginCacheDir) } : {}),
            ...(stringField(plugin.prepared.projectMarketplacePath) ? { projectMarketplacePath: stringField(plugin.prepared.projectMarketplacePath) } : {}),
            ...(stringField(plugin.prepared.projectPluginBundleDir) ? { projectPluginBundleDir: stringField(plugin.prepared.projectPluginBundleDir) } : {}),
            ...(stringField(plugin.prepared.catalogSkillsDir) ? { catalogSkillsDir: stringField(plugin.prepared.catalogSkillsDir) } : {}),
          }
        : { codexConfigPath: '' },
    })),
  }
}

function materializeDesktopPluginCache(
  cacheRoot: string,
  plugin: ProjectPluginRecord,
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
    contentHash,
    sourcePath,
    cachedAt: new Date().toISOString(),
  })
  return { cacheDir, contentHash }
}

function ensureCodexPluginEnabled(configPath: string, pluginKey: string): void {
  const current = existsSync(configPath) ? readFileSync(configPath, 'utf8') : ''
  let next = current
  next = setTomlSectionValue(next, '[features]', /^plugins\s*=/, 'plugins = true')
  next = setTomlSectionValue(next, `[plugins.${tomlString(pluginKey)}]`, /^enabled\s*=/, 'enabled = true')
  if (next !== current) writeTextAtomic(configPath, next)
}

function ensureProjectMarketplacePlugin(marketplacePath: string, plugin: ProjectPluginRecord, sourcePath: string): void {
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

function replaceDirectory(source: string, destination: string): void {
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
