import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_AGENT_MANIFEST,
  type AgentManifest,
  type AgentToolGrant,
} from './agentManifest.js'
import { resolveAgentStatePath } from '../state/fileStore.js'
import {
  DEFAULT_TOOL_REGISTRY,
  StaticToolRegistry,
  mergeRegisteredTools,
  type RegisteredTool,
  type ToolRegistry,
} from '../tools/toolRegistry.js'
import type { JSONValue } from '../types.js'
import { isJSONRecord, isJSONValue, isRecord } from '../jsonValue.js'
import { buildLayeredCatalogRegistry } from './registry.js'
import { lintCatalog } from './linter.js'
import type { AgentProfile, CapabilityPack, CatalogIssue, CatalogRegistry, ContextSelector, PolicyScope, SkillActivationScope, SkillDefinition, SkillKind, SkillLoadMode, SkillTrigger, ToolDefinition } from './types.js'
import { loadAgentKnowledgeStore } from '../knowledge/knowledgeLoader.js'
import type { KnowledgeCollection } from '../knowledge/types.js'

export interface AgentPluginCatalog {
  skillsDir: string
  toolsDir: string
  builtinSkillsDir: string
  builtinToolsDir: string
  packsDir: string
  builtinPacksDir: string
  profilesDir: string
  builtinProfilesDir: string
  packs: CapabilityPack[]
  profiles: AgentProfile[]
  layeredSkills: SkillDefinition[]
  layeredTools: ToolDefinition[]
  knowledgeCollections: KnowledgeCollection[]
  toolGrants: AgentToolGrant[]
  manifest: AgentManifest
  registry: ToolRegistry
  layeredRegistry: CatalogRegistry
  catalogIssues: CatalogIssue[]
  resourcePaths: CatalogResourcePaths
  warnings: string[]
}

export interface CatalogResourcePaths {
  packs: Record<string, string>
  profiles: Record<string, string>
  skills: Record<string, string>
  tools: Record<string, string>
}

export function loadAgentPluginCatalog(options: {
  skillsDir?: string
  toolsDir?: string
  builtinSkillsDir?: string
  builtinToolsDir?: string
  packsDir?: string
  builtinPacksDir?: string
  profilesDir?: string
  builtinProfilesDir?: string
  baseManifest?: AgentManifest
  baseTools?: RegisteredTool[]
} = {}): AgentPluginCatalog {
  const skillsDir = options.skillsDir ?? resolveAgentSkillsDir()
  const toolsDir = options.toolsDir ?? resolveAgentToolsDir()
  const builtinSkillsDir = options.builtinSkillsDir ?? resolveBuiltinAgentSkillsDir()
  const builtinToolsDir = options.builtinToolsDir ?? resolveBuiltinAgentToolsDir()
  const packsDir = options.packsDir ?? resolveAgentPacksDir()
  const builtinPacksDir = options.builtinPacksDir ?? resolveBuiltinAgentPacksDir()
  const profilesDir = options.profilesDir ?? resolveAgentProfilesDir()
  const builtinProfilesDir = options.builtinProfilesDir ?? resolveBuiltinAgentProfilesDir()
  const builtinPackResult = loadPackDirectory(builtinPacksDir)
  const localPackResult = loadPackDirectory(packsDir)
  const builtinProfileResult = loadProfileDirectory(builtinProfilesDir)
  const localProfileResult = loadProfileDirectory(profilesDir)
  const packs = dedupePacks([
    ...builtinPackResult.packs,
    ...localPackResult.packs,
  ])
  const builtinLayeredSkillResult = loadLayeredSkillsForPacks(builtinSkillsDir, builtinPackResult.packs)
  const localLayeredSkillResult = loadLayeredSkillsForPacks(skillsDir, localPackResult.packs)
  const localStandaloneCodexSkillResult = loadStandaloneCodexSkills(skillsDir)
  const builtinLayeredToolResult = loadLayeredToolsForPacks(builtinToolsDir, builtinPackResult.packs, 'runtime')
  const localLayeredToolResult = loadLayeredToolsForPacks(toolsDir, localPackResult.packs, 'plugin')
  const layeredSkills = dedupeLayeredSkills([
    ...builtinLayeredSkillResult.skills,
    ...localLayeredSkillResult.skills,
    ...localStandaloneCodexSkillResult.skills,
  ])
  const layeredTools = dedupeLayeredTools([
    ...builtinLayeredToolResult.tools,
    ...localLayeredToolResult.tools,
  ])
  const knowledgeCollections = loadAgentKnowledgeStore().listCollections()
  const layeredRegisteredTools = layeredTools.map(registeredToolFromLayeredTool)
  const layeredToolGrants = layeredTools.map((tool): AgentToolGrant => ({
    name: tool.name,
    mode: tool.defaults.grant,
    approval: tool.defaults.approval,
  }))
  const profiles = profilesWithEnabledPackResources(dedupeProfiles([
    ...builtinProfileResult.profiles,
    ...localProfileResult.profiles,
  ]), layeredToolGrants, packs, layeredSkills)
  const warnings = [
    ...builtinPackResult.warnings,
    ...localPackResult.warnings,
    ...builtinProfileResult.warnings,
    ...localProfileResult.warnings,
    ...builtinLayeredSkillResult.warnings,
    ...localLayeredSkillResult.warnings,
    ...localStandaloneCodexSkillResult.warnings,
    ...builtinLayeredToolResult.warnings,
    ...localLayeredToolResult.warnings,
    ...packResourceWarnings(builtinPackResult.packs, 'builtin'),
    ...packResourceWarnings(localPackResult.packs, 'local'),
  ]
  const baseManifest = options.baseManifest ?? DEFAULT_AGENT_MANIFEST
  const baseTools = options.baseTools ?? DEFAULT_TOOL_REGISTRY.list()
  const manifest = {
    ...baseManifest,
    tools: mergeToolGrants(baseManifest.tools, enabledPackToolGrants(profiles, layeredToolGrants, packs)),
  }
  const registry = new StaticToolRegistry(mergeRegisteredTools(baseTools, layeredRegisteredTools))
  const layeredRegistry = buildLayeredCatalogRegistry({
    manifest,
    tools: baseTools,
    packs,
    profiles,
    layeredSkills,
    layeredTools,
    knowledgeCollections,
  })
  const catalogIssues = lintCatalog(layeredRegistry)
  const resourcePaths = {
    packs: { ...builtinPackResult.paths, ...localPackResult.paths },
    profiles: { ...builtinProfileResult.paths, ...localProfileResult.paths },
    skills: { ...builtinLayeredSkillResult.paths, ...localLayeredSkillResult.paths, ...localStandaloneCodexSkillResult.paths },
    tools: { ...builtinLayeredToolResult.paths, ...localLayeredToolResult.paths },
  }

  return {
    skillsDir,
    toolsDir,
    builtinSkillsDir,
    builtinToolsDir,
    packsDir,
    builtinPacksDir,
    profilesDir,
    builtinProfilesDir,
    packs,
    profiles,
    layeredSkills,
    layeredTools,
    knowledgeCollections,
    toolGrants: layeredToolGrants,
    manifest,
    registry,
    layeredRegistry,
    catalogIssues,
    resourcePaths,
    warnings: Array.from(new Set([
      ...warnings,
    ])),
  }
}

