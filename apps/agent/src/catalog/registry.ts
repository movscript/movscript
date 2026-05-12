import { DRAFT_SCHEMA_REGISTRY } from '@movscript/draft-schemas'
import type { AgentManifest, AgentSkillManifest } from './agentManifest.js'
import type { RegisteredTool } from '../tools/toolRegistry.js'
import type {
  AgentProfile,
  CapabilityPack,
  CatalogRegistry,
  SkillDefinition,
  SkillTrigger,
  ToolDefinition,
  ToolGrant,
} from './types.js'

const EMPTY_OBJECT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {},
}

export function createEmptyCatalogRegistry(version = new Date().toISOString()): CatalogRegistry {
  return {
    version,
    schemas: new Map(Object.entries(DRAFT_SCHEMA_REGISTRY)),
    tools: new Map(),
    skills: new Map(),
    packs: new Map(),
    profiles: new Map(),
    modeProfiles: new Map(),
  }
}

export function buildLayeredCatalogRegistry(input: {
  manifest: AgentManifest
  skills: AgentSkillManifest[]
  tools: RegisteredTool[]
  packs?: CapabilityPack[]
  profiles?: AgentProfile[]
  layeredSkills?: SkillDefinition[]
  layeredTools?: ToolDefinition[]
  version?: string
}): CatalogRegistry {
  const registry = createEmptyCatalogRegistry(input.version)
  for (const tool of input.tools) registry.tools.set(tool.name, toolDefinitionFromRegisteredTool(tool))
  for (const tool of input.layeredTools ?? []) registry.tools.set(tool.name, tool)
  for (const skill of [...input.skills, ...input.manifest.skills]) {
    const definition = skillDefinitionFromManifestSkill(skill)
    registry.skills.set(definition.id, definition)
  }
  for (const skill of input.layeredSkills ?? []) registry.skills.set(skill.id, skill)
  for (const pack of input.packs ?? []) registry.packs.set(pack.id, pack)
  registry.packs.set('movscript.pack.default', {
    id: 'movscript.pack.default',
    version: '1.0.0',
    name: 'Default MovScript Agent Pack',
    description: 'Default pack containing the active built-in and local catalog resources.',
    source: 'builtin',
    schemas: Array.from(registry.schemas.keys()),
    tools: Array.from(registry.tools.keys()),
    skills: Array.from(registry.skills.keys()),
  })
  for (const profile of input.profiles ?? []) {
    registry.profiles.set(profile.id, profile)
    if (profile.modeAlias) registry.modeProfiles.set(profile.modeAlias, profile)
  }
  return registry
}

export function toolDefinitionFromRegisteredTool(tool: RegisteredTool): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: isRecord(tool.inputSchema) ? tool.inputSchema : EMPTY_OBJECT_SCHEMA,
    permission: tool.permission,
    risk: tool.risk,
    projectScoped: tool.projectScoped,
    defaults: {
      grant: tool.defaults?.grant ?? 'allow',
      approval: tool.defaults?.approval ?? (tool.requiresApprovalByDefault ? 'always' : 'never'),
      ...(tool.defaults?.timeoutMs !== undefined ? { timeoutMs: tool.defaults.timeoutMs } : {}),
    },
    source: tool.source === 'plugin' ? 'plugin' : tool.source === 'mcp' ? 'mcp' : 'runtime',
    capability: typeof tool.capability === 'string' ? tool.capability : tool.description,
    ...(tool.source === 'plugin' && typeof tool.pluginId === 'string' ? { pluginId: tool.pluginId } : {}),
    ...(tool.source === 'mcp' && typeof tool.mcpServerId === 'string' ? { mcpServerId: tool.mcpServerId } : {}),
    ...(tool.errorCodes ? { errorCodes: tool.errorCodes } : {}),
    ...(tool.allowedRunRoles ? { allowedRunRoles: tool.allowedRunRoles } : {}),
  }
}

export function skillDefinitionFromManifestSkill(skill: AgentSkillManifest): SkillDefinition {
  const kind = inferSkillKind(skill)
  const base = {
    id: normalizeLegacySkillId(skill.id, kind),
    version: skill.version ?? '1.0.0',
    name: skill.name,
    description: skill.description,
    priority: typeof skill.priority === 'number' ? skill.priority : 100,
    enabled: skill.enabled !== false,
    instructionTemplate: rewriteLegacyTemplate(skill.instruction || skill.description),
    ...(skill.outputContract ? { outputContract: skill.outputContract } : {}),
    ...(skill.metadata ? { metadata: skill.metadata } : {}),
  }
  if (kind === 'persona') return { ...base, kind: 'persona' }
  if (kind === 'policy') {
    return {
      ...base,
      kind: 'policy',
      scope: 'global',
      toolRefs: skill.toolHints?.map((name) => `tool://${name}`),
    }
  }
  return {
    ...base,
    kind: 'workflow',
    triggers: triggersFromLegacySkill(skill),
    toolRefs: (skill.toolHints ?? []).map((name) => `tool://${name}`),
    schemaRefs: schemaRefsFromLegacySkill(skill),
    toolScope: 'intersect',
  }
}

