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
import type { ProviderConfig, ProviderRuntimeProfile } from '../../src/shared/infrastructure/providerConfigStore'
import type { ElectronProjectSkillProviderTarget } from '../../src/shared/contracts/electronApi'
import {
  MOVSCRIPT_BUNDLED_PLUGIN_KEY,
  type AgentCapabilityLayer,
  type AgentCapabilitySkillRoot,
  providerDefaultPluginSkillDir,
  resolveAgentEffectiveCapabilityPaths,
  sdkRuntimeProviderTarget,
} from './agentCapabilityResolver'
import { resolveMovScriptBundledPluginSource } from './movscriptBundledPluginSource'
import { ensureAgentRuntimeRootBundledPlugin } from './agentRuntimeBundledPluginCatalog'

const DEFAULT_SKILL_LOCK_PATH = ['.agents', 'plugins', 'default-skills-lock.json']

const sdkRuntimeExtraSkillRoots = new Map<string, string[]>()

export { sdkRuntimeProviderTarget } from './agentCapabilityResolver'

export function ensureSdkRuntimeDefaultSkills(input: {
  cwd?: string
  workspaceDir?: string
  provider: Pick<ProviderConfig, 'id' | 'kind'>
  runtime: Pick<ProviderRuntimeProfile, 'api'>
}): {
  installed: boolean
  target?: ElectronProjectSkillProviderTarget
  targetDir?: string
  inheritedFromRoot?: boolean
  workspaceTargetDir?: string
} {
  const target = sdkRuntimeProviderTarget(input)
  if (!target) return { installed: false, target }
  const explicitCwd = input.cwd?.trim()
  const cwdInput = explicitCwd || input.workspaceDir?.trim()
  if (!cwdInput) return { installed: false, target }
  const cwd = resolve(cwdInput)
  if (!existsSync(cwd)) {
    if (explicitCwd) return { installed: false, target }
    mkdirSync(cwd, { recursive: true })
  }
  const workspaceDir = resolve(input.workspaceDir?.trim() || cwd)
  const source = resolveMovScriptBundledPluginSource()
  const sourceSkillsDir = join(source, 'skills')
  if (!existsSync(sourceSkillsDir)) return { installed: false, target }
  const workspaceTargetDir = providerDefaultPluginSkillDir(workspaceDir, target)
  let installed = false
  let rootPluginPrepared = false

  if (!containsSkillDoc(workspaceTargetDir) && !defaultSkillTargetWasDisabled(workspaceDir, target, workspaceTargetDir)) {
    const materialized = ensureAgentRuntimeRootBundledPlugin({ workspaceDir, providerTarget: target })
    installed = materialized.installed
    rootPluginPrepared = materialized.prepared
  }

  if (!containsSkillDoc(workspaceTargetDir) && !rootPluginPrepared && !defaultSkillTargetWasDisabled(workspaceDir, target, workspaceTargetDir)) {
    replaceDirectory(sourceSkillsDir, workspaceTargetDir)
    writeDefaultSkillLock(workspaceDir, {
      providerTarget: target,
      targetDir: workspaceTargetDir,
      source,
    })
    installed = true
  }

  if (containsSkillDoc(workspaceTargetDir) && !defaultSkillTargetIsRecorded(workspaceDir, target)) {
    writeDefaultSkillLock(workspaceDir, {
      providerTarget: target,
      targetDir: workspaceTargetDir,
      source,
    })
  }

  if (containsSkillDoc(workspaceTargetDir)) {
    return {
      installed,
      target,
      targetDir: workspaceTargetDir,
      workspaceTargetDir,
      inheritedFromRoot: cwd !== workspaceDir,
    }
  }

  const cwdTargetDir = providerDefaultPluginSkillDir(cwd, target)
  if (containsSkillDoc(cwdTargetDir)) {
    return {
      installed: false,
      target,
      targetDir: cwdTargetDir,
      workspaceTargetDir,
      inheritedFromRoot: false,
    }
  }

  return {
    installed: false,
    target,
    targetDir: cwd === workspaceDir ? workspaceTargetDir : cwdTargetDir,
    workspaceTargetDir,
    inheritedFromRoot: false,
  }
}

export function setSdkRuntimeExtraSkillRoots(input: {
  provider: Pick<ProviderConfig, 'id' | 'kind'>
  runtime: Pick<ProviderRuntimeProfile, 'id'>
  extraRoots?: string[]
}): { extraRoots: string[] } {
  const roots = normalizeRoots(input.extraRoots)
  sdkRuntimeExtraSkillRoots.set(skillRootKey(input), roots)
  return { extraRoots: roots }
}