function registeredToolFromLayeredTool(tool: ToolDefinition): RegisteredTool {
  return {
    name: tool.name,
    description: tool.description,
    permission: tool.permission,
    risk: tool.risk,
    source: tool.source,
    inputSchema: tool.inputSchema as unknown as JSONValue,
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema as unknown as JSONValue } : {}),
    projectScoped: tool.projectScoped,
    requiresApprovalByDefault: tool.defaults.approval !== 'never',
    defaults: tool.defaults,
    ...(tool.capability ? { capability: tool.capability } : {}),
    ...(tool.pluginId ? { pluginId: tool.pluginId } : {}),
    ...(tool.mcpServerId ? { mcpServerId: tool.mcpServerId } : {}),
    ...(tool.errorCodes ? { errorCodes: tool.errorCodes } : {}),
    ...(tool.allowedRunRoles ? { allowedRunRoles: tool.allowedRunRoles } : {}),
  }
}

function profilesWithEnabledPackResources(
  profiles: AgentProfile[],
  grants: AgentToolGrant[],
  packs: CapabilityPack[],
  skills: SkillDefinition[],
): AgentProfile[] {
  const packsById = new Map(packs.map((pack) => [pack.id, pack]))
  const skillsById = new Map(skills.map((skill) => [skill.id, skill]))
  return profiles.map((profile) => {
    const packClosure = collectEnabledPackClosure(profile.enabledPacks, packsById)
    const packTools = new Set(Array.from(packClosure).flatMap((packId) => packsById.get(packId)?.tools ?? []))
    const packSkills = Array.from(packClosure).flatMap((packId) => packsById.get(packId)?.skills ?? [])
    const explicitWorkflowFilter = profile.enabledWorkflows.length > 0 ? new Set(profile.enabledWorkflows) : undefined
    const explicitPolicyFilter = profile.enabledPolicies.length > 0 ? new Set(profile.enabledPolicies) : undefined
    const enabledWorkflows = packSkills
      .filter((id) => skillsById.get(id)?.kind === 'workflow')
      .filter((id) => !explicitWorkflowFilter || explicitWorkflowFilter.has(id))
    const enabledPolicies = packSkills
      .filter((id) => skillsById.get(id)?.kind === 'policy')
      .filter((id) => !explicitPolicyFilter || explicitPolicyFilter.has(id))
    const explicitGrants = new Map(profile.toolGrants.map((grant) => [grant.name, grant]))
    const toolGrants = grants
      .filter((grant) => packTools.has(grant.name))
      .map((grant) => {
        const explicit = explicitGrants.get(grant.name)
        if (!explicit) return { name: grant.name, mode: grant.mode, ...(grant.approval ? { approval: grant.approval } : {}) }
        const approval = stricterApproval(grant.approval, explicit.approval)
        return {
          name: grant.name,
          mode: explicit.mode,
          ...(approval ? { approval } : {}),
        }
      })
    return {
      ...profile,
      enabledWorkflows,
      enabledPolicies,
      toolGrants,
    }
  })
}

function enabledPackToolGrants(
  profiles: AgentProfile[],
  grants: AgentToolGrant[],
  packs: CapabilityPack[],
): AgentToolGrant[] {
  const packsById = new Map(packs.map((pack) => [pack.id, pack]))
  const enabledPackIds = new Set(profiles.flatMap((profile) => Array.from(collectEnabledPackClosure(profile.enabledPacks, packsById))))
  const enabledToolNames = new Set(Array.from(enabledPackIds).flatMap((packId) => packsById.get(packId)?.tools ?? []))
  return grants.filter((grant) => enabledToolNames.has(grant.name))
}

function collectEnabledPackClosure(packIds: string[], packsById: Map<string, CapabilityPack>): Set<string> {
  const visited = new Set<string>()
  for (const id of packIds) visit(id)
  return visited

  function visit(id: string): void {
    if (visited.has(id)) return
    visited.add(id)
    const pack = packsById.get(id)
    if (!pack) return
    for (const required of Object.keys(pack.requires?.packs ?? {})) visit(required)
  }
}

function stricterApproval(left?: AgentToolGrant['approval'], right?: AgentToolGrant['approval']): AgentToolGrant['approval'] {
  if (!left) return right
  if (!right) return left
  return approvalRank(right) > approvalRank(left) ? right : left
}

function approvalRank(value?: AgentToolGrant['approval']): number {
  if (value === 'always') return 2
  if (value === 'on_write') return 1
  return 0
}

export function resolveAgentSkillsDir(statePath = resolveAgentStatePath()): string {
  return process.env.MOVSCRIPT_AGENT_SKILLS_DIR || join(dirname(statePath), 'skills')
}

export function resolveAgentToolsDir(statePath = resolveAgentStatePath()): string {
  return process.env.MOVSCRIPT_AGENT_TOOLS_DIR || join(dirname(statePath), 'tools')
}

export function resolveBuiltinAgentSkillsDir(): string {
  return resolveCatalogDir('skills')
}

export function resolveBuiltinAgentToolsDir(): string {
  return resolveCatalogDir('tools')
}

