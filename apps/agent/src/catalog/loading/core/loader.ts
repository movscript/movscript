import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_AGENT_MANIFEST,
  type AgentManifest,
  type AgentToolGrant,
} from '../../manifest/agentManifest.js'
import { resolveAgentStatePath } from '../../../state/store/file/fileStore.js'
import {
  DEFAULT_TOOL_REGISTRY,
  StaticToolRegistry,
  mergeRegisteredTools,
  normalizeToolExecutionMetadata,
  type RegisteredTool,
  type ToolRegistry,
} from '../../../tools/registry/core/toolRegistry.js'
import type { JSONValue } from '../../../shared/protocol/types.js'
import { isJSONRecord, isRecord } from '../../../shared/json/jsonValue.js'
import { buildLayeredCatalogRegistry } from '../../registry/core/registry.js'
import { lintCatalog } from '../../validation/linter.js'
import type { AgentConfigFile, CapabilityPack, CatalogIssue, CatalogRegistry, ContextSelector, SkillActivationScope, SkillContextBudgetStrategy, SkillDefinition, SkillLoadMode, SkillTrigger, ToolDefinition } from '../../registry/shared/types.js'
import {
  listPackResourceJSONFiles,
  listPackResourceSkillFiles,
  listPluginCodexSkillFiles,
  listPluginJSONFiles,
  listPluginSkillFiles,
} from './loader-resources/resourceFiles.js'
import { parseMarkdownFrontmatter } from './loader-resources/markdownFrontmatter.js'
import {
  jsonRecord,
  nonEmptyString,
  positiveNumber,
  runRoleArray,
  stringArray,
  stringRecord,
} from './loader-normalization/values.js'

