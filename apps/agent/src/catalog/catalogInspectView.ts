import type { JSONValue } from '../types.js'
import type { KnowledgeCollection } from '../knowledge/types.js'
import type { AgentManifest } from './agentManifest.js'
import type { AgentProfile, CapabilityPack, CatalogRegistry, SkillDefinition, ToolDefinition } from './types.js'

export type CatalogInspectView = 'summary' | 'pack' | 'skill' | 'tool' | 'profile' | 'knowledge'

export function normalizeCatalogInspectView(value: unknown): CatalogInspectView {
  if (value === 'pack' || value === 'skill' || value === 'tool' || value === 'profile' || value === 'knowledge') return value
  return 'summary'
}

export function inspectAgentCatalogView(input: {
  snapshot: {
    id: string
    catalogVersion: string | null
    defaultAgentManifest: AgentManifest
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
  const profileId = normalizeNonEmptyString(input.runManifest?.metadata?.profileId)
    ?? normalizeNonEmptyString(snapshot.defaultAgentManifest.metadata?.profileId)
    ?? 'movscript.profile.default'
  const profile = registry.profiles.get(profileId) ?? registry.profiles.get('movscript.profile.default') ?? registry.profiles.values().next().value
  const enabledPackIds = profile ? collectCatalogPackClosure(profile.enabledPacks, registry.packs) : []
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
      profile: profile ? summarizeCatalogProfile(profile) : null,
      counts: {
        packs: registry.packs.size,
        enabledPacks: enabledPackIds.length,
        skills: registry.skills.size,
        tools: registry.tools.size,
        knowledge: registry.knowledge.size,
        profiles: registry.profiles.size,
      },
      enabledPackIds,
      activeSkillIds: input.activeSkillIds,
      availableSkillIds: profile ? uniqueStrings([
        ...(profile.persona ? [profile.persona] : []),
        ...profile.enabledPolicies,
        ...profile.enabledWorkflows,
      ]) : [],
      toolNames: profile?.toolGrants.map((grant) => grant.name) ?? [],
      knowledgeCollections: summarizeEnabledKnowledgeCollections(enabledPackIds, registry),
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
      knowledgeCollections: (pack.knowledge ?? []).flatMap((collectionId) => {
        const collection = registry.knowledge.get(collectionId)
        return collection ? [summarizeKnowledgeCollection(collection)] : []
      }),
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
    const grant = profile?.toolGrants.find((item) => item.name === tool.name)
    return {
      ...base,
      tool: summarizeCatalogTool(tool, request.includeSchema === true),
      enabledByPack: enabledPackIds.some((packId) => registry.packs.get(packId)?.tools.includes(tool.name)),
      grant: grant ? { mode: grant.mode, ...(grant.approval ? { approval: grant.approval } : {}) } : null,
    } as unknown as JSONValue
  }
  if (view === 'profile') {
    const target = registry.profiles.get(id)
    if (!target) throw new Error(`catalog profile not found: ${id}`)
    return {
      ...base,
      profile: summarizeCatalogProfile(target),
      isCurrent: target.id === profile?.id,
    } as unknown as JSONValue
  }
  if (view === 'knowledge') {
    const collection = registry.knowledge.get(id)
    if (!collection) throw new Error(`catalog knowledge collection not found: ${id}`)
    return {
      ...base,
      knowledge: summarizeKnowledgeCollection(collection),
      enabledByPack: enabledPackIds.some((packId) => registry.packs.get(packId)?.knowledge?.includes(collection.id)),
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

export function summarizeCatalogProfile(profile: AgentProfile): JSONValue {
  return {
    id: profile.id,
    version: profile.version,
    name: profile.name,
    ...(profile.description ? { description: profile.description } : {}),
    enabledPacks: profile.enabledPacks,
    persona: profile.persona,
    enabledPolicies: profile.enabledPolicies,
    enabledWorkflows: profile.enabledWorkflows,
    toolGrants: profile.toolGrants.map((grant) => ({
      name: grant.name,
      mode: grant.mode,
      ...(grant.approval ? { approval: grant.approval } : {}),
    })),
    ...(profile.limits ? { limits: profile.limits as unknown as JSONValue } : {}),
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
    ...(pack.knowledge ? { knowledge: pack.knowledge } : {}),
    ...(pack.resources?.knowledge ? { knowledgeResources: pack.resources.knowledge } : {}),
    ...(pack.requires ? { requires: pack.requires as unknown as JSONValue } : {}),
    ...(pack.conflicts ? { conflicts: pack.conflicts } : {}),
  }
}

export function summarizeEnabledKnowledgeCollections(enabledPackIds: string[], registry: CatalogRegistry): JSONValue {
  return enabledPackIds.flatMap((packId) => {
    const pack = registry.packs.get(packId)
    return (pack?.knowledge ?? []).flatMap((collectionId) => {
      const collection = registry.knowledge.get(collectionId)
      return collection ? [summarizeKnowledgeCollection(collection)] : []
    })
  }) as unknown as JSONValue
}

export function summarizeKnowledgeCollection(collection: KnowledgeCollection): JSONValue {
  return {
    id: collection.id,
    version: collection.version,
    domain: collection.domain,
    name: collection.name,
    ...(collection.description ? { description: collection.description } : {}),
    tags: collection.tags,
    chunkIds: collection.chunkIds,
  }
}

export function summarizeCatalogSkill(skill: SkillDefinition, includeInstruction: boolean): JSONValue {
  return {
    id: skill.id,
    kind: skill.kind,
    version: skill.version,
    name: skill.name,
    description: skill.description,
    priority: skill.priority,
    enabled: skill.enabled,
    ...(skill.kind === 'workflow' ? {
      triggers: skill.triggers as unknown as JSONValue,
      toolRefs: skill.toolRefs,
      ...(skill.toolScope ? { toolScope: skill.toolScope } : {}),
    } : {}),
    ...(skill.kind !== 'workflow' && skill.toolRefs ? { toolRefs: skill.toolRefs } : {}),
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
    ...(tool.capability ? { capability: tool.capability } : {}),
    ...(tool.errorCodes ? { errorCodes: tool.errorCodes } : {}),
    ...(tool.allowedRunRoles ? { allowedRunRoles: tool.allowedRunRoles } : {}),
    ...(tool.availability ? { availability: tool.availability as unknown as JSONValue } : {}),
    ...(includeSchema ? { inputSchema: tool.inputSchema as unknown as JSONValue } : {}),
    ...(includeSchema && tool.outputSchema ? { outputSchema: tool.outputSchema as unknown as JSONValue } : {}),
  }
}