export function resolveAgentPacksDir(statePath = resolveAgentStatePath()): string {
  return process.env.MOVSCRIPT_AGENT_PACKS_DIR || join(dirname(statePath), 'packs')
}

export function resolveBuiltinAgentPacksDir(): string {
  return resolveCatalogDir('packs')
}

export function resolveAgentProfilesDir(statePath = resolveAgentStatePath()): string {
  return process.env.MOVSCRIPT_AGENT_PROFILES_DIR || join(dirname(statePath), 'profiles')
}

export function resolveBuiltinAgentProfilesDir(): string {
  return resolveCatalogDir('profiles')
}

function resolveCatalogDir(kind: 'skills' | 'tools' | 'packs' | 'profiles'): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(moduleDir, '..', '..', 'catalog', kind),
    resolve(moduleDir, '..', '..', '..', 'catalog', kind),
    resolve(moduleDir, '..', 'catalog', kind),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[1]
}

function loadPackDirectory(dir: string): { packs: CapabilityPack[]; warnings: string[]; paths: Record<string, string> } {
  const warnings: string[] = []
  const packs: CapabilityPack[] = []
  const paths: Record<string, string> = {}
  for (const filePath of listPluginJSONFiles(dir)) {
    const parsed = readJSONFile(filePath, warnings)
    if (parsed === undefined) continue
    const pack = normalizeCapabilityPack(parsed, filePath, warnings)
    if (pack) {
      packs.push(pack)
      paths[pack.id] = filePath
    }
  }
  return { packs: dedupePacks(packs), warnings, paths }
}

function loadProfileDirectory(dir: string): { profiles: AgentProfile[]; warnings: string[]; paths: Record<string, string> } {
  const warnings: string[] = []
  const profiles: AgentProfile[] = []
  const paths: Record<string, string> = {}
  for (const filePath of listPluginJSONFiles(dir)) {
    const parsed = readJSONFile(filePath, warnings)
    if (parsed === undefined) continue
    const profile = normalizeAgentProfile(parsed, filePath, warnings)
    if (profile) {
      profiles.push(profile)
      paths[profile.id] = filePath
    }
  }
  return { profiles: dedupeProfiles(profiles), warnings, paths }
}

function loadLayeredSkillsForPacks(rootDir: string, packs: CapabilityPack[]): { skills: SkillDefinition[]; warnings: string[]; paths: Record<string, string> } {
  const warnings: string[] = []
  const skills: SkillDefinition[] = []
  const paths: Record<string, string> = {}
  for (const filePath of listPackResourceSkillFiles(rootDir, packs, warnings)) {
    const normalizedSkills = normalizeLayeredSkillResource(filePath, warnings)
    skills.push(...normalizedSkills)
    for (const skill of normalizedSkills) paths[skill.id] = filePath
  }
  return { skills: dedupeLayeredSkills(skills), warnings, paths }
}

function loadStandaloneCodexSkills(rootDir: string): { skills: SkillDefinition[]; warnings: string[]; paths: Record<string, string> } {
  const warnings: string[] = []
  const skills: SkillDefinition[] = []
  const paths: Record<string, string> = {}
  for (const filePath of listPluginCodexSkillFiles(rootDir)) {
    const skill = normalizeCodexSkillFile(filePath, warnings)
    if (!skill) continue
    skills.push(skill)
    paths[skill.id] = filePath
  }
  return { skills: dedupeLayeredSkills(skills), warnings, paths }
}

function loadLayeredToolsForPacks(rootDir: string, packs: CapabilityPack[], defaultSource: 'runtime' | 'plugin'): { tools: ToolDefinition[]; warnings: string[]; paths: Record<string, string> } {
  const warnings: string[] = []
  const tools: ToolDefinition[] = []
  const paths: Record<string, string> = {}
  for (const filePath of listPackResourceJSONFiles(rootDir, packs, 'tools', warnings, /\.tool\.json$/i)) {
    const parsed = readJSONFile(filePath, warnings)
    if (parsed === undefined) continue
    const tool = normalizeLayeredTool(parsed, filePath, warnings, defaultSource)
    if (tool) {
      tools.push(tool)
      paths[tool.name] = filePath
    }
  }
  return { tools: dedupeLayeredTools(tools), warnings, paths }
}

function loadLayeredSkillDirectory(dir: string): { skills: SkillDefinition[]; warnings: string[]; paths: Record<string, string> } {
  const warnings: string[] = []
  const skills: SkillDefinition[] = []
  const paths: Record<string, string> = {}
  for (const filePath of listPluginSkillFiles(dir)) {
    const normalizedSkills = normalizeLayeredSkillResource(filePath, warnings)
    skills.push(...normalizedSkills)
    for (const skill of normalizedSkills) paths[skill.id] = filePath
  }
  return { skills: dedupeLayeredSkills(skills), warnings, paths }
}

function loadLayeredToolDirectory(dir: string, defaultSource: 'runtime' | 'plugin'): { tools: ToolDefinition[]; warnings: string[]; paths: Record<string, string> } {
  const warnings: string[] = []
  const tools: ToolDefinition[] = []
  const paths: Record<string, string> = {}
  for (const filePath of listPluginJSONFiles(dir)) {
    if (!/\.tool\.json$/i.test(filePath)) continue
    const parsed = readJSONFile(filePath, warnings)
    if (parsed === undefined) continue
    const tool = normalizeLayeredTool(parsed, filePath, warnings, defaultSource)
    if (tool) {
      tools.push(tool)
      paths[tool.name] = filePath
    }
  }
  return { tools: dedupeLayeredTools(tools), warnings, paths }
}

function packResourceWarnings(packs: CapabilityPack[], label: string): string[] {
  const warnings: string[] = []
  for (const pack of packs) {
    if ((pack.skills.length > 0 || pack.tools.length > 0) && !pack.resources) {
      warnings.push(`${label} pack ${pack.id} declares skills/tools but no resources.skills/resources.tools paths; no pack-owned skill/tool files will be loaded for this pack`)
      continue
    }
    if (pack.skills.length > 0 && (pack.resources?.skills?.length ?? 0) === 0) {
      warnings.push(`${label} pack ${pack.id} declares skills but no resources.skills paths`)
    }
    if (pack.tools.length > 0 && (pack.resources?.tools?.length ?? 0) === 0) {
      warnings.push(`${label} pack ${pack.id} declares tools but no resources.tools paths`)
    }
  }
  return warnings
}

