import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_AGENT_MANIFEST,
  mergeAgentManifestSkills,
  normalizeAgentSkillManifest,
  type AgentManifest,
  type AgentSkillManifest,
  type AgentToolGrant,
} from './agentManifest.js'
import { resolveAgentStatePath } from '../runtime/store/fileStore.js'
import {
  DEFAULT_TOOL_REGISTRY,
  StaticToolRegistry,
  mergeRegisteredTools,
  normalizeRegisteredTool,
  type RegisteredTool,
  type ToolRegistry,
} from '../tools/toolRegistry.js'
import type { JSONValue } from '../types.js'

export interface AgentPluginBundle {
  id: string
  name: string
  description?: string
  category?: string
  categories?: string[]
  skills: string[]
  tools: string[]
  metadata?: Record<string, JSONValue>
}

export interface AgentPluginCatalog {
  skillsDir: string
  toolsDir: string
  builtinSkillsDir: string
  builtinToolsDir: string
  bundlesDir: string
  builtinBundlesDir: string
  bundles: AgentPluginBundle[]
  activeBundleIds: string[]
  availableBundleIds: string[]
  skills: AgentSkillManifest[]
  tools: RegisteredTool[]
  toolGrants: AgentToolGrant[]
  manifest: AgentManifest
  registry: ToolRegistry
  warnings: string[]
}

export function loadAgentPluginCatalog(options: {
  skillsDir?: string
  toolsDir?: string
  builtinSkillsDir?: string
  builtinToolsDir?: string
  bundlesDir?: string
  builtinBundlesDir?: string
  enabledBundleIds?: string[]
  baseManifest?: AgentManifest
  baseTools?: RegisteredTool[]
} = {}): AgentPluginCatalog {
  const skillsDir = options.skillsDir ?? resolveAgentSkillsDir()
  const toolsDir = options.toolsDir ?? resolveAgentToolsDir()
  const builtinSkillsDir = options.builtinSkillsDir ?? resolveBuiltinAgentSkillsDir()
  const builtinToolsDir = options.builtinToolsDir ?? resolveBuiltinAgentToolsDir()
  const bundlesDir = options.bundlesDir ?? resolveAgentBundlesDir()
  const builtinBundlesDir = options.builtinBundlesDir ?? resolveBuiltinAgentBundlesDir()
  const builtinSkillResult = loadSkillDirectory(builtinSkillsDir)
  const localSkillResult = loadSkillDirectory(skillsDir)
  const builtinToolResult = loadToolDirectory(builtinToolsDir)
  const localToolResult = loadToolDirectory(toolsDir)
  const builtinBundleResult = loadBundleDirectory(builtinBundlesDir)
  const localBundleResult = loadBundleDirectory(bundlesDir)
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
  const bundles = dedupeByBundleId([
    ...builtinBundleResult.bundles,
    ...localBundleResult.bundles,
  ])
  const availableBundleIds = bundles.map((bundle) => bundle.id)
  const missingEnabledBundleIds = (options.enabledBundleIds ?? []).filter((id) => !availableBundleIds.includes(id))
  const activeBundles = options.enabledBundleIds
    ? bundles.filter((bundle) => options.enabledBundleIds!.includes(bundle.id))
    : bundles
  const bundleSkillRefs = Array.from(new Set(activeBundles.flatMap((bundle) => bundle.skills)))
  const bundleToolRefs = Array.from(new Set(activeBundles.flatMap((bundle) => bundle.tools)))
  const useBundleSelection = options.enabledBundleIds !== undefined || bundleSkillRefs.length > 0 || bundleToolRefs.length > 0
  const selectedSkillRefs = useBundleSelection ? bundleSkillRefs : skillDefinitions.map((skill) => skill.id)
  const selectedToolRefs = useBundleSelection ? bundleToolRefs : toolDefinitions.map((tool) => tool.name)
  const skillResult = {
    skills: resolveSkillRefs(selectedSkillRefs, skillDefinitions),
    warnings: [
      ...builtinSkillResult.warnings,
      ...localSkillResult.warnings,
      ...builtinBundleResult.warnings,
      ...localBundleResult.warnings,
      ...missingEnabledBundleIds.map((id) => `enabled bundle not found: ${id}`),
      ...missingSkillWarnings(selectedSkillRefs, skillDefinitions),
    ],
  }
  const toolResult = {
    tools: resolveToolRefs(selectedToolRefs, toolDefinitions),
    grants: mergeToolGrants([], [
      ...definitionGrants.filter((grant) => selectedToolRefs.includes(grant.name)),
    ]),
    warnings: [
      ...builtinToolResult.warnings,
      ...localToolResult.warnings,
      ...builtinBundleResult.warnings,
      ...localBundleResult.warnings,
      ...missingEnabledBundleIds.map((id) => `enabled bundle not found: ${id}`),
      ...missingToolWarnings(selectedToolRefs, toolDefinitions),
    ],
  }
  const baseManifest = options.baseManifest ?? DEFAULT_AGENT_MANIFEST
  const baseTools = options.baseTools ?? DEFAULT_TOOL_REGISTRY.list()
  const manifest = mergeAgentManifestSkills({
    ...baseManifest,
    tools: mergeToolGrants(baseManifest.tools, toolResult.grants),
    permissions: mergePermissions(baseManifest.permissions, toolResult.tools),
  }, skillResult.skills)
  const registry = new StaticToolRegistry(mergeRegisteredTools(baseTools, toolResult.tools))

  return {
    skillsDir,
    toolsDir,
    builtinSkillsDir,
    builtinToolsDir,
    bundlesDir,
    builtinBundlesDir,
    bundles,
    activeBundleIds: activeBundles.map((bundle) => bundle.id),
    availableBundleIds,
    skills: skillResult.skills,
    tools: toolResult.tools,
    toolGrants: toolResult.grants,
    manifest,
    registry,
    warnings: Array.from(new Set([...skillResult.warnings, ...toolResult.warnings])),
  }
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

export function resolveAgentBundlesDir(statePath = resolveAgentStatePath()): string {
  return process.env.MOVSCRIPT_AGENT_BUNDLES_DIR || join(dirname(statePath), 'bundles')
}

export function resolveBuiltinAgentBundlesDir(): string {
  return resolveCatalogDir('bundles')
}

function resolveCatalogDir(kind: 'skills' | 'tools' | 'bundles'): string {
  const fromSource = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'catalog', kind)
  const fromDist = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'catalog', kind)
  return existsSync(fromSource) ? fromSource : fromDist
}