export function listSdkRuntimeSkills(input: {
  provider: Pick<ProviderConfig, 'id' | 'kind'>
  runtime: Pick<ProviderRuntimeProfile, 'id' | 'api'>
  workspaceDir: string
  cwds?: string[]
}): {
  data: Array<{
    cwd: string
    providerTarget?: ElectronProjectSkillProviderTarget
    effectiveSkillRoots: AgentCapabilitySkillRoot[]
    skills: SdkRuntimeSkillSummary[]
    errors: Array<{ path?: string; message: string }>
  }>
  skills: SdkRuntimeSkillSummary[]
  extraRoots: string[]
} {
  const target = sdkRuntimeProviderTarget(input)
  const cwds = normalizeRoots(input.cwds?.length ? input.cwds : [input.workspaceDir])
  const extraRoots = sdkRuntimeExtraSkillRoots.get(skillRootKey(input)) ?? []
  const data = cwds.map((cwd) => {
    const effective = resolveAgentEffectiveCapabilityPaths({
      workspaceDir: input.workspaceDir,
      cwd,
      providerTarget: target,
      extraSkillRoots: extraRoots,
    })
    const errors: Array<{ path?: string; message: string }> = []
    const skillsById = new Map<string, SdkRuntimeSkillSummary>()
    for (const root of effective.skillRoots) {
      for (const skill of collectSkills(root.path, {
        providerTarget: target,
        sourceRoot: root.path,
        errors,
        layer: root.layer,
        inherited: root.inherited,
        pluginKey: root.pluginKey,
      })) {
        skillsById.set(skill.id, skill)
      }
    }
    return {
      cwd,
      ...(target ? { providerTarget: target } : {}),
      effectiveSkillRoots: effective.skillRoots,
      skills: [...skillsById.values()],
      errors,
    }
  })
  return {
    data,
    skills: data.flatMap((entry) => entry.skills),
    extraRoots,
  }
}

export interface SdkRuntimeSkillSummary {
  id: string
  name: string
  description: string
  enabled: boolean
  instruction: string
  instructionTemplate: string
  source: 'builtin' | 'local' | 'plugin' | 'team' | 'mcp'
  providerScope?: ElectronProjectSkillProviderTarget
  providerTarget?: ElectronProjectSkillProviderTarget
  layer?: AgentCapabilityLayer
  inherited?: boolean
  pluginKey?: string
  sourceRoot?: string
  path: string
}

function collectSkills(
  root: string,
  input: {
    providerTarget?: ElectronProjectSkillProviderTarget
    sourceRoot: string
    errors: Array<{ path?: string; message: string }>
    layer?: AgentCapabilityLayer
    inherited?: boolean
    pluginKey?: string
  },
): SdkRuntimeSkillSummary[] {
  if (!existsSync(root)) return []
  return findSkillDocs(root, input.errors).map((path) => {
    const skillDir = dirname(path)
    const relativeDir = normalizeRelativePath(relative(input.sourceRoot, skillDir)) || safePathSegment(skillDir.split(sep).pop() ?? 'skill')
    const doc = readSkillDoc(path, input.errors)
    const pluginSource = relativeDir.startsWith('plugins/')
    return {
      id: `${input.providerTarget ?? 'sdk'}:${safePathSegment(relativeDir).replace(/\//g, '__').replace(/_+/g, '_')}`,
      name: doc.name ?? relativeDir.split('/').pop() ?? relativeDir,
      description: doc.description ?? '',
      enabled: true,
      instruction: doc.instruction,
      instructionTemplate: doc.instruction,
      source: pluginSource ? 'plugin' : 'local',
      ...(input.providerTarget ? { providerScope: input.providerTarget, providerTarget: input.providerTarget } : {}),
      ...(input.layer ? { layer: input.layer } : {}),
      ...(input.inherited !== undefined ? { inherited: input.inherited } : {}),
      ...(input.pluginKey ? { pluginKey: input.pluginKey } : pluginSource ? { pluginKey: MOVSCRIPT_BUNDLED_PLUGIN_KEY } : {}),
      sourceRoot: input.sourceRoot,
      path,
    }
  })
}