function listPackResourceJSONFiles(
  rootDir: string,
  packs: CapabilityPack[],
  kind: 'skills' | 'tools',
  warnings: string[],
  fileNamePattern: RegExp,
): string[] {
  const files = new Set<string>()
  for (const pack of packs) {
    const resourcePaths = pack.resources?.[kind] ?? []
    for (const resourcePath of resourcePaths) {
      const resolvedPath = resolveCatalogResourcePath(rootDir, resourcePath)
      if (!resolvedPath) {
        warnings.push(`pack ${pack.id} has invalid ${kind} resource path ${resourcePath}; paths must be relative and stay inside the catalog ${kind} root`)
        continue
      }
      for (const filePath of listResourceJSONFiles(resolvedPath)) {
        if (fileNamePattern.test(filePath)) files.add(filePath)
      }
    }
  }
  return Array.from(files).sort()
}

function listPackResourceSkillFiles(rootDir: string, packs: CapabilityPack[], warnings: string[]): string[] {
  const files = new Set<string>()
  for (const pack of packs) {
    const resourcePaths = pack.resources?.skills ?? []
    for (const resourcePath of resourcePaths) {
      const resolvedPath = resolveCatalogResourcePath(rootDir, resourcePath)
      if (!resolvedPath) {
        warnings.push(`pack ${pack.id} has invalid skills resource path ${resourcePath}; paths must be relative and stay inside the catalog skills root`)
        continue
      }
      for (const filePath of listResourceSkillFiles(resolvedPath)) files.add(filePath)
    }
  }
  return Array.from(files).sort()
}

function resolveCatalogResourcePath(rootDir: string, resourcePath: string): string | undefined {
  if (isAbsolute(resourcePath)) return undefined
  const resolvedPath = resolve(rootDir, resourcePath)
  const normalizedRoot = normalize(rootDir)
  const normalizedResolved = normalize(resolvedPath)
  if (normalizedResolved !== normalizedRoot && !normalizedResolved.startsWith(`${normalizedRoot}/`)) return undefined
  return resolvedPath
}

function listResourceJSONFiles(path: string): string[] {
  if (!existsSync(path)) return []
  const stat = statSync(path)
  if (stat.isFile()) return path.endsWith('.json') ? [path] : []
  if (stat.isDirectory()) return listPluginJSONFiles(path)
  return []
}

function listResourceSkillFiles(path: string): string[] {
  if (!existsSync(path)) return []
  const stat = statSync(path)
  if (stat.isFile()) return isSkillResourceFile(path) ? [path] : []
  if (stat.isDirectory()) return listPluginSkillFiles(path)
  return []
}

function listPluginJSONFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  visit(dir)
  return files

  function visit(currentDir: string): void {
    for (const entry of readdirSync(currentDir).sort()) {
      const fullPath = join(currentDir, entry)
      const stat = statSync(fullPath)
      if (stat.isFile() && entry.endsWith('.json')) {
        files.push(fullPath)
        continue
      }
      if (stat.isDirectory()) visit(fullPath)
    }
  }
}

function listPluginSkillFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  visit(dir)
  return files

  function visit(currentDir: string): void {
    for (const entry of readdirSync(currentDir).sort()) {
      const fullPath = join(currentDir, entry)
      const stat = statSync(fullPath)
      if (stat.isFile() && isSkillResourceFile(fullPath)) {
        files.push(fullPath)
        continue
      }
      if (stat.isDirectory()) visit(fullPath)
    }
  }
}

function listPluginCodexSkillFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  visit(dir)
  return files

  function visit(currentDir: string): void {
    for (const entry of readdirSync(currentDir).sort()) {
      const fullPath = join(currentDir, entry)
      const stat = statSync(fullPath)
      if (stat.isFile() && (/(^|\/)SKILL\.md$/i.test(fullPath) || /\.skill\.md$/i.test(fullPath))) {
        files.push(fullPath)
        continue
      }
      if (stat.isDirectory()) visit(fullPath)
    }
  }
}

function isSkillResourceFile(filePath: string): boolean {
  return /\.(persona|workflow|policy|expertise)\.json$/i.test(filePath)
    || /(^|\/)SKILL\.md$/i.test(filePath)
    || /\.skill\.md$/i.test(filePath)
}

