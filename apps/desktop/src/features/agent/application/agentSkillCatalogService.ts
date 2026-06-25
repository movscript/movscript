import type {
  ProviderCatalogInspectResponse,
  ProviderCatalogSkill,
  ProviderManifest,
  JSONValue,
  ProviderSessionCapabilitiesResponse,
  ProviderToolApprovalMode,
  ProviderToolDescriptor,
  ProviderToolRiskLevel,
  ResolvedToolCatalog,
} from '@movscript/agent-protocol'
import type { AgentChatDataSource } from '@movscript/agent-chat'
import type { ProviderConfig } from '@/shared/infrastructure/providerConfigStore'
import { createAgentChatDataSourceForProvider } from '@/features/agent/application/agentChatDataSourceFactory'

export type AgentSkillCatalogDataSourceFactory = (provider: ProviderConfig) => Promise<AgentChatDataSource>

export class AgentSkillCatalogService {
  constructor(private readonly createDataSource: AgentSkillCatalogDataSourceFactory = createAgentChatDataSourceForProvider) {}

  async inspect(input: {
    provider: ProviderConfig
    cwds?: string[]
    forceReload?: boolean
  }): Promise<ProviderCatalogInspectResponse> {
    const dataSource = await this.createDataSource(input.provider)
    const skillsResponse = dataSource.capabilities?.skills?.list
      ? await dataSource.capabilities.skills.list({ cwds: input.cwds, forceReload: input.forceReload ?? true })
      : undefined
    const skills = normalizeProviderCatalogSkills(skillsResponse)
    return emptyProviderCatalogInspectResponse(input.provider, skills)
  }

  async capabilities(input: {
    provider: ProviderConfig
    cwds?: string[]
    forceReload?: boolean
  }): Promise<ProviderSessionCapabilitiesResponse> {
    const dataSource = await this.createDataSource(input.provider)
    const skillsResponse = dataSource.capabilities?.skills?.list
      ? await dataSource.capabilities.skills.list({ cwds: input.cwds, forceReload: input.forceReload ?? true })
      : undefined
    return emptyProviderCapabilitiesResponse(input.provider, normalizeResolvedToolCatalog(skillsResponse))
  }
}

export const agentSkillCatalogService = new AgentSkillCatalogService()

export function emptyProviderCatalogInspectResponse(
  provider: ProviderConfig,
  skills: ProviderCatalogSkill[] = [],
): ProviderCatalogInspectResponse {
  const activeProviderManifest = providerManifestFromSkills(provider, skills)
  return {
    mcpEndpoint: '',
    resources: [],
    tools: [],
    registeredTools: [],
    skills,
    packs: [],
    configFiles: [],
    activeConfigFileId: null,
    activeProviderManifest,
  }
}

export function normalizeProviderCatalogSkills(value: unknown): ProviderCatalogSkill[] {
  const candidates = providerCatalogSkillCandidates(value)
  const byId = new Map<string, ProviderCatalogSkill>()
  candidates.forEach((candidate, index) => {
    const skill = normalizeProviderCatalogSkill(candidate, index)
    if (!skill) return
    byId.set(skill.id, skill)
  })
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
}

export function emptyProviderCapabilitiesResponse(
  provider: ProviderConfig,
  resolvedTools: ResolvedToolCatalog = emptyResolvedToolCatalog(),
): ProviderSessionCapabilitiesResponse {
  return {
    activeProviderManifest: providerManifestFromSkills(provider, []),
    mcp: {
      connected: false,
      resources: [],
      tools: [],
    },
    registry: [],
    resolvedTools,
    warnings: [],
  }
}