export interface AgentPluginCatalog {
  skillsDir: string
  toolsDir: string
  builtinSkillsDir: string
  builtinToolsDir: string
  packsDir: string
  builtinPacksDir: string
  configFilesDir: string
  builtinConfigFilesDir: string
  packs: CapabilityPack[]
  configFiles: AgentConfigFile[]
  layeredSkills: SkillDefinition[]
  layeredTools: ToolDefinition[]
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
  configFiles: Record<string, string>
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
  configFilesDir?: string
  builtinConfigFilesDir?: string
  baseManifest?: AgentManifest
  baseTools?: RegisteredTool[]
} = {}): AgentPluginCatalog {
  const skillsDir = options.skillsDir ?? resolveAgentSkillsDir()
  const toolsDir = options.toolsDir ?? resolveAgentToolsDir()
  const builtinSkillsDir = options.builtinSkillsDir ?? resolveBuiltinAgentSkillsDir()
  const builtinToolsDir = options.builtinToolsDir ?? resolveBuiltinAgentToolsDir()
  const packsDir = options.packsDir ?? resolveAgentPacksDir()
  const builtinPacksDir = options.builtinPacksDir ?? resolveBuiltinAgentPacksDir()
  const configFilesDir = options.configFilesDir ?? resolveAgentConfigFilesDir()
  const builtinConfigFilesDir = options.builtinConfigFilesDir ?? resolveBuiltinAgentConfigFilesDir()
  const builtinPackResult = loadPackDirectory(builtinPacksDir)
  const localPackResult = loadPackDirectory(packsDir)
  const builtinConfigFileResult = loadConfigFileDirectory(builtinConfigFilesDir)
  const localConfigFileResult = loadConfigFileDirectory(configFilesDir)
  const packs = dedupePacks([
    ...builtinPackResult.packs,
    ...localPackResult.packs,
  ])
  const builtinLayeredSkillResult = loadLayeredSkillsForPacks(builtinSkillsDir, builtinPackResult.packs, 'builtin')
  const localLayeredSkillResult = loadLayeredSkillsForPacks(skillsDir, localPackResult.packs, 'local')
  const localStandaloneCodexSkillResult = loadStandaloneCodexSkills(skillsDir)
  const builtinLayeredToolResult = loadLayeredToolsForPacks(builtinToolsDir, builtinPackResult.packs, 'runtime')
  const localLayeredToolResult = loadLayeredToolsForPacks(toolsDir, localPackResult.packs, 'local')
  const layeredSkills = dedupeLayeredSkills([
    ...builtinLayeredSkillResult.skills,
    ...localLayeredSkillResult.skills,
    ...localStandaloneCodexSkillResult.skills,
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
  const configFiles = configFilesWithEnabledPackResources(dedupeConfigFiles([
    ...builtinConfigFileResult.configFiles,
    ...localConfigFileResult.configFiles,
  ]), layeredToolGrants, packs, layeredSkills, layeredTools)
  const warnings = [
    ...builtinPackResult.warnings,
    ...localPackResult.warnings,
    ...builtinConfigFileResult.warnings,
    ...localConfigFileResult.warnings,
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
    tools: mergeToolGrants(baseManifest.tools, enabledPackToolGrants(configFiles, layeredToolGrants, packs)),
  }
  const registry = new StaticToolRegistry(mergeRegisteredTools(baseTools, layeredRegisteredTools))
  const layeredRegistry = buildLayeredCatalogRegistry({
    manifest,
    tools: baseTools,
    packs,
    configFiles,
    layeredSkills,
    layeredTools,
  })
  const catalogIssues = lintCatalog(layeredRegistry)
  const resourcePaths = {
    packs: { ...builtinPackResult.paths, ...localPackResult.paths },
    configFiles: { ...builtinConfigFileResult.paths, ...localConfigFileResult.paths },
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
    configFilesDir,
    builtinConfigFilesDir,
    packs,
    configFiles,
    layeredSkills,
    layeredTools,
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
    ...(tool.execution ? { execution: tool.execution } : {}),
    ...(tool.capability ? { capability: tool.capability } : {}),
    ...(tool.pluginId ? { pluginId: tool.pluginId } : {}),
    ...(tool.mcpServerId ? { mcpServerId: tool.mcpServerId } : {}),
    ...(tool.errorCodes ? { errorCodes: tool.errorCodes } : {}),
    ...(tool.allowedRunRoles ? { allowedRunRoles: tool.allowedRunRoles } : {}),
    ...(tool.requiresSkills ? { requiresSkills: tool.requiresSkills } : {}),
  }
}

function configFilesWithEnabledPackResources(
  configFiles: AgentConfigFile[],
  grants: AgentToolGrant[],
  packs: CapabilityPack[],
  skills: SkillDefinition[],
  tools: ToolDefinition[],
): AgentConfigFile[] {
  const packsById = new Map(packs.map((pack) => [pack.id, pack]))
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]))
  return configFiles.map((configFile) => {
    const packClosure = collectEnabledPackClosure(configFile.enabledPackIds, packsById)
    const packTools = new Set(Array.from(packClosure).flatMap((packId) => packsById.get(packId)?.tools ?? []))
    const packSkills = Array.from(packClosure).flatMap((packId) => packsById.get(packId)?.skills ?? [])
    const explicitSkillFilter = configFile.skillIds.length > 0 ? new Set(configFile.skillIds) : undefined
    const skillIds = Array.from(new Set(packSkills.filter((id) => !explicitSkillFilter || explicitSkillFilter.has(id))))
    const explicitGrants = new Map(configFile.toolGrants.map((grant) => [grant.name, grant]))
    const toolGrants = grants
      .filter((grant) => packTools.has(grant.name))
      .map((grant) => {
        const tool = toolsByName.get(grant.name)
        const defaultApproval = configFileApprovalDefault(configFile, tool)
        const explicit = explicitGrants.get(grant.name)
        if (!explicit) {
          const approval = stricterApproval(grant.approval, defaultApproval)
          return { name: grant.name, mode: grant.mode, ...(approval ? { approval } : {}) }
        }
        const approval = stricterApproval(stricterApproval(grant.approval, defaultApproval), explicit.approval)
        return {
          name: grant.name,
          mode: explicit.mode,
          ...(approval ? { approval } : {}),
        }
      })
    return {
      ...configFile,
      skillIds,
      toolGrants,
    }
  })
}