function readJSONFile(filePath: string, warnings: string[]): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    warnings.push(`${filePath} could not be parsed: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

function normalizeToolGrant(input: unknown): AgentToolGrant | undefined {
  if (!isRecord(input)) return undefined
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : undefined
  if (!name) return undefined
  const mode = input.mode === 'deny' ? 'deny' : 'allow'
  const approval = input.approval === 'never' || input.approval === 'always' || input.approval === 'on_write'
    ? input.approval
    : undefined
  return { name, mode, ...(approval ? { approval } : {}) }
}

function normalizeCapabilityPack(input: unknown, filePath: string, warnings: string[]): CapabilityPack | undefined {
  if (!isRecord(input)) return undefined
  const id = nonEmptyString(input.id)
  const version = nonEmptyString(input.version) ?? '1.0.0'
  const name = nonEmptyString(input.name) ?? id
  if (!id || !name) {
    warnings.push(`${filePath} is not a valid capability pack: id is required`)
    return undefined
  }
  const source = input.source === 'plugin' || input.source === 'mcp' || input.source === 'builtin' ? input.source : 'builtin'
  return {
    id,
    version,
    name,
    ...(nonEmptyString(input.description) ? { description: nonEmptyString(input.description) } : {}),
    source,
    ...(normalizePackResources(input.resources) ? { resources: normalizePackResources(input.resources) } : {}),
    ...(stringArray(input.knowledge).length > 0 ? { knowledge: stringArray(input.knowledge) } : {}),
    schemas: stringArray(input.schemas),
    tools: stringArray(input.tools),
    skills: stringArray(input.skills),
    ...(isRecord(input.requires) ? { requires: normalizePackRequires(input.requires) } : {}),
    ...(stringArray(input.conflicts).length > 0 ? { conflicts: stringArray(input.conflicts) } : {}),
    ...(nonEmptyString(input.pluginId) ? { pluginId: nonEmptyString(input.pluginId) } : {}),
    ...(nonEmptyString(input.mcpServerId) ? { mcpServerId: nonEmptyString(input.mcpServerId) } : {}),
    ...(isRecord(input.capabilities) ? { capabilities: normalizePackCapabilities(input.capabilities) } : {}),
  }
}

function normalizePackResources(input: unknown): CapabilityPack['resources'] | undefined {
  if (!isRecord(input)) return undefined
  const resources = {
    ...(stringArray(input.skills).length > 0 ? { skills: stringArray(input.skills) } : {}),
    ...(stringArray(input.tools).length > 0 ? { tools: stringArray(input.tools) } : {}),
    ...(stringArray(input.knowledge).length > 0 ? { knowledge: stringArray(input.knowledge) } : {}),
  }
  return resources.skills || resources.tools || resources.knowledge ? resources : undefined
}

function normalizePackRequires(input: Record<string, unknown>): NonNullable<CapabilityPack['requires']> {
  return {
    ...(stringRecord(input.packs) ? { packs: stringRecord(input.packs) } : {}),
    ...(stringRecord(input.schemas) ? { schemas: stringRecord(input.schemas) } : {}),
    ...(stringRecord(input.tools) ? { tools: stringRecord(input.tools) } : {}),
    ...(stringRecord(input.skills) ? { skills: stringRecord(input.skills) } : {}),
  }
}

function normalizePackCapabilities(input: Record<string, unknown>): NonNullable<CapabilityPack['capabilities']> {
  return {
    ...(stringArray(input.requiresPermissions).length > 0 ? { requiresPermissions: stringArray(input.requiresPermissions) } : {}),
    ...(stringArray(input.requiresFeatureFlags).length > 0 ? { requiresFeatureFlags: stringArray(input.requiresFeatureFlags) } : {}),
  }
}

function normalizeAgentProfile(input: unknown, filePath: string, warnings: string[]): AgentProfile | undefined {
  if (!isRecord(input)) return undefined
  if (input.schema !== 'movscript.agent.profile.v1') {
    warnings.push(`${filePath} is not an agent profile: schema must be movscript.agent.profile.v1`)
    return undefined
  }
  const id = nonEmptyString(input.id)
  const version = nonEmptyString(input.version) ?? '1.0.0'
  const name = nonEmptyString(input.name) ?? id
  if (!id || !name) {
    warnings.push(`${filePath} is not a valid agent profile: id is required`)
    return undefined
  }
  return {
    schema: 'movscript.agent.profile.v1',
    id,
    version,
    name,
    ...(nonEmptyString(input.description) ? { description: nonEmptyString(input.description) } : {}),
    enabledPacks: stringArray(input.enabledPacks),
    persona: typeof input.persona === 'string' && input.persona.trim() ? input.persona.trim() : null,
    enabledWorkflows: stringArray(input.enabledWorkflows),
    enabledPolicies: stringArray(input.enabledPolicies),
    toolGrants: normalizeProfileToolGrants(input.toolGrants),
    ...(isRecord(input.model) ? { model: normalizeProfileModel(input.model) } : {}),
    ...(isRecord(input.limits) ? { limits: normalizeProfileLimits(input.limits) } : {}),
    ...(jsonRecord(input.metadata) ? { metadata: jsonRecord(input.metadata) } : {}),
  }
}

function normalizeLayeredSkillFile(input: unknown, filePath: string, warnings: string[]): SkillDefinition[] {
  if (Array.isArray(input)) return input.flatMap((item) => normalizeLayeredSkill(item, filePath, warnings) ?? [])
  if (isRecord(input) && Array.isArray(input.skills)) {
    return input.skills.flatMap((item) => normalizeLayeredSkill(item, filePath, warnings) ?? [])
  }
  const skill = normalizeLayeredSkill(input, filePath, warnings)
  return skill ? [skill] : []
}

function normalizeLayeredSkillResource(filePath: string, warnings: string[]): SkillDefinition[] {
  if (/\.md$/i.test(filePath)) {
    const skill = normalizeCodexSkillFile(filePath, warnings)
    return skill ? [skill] : []
  }
  const parsed = readJSONFile(filePath, warnings)
  if (parsed === undefined) return []
  return normalizeLayeredSkillFile(parsed, filePath, warnings)
}

function normalizeCodexSkillFile(filePath: string, warnings: string[]): SkillDefinition | undefined {
  let content: string
  try {
    content = readFileSync(filePath, 'utf8')
  } catch (error) {
    warnings.push(`${filePath} could not be read: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
  const parsed = parseMarkdownFrontmatter(content)
  if (!parsed.frontmatter) {
    warnings.push(`${filePath} is not a valid Codex-style skill: SKILL.md requires frontmatter with name and description`)
    return undefined
  }
  const input = parsed.frontmatter
  const name = nonEmptyString(input.name)
  const description = nonEmptyString(input.description)
  const kind = normalizeSkillKind(input.kind) ?? 'expertise'
  const id = nonEmptyString(input.id) ?? codexSkillIdFromPath(filePath, name)
  const body = parsed.body.trim()
  if (!id || !name || !description || !body) {
    warnings.push(`${filePath} is not a valid Codex-style skill: name, description, and Markdown body are required`)
    return undefined
  }
  const aliases = stringArray(input.aliases)
  const tags = stringArray(input.tags)
  const useWhen = stringArray(input.useWhen)
  const loadMode = normalizeSkillLoadMode(input.loadMode) ?? normalizeSkillLoadMode(input.load) ?? 'on_demand'
  const activationScope = normalizeSkillActivationScope(input.activationScope) ?? normalizeSkillActivationScope(input.scope)
  const base = {
    id,
    kind,
    version: nonEmptyString(input.version) ?? '1.0.0',
    name,
    description,
    priority: typeof input.priority === 'number' && Number.isFinite(input.priority) ? input.priority : defaultSkillPriority(kind),
    enabled: input.enabled !== false,
    instructionTemplate: body,
    loadMode,
    sourcePath: filePath,
    ...(tags.length > 0 ? { tags } : {}),
    ...(aliases.length > 0 ? { aliases } : {}),
    ...(useWhen.length > 0 ? { useWhen } : {}),
    ...(stringArray(input.dependencies).length > 0 ? { dependencies: stringArray(input.dependencies) } : {}),
    ...(stringArray(input.conflicts).length > 0 ? { conflicts: stringArray(input.conflicts) } : {}),
    ...(typeof input.tokenEstimate === 'number' && Number.isFinite(input.tokenEstimate) ? { tokenEstimate: Math.max(0, Math.floor(input.tokenEstimate)) } : {}),
    ...(activationScope ? { activationScope } : {}),
    ...(stringArray(input.toolRefs).length > 0 ? { toolRefs: stringArray(input.toolRefs) } : {}),
    ...(stringArray(input.schemaRefs).length > 0 ? { schemaRefs: stringArray(input.schemaRefs) } : {}),
    ...(nonEmptyString(input.outputContract) ? { outputContract: nonEmptyString(input.outputContract) } : {}),
    metadata: {
      ...(jsonRecord(input.metadata) ?? {}),
      codexSkill: true,
      sourcePath: filePath,
      loadMode,
    },
  }
  if (kind === 'persona') return { ...base, kind: 'persona' }
  if (kind === 'policy') return { ...base, kind: 'policy' }
  if (kind === 'workflow') {
    return {
      ...base,
      kind: 'workflow',
      triggers: normalizeSkillTriggers(input.triggers).length > 0
        ? normalizeSkillTriggers(input.triggers)
        : defaultCodexWorkflowTriggers(name, aliases, tags, useWhen),
      toolRefs: stringArray(input.toolRefs),
      ...(input.toolScope === 'union' || input.toolScope === 'intersect' ? { toolScope: input.toolScope } : {}),
    }
  }
  return { ...base, kind: 'expertise' }
}