export function normalizeResolvedToolCatalog(value: unknown): ResolvedToolCatalog {
  const candidate = resolvedToolCatalogCandidate(value)
  const discovered = normalizeProviderToolDescriptors(candidate?.discovered)
  const available = normalizeProviderToolDescriptors(candidate?.available)
  const blocked = normalizeProviderToolDescriptors(candidate?.blocked)
  const normalizedDiscovered = discovered.length > 0 ? discovered : [...available, ...blocked]
  const normalizedAvailable = available.length > 0 ? available : normalizedDiscovered.filter((tool) => tool.available)
  const normalizedBlocked = blocked.length > 0 ? blocked : normalizedDiscovered.filter((tool) => !tool.available)
  return {
    discovered: normalizedDiscovered,
    available: normalizedAvailable,
    blocked: normalizedBlocked,
    byName: Object.fromEntries(normalizedDiscovered.map((tool) => [tool.name, tool])),
  }
}

function emptyResolvedToolCatalog(): ResolvedToolCatalog {
  return {
    discovered: [],
    available: [],
    blocked: [],
    byName: {},
  }
}

function resolvedToolCatalogCandidate(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null
  const resolvedTools = value.resolvedTools
  if (isRecord(resolvedTools)) return resolvedTools
  if (Array.isArray(value.discovered) || Array.isArray(value.available) || Array.isArray(value.blocked)) return value
  return null
}

function normalizeProviderToolDescriptors(value: unknown): ProviderToolDescriptor[] {
  const candidates = Array.isArray(value)
    ? value
    : isRecord(value) ? Object.values(value) : []
  return candidates.flatMap((candidate) => {
    const tool = normalizeProviderToolDescriptor(candidate)
    return tool ? [tool] : []
  })
}

function normalizeProviderToolDescriptor(value: unknown): ProviderToolDescriptor | null {
  if (!isRecord(value)) return null
  const name = stringField(value.name)
  if (!name) return null
  const available = typeof value.available === 'boolean' ? value.available : true
  const approval = providerToolApprovalMode(value.approval) ?? 'on_write'
  return {
    name,
    ...(stringField(value.description) ? { description: stringField(value.description) } : {}),
    ...(isRecord(value.inputSchema) ? { inputSchema: value.inputSchema as unknown as JSONValue } : {}),
    ...(isRecord(value.outputSchema) ? { outputSchema: value.outputSchema as unknown as JSONValue } : {}),
    source: providerToolSource(value.source) ?? 'runtime',
    ...(stringField(value.category) ? { category: stringField(value.category) } : {}),
    ...(stringArray(value.categories).length ? { categories: stringArray(value.categories) } : {}),
    registered: typeof value.registered === 'boolean' ? value.registered : true,
    granted: typeof value.granted === 'boolean' ? value.granted : available,
    ...(stringField(value.permission) ? { permission: stringField(value.permission) } : {}),
    ...(providerToolRisk(value.risk) ? { risk: providerToolRisk(value.risk) } : {}),
    ...(isRecord(value.execution) ? { execution: value.execution as unknown as ProviderToolDescriptor['execution'] } : {}),
    ...(typeof value.projectScoped === 'boolean' ? { projectScoped: value.projectScoped } : {}),
    approval,
    available,
    ...(stringField(value.unavailableReason) ? { unavailableReason: stringField(value.unavailableReason) } : {}),
    requiresApproval: typeof value.requiresApproval === 'boolean' ? value.requiresApproval : approval !== 'never',
    ...(isRecord(value.runtime) ? { runtime: value.runtime as unknown as ProviderToolDescriptor['runtime'] } : {}),
    ...(isRecord(value.resolution) ? { resolution: value.resolution as unknown as ProviderToolDescriptor['resolution'] } : {}),
  }
}

function providerToolSource(value: unknown): ProviderToolDescriptor['source'] | undefined {
  return value === 'mcp' || value === 'runtime' || value === 'local' || value === 'plugin' ? value : undefined
}

function providerToolApprovalMode(value: unknown): ProviderToolApprovalMode | undefined {
  return value === 'never' || value === 'always' || value === 'on_write' ? value : undefined
}

function providerToolRisk(value: unknown): ProviderToolRiskLevel | undefined {
  return value === 'read' || value === 'workspace' || value === 'write' || value === 'generate' || value === 'destructive' || value === 'ui'
    ? value
    : undefined
}