function loadBundleDirectory(dir: string): { bundles: AgentPluginBundle[]; warnings: string[] } {
  const warnings: string[] = []
  const bundles: AgentPluginBundle[] = []
  for (const filePath of listPluginJSONFiles(dir)) {
    const parsed = readJSONFile(filePath, warnings)
    if (parsed === undefined) continue
    const bundle = extractBundle(parsed, dir, filePath, warnings)
    if (bundle) bundles.push(bundle)
  }
  return {
    bundles: dedupeByBundleId(bundles),
    warnings,
  }
}

function loadSkillDirectory(dir: string): { skills: AgentSkillManifest[]; warnings: string[] } {
  const warnings: string[] = []
  const skills: AgentSkillManifest[] = []
  for (const filePath of listPluginJSONFiles(dir)) {
    const parsed = readJSONFile(filePath, warnings)
    if (parsed === undefined) continue
    for (const skill of extractSkills(parsed)) {
      skills.push(withCatalogCategory(skill, parsed, dir, filePath))
    }
  }
  return { skills: dedupeById(skills), warnings }
}

function loadToolDirectory(dir: string): { tools: RegisteredTool[]; grants: AgentToolGrant[]; warnings: string[] } {
  const warnings: string[] = []
  const tools: RegisteredTool[] = []
  const grants: AgentToolGrant[] = []
  for (const filePath of listPluginJSONFiles(dir)) {
    const parsed = readJSONFile(filePath, warnings)
    if (parsed === undefined) continue
    const bundle = extractTools(parsed)
    tools.push(...bundle.tools.map((tool) => withCatalogCategory(tool, parsed, dir, filePath)))
    grants.push(...bundle.grants)
  }
  return {
    tools: dedupeByName(tools),
    grants: mergeToolGrants([], grants),
    warnings,
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

function extractSkills(value: unknown): AgentSkillManifest[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeAgentSkillManifest(item) ?? [])
  if (!isRecord(value)) return []
  if (Array.isArray(value.skills)) return value.skills.flatMap((item) => normalizeAgentSkillManifest(item) ?? [])
  const skill = normalizeAgentSkillManifest(value)
  return skill ? [skill] : []
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

function extractSkillRefs(value: unknown, filePath: string, warnings: string[]): string[] {
  if (!isRecord(value) || !Array.isArray(value.skills)) return []
  return value.skills.flatMap((item) => {
    if (typeof item === 'string' && item.trim()) return [item.trim()]
    if (isRecord(item)) {
      const ref = typeof item.ref === 'string' && item.ref.trim()
        ? item.ref.trim()
        : typeof item.id === 'string' && item.id.trim() && !('instruction' in item)
          ? item.id.trim()
          : undefined
      if (ref) return [ref]
    }
    warnings.push(`${filePath} contains inline skill content; bundles must reference reusable skill ids only`)
    return []
  })
}

function extractToolRefs(value: unknown, filePath: string, warnings: string[]): string[] {
  if (!isRecord(value) || !Array.isArray(value.tools)) return []
  return value.tools.flatMap((item) => {
    if (typeof item === 'string' && item.trim()) return [item.trim()]
    if (isRecord(item)) {
      const ref = typeof item.ref === 'string' && item.ref.trim()
        ? item.ref.trim()
        : typeof item.name === 'string' && item.name.trim() && !('description' in item)
          ? item.name.trim()
          : undefined
      if (ref) return [ref]
    }
    warnings.push(`${filePath} contains inline tool content; bundles must reference reusable tool names only`)
    return []
  })
}

function extractBundle(value: unknown, rootDir: string, filePath: string, warnings: string[]): AgentPluginBundle | undefined {
  if (!isRecord(value)) return undefined
  const skills = extractSkillRefs(value, filePath, warnings)
  const tools = extractToolRefs(value, filePath, warnings)
  if (skills.length === 0 && tools.length === 0) return undefined
  const id = nonEmptyString(value.id) ?? fallbackBundleId(rootDir, filePath)
  const name = nonEmptyString(value.name) ?? id
  const category = nonEmptyString(value.category) ?? pathCategory(rootDir, filePath)
  const categories = Array.from(new Set([
    ...catalogCategories(value),
    ...(category ? [category] : []),
  ]))
  return {
    id,
    name,
    ...(nonEmptyString(value.description) ? { description: nonEmptyString(value.description) } : {}),
    ...(category ? { category } : {}),
    ...(categories.length > 0 ? { categories } : {}),
    skills: Array.from(new Set(skills)),
    tools: Array.from(new Set(tools)),
    metadata: {
      ...(category ? { category } : {}),
      catalogFile: filePath,
    },
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

function missingSkillWarnings(refs: string[], definitions: AgentSkillManifest[]): string[] {
  const known = new Set(definitions.map((skill) => skill.id))
  return refs.filter((ref) => !known.has(ref)).map((ref) => `bundle references unknown skill: ${ref}`)
}

function missingToolWarnings(refs: string[], definitions: RegisteredTool[]): string[] {
  const known = new Set(definitions.map((tool) => tool.name))
  return refs.filter((ref) => !known.has(ref)).map((ref) => `bundle references unknown tool: ${ref}`)
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

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function mergeToolGrants(base: AgentToolGrant[], next: AgentToolGrant[]): AgentToolGrant[] {
  const byName = new Map<string, AgentToolGrant>()
  for (const grant of base) byName.set(grant.name, grant)
  for (const grant of next) byName.set(grant.name, grant)
  return Array.from(byName.values())
}

function dedupeByBundleId(bundles: AgentPluginBundle[]): AgentPluginBundle[] {
  const byId = new Map<string, AgentPluginBundle>()
  for (const bundle of bundles) byId.set(bundle.id, bundle)
  return Array.from(byId.values())
}

function fallbackBundleId(rootDir: string, filePath: string): string {
  const relative = filePath.startsWith(rootDir) ? filePath.slice(rootDir.length).replace(/^[/\\]/, '') : basename(filePath)
  return `catalog.bundle.${relative.replace(/\.json$/i, '').split(/[/\\]/).filter(Boolean).join('.')}`
}

function mergePermissions(base: string[], tools: RegisteredTool[]): string[] {
  return Array.from(new Set([...base, ...tools.map((tool) => tool.permission)]))
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