function normalizeLayeredSkill(input: unknown, filePath: string, warnings: string[]): SkillDefinition | undefined {
  if (!isRecord(input)) return undefined
  const id = nonEmptyString(input.id)
  const kind = input.kind === 'persona' || input.kind === 'workflow' || input.kind === 'policy' || input.kind === 'expertise' ? input.kind : undefined
  const name = nonEmptyString(input.name) ?? id
  const description = nonEmptyString(input.description) ?? ''
  const instructionTemplate = resolveInstructionTemplate(input, filePath, warnings)
  const loadMode = normalizeSkillLoadMode(input.loadMode) ?? normalizeSkillLoadMode(input.load)
  const activationScope = normalizeSkillActivationScope(input.activationScope) ?? normalizeSkillActivationScope(input.scope)
  if (!id || !kind || !name || !instructionTemplate) {
    warnings.push(`${filePath} is not a valid ${kind ?? 'skill'}: id, kind, name, and instructionTemplate or instructionTemplatePath are required`)
    return undefined
  }
  const base = {
    id,
    kind,
    version: nonEmptyString(input.version) ?? '1.0.0',
    name,
    description,
    priority: typeof input.priority === 'number' && Number.isFinite(input.priority) ? input.priority : kind === 'persona' ? 1000 : 100,
    enabled: input.enabled !== false,
    instructionTemplate,
    ...(loadMode ? { loadMode } : {}),
    ...(nonEmptyString(input.sourcePath) ? { sourcePath: nonEmptyString(input.sourcePath) } : {}),
    ...(stringArray(input.tags).length > 0 ? { tags: stringArray(input.tags) } : {}),
    ...(stringArray(input.aliases).length > 0 ? { aliases: stringArray(input.aliases) } : {}),
    ...(stringArray(input.useWhen).length > 0 ? { useWhen: stringArray(input.useWhen) } : {}),
    ...(stringArray(input.dependencies).length > 0 ? { dependencies: stringArray(input.dependencies) } : {}),
    ...(stringArray(input.conflicts).length > 0 ? { conflicts: stringArray(input.conflicts) } : {}),
    ...(typeof input.tokenEstimate === 'number' && Number.isFinite(input.tokenEstimate) ? { tokenEstimate: Math.max(0, Math.floor(input.tokenEstimate)) } : {}),
    ...(activationScope ? { activationScope } : {}),
    ...(stringArray(input.toolRefs).length > 0 ? { toolRefs: stringArray(input.toolRefs) } : {}),
    ...(stringArray(input.schemaRefs).length > 0 ? { schemaRefs: stringArray(input.schemaRefs) } : {}),
    ...(nonEmptyString(input.outputContract) ? { outputContract: nonEmptyString(input.outputContract) } : {}),
    ...(isJSONRecord(input.metadata) ? { metadata: input.metadata } : {}),
  }
  if (kind === 'persona') return { ...base, kind: 'persona' }
  if (kind === 'policy') {
    return {
      ...base,
      kind: 'policy',
      ...(normalizePolicyScope(input.scope) ? { scope: normalizePolicyScope(input.scope) } : {}),
    }
  }
  if (kind === 'expertise') return { ...base, kind: 'expertise' }
  return {
    ...base,
    kind: 'workflow',
    triggers: normalizeSkillTriggers(input.triggers),
    toolRefs: stringArray(input.toolRefs),
    ...(input.toolScope === 'union' || input.toolScope === 'intersect' ? { toolScope: input.toolScope } : {}),
  }
}

function resolveInstructionTemplate(input: Record<string, unknown>, filePath: string, warnings: string[]): string | undefined {
  const inline = nonEmptyString(input.instructionTemplate)
  const instructionPath = nonEmptyString(input.instructionTemplatePath)
    ?? nonEmptyString(input.instructionPath)
    ?? nonEmptyString(input.bodyPath)
  if (!instructionPath) return inline
  const resolvedPath = resolveCatalogSiblingPath(filePath, instructionPath)
  if (!resolvedPath) {
    warnings.push(`${filePath} instructionTemplatePath must be relative and stay inside the skill directory`)
    return inline
  }
  try {
    const fromFile = readFileSync(resolvedPath, 'utf8').trim()
    if (!fromFile) {
      warnings.push(`${resolvedPath} is empty; instructionTemplatePath ignored`)
      return inline
    }
    return fromFile
  } catch (error) {
    warnings.push(`${resolvedPath} could not be read: ${error instanceof Error ? error.message : String(error)}`)
    return inline
  }
}

