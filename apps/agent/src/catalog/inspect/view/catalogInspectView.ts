import type { JSONValue } from '../../../shared/protocol/types.js'
import type { AgentManifest } from '../../manifest/agentManifest.js'
import type { AgentConfigFile, CapabilityPack, CatalogRegistry, SkillDefinition, ToolDefinition } from '../../registry/shared/types.js'

export type CatalogInspectView = 'summary' | 'pack' | 'skill' | 'tool' | 'config'

export function normalizeCatalogInspectView(value: unknown): CatalogInspectView {
  if (value === 'pack' || value === 'skill' || value === 'tool' || value === 'config') return value
  return 'summary'
}

export function inspectAgentCatalogView(input: {
  snapshot: {
    id: string
    catalogVersion: string | null
    activeAgentManifest: AgentManifest
    layeredRegistry: CatalogRegistry
    pluginWarnings: string[]
  }
  runManifest?: AgentManifest
  activeSkillIds: string[]
  request?: Record<string, JSONValue>
}): JSONValue {
  const request = input.request ?? {}
  const snapshot = input.snapshot
  const registry = snapshot.layeredRegistry
  const view = normalizeCatalogInspectView(request.view)
  const id = normalizeNonEmptyString(request.id)
  const configFileId = normalizeNonEmptyString(input.runManifest?.metadata?.configFileId)
    ?? normalizeNonEmptyString(snapshot.activeAgentManifest.metadata?.configFileId)
    ?? 'movscript.config_file.base'
  const configFile = registry.configFiles.get(configFileId) ?? registry.configFiles.get('movscript.config_file.base') ?? registry.configFiles.values().next().value
  const enabledPackIds = configFile ? collectCatalogPackClosure(configFile.enabledPackIds, registry.packs) : []
  const enabledPackSet = new Set(enabledPackIds)
  const base = {
    status: 'ok',
    catalogSnapshot: {
      id: snapshot.id,
      version: snapshot.catalogVersion,
    },
    view,
  }

  if (view === 'summary') {
    return {
      ...base,
      configFile: configFile ? summarizeCatalogConfigFile(configFile) : null,
      counts: {
        packs: registry.packs.size,
        enabledPackIds: enabledPackIds.length,
        skills: registry.skills.size,
        tools: registry.tools.size,
        configFiles: registry.configFiles.size,
      },
      enabledPackIds,
      activeSkillIds: input.activeSkillIds,
      availableSkillIds: configFile ? uniqueStrings(configFile.skillIds) : [],
      installedSkills: Array.from(registry.skills.values()).map((skill) => summarizeCatalogSkillIndex(skill, input.activeSkillIds, enabledPackIds, registry)),
      toolNames: configFile?.toolGrants.map((grant) => grant.name) ?? [],
      warnings: snapshot.pluginWarnings,
    } as unknown as JSONValue
  }

  if (!id) throw new Error(`inspect_agent_catalog ${view} view requires id`)
  if (view === 'pack') {
    const pack = registry.packs.get(id)
    if (!pack) throw new Error(`catalog pack not found: ${id}`)
    return {
      ...base,
      pack: summarizeCatalogPack(pack),
      enabled: enabledPackSet.has(pack.id),
    } as unknown as JSONValue
  }
  if (view === 'skill') {
    const skill = registry.skills.get(id)
    if (!skill) throw new Error(`catalog skill not found: ${id}`)
    return {
      ...base,
      skill: summarizeCatalogSkill(skill, request.includeInstruction === true),
      active: input.activeSkillIds.includes(skill.id),
      coveredByEnabledPack: enabledPackIds.some((packId) => registry.packs.get(packId)?.skills.includes(skill.id)),
    } as unknown as JSONValue
  }
  if (view === 'tool') {
    const tool = registry.tools.get(id)
    if (!tool) throw new Error(`catalog tool not found: ${id}`)
    const grant = configFile?.toolGrants.find((item) => item.name === tool.name)
    return {
      ...base,
      tool: summarizeCatalogTool(tool, request.includeSchema === true),
      enabledByPack: enabledPackIds.some((packId) => registry.packs.get(packId)?.tools.includes(tool.name)),
      grant: grant ? { mode: grant.mode, ...(grant.approval ? { approval: grant.approval } : {}) } : null,
    } as unknown as JSONValue
  }
  if (view === 'config') {
    const target = registry.configFiles.get(id)
    if (!target) throw new Error(`catalog config file not found: ${id}`)
    return {
      ...base,
      configFile: summarizeCatalogConfigFile(target),
      isCurrent: target.id === configFile?.id,
    } as unknown as JSONValue
  }
  throw new Error(`unsupported catalog inspect view: ${view}`)
}

export function collectCatalogPackClosure(ids: string[], packs: Map<string, CapabilityPack>): string[] {
  const visited = new Set<string>()
  const visit = (id: string): void => {
    if (visited.has(id)) return
    visited.add(id)
    const pack = packs.get(id)
    if (!pack) return
    for (const required of Object.keys(pack.requires?.packs ?? {})) visit(required)
  }
  for (const id of ids) visit(id)
  return Array.from(visited)
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values))
}

