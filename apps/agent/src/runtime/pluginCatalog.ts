import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_AGENT_MANIFEST,
  mergeAgentManifestSkills,
  normalizeAgentSkillManifest,
  type AgentManifest,
  type AgentSkillManifest,
  type AgentToolGrant,
} from './agentManifest.js'
import { resolveAgentStatePath } from './fileStore.js'
import {
  DEFAULT_TOOL_REGISTRY,
  StaticToolRegistry,
  mergeRegisteredTools,
  normalizeRegisteredTool,
  type RegisteredTool,
  type ToolRegistry,
} from './toolRegistry.js'

export interface AgentPluginCatalog {
  skillsDir: string
  toolsDir: string
  builtinSkillsDir: string
  builtinToolsDir: string
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
  baseManifest?: AgentManifest
  baseTools?: RegisteredTool[]
} = {}): AgentPluginCatalog {
  const skillsDir = options.skillsDir ?? resolveAgentSkillsDir()
  const toolsDir = options.toolsDir ?? resolveAgentToolsDir()
  const builtinSkillsDir = options.builtinSkillsDir ?? resolveBuiltinAgentSkillsDir()
  const builtinToolsDir = options.builtinToolsDir ?? resolveBuiltinAgentToolsDir()
  const builtinSkillResult = loadSkillDirectory(builtinSkillsDir)
  const localSkillResult = loadSkillDirectory(skillsDir)
  const builtinToolResult = loadToolDirectory(builtinToolsDir)
  const localToolResult = loadToolDirectory(toolsDir)
  const skillResult = {
    skills: dedupeById([...builtinSkillResult.skills, ...localSkillResult.skills]),
    warnings: [...builtinSkillResult.warnings, ...localSkillResult.warnings],
  }
  const toolResult = {
    tools: dedupeByName([...builtinToolResult.tools, ...localToolResult.tools]),
    grants: mergeToolGrants([], [...builtinToolResult.grants, ...localToolResult.grants]),
    warnings: [...builtinToolResult.warnings, ...localToolResult.warnings],
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
    skills: skillResult.skills,
    tools: toolResult.tools,
    toolGrants: toolResult.grants,
    manifest,
    registry,
    warnings: [...skillResult.warnings, ...toolResult.warnings],
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

function resolveCatalogDir(kind: 'skills' | 'tools'): string {
  const fromSource = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'catalog', kind)
  const fromDist = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'catalog', kind)
  return existsSync(fromSource) ? fromSource : fromDist
}

function loadSkillDirectory(dir: string): { skills: AgentSkillManifest[]; warnings: string[] } {
  const warnings: string[] = []
  const skills: AgentSkillManifest[] = []
  for (const filePath of listPluginJSONFiles(dir)) {
    const parsed = readJSONFile(filePath, warnings)
    if (parsed === undefined) continue
    for (const skill of extractSkills(parsed)) {
      skills.push(skill)
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
    tools.push(...bundle.tools)
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
  for (const entry of readdirSync(dir).sort()) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isFile() && entry.endsWith('.json')) {
      files.push(fullPath)
      continue
    }
    if (stat.isDirectory()) {
      for (const candidate of ['manifest.json', 'skills.json', 'skill.json', 'tools.json', 'tool.json']) {
        const candidatePath = join(fullPath, candidate)
        if (existsSync(candidatePath) && statSync(candidatePath).isFile()) files.push(candidatePath)
      }
    }
  }
  return files
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

function mergeToolGrants(base: AgentToolGrant[], next: AgentToolGrant[]): AgentToolGrant[] {
  const byName = new Map<string, AgentToolGrant>()
  for (const grant of base) byName.set(grant.name, grant)
  for (const grant of next) byName.set(grant.name, grant)
  return Array.from(byName.values())
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