function resolveCatalogSiblingPath(filePath: string, siblingPath: string): string | undefined {
  if (isAbsolute(siblingPath)) return undefined
  const baseDir = dirname(filePath)
  const resolvedPath = resolve(baseDir, siblingPath)
  const normalizedBase = normalize(baseDir)
  const normalizedResolved = normalize(resolvedPath)
  if (normalizedResolved !== normalizedBase && !normalizedResolved.startsWith(`${normalizedBase}/`)) return undefined
  return resolvedPath
}

function normalizeLayeredTool(input: unknown, filePath: string, warnings: string[], defaultSource: 'runtime' | 'plugin'): ToolDefinition | undefined {
  if (!isRecord(input)) return undefined
  const name = nonEmptyString(input.name)
  const description = nonEmptyString(input.description)
  const permission = nonEmptyString(input.permission)
  const risk = input.risk === 'read' || input.risk === 'draft' || input.risk === 'write' || input.risk === 'generate' || input.risk === 'destructive' || input.risk === 'ui'
    ? input.risk
    : undefined
  if (!name || !description || !permission || !risk || !isRecord(input.inputSchema)) {
    warnings.push(`${filePath} is not a valid tool: name, description, permission, risk, and inputSchema are required`)
    return undefined
  }
  const source = input.source === 'runtime' || input.source === 'plugin' || input.source === 'mcp' ? input.source : defaultSource
  return {
    name,
    description,
    inputSchema: input.inputSchema,
    ...(isRecord(input.outputSchema) ? { outputSchema: input.outputSchema } : {}),
    permission,
    risk,
    projectScoped: input.projectScoped === true,
    defaults: normalizeLayeredToolDefaults(input.defaults),
    source,
    ...(nonEmptyString(input.capability) ? { capability: nonEmptyString(input.capability) } : {}),
    ...(nonEmptyString(input.pluginId) ? { pluginId: nonEmptyString(input.pluginId) } : {}),
    ...(nonEmptyString(input.mcpServerId) ? { mcpServerId: nonEmptyString(input.mcpServerId) } : {}),
    ...(stringArray(input.errorCodes).length > 0 ? { errorCodes: stringArray(input.errorCodes) } : {}),
    ...(runRoleArray(input.allowedRunRoles).length > 0 ? { allowedRunRoles: runRoleArray(input.allowedRunRoles) } : {}),
  }
}

function normalizeLayeredToolDefaults(value: unknown): ToolDefinition['defaults'] {
  if (!isRecord(value)) return { grant: 'allow', approval: 'never' }
  const grant = value.grant === 'deny' ? 'deny' : 'allow'
  const approval = value.approval === 'always' || value.approval === 'on_write' || value.approval === 'never'
    ? value.approval
    : 'never'
  return {
    grant,
    approval,
    ...(positiveNumber(value.timeoutMs) ? { timeoutMs: positiveNumber(value.timeoutMs) } : {}),
  }
}

function parseMarkdownFrontmatter(content: string): { frontmatter?: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(content)
  if (!match) return { body: content }
  return {
    frontmatter: parseSimpleFrontmatter(match[1]),
    body: match[2],
  }
}

function parseSimpleFrontmatter(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  let currentArrayKey: string | undefined
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (currentArrayKey && trimmed.startsWith('- ')) {
      const current = Array.isArray(result[currentArrayKey]) ? result[currentArrayKey] as unknown[] : []
      current.push(parseFrontmatterScalar(trimmed.slice(2).trim()))
      result[currentArrayKey] = current
      continue
    }
    currentArrayKey = undefined
    const separator = line.indexOf(':')
    if (separator < 0) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    if (!key) continue
    if (!value) {
      result[key] = []
      currentArrayKey = key
      continue
    }
    result[key] = parseFrontmatterScalar(value)
  }
  return result
}

function parseFrontmatterScalar(value: string): unknown {
  const unquoted = stripMatchingQuotes(value)
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    if (!inner) return []
    return inner.split(',').map((item) => stripMatchingQuotes(item.trim())).filter((item) => item.length > 0)
  }
  if (unquoted === 'true') return true
  if (unquoted === 'false') return false
  const number = Number(unquoted)
  if (/^-?\d+(\.\d+)?$/.test(unquoted) && Number.isFinite(number)) return number
  return unquoted
}

function stripMatchingQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

function normalizeSkillKind(value: unknown): SkillKind | undefined {
  return value === 'persona' || value === 'workflow' || value === 'policy' || value === 'expertise' ? value : undefined
}

function normalizeSkillLoadMode(value: unknown): SkillLoadMode | undefined {
  return value === 'core' || value === 'on_demand' || value === 'manual' ? value : undefined
}

function normalizeSkillActivationScope(value: unknown): SkillActivationScope | undefined {
  return value === 'turn' || value === 'run' || value === 'thread' ? value : undefined
}

function defaultSkillPriority(kind: SkillKind): number {
  if (kind === 'persona') return 1000
  if (kind === 'expertise') return 75
  return 100
}

function codexSkillIdFromPath(filePath: string, name: string | undefined): string {
  const parent = dirname(filePath).split('/').at(-1) ?? 'skill'
  return `codex.skill.${slugify(name ?? parent)}`
}

function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'skill'
}

function defaultCodexWorkflowTriggers(name: string, aliases: string[], tags: string[], useWhen: string[]): SkillTrigger[] {
  const keywords = stringArray([name, ...aliases, ...tags, ...useWhen].filter((item) => item.length <= 80))
  return [{ kind: 'keyword', any: keywords.length > 0 ? keywords : [name] }]
}

function normalizePolicyScope(value: unknown): PolicyScope | undefined {
  if (value === 'global') return 'global'
  if (!isRecord(value)) return undefined
  return {
    ...(stringArray(value.workflow).length > 0 ? { workflow: stringArray(value.workflow) } : {}),
    ...(stringArray(value.risk).length > 0 ? { risk: stringArray(value.risk).filter((risk) => risk === 'read' || risk === 'draft' || risk === 'write' || risk === 'generate' || risk === 'destructive' || risk === 'ui') } : {}),
  }
}