export function summarizeCatalogSkillIndex(
  skill: SkillDefinition,
  activeSkillIds: string[] = [],
  enabledPackIds: string[] = [],
  registry?: CatalogRegistry,
): JSONValue {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    active: activeSkillIds.includes(skill.id),
    ...(registry ? { coveredByEnabledPack: enabledPackIds.some((packId) => registry.packs.get(packId)?.skills.includes(skill.id)) } : {}),
    ...(skill.loadMode ? { loadMode: skill.loadMode } : {}),
    ...(skill.tags ? { tags: skill.tags } : {}),
    ...(skill.aliases ? { aliases: skill.aliases } : {}),
    ...(skill.useWhen ? { useWhen: skill.useWhen } : {}),
  }
}

export function summarizeCatalogConfigFile(configFile: AgentConfigFile): JSONValue {
  return {
    id: configFile.id,
    version: configFile.version,
    name: configFile.name,
    ...(configFile.description ? { description: configFile.description } : {}),
    enabledPackIds: configFile.enabledPackIds,
    skillIds: configFile.skillIds,
    ...(configFile.approvalDefaults ? { approvalDefaults: configFile.approvalDefaults as unknown as JSONValue } : {}),
    toolGrants: configFile.toolGrants.map((grant) => ({
      name: grant.name,
      mode: grant.mode,
      ...(grant.approval ? { approval: grant.approval } : {}),
    })),
    ...(configFile.limits ? { limits: configFile.limits as unknown as JSONValue } : {}),
  }
}

export function summarizeCatalogPack(pack: CapabilityPack): JSONValue {
  return {
    id: pack.id,
    version: pack.version,
    name: pack.name,
    ...(pack.description ? { description: pack.description } : {}),
    source: pack.source,
    skills: pack.skills,
    tools: pack.tools,
    schemas: pack.schemas,
    ...(pack.reference ? { reference: pack.reference } : {}),
    ...(pack.requires ? { requires: pack.requires as unknown as JSONValue } : {}),
    ...(pack.conflicts ? { conflicts: pack.conflicts } : {}),
  }
}

export function summarizeCatalogSkill(skill: SkillDefinition, includeInstruction: boolean): JSONValue {
  return {
    id: skill.id,
    version: skill.version,
    name: skill.name,
    description: skill.description,
    priority: skill.priority,
    enabled: skill.enabled,
    ...(skill.loadMode ? { loadMode: skill.loadMode } : {}),
    ...(skill.source ? { source: skill.source } : {}),
    ...(skill.sourcePath ? { sourcePath: skill.sourcePath } : {}),
    ...(skill.tags ? { tags: skill.tags } : {}),
    ...(skill.aliases ? { aliases: skill.aliases } : {}),
    ...(skill.useWhen ? { useWhen: skill.useWhen } : {}),
    ...(skill.dependencies ? { dependencies: skill.dependencies } : {}),
    ...(skill.conflicts ? { conflicts: skill.conflicts } : {}),
    ...(skill.tokenEstimate !== undefined ? { tokenEstimate: skill.tokenEstimate } : {}),
    ...(skill.contextBudget ? { contextBudget: skill.contextBudget as unknown as JSONValue } : {}),
    ...(skill.activationScope ? { activationScope: skill.activationScope } : {}),
    ...((skill.triggers?.length ?? 0) > 0 ? {
      triggers: skill.triggers as unknown as JSONValue,
      ...(skill.toolScope ? { toolScope: skill.toolScope } : {}),
    } : {}),
    ...(skill.toolGrants ? { toolGrants: skill.toolGrants } : {}),
    ...(skill.schemaRefs ? { schemaRefs: skill.schemaRefs } : {}),
    ...(skill.outputContract ? { outputContract: skill.outputContract } : {}),
    ...(skill.metadata ? { metadata: skill.metadata as unknown as JSONValue } : {}),
    ...(includeInstruction ? { instructionTemplate: skill.instructionTemplate } : {}),
  }
}

export function summarizeCatalogTool(tool: ToolDefinition, includeSchema: boolean): JSONValue {
  return {
    name: tool.name,
    description: tool.description,
    permission: tool.permission,
    risk: tool.risk,
    projectScoped: tool.projectScoped,
    defaults: tool.defaults,
    source: tool.source,
    ...(tool.execution ? { execution: tool.execution as unknown as JSONValue } : {}),
    ...(tool.capability ? { capability: tool.capability } : {}),
    ...(tool.errorCodes ? { errorCodes: tool.errorCodes } : {}),
    ...(tool.allowedRunRoles ? { allowedRunRoles: tool.allowedRunRoles } : {}),
    ...(tool.availability ? { availability: tool.availability as unknown as JSONValue } : {}),
    ...(includeSchema ? { inputSchema: tool.inputSchema as unknown as JSONValue } : {}),
    ...(includeSchema && tool.outputSchema ? { outputSchema: tool.outputSchema as unknown as JSONValue } : {}),
  }
}