function configFileApprovalDefault(configFile: AgentConfigFile, tool: ToolDefinition | undefined): AgentConfigFile['toolGrants'][number]['approval'] {
  if (!configFile.approvalDefaults) return undefined
  return (tool ? configFile.approvalDefaults[tool.risk] : undefined) ?? configFile.approvalDefaults.default
}

function enabledPackToolGrants(
  configFiles: AgentConfigFile[],
  grants: AgentToolGrant[],
  packs: CapabilityPack[],
): AgentToolGrant[] {
  const packsById = new Map(packs.map((pack) => [pack.id, pack]))
  const enabledPackIds = new Set(configFiles.flatMap((configFile) => Array.from(collectEnabledPackClosure(configFile.enabledPackIds, packsById))))
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

export function resolveAgentConfigFilesDir(statePath = resolveAgentStatePath()): string {
  return process.env.MOVSCRIPT_AGENT_CONFIG_FILES_DIR || join(dirname(statePath), 'config-files')
}

export function resolveBuiltinAgentConfigFilesDir(): string {
  return resolveCatalogDir('config-files')
}

function resolveCatalogDir(kind: 'skills' | 'tools' | 'packs' | 'config-files'): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(moduleDir, '..', '..', '..', '..', 'catalog', kind),
    resolve(moduleDir, '..', '..', '..', 'catalog', kind),
    resolve(moduleDir, '..', '..', 'catalog', kind),
    resolve(moduleDir, '..', 'catalog', kind),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
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

function loadConfigFileDirectory(dir: string): { configFiles: AgentConfigFile[]; warnings: string[]; paths: Record<string, string> } {
  const warnings: string[] = []
  const configFiles: AgentConfigFile[] = []
  const paths: Record<string, string> = {}
  for (const filePath of listPluginJSONFiles(dir)) {
    const parsed = readJSONFile(filePath, warnings)
    if (parsed === undefined) continue
    const configFile = normalizeAgentConfigFile(parsed, filePath, warnings)
    if (configFile) {
      configFiles.push(configFile)
      paths[configFile.id] = filePath
    }
  }
  return { configFiles: dedupeConfigFiles(configFiles), warnings, paths }
}

function loadLayeredSkillsForPacks(rootDir: string, packs: CapabilityPack[], fallbackSource: SkillDefinition['source']): { skills: SkillDefinition[]; warnings: string[]; paths: Record<string, string> } {
  const warnings: string[] = []
  const skills: SkillDefinition[] = []
  const paths: Record<string, string> = {}
  for (const pack of packs) {
    const defaultSource = skillSourceForPack(pack, fallbackSource)
    for (const filePath of listPackResourceSkillFiles(rootDir, [pack], warnings)) {
      const normalizedSkills = normalizeLayeredSkillResource(filePath, warnings, defaultSource)
      skills.push(...normalizedSkills)
      for (const skill of normalizedSkills) paths[skill.id] = filePath
    }
  }
  return { skills: dedupeLayeredSkills(skills), warnings, paths }
}

function loadStandaloneCodexSkills(rootDir: string): { skills: SkillDefinition[]; warnings: string[]; paths: Record<string, string> } {
  const warnings: string[] = []
  const skills: SkillDefinition[] = []
  const paths: Record<string, string> = {}
  for (const filePath of listPluginCodexSkillFiles(rootDir)) {
    const skill = normalizeCodexSkillFile(filePath, warnings, 'local')
    if (!skill) continue
    skills.push(skill)
    paths[skill.id] = filePath
  }
  return { skills: dedupeLayeredSkills(skills), warnings, paths }
}

function loadLayeredToolsForPacks(rootDir: string, packs: CapabilityPack[], fallbackSource: ToolDefinition['source']): { tools: ToolDefinition[]; warnings: string[]; paths: Record<string, string> } {
  const warnings: string[] = []
  const tools: ToolDefinition[] = []
  const paths: Record<string, string> = {}
  for (const pack of packs) {
    const defaultSource = toolSourceForPack(pack, fallbackSource)
    for (const filePath of listPackResourceJSONFiles(rootDir, [pack], 'tools', warnings, /\.tool\.json$/i)) {
      const parsed = readJSONFile(filePath, warnings)
      if (parsed === undefined) continue
      const tool = normalizeLayeredTool(parsed, filePath, warnings, defaultSource)
      if (tool) {
        tools.push(tool)
        paths[tool.name] = filePath
      }
    }
  }
  return { tools: dedupeLayeredTools(tools), warnings, paths }
}

function loadLayeredSkillDirectory(dir: string): { skills: SkillDefinition[]; warnings: string[]; paths: Record<string, string> } {
  const warnings: string[] = []
  const skills: SkillDefinition[] = []
  const paths: Record<string, string> = {}
  for (const filePath of listPluginSkillFiles(dir)) {
    const normalizedSkills = normalizeLayeredSkillResource(filePath, warnings, 'local')
    skills.push(...normalizedSkills)
    for (const skill of normalizedSkills) paths[skill.id] = filePath
  }
  return { skills: dedupeLayeredSkills(skills), warnings, paths }
}

function loadLayeredToolDirectory(dir: string, defaultSource: ToolDefinition['source']): { tools: ToolDefinition[]; warnings: string[]; paths: Record<string, string> } {
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

function toolSourceForPack(pack: CapabilityPack, fallbackSource: ToolDefinition['source']): ToolDefinition['source'] {
  if (pack.source === 'builtin') return 'runtime'
  if (pack.source === 'mcp') return 'mcp'
  if (pack.source === 'plugin') return 'plugin'
  if (pack.source === 'local' || pack.source === 'team') return 'local'
  return fallbackSource
}

function skillSourceForPack(pack: CapabilityPack, fallbackSource: SkillDefinition['source']): SkillDefinition['source'] {
  if (pack.source === 'builtin') return 'builtin'
  if (pack.source === 'mcp') return 'mcp'
  if (pack.source === 'plugin') return 'plugin'
  if (pack.source === 'team') return 'team'
  if (pack.source === 'local') return 'local'
  return fallbackSource
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
  const source = input.source === 'plugin'
    || input.source === 'mcp'
    || input.source === 'local'
    || input.source === 'team'
    || input.source === 'builtin'
    ? input.source
    : 'builtin'
  return {
    id,
    version,
    name,
    ...(nonEmptyString(input.description) ? { description: nonEmptyString(input.description) } : {}),
    source,
    ...(normalizePackResources(input.resources) ? { resources: normalizePackResources(input.resources) } : {}),
    schemas: stringArray(input.schemas),
    tools: stringArray(input.tools),
    skills: stringArray(input.skills),
    ...(stringArray(input.reference).length > 0 ? { reference: stringArray(input.reference) } : {}),
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
  }
  return resources.skills || resources.tools ? resources : undefined
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

function normalizeAgentConfigFile(input: unknown, filePath: string, warnings: string[]): AgentConfigFile | undefined {
  if (!isRecord(input)) return undefined
  if (input.schema !== 'movscript.agent.config_file.v1') {
    warnings.push(`${filePath} is not an agent config file: schema must be movscript.agent.config_file.v1`)
    return undefined
  }
  const id = nonEmptyString(input.id)
  const version = nonEmptyString(input.version) ?? '1.0.0'
  const name = nonEmptyString(input.name) ?? id
  if (!id || !name) {
    warnings.push(`${filePath} is not a valid agent config file: id is required`)
    return undefined
  }
  return {
    schema: 'movscript.agent.config_file.v1',
    id,
    version,
    name,
    ...(nonEmptyString(input.description) ? { description: nonEmptyString(input.description) } : {}),
    enabledPackIds: stringArray(input.enabledPackIds),
    skillIds: stringArray(input.skillIds),
    ...(isRecord(input.approvalDefaults) ? { approvalDefaults: normalizeConfigFileApprovalDefaults(input.approvalDefaults) } : {}),
    toolGrants: normalizeConfigFileToolGrants(input.toolGrants),
    ...(isRecord(input.model) ? { model: normalizeConfigFileModel(input.model) } : {}),
    ...(isRecord(input.limits) ? { limits: normalizeConfigFileLimits(input.limits) } : {}),
    ...(jsonRecord(input.metadata) ? { metadata: jsonRecord(input.metadata) } : {}),
  }
}

function normalizeLayeredSkillFile(input: unknown, filePath: string, warnings: string[], defaultSource: SkillDefinition['source']): SkillDefinition[] {
  if (Array.isArray(input)) return input.flatMap((item) => normalizeLayeredSkill(item, filePath, warnings, defaultSource) ?? [])
  if (isRecord(input) && Array.isArray(input.skills)) {
    return input.skills.flatMap((item) => normalizeLayeredSkill(item, filePath, warnings, defaultSource) ?? [])
  }
  const skill = normalizeLayeredSkill(input, filePath, warnings, defaultSource)
  return skill ? [skill] : []
}

function normalizeLayeredSkillResource(filePath: string, warnings: string[], defaultSource: SkillDefinition['source']): SkillDefinition[] {
  if (/\.md$/i.test(filePath)) {
    const skill = normalizeCodexSkillFile(filePath, warnings, defaultSource)
    return skill ? [skill] : []
  }
  const parsed = readJSONFile(filePath, warnings)
  if (parsed === undefined) return []
  return normalizeLayeredSkillFile(parsed, filePath, warnings, defaultSource)
}

function normalizeCodexSkillFile(filePath: string, warnings: string[], defaultSource: SkillDefinition['source']): SkillDefinition | undefined {
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
  const toolScope: SkillDefinition['toolScope'] = input.toolScope === 'union' || input.toolScope === 'intersect' ? input.toolScope : undefined
  const source = normalizeSkillSource(input.source) ?? defaultSource
  const base = {
    id,
    version: nonEmptyString(input.version) ?? '1.0.0',
    name,
    description,
    priority: typeof input.priority === 'number' && Number.isFinite(input.priority) ? input.priority : defaultCatalogSkillPriority(),
    enabled: input.enabled !== false,
    instructionTemplate: body,
    loadMode,
    source,
    sourcePath: filePath,
    ...(tags.length > 0 ? { tags } : {}),
    ...(aliases.length > 0 ? { aliases } : {}),
    ...(useWhen.length > 0 ? { useWhen } : {}),
    ...(stringArray(input.dependencies).length > 0 ? { dependencies: stringArray(input.dependencies) } : {}),
    ...(stringArray(input.conflicts).length > 0 ? { conflicts: stringArray(input.conflicts) } : {}),
    ...(typeof input.tokenEstimate === 'number' && Number.isFinite(input.tokenEstimate) ? { tokenEstimate: Math.max(0, Math.floor(input.tokenEstimate)) } : {}),
    ...(normalizeSkillContextBudget(input.contextBudget) ? { contextBudget: normalizeSkillContextBudget(input.contextBudget) } : {}),
    ...(activationScope ? { activationScope } : {}),
    ...(normalizeSkillTriggers(input.triggers).length > 0 ? { triggers: normalizeSkillTriggers(input.triggers) } : {}),
    ...(stringArray(input.toolGrants).length > 0 ? { toolGrants: stringArray(input.toolGrants) } : {}),
    ...(toolScope ? { toolScope } : {}),
    ...(stringArray(input.schemaRefs).length > 0 ? { schemaRefs: stringArray(input.schemaRefs) } : {}),
    ...(nonEmptyString(input.outputContract) ? { outputContract: nonEmptyString(input.outputContract) } : {}),
    metadata: {
      ...(jsonRecord(input.metadata) ?? {}),
      codexSkill: true,
      sourcePath: filePath,
      loadMode,
    },
  }
  return {
    ...base,
    triggers: base.triggers ?? defaultCodexSkillTriggers(name, aliases, useWhen),
  } as SkillDefinition
}

function normalizeLayeredSkill(input: unknown, filePath: string, warnings: string[], defaultSource: SkillDefinition['source']): SkillDefinition | undefined {
  if (!isRecord(input)) return undefined
  const id = nonEmptyString(input.id)
  const name = nonEmptyString(input.name) ?? id
  const description = nonEmptyString(input.description) ?? ''
  const instructionTemplate = resolveInstructionTemplate(input, filePath, warnings)
  const loadMode = normalizeSkillLoadMode(input.loadMode) ?? normalizeSkillLoadMode(input.load)
  const activationScope = normalizeSkillActivationScope(input.activationScope) ?? normalizeSkillActivationScope(input.scope)
  const toolScope: SkillDefinition['toolScope'] = input.toolScope === 'union' || input.toolScope === 'intersect' ? input.toolScope : undefined
  const source = normalizeSkillSource(input.source) ?? defaultSource
  if (!id || !name || !instructionTemplate) {
    warnings.push(`${filePath} is not a valid skill: id, name, and instructionTemplate or instructionTemplatePath are required`)
    return undefined
  }
  const base = {
    id,
    version: nonEmptyString(input.version) ?? '1.0.0',
    name,
    description,
    priority: typeof input.priority === 'number' && Number.isFinite(input.priority) ? input.priority : defaultCatalogSkillPriority(),
    enabled: input.enabled !== false,
    instructionTemplate,
    ...(loadMode ? { loadMode } : {}),
    source,
    ...(nonEmptyString(input.sourcePath) ? { sourcePath: nonEmptyString(input.sourcePath) } : {}),
    ...(stringArray(input.tags).length > 0 ? { tags: stringArray(input.tags) } : {}),
    ...(stringArray(input.aliases).length > 0 ? { aliases: stringArray(input.aliases) } : {}),
    ...(stringArray(input.useWhen).length > 0 ? { useWhen: stringArray(input.useWhen) } : {}),
    ...(stringArray(input.dependencies).length > 0 ? { dependencies: stringArray(input.dependencies) } : {}),
    ...(stringArray(input.conflicts).length > 0 ? { conflicts: stringArray(input.conflicts) } : {}),
    ...(typeof input.tokenEstimate === 'number' && Number.isFinite(input.tokenEstimate) ? { tokenEstimate: Math.max(0, Math.floor(input.tokenEstimate)) } : {}),
    ...(normalizeSkillContextBudget(input.contextBudget) ? { contextBudget: normalizeSkillContextBudget(input.contextBudget) } : {}),
    ...(activationScope ? { activationScope } : {}),
    ...(normalizeSkillTriggers(input.triggers).length > 0 ? { triggers: normalizeSkillTriggers(input.triggers) } : {}),
    ...(stringArray(input.toolGrants).length > 0 ? { toolGrants: stringArray(input.toolGrants) } : {}),
    ...(toolScope ? { toolScope } : {}),
    ...(stringArray(input.schemaRefs).length > 0 ? { schemaRefs: stringArray(input.schemaRefs) } : {}),
    ...(nonEmptyString(input.outputContract) ? { outputContract: nonEmptyString(input.outputContract) } : {}),
    ...(isJSONRecord(input.metadata) ? { metadata: input.metadata } : {}),
  }
  return base as SkillDefinition
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

function normalizeLayeredTool(input: unknown, filePath: string, warnings: string[], defaultSource: ToolDefinition['source']): ToolDefinition | undefined {
  if (!isRecord(input)) return undefined
  const name = nonEmptyString(input.name)
  const description = nonEmptyString(input.description)
  const permission = nonEmptyString(input.permission)
  const risk = input.risk === 'read' || input.risk === 'workspace' || input.risk === 'write' || input.risk === 'generate' || input.risk === 'destructive' || input.risk === 'ui'
    ? input.risk
    : undefined
  if (!name || !description || !permission || !risk || !isRecord(input.inputSchema)) {
    warnings.push(`${filePath} is not a valid tool: name, description, permission, risk, and inputSchema are required`)
    return undefined
  }
  const source = input.source === 'runtime' || input.source === 'local' || input.source === 'plugin' || input.source === 'mcp' ? input.source : defaultSource
  return {
    name,
    description,
    inputSchema: input.inputSchema,
    ...(isRecord(input.outputSchema) ? { outputSchema: input.outputSchema } : {}),
    permission,
    risk,
    projectScoped: input.projectScoped === true,
    defaults: normalizeLayeredToolDefaults(input.defaults),
    execution: normalizeToolExecutionMetadata(input.execution, risk),
    source,
    ...(nonEmptyString(input.capability) ? { capability: nonEmptyString(input.capability) } : {}),
    ...(nonEmptyString(input.pluginId) ? { pluginId: nonEmptyString(input.pluginId) } : {}),
    ...(nonEmptyString(input.mcpServerId) ? { mcpServerId: nonEmptyString(input.mcpServerId) } : {}),
    ...(stringArray(input.errorCodes).length > 0 ? { errorCodes: stringArray(input.errorCodes) } : {}),
    ...(runRoleArray(input.allowedRunRoles).length > 0 ? { allowedRunRoles: runRoleArray(input.allowedRunRoles) } : {}),
    ...(stringArray(input.requiresSkills).length > 0 ? { requiresSkills: stringArray(input.requiresSkills) } : {}),
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

function normalizeSkillLoadMode(value: unknown): SkillLoadMode | undefined {
  return value === 'core' || value === 'on_demand' || value === 'manual' ? value : undefined
}

function normalizeSkillSource(value: unknown): SkillDefinition['source'] | undefined {
  return value === 'builtin' || value === 'local' || value === 'plugin' || value === 'team' || value === 'mcp' ? value : undefined
}

function normalizeSkillActivationScope(value: unknown): SkillActivationScope | undefined {
  return value === 'turn' || value === 'run' || value === 'thread' ? value : undefined
}

function normalizeSkillContextBudget(value: unknown): SkillDefinition['contextBudget'] | undefined {
  if (!isRecord(value)) return undefined
  const maxChars = positiveNumber(value.maxChars)
  const reserveRatioRaw = typeof value.reserveRatio === 'number' ? value.reserveRatio : Number(value.reserveRatio)
  const reserveRatio = Number.isFinite(reserveRatioRaw) && reserveRatioRaw > 0 && reserveRatioRaw <= 1 ? reserveRatioRaw : undefined
  const strategy: SkillContextBudgetStrategy | undefined = value.strategy === 'fixed' || value.strategy === 'proportional' || value.strategy === 'opportunistic' ? value.strategy : undefined
  const budget = {
    ...(maxChars ? { maxChars: Math.floor(maxChars) } : {}),
    ...(reserveRatio ? { reserveRatio } : {}),
    ...(strategy ? { strategy } : {}),
  }
  return Object.keys(budget).length > 0 ? budget : undefined
}

function defaultCatalogSkillPriority(): number {
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

function defaultCodexSkillTriggers(name: string, aliases: string[], useWhen: string[]): SkillTrigger[] {
  const keywords = stringArray([name, ...aliases, ...useWhen].filter((item) => item.length <= 80))
  return [{ kind: 'keyword', any: keywords.length > 0 ? keywords : [name] }]
}

function normalizeSkillTriggers(value: unknown): SkillTrigger[] {
  if (!Array.isArray(value)) return []
  const triggers: SkillTrigger[] = []
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
    ...(stringArray(input.workspaceStatus).length > 0 ? { workspaceStatus: stringArray(input.workspaceStatus).filter((item) => item === 'proposed' || item === 'confirmed' || item === 'superseded') as never } : {}),
    ...(typeof input.hasProjectId === 'boolean' ? { hasProjectId: input.hasProjectId } : {}),
    ...(typeof input.hasProductionId === 'boolean' ? { hasProductionId: input.hasProductionId } : {}),
  }
}

function normalizeConfigFileToolGrants(value: unknown): AgentConfigFile['toolGrants'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const grant = normalizeToolGrant(item)
    return grant ? [grant] : []
  })
}

function normalizeConfigFileApprovalDefaults(input: Record<string, unknown>): NonNullable<AgentConfigFile['approvalDefaults']> | undefined {
  const defaults: NonNullable<AgentConfigFile['approvalDefaults']> = {}
  for (const key of ['default', 'read', 'workspace', 'write', 'generate', 'destructive', 'ui'] as const) {
    const approval = input[key]
    if (approval === 'never' || approval === 'always' || approval === 'on_write') defaults[key] = approval
  }
  return Object.keys(defaults).length > 0 ? defaults : undefined
}

function normalizeConfigFileModel(input: Record<string, unknown>): NonNullable<AgentConfigFile['model']> {
  const provider = input.provider === 'anthropic' || input.provider === 'openai' || input.provider === 'azure' || input.provider === 'custom'
    ? input.provider
    : 'custom'
  return {
    provider,
    modelId: nonEmptyString(input.modelId) ?? 'default',
    ...(nonEmptyString(input.platformModelId) ? { platformModelId: nonEmptyString(input.platformModelId) } : {}),
  }
}

function normalizeConfigFileLimits(input: Record<string, unknown>): NonNullable<AgentConfigFile['limits']> {
  return {
    ...(positiveNumber(input.maxToolCalls) ? { maxToolCalls: positiveNumber(input.maxToolCalls) } : {}),
    ...(positiveNumber(input.maxIterations) ? { maxIterations: positiveNumber(input.maxIterations) } : {}),
    ...(input.executionMode === 'compact' || input.executionMode === 'standard' || input.executionMode === 'deep' ? { executionMode: input.executionMode } : {}),
    ...(typeof input.allowForcedToolCalls === 'boolean' ? { allowForcedToolCalls: input.allowForcedToolCalls } : {}),
    ...(positiveNumber(input.maxActiveTriggeredSkills) ? { maxActiveTriggeredSkills: positiveNumber(input.maxActiveTriggeredSkills) } : {}),
    ...(positiveNumber(input.systemPromptCharLimit) ? { systemPromptCharLimit: positiveNumber(input.systemPromptCharLimit) } : {}),
    ...(positiveNumber(input.contextWindowCharLimit) ? { contextWindowCharLimit: positiveNumber(input.contextWindowCharLimit) } : {}),
    ...(positiveNumber(input.maxRetrievedContextChars) ? { maxRetrievedContextChars: positiveNumber(input.maxRetrievedContextChars) } : {}),
    ...(positiveNumber(input.maxReferenceCharsPerRun) ? { maxReferenceCharsPerRun: positiveNumber(input.maxReferenceCharsPerRun) } : {}),
    ...(positiveNumber(input.maxReferenceChunksPerRun) ? { maxReferenceChunksPerRun: positiveNumber(input.maxReferenceChunksPerRun) } : {}),
    ...(positiveNumber(input.maxHistoryMessages) ? { maxHistoryMessages: positiveNumber(input.maxHistoryMessages) } : {}),
    ...(positiveNumber(input.maxThreadSummaryChars) ? { maxThreadSummaryChars: positiveNumber(input.maxThreadSummaryChars) } : {}),
  }
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

function dedupeConfigFiles(configFiles: AgentConfigFile[]): AgentConfigFile[] {
  const byId = new Map<string, AgentConfigFile>()
  for (const configFile of configFiles) byId.set(configFile.id, configFile)
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