function normalizeSkillTriggers(value: unknown): NonNullable<Extract<SkillDefinition, { kind: 'workflow' }>['triggers']> {
  if (!Array.isArray(value)) return []
  const triggers: NonNullable<Extract<SkillDefinition, { kind: 'workflow' }>['triggers']> = []
  for (const item of value) {
    if (!isRecord(item)) continue
    if (item.kind === 'always') triggers.push({ kind: 'always' })
    else if (item.kind === 'keyword' && stringArray(item.any).length > 0) triggers.push({ kind: 'keyword', any: stringArray(item.any) })
    else if (item.kind === 'regex' && nonEmptyString(item.pattern)) triggers.push({ kind: 'regex', pattern: nonEmptyString(item.pattern)!, ...(nonEmptyString(item.flags) ? { flags: nonEmptyString(item.flags) } : {}) })
    else if (item.kind === 'intent' && nonEmptyString(item.id)) triggers.push({ kind: 'intent', id: nonEmptyString(item.id)! })
    else if (item.kind === 'context' && isRecord(item.selector)) triggers.push({ kind: 'context', selector: normalizeContextSelector(item.selector) })
  }
  return triggers
}

function normalizeContextSelector(input: Record<string, unknown>): ContextSelector {
  return {
    ...(stringArray(input.route).length > 0 ? { route: stringArray(input.route) } : {}),
    ...(stringArray(input.selectedKind).length > 0 ? { selectedKind: stringArray(input.selectedKind) as never } : {}),
    ...(stringArray(input.selectedScope).length > 0 ? { selectedScope: stringArray(input.selectedScope) as never } : {}),
    ...(stringArray(input.draftStatus).length > 0 ? { draftStatus: stringArray(input.draftStatus).filter((item) => item === 'proposed' || item === 'confirmed' || item === 'superseded') as never } : {}),
    ...(typeof input.hasProjectId === 'boolean' ? { hasProjectId: input.hasProjectId } : {}),
    ...(typeof input.hasProductionId === 'boolean' ? { hasProductionId: input.hasProductionId } : {}),
  }
}

function normalizeProfileToolGrants(value: unknown): AgentProfile['toolGrants'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const grant = normalizeToolGrant(item)
    return grant ? [grant] : []
  })
}

function normalizeProfileModel(input: Record<string, unknown>): NonNullable<AgentProfile['model']> {
  const provider = input.provider === 'anthropic' || input.provider === 'openai' || input.provider === 'azure' || input.provider === 'custom'
    ? input.provider
    : 'custom'
  return {
    provider,
    modelId: nonEmptyString(input.modelId) ?? 'default',
    ...(nonEmptyString(input.platformModelId) ? { platformModelId: nonEmptyString(input.platformModelId) } : {}),
  }
}

function normalizeProfileLimits(input: Record<string, unknown>): NonNullable<AgentProfile['limits']> {
  return {
    ...(positiveNumber(input.maxActiveWorkflows) ? { maxActiveWorkflows: positiveNumber(input.maxActiveWorkflows) } : {}),
    ...(positiveNumber(input.systemPromptCharLimit) ? { systemPromptCharLimit: positiveNumber(input.systemPromptCharLimit) } : {}),
    ...(positiveNumber(input.contextWindowCharLimit) ? { contextWindowCharLimit: positiveNumber(input.contextWindowCharLimit) } : {}),
    ...(positiveNumber(input.maxRetrievedContextChars) ? { maxRetrievedContextChars: positiveNumber(input.maxRetrievedContextChars) } : {}),
    ...(positiveNumber(input.maxKnowledgeCharsPerRun) ? { maxKnowledgeCharsPerRun: positiveNumber(input.maxKnowledgeCharsPerRun) } : {}),
    ...(positiveNumber(input.maxKnowledgeChunksPerRun) ? { maxKnowledgeChunksPerRun: positiveNumber(input.maxKnowledgeChunksPerRun) } : {}),
    ...(positiveNumber(input.maxHistoryMessages) ? { maxHistoryMessages: positiveNumber(input.maxHistoryMessages) } : {}),
    ...(positiveNumber(input.maxThreadSummaryChars) ? { maxThreadSummaryChars: positiveNumber(input.maxThreadSummaryChars) } : {}),
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())))
}

function runRoleArray(value: unknown): Array<'planner' | 'worker'> {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is 'planner' | 'worker' => item === 'planner' || item === 'worker')))
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value).flatMap(([key, item]) => typeof item === 'string' && item.trim() ? [[key, item.trim()] as const] : [])
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function jsonRecord(value: unknown): Record<string, JSONValue> | undefined {
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value).filter((entry): entry is [string, JSONValue] => isJSONValue(entry[1]))
  return entries.length === Object.keys(value).length ? Object.fromEntries(entries) : undefined
}

function positiveNumber(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function mergeToolGrants(base: AgentToolGrant[], next: AgentToolGrant[]): AgentToolGrant[] {
  const byName = new Map<string, AgentToolGrant>()
  for (const grant of base) byName.set(grant.name, grant)
  for (const grant of next) byName.set(grant.name, grant)
  return Array.from(byName.values())
}

function dedupePacks(packs: CapabilityPack[]): CapabilityPack[] {
  const byId = new Map<string, CapabilityPack>()
  for (const pack of packs) byId.set(pack.id, pack)
  return Array.from(byId.values())
}

function dedupeProfiles(profiles: AgentProfile[]): AgentProfile[] {
  const byId = new Map<string, AgentProfile>()
  for (const profile of profiles) byId.set(profile.id, profile)
  return Array.from(byId.values())
}

function dedupeLayeredSkills(skills: SkillDefinition[]): SkillDefinition[] {
  const byId = new Map<string, SkillDefinition>()
  for (const skill of skills) byId.set(skill.id, skill)
  return Array.from(byId.values())
}

function dedupeLayeredTools(tools: ToolDefinition[]): ToolDefinition[] {
  const byName = new Map<string, ToolDefinition>()
  for (const tool of tools) byName.set(tool.name, tool)
  return Array.from(byName.values())
}