function providerManifestFromSkills(provider: ProviderConfig, skills: ProviderCatalogSkill[]): ProviderManifest {
  return {
    schema: 'movscript.agent.current',
    id: provider.id,
    version: '0',
    name: provider.label,
    tools: [],
    skills: skills.map((skill) => ({ id: skill.id, enabled: skill.enabled !== false })),
    metadata: {
      source: 'agent-skill-catalog-service',
      providerKind: provider.kind,
    },
  }
}

function providerCatalogSkillCandidates(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (!isRecord(value)) return []
  const skills = value.skills
  if (Array.isArray(skills)) return skills
  const data = value.data
  if (Array.isArray(data)) {
    return data.flatMap((item) => {
      if (isRecord(item) && Array.isArray(item.skills)) return item.skills
      return isRecord(item) && (stringField(item.id) || stringField(item.name)) ? [item] : []
    })
  }
  return []
}

function normalizeProviderCatalogSkill(value: unknown, index: number): ProviderCatalogSkill | null {
  if (!isRecord(value)) return null
  const id = stringField(value.id) ?? stringField(value.skillId) ?? stringField(value.name) ?? `skill.${index + 1}`
  const name = stringField(value.name) ?? id
  return {
    id,
    name,
    description: stringField(value.description) ?? '',
    enabled: value.enabled !== false,
    instruction: stringField(value.instruction) ?? stringField(value.instructionTemplate) ?? '',
    ...(stringField(value.version) ? { version: stringField(value.version) } : {}),
    ...(numberField(value.priority) !== undefined ? { priority: numberField(value.priority) } : {}),
    ...(stringField(value.instructionTemplate) ? { instructionTemplate: stringField(value.instructionTemplate) } : {}),
    ...(providerCatalogSkillLoadMode(value.loadMode) ? { loadMode: providerCatalogSkillLoadMode(value.loadMode) } : {}),
    ...(providerCatalogSkillSource(value.source) ? { source: providerCatalogSkillSource(value.source) } : {}),
    ...(providerCatalogSkillActivationScope(value.activationScope) ? { activationScope: providerCatalogSkillActivationScope(value.activationScope) } : {}),
    ...(stringArray(value.tags).length ? { tags: stringArray(value.tags) } : {}),
    ...(stringArray(value.aliases).length ? { aliases: stringArray(value.aliases) } : {}),
    ...(stringArray(value.useWhen).length ? { useWhen: stringArray(value.useWhen) } : {}),
    ...(stringArray(value.dependencies).length ? { dependencies: stringArray(value.dependencies) } : {}),
    ...(stringArray(value.conflicts).length ? { conflicts: stringArray(value.conflicts) } : {}),
    ...(stringArray(value.toolGrants).length ? { toolGrants: stringArray(value.toolGrants) } : {}),
    ...(stringArray(value.schemaRefs).length ? { schemaRefs: stringArray(value.schemaRefs) } : {}),
    ...(stringField(value.outputContract) ? { outputContract: stringField(value.outputContract) } : {}),
    ...(stringArray(value.toolHints).length ? { toolHints: stringArray(value.toolHints) } : {}),
  }
}

function providerCatalogSkillLoadMode(value: unknown): ProviderCatalogSkill['loadMode'] | undefined {
  return value === 'core' || value === 'on_demand' || value === 'manual' ? value : undefined
}

function providerCatalogSkillSource(value: unknown): ProviderCatalogSkill['source'] | undefined {
  return value === 'builtin' || value === 'local' || value === 'plugin' || value === 'team' || value === 'mcp' ? value : undefined
}

function providerCatalogSkillActivationScope(value: unknown): ProviderCatalogSkill['activationScope'] | undefined {
  return value === 'turn' || value === 'run' || value === 'thread' ? value : undefined
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => typeof item === 'string' && item.trim() ? [item.trim()] : [])
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