export function profileFromManifest(manifest: AgentManifest, id = manifest.id, name = manifest.name): AgentProfile {
  const modeAlias = typeof manifest.metadata?.mode === 'string' ? manifest.metadata.mode : undefined
  const skills = manifest.skills.map((skill) => skillDefinitionFromManifestSkill(skill))
  return {
    schema: 'movscript.agent.profile.v1',
    id,
    version: manifest.version,
    name,
    ...(manifest.description ? { description: manifest.description } : {}),
    ...(modeAlias ? { modeAlias } : {}),
    enabledPacks: ['movscript.pack.default'],
    persona: manifest.soul
      ? `movscript.persona.${modeAlias ?? 'default'}`
      : null,
    enabledWorkflows: skills.filter((skill) => skill.kind === 'workflow').map((skill) => skill.id),
    enabledPolicies: skills.filter((skill) => skill.kind === 'policy').map((skill) => skill.id),
    toolGrants: manifest.tools.map((grant): ToolGrant => ({
      name: grant.name,
      mode: grant.mode,
      ...(grant.approval ? { approval: grant.approval } : {}),
    })),
    ...(manifest.model?.provider && manifest.model.modelId
      ? { model: { provider: normalizeProvider(manifest.model.provider), modelId: manifest.model.modelId, ...(manifest.model.platformModelId !== undefined ? { platformModelId: String(manifest.model.platformModelId) } : {}) } }
      : {}),
    metadata: {
      ...(manifest.metadata ?? {}),
      migratedFrom: manifest.schema,
    },
  }
}

function inferSkillKind(skill: AgentSkillManifest): SkillDefinition['kind'] {
  if (skill.category === 'policy' || skill.id.includes('.policy.') || skill.id.includes('.drafts.safe-drafts') || skill.id.includes('.platform.concepts')) return 'policy'
  if (skill.category === 'persona' || skill.id.includes('.persona.')) return 'persona'
  return 'workflow'
}

function normalizeLegacySkillId(id: string, kind: SkillDefinition['kind']): string {
  if (id.includes(`.${kind}.`)) return id
  if (id.startsWith('movscript.intent.')) return `movscript.workflow.${id.slice('movscript.intent.'.length)}`
  if (id === 'movscript.drafts.safe-drafts') return 'movscript.policy.safe-drafts'
  if (id === 'movscript.platform.concepts') return 'movscript.policy.platform-concepts'
  return id
}

function triggersFromLegacySkill(skill: AgentSkillManifest): SkillTrigger[] {
  const triggers: SkillTrigger[] = []
  const category = skill.category
  if (category) {
    triggers.push({ kind: 'intent', id: category })
    triggers.push({ kind: 'context', selector: { mode: [category.replaceAll('_', '-')] } })
  }
  return triggers.length > 0 ? triggers : [{ kind: 'always' }]
}

function schemaRefsFromLegacySkill(skill: AgentSkillManifest): string[] | undefined {
  const haystack = `${skill.id}\n${skill.category ?? ''}\n${skill.instruction}`
  const refs: string[] = []
  const mappings = [
    ['project_proposal', 'schema://movscript.project_proposal.v1'],
    ['production_proposal', 'schema://movscript.production_proposal.v1'],
    ['content_unit_media_proposal', 'schema://movscript.content_unit_media_proposal.v1'],
    ['content_unit_proposal', 'schema://movscript.content_unit_proposal.v1'],
    ['asset_proposal', 'schema://movscript.asset_proposal.v1'],
    ['script_split', 'schema://movscript.script_split_proposal.v1'],
  ] as const
  for (const [needle, ref] of mappings) {
    if (haystack.includes(needle)) refs.push(ref)
  }
  return refs.length > 0 ? Array.from(new Set(refs)) : undefined
}

function rewriteLegacyTemplate(instruction: string): string {
  return instruction
    .replace(/movscript\.draft\.project_proposal\.v1/g, '{{schema:movscript.project_proposal.v1.id}}')
    .replace(/movscript\.draft\.production_proposal\.v1/g, '{{schema:movscript.production_proposal.v1.id}}')
    .replace(/movscript\.draft\.script_split_proposal\.v1/g, '{{schema:movscript.script_split_proposal.v1.id}}')
}

function normalizeProvider(provider: string): 'anthropic' | 'openai' | 'azure' | 'custom' {
  if (provider === 'anthropic' || provider === 'openai' || provider === 'azure') return provider
  return 'custom'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
