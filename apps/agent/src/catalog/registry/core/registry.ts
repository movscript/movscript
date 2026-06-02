import { DRAFT_SCHEMA_REGISTRY } from '@movscript/drafts'
import type { AgentManifest } from '../../manifest/agentManifest.js'
import type { RegisteredTool } from '../../../tools/registry/core/toolRegistry.js'
import { isRecord } from '../../../shared/json/jsonValue.js'
import type {
  AgentConfigFile,
  CapabilityPack,
  CatalogRegistry,
  SkillDefinition,
  ToolDefinition,
  ToolGrant,
} from '../shared/types.js'

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
    configFiles: new Map(),
  }
}

export function buildLayeredCatalogRegistry(input: {
  manifest: AgentManifest
  tools: RegisteredTool[]
  packs?: CapabilityPack[]
  configFiles?: AgentConfigFile[]
  layeredSkills?: SkillDefinition[]
  layeredTools?: ToolDefinition[]
  version?: string
}): CatalogRegistry {
  const registry = createEmptyCatalogRegistry(input.version)
  for (const tool of input.tools) registry.tools.set(tool.name, toolDefinitionFromRegisteredTool(tool))
  for (const tool of input.layeredTools ?? []) registry.tools.set(tool.name, tool)
  for (const skill of input.layeredSkills ?? []) registry.skills.set(skill.id, skill)
  for (const pack of input.packs ?? []) registry.packs.set(pack.id, pack)
  registry.packs.set('core.pack.base', {
    id: 'core.pack.base',
    version: '1.0.0',
    name: 'MovScript Base Agent Pack',
    description: 'Base pack containing the active built-in and local catalog resources.',
    source: 'builtin',
    schemas: Array.from(registry.schemas.keys()),
    tools: Array.from(registry.tools.keys()),
    skills: Array.from(registry.skills.keys()),
  })
  for (const configFile of input.configFiles ?? []) {
    registry.configFiles.set(configFile.id, configFile)
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
    source: tool.source === 'local' ? 'local' : tool.source === 'plugin' ? 'plugin' : tool.source === 'mcp' ? 'mcp' : 'runtime',
    ...(tool.execution ? { execution: tool.execution } : {}),
    capability: typeof tool.capability === 'string' ? tool.capability : tool.description,
    ...(tool.source === 'plugin' && typeof tool.pluginId === 'string' ? { pluginId: tool.pluginId } : {}),
    ...(tool.source === 'mcp' && typeof tool.mcpServerId === 'string' ? { mcpServerId: tool.mcpServerId } : {}),
    ...(tool.errorCodes ? { errorCodes: tool.errorCodes } : {}),
    ...(tool.allowedRunRoles ? { allowedRunRoles: tool.allowedRunRoles } : {}),
    ...(tool.requiresSkills ? { requiresSkills: tool.requiresSkills } : {}),
  }
}

export function configFileFromManifest(manifest: AgentManifest, id = manifest.id, name = manifest.name): AgentConfigFile {
  return {
    schema: 'movscript.agent.config_file.v1',
    id,
    version: manifest.version,
    name,
    ...(manifest.description ? { description: manifest.description } : {}),
    enabledPackIds: ['core.pack.base'],
    skillIds: manifest.soul ? ['core.base.default'] : [],
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
