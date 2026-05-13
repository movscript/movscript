import { DRAFT_SCHEMA_REGISTRY } from '@movscript/draft-schemas'
import type { AgentManifest } from './agentManifest.js'
import type { RegisteredTool } from '../tools/toolRegistry.js'
import type {
  AgentProfile,
  CapabilityPack,
  CatalogRegistry,
  SkillDefinition,
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
  }
}

export function buildLayeredCatalogRegistry(input: {
  manifest: AgentManifest
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
  }
  return registry
}

export function toolDefinitionFromRegisteredTool(tool: RegisteredTool): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: isRecord(tool.inputSchema) ? tool.inputSchema : EMPTY_OBJECT_SCHEMA,
    ...(isRecord(tool.outputSchema) ? { outputSchema: tool.outputSchema } : {}),
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

export function profileFromManifest(manifest: AgentManifest, id = manifest.id, name = manifest.name): AgentProfile {
  return {
    schema: 'movscript.agent.profile.v1',
    id,
    version: manifest.version,
    name,
    ...(manifest.description ? { description: manifest.description } : {}),
    enabledPacks: ['movscript.pack.default'],
    persona: manifest.soul
      ? 'movscript.persona.default'
      : null,
    enabledWorkflows: [],
    enabledPolicies: [],
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

function normalizeProvider(provider: string): 'anthropic' | 'openai' | 'azure' | 'custom' {
  if (provider === 'anthropic' || provider === 'openai' || provider === 'azure') return provider
  return 'custom'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