function readSkillDoc(path: string, errors: Array<{ path?: string; message: string }>): {
  name?: string
  description?: string
  instruction: string
} {
  try {
    const text = readFileSync(path, 'utf8')
    if (!text.startsWith('---')) return { instruction: text.trim() }
    const end = text.indexOf('\n---', 3)
    if (end < 0) return { instruction: text.trim() }
    const frontmatter = text.slice(3, end).trim()
    const body = text.slice(end + 4).trim()
    return {
      name: frontmatterString(frontmatter, 'name'),
      description: frontmatterString(frontmatter, 'description'),
      instruction: body,
    }
  } catch (error) {
    errors.push({ path, message: error instanceof Error ? error.message : String(error) })
    return { instruction: '' }
  }
}

function frontmatterString(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${escapeRegExp(key)}:\\s*(.+)$`, 'm'))
  const value = match?.[1]?.trim().replace(/^['"]|['"]$/g, '')
  return value || undefined
}

function findSkillDocs(root: string, errors: Array<{ path?: string; message: string }>): string[] {
  const docs: string[] = []
  function walk(dir: string, depth: number): void {
    if (depth > 8) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch (error) {
      errors.push({ path: dir, message: error instanceof Error ? error.message : String(error) })
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
      } catch (error) {
        errors.push({ path, message: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  walk(root, 0)
  return docs.sort()
}

function containsSkillDoc(root: string): boolean {
  if (!existsSync(root)) return false
  const errors: Array<{ path?: string; message: string }> = []
  return findSkillDocs(root, errors).length > 0
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

function writeDefaultSkillLock(cwd: string, input: {
  providerTarget: ElectronProjectSkillProviderTarget
  targetDir: string
  source: string
}): void {
  const path = join(cwd, ...DEFAULT_SKILL_LOCK_PATH)
  mkdirSync(dirname(path), { recursive: true })
  const current = readDefaultSkillLock(cwd)
  const installs = [
    ...current.installs.filter((item) => item.providerTarget !== input.providerTarget),
    input,
  ].sort((left, right) => left.providerTarget.localeCompare(right.providerTarget))
  writeFileSync(path, `${JSON.stringify({
    schema: 'movscript.sdk-runtime-default-skills.v1',
    updatedAt: new Date().toISOString(),
    pluginKey: 'movscript@movscript-bundled',
    installs,
  }, null, 2)}\n`, 'utf8')
}

function defaultSkillTargetWasDisabled(cwd: string, providerTarget: ElectronProjectSkillProviderTarget, targetDir: string): boolean {
  const lock = readDefaultSkillLock(cwd)
  return lock.installs.some((item) => item.providerTarget === providerTarget) && !containsSkillDoc(targetDir)
}

function defaultSkillTargetIsRecorded(cwd: string, providerTarget: ElectronProjectSkillProviderTarget): boolean {
  return readDefaultSkillLock(cwd).installs.some((item) => item.providerTarget === providerTarget)
}

function readDefaultSkillLock(cwd: string): {
  installs: Array<{
    providerTarget: ElectronProjectSkillProviderTarget
    targetDir: string
    source: string
  }>
} {
  const path = join(cwd, ...DEFAULT_SKILL_LOCK_PATH)
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!isRecord(parsed) || !Array.isArray(parsed.installs)) return { installs: [] }
    return {
      installs: parsed.installs.flatMap((item) => {
        if (!isRecord(item)) return []
        const providerTarget = projectSkillProviderTarget(item.providerTarget)
        const targetDir = typeof item.targetDir === 'string' ? item.targetDir : ''
        const source = typeof item.source === 'string' ? item.source : ''
        return providerTarget && targetDir && source ? [{ providerTarget, targetDir, source }] : []
      }),
    }
  } catch {
    return { installs: [] }
  }
}

function normalizeRoots(value: unknown): string[] {
  const input = Array.isArray(value) ? value : []
  return Array.from(new Set(input.flatMap((item) => (
    typeof item === 'string' && item.trim() ? [resolve(item.trim())] : []
  ))))
}

function skillRootKey(input: {
  provider: Pick<ProviderConfig, 'id' | 'kind'>
  runtime: Pick<ProviderRuntimeProfile, 'id'>
}): string {
  return [input.runtime.id, input.provider.id || input.provider.kind].join(':')
}

function normalizeRelativePath(path: string): string {
  return path.split(sep).join('/').replace(/^\.\/+/, '')
}

function safePathSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._/-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 180) || 'skill'
}

function projectSkillProviderTarget(value: unknown): ElectronProjectSkillProviderTarget | undefined {
  return value === 'codex' || value === 'mova' || value === 'claude' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
