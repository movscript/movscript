import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_AGENT_MANIFEST,
  mergeAgentManifestSkills,
  normalizeAgentSkillManifest,
  type AgentManifest,
  type AgentSkillManifest,
  type AgentToolGrant,
} from './agentManifest.js'
import { resolveAgentStatePath } from '../state/fileStore.js'
import {
  DEFAULT_TOOL_REGISTRY,
  StaticToolRegistry,
  mergeRegisteredTools,
  normalizeRegisteredTool,
  type RegisteredTool,
  type ToolRegistry,
} from '../tools/toolRegistry.js'
import type { JSONValue } from '../types.js'
import { buildLayeredCatalogRegistry } from './registry.js'
import { lintCatalog } from './linter.js'
import type { AgentProfile, CapabilityPack, CatalogIssue, CatalogRegistry, ContextSelector, PolicyScope, SkillDefinition, ToolDefinition } from './types.js'

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
  skills: AgentSkillManifest[]
  tools: RegisteredTool[]
  toolGrants: AgentToolGrant[]
  manifest: AgentManifest
  registry: ToolRegistry
  layeredRegistry: CatalogRegistry
  catalogIssues: CatalogIssue[]
  warnings: string[]
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
  const builtinSkillResult = { skills: [] as AgentSkillManifest[], warnings: [] as string[] }
  const localSkillResult = { skills: [] as AgentSkillManifest[], warnings: [] as string[] }
  const builtinToolResult = { tools: [] as RegisteredTool[], grants: [] as AgentToolGrant[], warnings: [] as string[] }
  const localToolResult = { tools: [] as RegisteredTool[], grants: [] as AgentToolGrant[], warnings: [] as string[] }
  const builtinLayeredSkillResult = loadLayeredSkillDirectory(builtinSkillsDir)
  const localLayeredSkillResult = loadLayeredSkillDirectory(skillsDir)
  const builtinLayeredToolResult = loadLayeredToolDirectory(builtinToolsDir, 'runtime')
  const localLayeredToolResult = loadLayeredToolDirectory(toolsDir, 'plugin')
  const builtinPackResult = loadPackDirectory(builtinPacksDir)
  const localPackResult = loadPackDirectory(packsDir)
  const builtinProfileResult = loadProfileDirectory(builtinProfilesDir)
  const localProfileResult = loadProfileDirectory(profilesDir)
  const skillDefinitions = dedupeById([
    ...builtinSkillResult.skills,
    ...localSkillResult.skills,
  ])
  const toolDefinitions = dedupeByName([
    ...builtinToolResult.tools,
    ...localToolResult.tools,
  ])
  const definitionGrants = mergeToolGrants([], [
    ...builtinToolResult.grants,
    ...localToolResult.grants,
  ])
  const packs = dedupePacks([
    ...builtinPackResult.packs,
    ...localPackResult.packs,
  ])
  const layeredSkills = dedupeLayeredSkills([
    ...builtinLayeredSkillResult.skills,
    ...localLayeredSkillResult.skills,
  ])
  const layeredTools = dedupeLayeredTools([
    ...builtinLayeredToolResult.tools,
    ...localLayeredToolResult.tools,
  ])
  const layeredRegisteredTools = layeredTools.map(registeredToolFromLayeredTool)
  const layeredToolGrants = layeredTools.map((tool): AgentToolGrant => ({
    name: tool.name,
    mode: tool.defaults.grant,
    approval: tool.defaults.approval,
  }))
  const profiles = profilesWithDefaultToolGrants(dedupeProfiles([
    ...builtinProfileResult.profiles,
    ...localProfileResult.profiles,
  ]), layeredToolGrants, packs)
  const selectedSkillRefs = skillDefinitions.map((skill) => skill.id)
  const selectedToolRefs = toolDefinitions.map((tool) => tool.name)
  const skillResult = {
    skills: resolveSkillRefs(selectedSkillRefs, skillDefinitions),
    warnings: [
      ...builtinSkillResult.warnings,
      ...localSkillResult.warnings,
      ...builtinPackResult.warnings,
      ...localPackResult.warnings,
      ...builtinProfileResult.warnings,
      ...localProfileResult.warnings,
      ...builtinLayeredSkillResult.warnings,
      ...localLayeredSkillResult.warnings,
      ...builtinLayeredToolResult.warnings,
      ...localLayeredToolResult.warnings,
    ],
  }
  const toolResult = {
    tools: mergeRegisteredTools(resolveToolRefs(selectedToolRefs, toolDefinitions), layeredRegisteredTools),
    grants: mergeToolGrants([], [
      ...definitionGrants.filter((grant) => selectedToolRefs.includes(grant.name)),
      ...layeredToolGrants,
    ]),
    warnings: [
      ...builtinToolResult.warnings,
      ...localToolResult.warnings,
      ...builtinPackResult.warnings,
      ...localPackResult.warnings,
      ...builtinProfileResult.warnings,
      ...localProfileResult.warnings,
      ...builtinLayeredSkillResult.warnings,
      ...localLayeredSkillResult.warnings,
      ...builtinLayeredToolResult.warnings,
      ...localLayeredToolResult.warnings,
    ],
  }
  const baseManifest = options.baseManifest ?? DEFAULT_AGENT_MANIFEST
  const baseTools = options.baseTools ?? DEFAULT_TOOL_REGISTRY.list()
  const manifest = mergeAgentManifestSkills({
    ...baseManifest,
    tools: mergeToolGrants(baseManifest.tools, toolResult.grants),
  }, skillResult.skills)
  const registry = new StaticToolRegistry(mergeRegisteredTools(baseTools, toolResult.tools))
  const layeredRegistry = buildLayeredCatalogRegistry({
    manifest,
    skills: skillDefinitions,
    tools: mergeRegisteredTools(baseTools, toolDefinitions),
    packs,
    profiles,
    layeredSkills,
    layeredTools,
  })
  const catalogIssues = lintCatalog(layeredRegistry)

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
    skills: skillResult.skills,
    tools: toolResult.tools,
    toolGrants: toolResult.grants,
    manifest,
    registry,
    layeredRegistry,
    catalogIssues,
    warnings: Array.from(new Set([
      ...skillResult.warnings,
      ...toolResult.warnings,
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

function profilesWithDefaultToolGrants(profiles: AgentProfile[], grants: AgentToolGrant[], packs: CapabilityPack[]): AgentProfile[] {
  if (grants.length === 0) return profiles
  const packsById = new Map(packs.map((pack) => [pack.id, pack]))
  return profiles.map((profile) => {
    if (profile.id !== 'movscript.profile.default') return profile
    const existing = new Set(profile.toolGrants.map((grant) => grant.name))
    const packTools = new Set(profile.enabledPacks.flatMap((packId) => packsById.get(packId)?.tools ?? []))
    const additions = grants
      .filter((grant) => grant.mode === 'allow' && !existing.has(grant.name) && packTools.has(grant.name))
      .map((grant) => ({ name: grant.name, mode: grant.mode, ...(grant.approval ? { approval: grant.approval } : {}) }))
    return additions.length > 0 ? { ...profile, toolGrants: [...profile.toolGrants, ...additions] } : profile
  })
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

function loadPackDirectory(dir: string): { packs: CapabilityPack[]; warnings: string[] } {
  const warnings: string[] = []
  const packs: CapabilityPack[] = []
  for (const filePath of listPluginJSONFiles(dir)) {
    const parsed = readJSONFile(filePath, warnings)
    if (parsed === undefined) continue
    const pack = normalizeCapabilityPack(parsed, filePath, warnings)
    if (pack) packs.push(pack)
  }
  return { packs: dedupePacks(packs), warnings }
}

function loadProfileDirectory(dir: string): { profiles: AgentProfile[]; warnings: string[] } {
  const warnings: string[] = []
  const profiles: AgentProfile[] = []
  for (const filePath of listPluginJSONFiles(dir)) {
    const parsed = readJSONFile(filePath, warnings)
    if (parsed === undefined) continue
    const profile = normalizeAgentProfile(parsed, filePath, warnings)
    if (profile) profiles.push(profile)
  }
  return { profiles: dedupeProfiles(profiles), warnings }
}

function loadLayeredSkillDirectory(dir: string): { skills: SkillDefinition[]; warnings: string[] } {
  const warnings: string[] = []
  const skills: SkillDefinition[] = []
  for (const filePath of listPluginJSONFiles(dir)) {
    if (!/\.(persona|workflow|policy)\.json$/i.test(filePath)) continue
    const parsed = readJSONFile(filePath, warnings)
    if (parsed === undefined) continue
    skills.push(...normalizeLayeredSkillFile(parsed, filePath, warnings))
  }
  return { skills: dedupeLayeredSkills(skills), warnings }
}

function loadLayeredToolDirectory(dir: string, defaultSource: 'runtime' | 'plugin'): { tools: ToolDefinition[]; warnings: string[] } {
  const warnings: string[] = []
  const tools: ToolDefinition[] = []
  for (const filePath of listPluginJSONFiles(dir)) {
    if (!/\.tool\.json$/i.test(filePath)) continue
    const parsed = readJSONFile(filePath, warnings)
    if (parsed === undefined) continue
    const tool = normalizeLayeredTool(parsed, filePath, warnings, defaultSource)
    if (tool) tools.push(tool)
  }
  return { tools: dedupeLayeredTools(tools), warnings }
}

function loadSkillDirectory(dir: string): { skills: AgentSkillManifest[]; warnings: string[] } {
  const warnings: string[] = []
  const skills: AgentSkillManifest[] = []
  for (const filePath of listPluginJSONFiles(dir)) {
    const parsed = readJSONFile(filePath, warnings)
    if (parsed === undefined) continue
    for (const skill of extractSkills(parsed, filePath, warnings)) {
      skills.push(withCatalogCategory(skill, parsed, dir, filePath))
    }
  }
  return { skills: dedupeById(skills), warnings }
}

function loadToolDirectory(dir: string, defaultSource: 'runtime' | 'plugin'): { tools: RegisteredTool[]; grants: AgentToolGrant[]; warnings: string[] } {
  const warnings: string[] = []
  const tools: RegisteredTool[] = []
  const grants: AgentToolGrant[] = []
  for (const filePath of listPluginJSONFiles(dir)) {
    const parsed = readJSONFile(filePath, warnings)
    if (parsed === undefined) continue
    const toolSet = extractTools(parsed)
    tools.push(...toolSet.tools.map((tool) => withCatalogCategory(withDefaultToolSource(tool, defaultSource), parsed, dir, filePath)))
    grants.push(...toolSet.grants)
  }
  return {
    tools: dedupeByName(tools),
    grants: mergeToolGrants([], grants),
    warnings,
  }
}

function withDefaultToolSource(tool: RegisteredTool, source: 'runtime' | 'plugin'): RegisteredTool {
  return {
    ...tool,
    source: tool.source ?? source,
    ...(source === 'plugin' && !tool.pluginId ? { pluginId: 'local.catalog' } : {}),
  }
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

function readJSONFile(filePath: string, warnings: string[]): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    warnings.push(`${filePath} could not be parsed: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

function extractSkills(value: unknown, filePath: string, warnings: string[]): AgentSkillManifest[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeAgentSkillManifest(resolveLegacySkillInstruction(item, filePath, warnings)) ?? [])
  if (!isRecord(value)) return []
  if (isNativeLayeredSkillFile(value)) return []
  if (Array.isArray(value.skills)) return value.skills.flatMap((item) => normalizeAgentSkillManifest(resolveLegacySkillInstruction(item, filePath, warnings)) ?? [])
  const skill = normalizeAgentSkillManifest(resolveLegacySkillInstruction(value, filePath, warnings))
  return skill ? [skill] : []
}

function resolveLegacySkillInstruction(input: unknown, filePath: string, warnings: string[]): unknown {
  if (!isRecord(input)) return input
  const instructionPath = nonEmptyString(input.instructionPath)
    ?? nonEmptyString(input.instructionTemplatePath)
    ?? nonEmptyString(input.bodyPath)
  if (!instructionPath) return input
  const resolvedPath = resolveCatalogSiblingPath(filePath, instructionPath)
  if (!resolvedPath) {
    warnings.push(`${filePath} instructionPath must be relative and stay inside the skill directory`)
    return input
  }
  try {
    const instruction = readFileSync(resolvedPath, 'utf8').trim()
    if (!instruction) {
      warnings.push(`${resolvedPath} is empty; instructionPath ignored`)
      return input
    }
    return { ...input, instruction }
  } catch (error) {
    warnings.push(`${resolvedPath} could not be read: ${error instanceof Error ? error.message : String(error)}`)
    return input
  }
}

function extractTools(value: unknown): { tools: RegisteredTool[]; grants: AgentToolGrant[] } {
  if (Array.isArray(value)) {
    return {
      tools: value.flatMap((item) => normalizeRegisteredTool(item) ?? []),
      grants: value.flatMap((item) => normalizeToolGrant(isRecord(item) ? item.defaultGrant : undefined) ?? []),
    }
  }
  if (!isRecord(value)) return { tools: [], grants: [] }
  const values = Array.isArray(value.tools) ? value.tools : [value]
  return {
    tools: values.flatMap((item) => normalizeRegisteredTool(item) ?? []),
    grants: values.flatMap((item) => normalizeToolGrant(isRecord(item) ? item.defaultGrant : undefined) ?? []),
  }
}

function resolveSkillRefs(refs: string[], definitions: AgentSkillManifest[]): AgentSkillManifest[] {
  const byId = new Map(definitions.map((skill) => [skill.id, skill]))
  return refs.flatMap((ref) => byId.get(ref) ?? [])
}

function resolveToolRefs(refs: string[], definitions: RegisteredTool[]): RegisteredTool[] {
  const byName = new Map(definitions.map((tool) => [tool.name, tool]))
  return refs.flatMap((ref) => byName.get(ref) ?? [])
}

function withCatalogCategory<T extends { category?: string; categories?: string[]; metadata?: Record<string, JSONValue> }>(
  item: T,
  parsed: unknown,
  rootDir: string,
  filePath: string,
): T {
  const category = item.category ?? catalogCategory(parsed) ?? pathCategory(rootDir, filePath)
  const parsedCategories = catalogCategories(parsed)
  const categories = Array.from(new Set([...(item.categories ?? []), ...parsedCategories, ...(category ? [category] : [])]))
  return {
    ...item,
    ...(category ? { category } : {}),
    ...(categories.length > 0 ? { categories } : {}),
    metadata: {
      ...(item.metadata ?? {}),
      ...(category ? { category } : {}),
      catalogFile: filePath,
    },
  }
}

function catalogCategory(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  return typeof value.category === 'string' && value.category.trim() ? value.category.trim() : undefined
}

function catalogCategories(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.categories)) return []
  return value.categories.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
}

function pathCategory(rootDir: string, filePath: string): string | undefined {
  const relative = filePath.startsWith(rootDir) ? filePath.slice(rootDir.length).replace(/^[/\\]/, '') : ''
  const parts = relative.split(/[/\\]/).filter(Boolean)
  if (parts.length <= 1) return undefined
  return parts[0]
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
    ...(nonEmptyString(input.modeAlias) ? { modeAlias: nonEmptyString(input.modeAlias) } : {}),
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

function normalizeLayeredSkill(input: unknown, filePath: string, warnings: string[]): SkillDefinition | undefined {
  if (!isRecord(input)) return undefined
  const id = nonEmptyString(input.id)
  const kind = input.kind === 'persona' || input.kind === 'workflow' || input.kind === 'policy' ? input.kind : undefined
  const name = nonEmptyString(input.name) ?? id
  const description = nonEmptyString(input.description) ?? ''
  const instructionTemplate = resolveInstructionTemplate(input, filePath, warnings)
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

function isNativeLayeredSkillFile(value: Record<string, unknown>): boolean {
  if (isNativeLayeredSkill(value)) return true
  return Array.isArray(value.skills) && value.skills.some((item) => isRecord(item) && isNativeLayeredSkill(item))
}

function isNativeLayeredSkill(value: Record<string, unknown>): boolean {
  return value.kind === 'persona' || value.kind === 'workflow' || value.kind === 'policy'
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

function normalizePolicyScope(value: unknown): PolicyScope | undefined {
  if (value === 'global') return 'global'
  if (!isRecord(value)) return undefined
  return {
    ...(stringArray(value.mode).length > 0 ? { mode: stringArray(value.mode) } : {}),
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
    ...(stringArray(input.mode).length > 0 ? { mode: stringArray(input.mode) } : {}),
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
    ...(positiveNumber(input.maxToolCallsPerTurn) ? { maxToolCallsPerTurn: positiveNumber(input.maxToolCallsPerTurn) } : {}),
    ...(positiveNumber(input.systemPromptCharLimit) ? { systemPromptCharLimit: positiveNumber(input.systemPromptCharLimit) } : {}),
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

function dedupeById(skills: AgentSkillManifest[]): AgentSkillManifest[] {
  const byId = new Map<string, AgentSkillManifest>()
  for (const skill of skills) byId.set(skill.id, skill)
  return Array.from(byId.values())
}

function dedupeByName(tools: RegisteredTool[]): RegisteredTool[] {
  const byName = new Map<string, RegisteredTool>()
  for (const tool of tools) byName.set(tool.name, tool)
  return Array.from(byName.values())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isJSONRecord(value: unknown): value is Record<string, JSONValue> {
  if (!isRecord(value)) return false
  return Object.values(value).every(isJSONValue)
}

function isJSONValue(value: unknown): value is JSONValue {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isJSONValue)
  return isJSONRecord(value)
}
