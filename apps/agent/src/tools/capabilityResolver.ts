import type { JSONValue, MCPResource, MCPTool } from '../state/types.js'
import {
  findToolGrant,
  type AgentManifest,
} from '../catalog/agentManifest.js'
import { DEFAULT_TOOL_REGISTRY, type RegisteredTool, type ToolRegistry } from './toolRegistry.js'
import { publicToolName } from './toolNames.js'
import { buildMCPVirtualPack } from '../catalog/mcpVirtualPack.js'
import type {
  AgentCapabilitiesResponse,
  AgentDebugTool,
  AgentToolRuntimeExplanation,
  AgentRunRole,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
} from '../state/types.js'
import { defaultToolApproval, requiresToolApproval } from './toolApprovalPolicy.js'
import { getToolAuthorizationUnavailableReason } from './toolAuthorization.js'
import { isToolVisibleForActiveBehavior } from './toolVisibility.js'
import { normalizeToolExecutionMetadata, type ToolExecutionMetadata } from './toolRegistry.js'

export interface CapabilityMCPClient {
  initialize(): Promise<unknown>
  listTools(): Promise<MCPTool[]>
  listResources(): Promise<MCPResource[]>
}

export async function resolveAgentCapabilities(options: {
  mcpClient: CapabilityMCPClient
  manifest: AgentManifest
  currentProjectId?: number
  registry?: ToolRegistry
  includeResources?: boolean
  pluginCatalog?: AgentCapabilitiesResponse['pluginCatalog']
  warnings?: string[]
  updates?: AgentCapabilitiesResponse['updates']
  activeSkills?: ResolvedAgentSkill[]
  userMessage?: string
  runRole?: AgentRunRole
}): Promise<AgentCapabilitiesResponse> {
  const registry = options.registry ?? DEFAULT_TOOL_REGISTRY
  const warnings: string[] = [...(options.warnings ?? [])]
  let connected = false
  let resources: MCPResource[] = []
  let tools: MCPTool[] = []
  let error: string | undefined

  try {
    await options.mcpClient.initialize()
    connected = true
    const [mcpTools, mcpResources] = await Promise.all([
      options.mcpClient.listTools(),
      options.includeResources === false ? Promise.resolve([]) : options.mcpClient.listResources(),
    ])
    tools = mcpTools
    resources = mcpResources
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    warnings.push(`MCP unavailable: ${error}`)
  }

  const mcpPack = connected && tools.length > 0
    ? buildMCPVirtualPack({ serverId: 'default', tools })
    : undefined
  const registryTools = mcpPack
    ? [...registry.list(), ...mcpPack.tools.map((tool): RegisteredTool => ({
      name: tool.name,
      description: tool.description,
      permission: tool.permission,
      risk: tool.risk,
      source: 'mcp',
      inputSchema: tool.inputSchema as unknown as JSONValue,
      ...(tool.outputSchema ? { outputSchema: tool.outputSchema as unknown as JSONValue } : {}),
      projectScoped: tool.projectScoped,
      requiresApprovalByDefault: true,
      defaults: tool.defaults,
      mcpServerId: tool.mcpServerId,
      capability: tool.capability,
    }))]
    : registry.list()

  return {
    defaultAgentManifest: options.manifest,
    ...(options.updates ? { updates: options.updates } : {}),
    ...(options.pluginCatalog || mcpPack ? { pluginCatalog: mergeMCPPackInfo(options.pluginCatalog, mcpPack) } : {}),
    mcp: {
      connected,
      resources,
      tools,
      ...(error ? { error } : {}),
    },
    registry: registryTools,
    resolvedTools: resolveToolCatalog({
      mcpTools: tools,
      registry,
      manifest: options.manifest,
      currentProjectId: options.currentProjectId,
      mcpConnected: connected,
      activeSkills: options.activeSkills,
      userMessage: options.userMessage,
      runRole: options.runRole,
    }),
    warnings,
  }
}

function mergeMCPPackInfo(
  pluginCatalog: AgentCapabilitiesResponse['pluginCatalog'] | undefined,
  mcpPack: ReturnType<typeof buildMCPVirtualPack> | undefined,
): AgentCapabilitiesResponse['pluginCatalog'] {
  if (!pluginCatalog) {
    return {
      skillsDir: '',
      toolsDir: '',
      skillCount: 0,
      toolCount: mcpPack?.tools.length ?? 0,
      metadata: {
        ...(mcpPack ? { mcpPacks: [mcpPack.pack] as unknown as JSONValue } : {}),
      },
    }
  }
  if (!mcpPack) return pluginCatalog
  const existingMCPPacks = Array.isArray(pluginCatalog.metadata?.mcpPacks)
    ? pluginCatalog.metadata.mcpPacks
    : []
  return {
    ...pluginCatalog,
    toolCount: pluginCatalog.toolCount + mcpPack.tools.length,
    metadata: {
      ...(pluginCatalog.metadata ?? {}),
      mcpPacks: [...existingMCPPacks, mcpPack.pack] as unknown as JSONValue,
    },
  }
}

export function resolveToolCatalog(options: {
  mcpTools: MCPTool[]
  registry?: ToolRegistry
  manifest: AgentManifest
  currentProjectId?: number
  mcpConnected?: boolean
  activeSkills?: ResolvedAgentSkill[]
  userMessage?: string
  runRole?: AgentRunRole
}): ResolvedToolCatalog {
  const registry = options.registry ?? DEFAULT_TOOL_REGISTRY
  const mcpByName = new Map(options.mcpTools.map((tool) => [publicToolName(tool.name), tool]))
  const names = new Set<string>([
    ...registry.list().map((tool) => tool.name),
    ...options.manifest.tools.map((tool) => publicToolName(tool.name)),
  ])
  const discovered: AgentDebugTool[] = []
  const available: AgentDebugTool[] = []
  const blocked: AgentDebugTool[] = []
  const byName: Record<string, AgentDebugTool> = {}

  for (const name of Array.from(names).sort()) {
    const mcpTool = mcpByName.get(name)
    const registeredTool = registry.get(name)
    const grantResolution = resolveToolGrant({
      manifest: options.manifest,
      toolName: name,
      activeSkills: options.activeSkills,
    })
    const grant = grantResolution.grant
    const approval = grant?.approval ?? defaultToolApproval(registeredTool)
    const approvalRequired = requiresToolApproval(registeredTool, approval)
    const authorizationReason = getToolAuthorizationUnavailableReason({
      registeredTool,
      grant,
      currentProjectId: options.currentProjectId,
      hasMCPTool: Boolean(mcpTool),
      runRole: options.runRole,
    })
    const visible = !authorizationReason && isVisibleForActiveSkills({
      name,
      activeSkills: options.activeSkills,
      userMessage: options.userMessage,
    })
    const unavailableReason = authorizationReason ?? (visible ? undefined : 'workflow_scope')
    const source = mcpTool ? 'mcp' : registeredTool?.source === 'plugin' ? 'plugin' : 'runtime'
    const execution = registeredTool?.execution ?? normalizeToolExecutionMetadata(undefined, registeredTool?.risk ?? 'write')
    const runtime = buildToolRuntimeExplanation({
      source,
      registeredTool,
      grant,
      approval,
      approvalRequired,
      unavailableReason,
      execution,
      grantSource: grantResolution.source,
    })
    const tool: AgentDebugTool = {
      name,
      ...(registeredTool?.description || mcpTool?.description ? { description: registeredTool?.description ?? mcpTool?.description } : {}),
      ...(registeredTool?.inputSchema !== undefined || mcpTool?.inputSchema !== undefined ? { inputSchema: registeredTool?.inputSchema ?? mcpTool?.inputSchema } : {}),
      ...(registeredTool?.outputSchema !== undefined ? { outputSchema: registeredTool.outputSchema } : {}),
      source,
      ...(registeredTool?.category ? { category: registeredTool.category } : {}),
      ...(registeredTool?.categories ? { categories: registeredTool.categories } : {}),
      registered: !!registeredTool,
      granted: !!grant && grant.mode !== 'deny',
      ...(registeredTool ? { permission: registeredTool.permission } : {}),
      ...(registeredTool ? { risk: registeredTool.risk } : {}),
      ...(registeredTool?.execution ? { execution: registeredTool.execution } : {}),
      ...(registeredTool ? { projectScoped: registeredTool.projectScoped } : {}),
      approval,
      available: !unavailableReason,
      ...(unavailableReason ? { unavailableReason } : {}),
      requiresApproval: approvalRequired,
      runtime,
      resolution: {
        authorized: !authorizationReason,
        visible,
        ...(unavailableReason ? { reason: unavailableReason } : {}),
        grantSource: grantResolution.source,
        approval,
        activeSkillIds: options.activeSkills?.map((skill) => skill.id) ?? [],
        ...(grantResolution.skillIds.length > 0 ? { grantingSkillIds: grantResolution.skillIds } : {}),
      },
    }
    discovered.push(tool)
    byName[name] = tool
    if (tool.available) available.push(tool)
    else blocked.push(tool)
  }

  return { discovered, available, blocked, byName }
}

function buildToolRuntimeExplanation(input: {
  source: AgentDebugTool['source']
  registeredTool?: RegisteredTool
  grant: ReturnType<typeof findManifestToolGrant>
  grantSource: AgentToolRuntimeExplanation['grantSource']
  approval: AgentDebugTool['approval']
  approvalRequired: boolean
  unavailableReason?: AgentDebugTool['unavailableReason']
  execution: ToolExecutionMetadata
}): AgentToolRuntimeExplanation {
  const registered = Boolean(input.registeredTool)
  const grantMode = input.grant?.mode ?? 'none'
  const available = !input.unavailableReason
  return {
    registered,
    source: input.source,
    grantMode,
    grantSource: input.grantSource,
    approval: input.approval,
    approvalRequired: input.approvalRequired,
    approvalReason: toolApprovalReason(input.registeredTool, input.approval, input.approvalRequired),
    available,
    ...(input.unavailableReason ? { unavailableReason: input.unavailableReason } : {}),
    execution: input.execution,
    reason: toolRuntimeReason({
      registered,
      grantMode,
      available,
      unavailableReason: input.unavailableReason,
      approvalRequired: input.approvalRequired,
      execution: input.execution,
    }),
  }
}

function toolApprovalReason(
  tool: RegisteredTool | undefined,
  approval: AgentDebugTool['approval'],
  approvalRequired: boolean,
): AgentToolRuntimeExplanation['approvalReason'] {
  if (!tool) return 'unknown_tool'
  if (!approvalRequired) return 'none'
  if (approval === 'always') return 'explicit_always'
  if (approval === 'on_write') return 'on_write'
  return 'tool_default'
}

function toolRuntimeReason(input: {
  registered: boolean
  grantMode: AgentToolRuntimeExplanation['grantMode']
  available: boolean
  unavailableReason?: AgentDebugTool['unavailableReason']
  approvalRequired: boolean
  execution: ToolExecutionMetadata
}): string {
  if (!input.registered) return 'Tool is not registered in the current runtime.'
  if (input.grantMode === 'deny') return 'Tool is denied by the active manifest.'
  if (input.grantMode === 'none') return 'Tool is not granted by the active manifest.'
  if (!input.available) return `Tool is blocked by runtime state: ${input.unavailableReason ?? 'unknown'}.`
  if (input.approvalRequired) return 'Tool is available but requires approval before execution.'
  if (input.execution.readOnly) return 'Tool is available as a read-only runtime operation.'
  if (input.execution.destructive) return 'Tool is available and marked destructive.'
  return 'Tool is available for execution under the active manifest and runtime state.'
}

function isVisibleForActiveSkills(options: {
  name: string
  activeSkills?: ResolvedAgentSkill[]
  userMessage?: string
}): boolean {
  if (!options.activeSkills) return true
  return isToolVisibleForActiveBehavior({
    toolName: options.name,
    activeSkills: options.activeSkills,
    userMessage: options.userMessage ?? '',
  })
}

function resolveToolGrant(input: {
  manifest: AgentManifest
  toolName: string
  activeSkills?: ResolvedAgentSkill[]
}): {
  grant?: ReturnType<typeof findManifestToolGrant>
  source: AgentToolRuntimeExplanation['grantSource']
  skillIds: string[]
} {
  const manifestGrant = findManifestToolGrant(input.manifest, input.toolName)
  if (manifestGrant) return { grant: manifestGrant, source: 'manifest', skillIds: [] }
  const skillIds = activeSkillToolGrantIds(input.activeSkills ?? [], input.toolName)
  if (skillIds.length === 0) return { source: 'none', skillIds: [] }
  return {
    grant: { name: input.toolName, mode: 'allow' },
    source: 'skill',
    skillIds,
  }
}

function activeSkillToolGrantIds(skills: ResolvedAgentSkill[], toolName: string): string[] {
  const normalizedToolName = publicToolName(toolName)
  return skills
    .filter((skill) => {
      const refs = [...(skill.toolRefs ?? []), ...(skill.toolHints ?? [])]
      return refs.some((ref) => publicToolName(normalizeToolRef(ref)) === normalizedToolName)
    })
    .map((skill) => skill.id)
    .sort()
}

function normalizeToolRef(value: string): string {
  return value.startsWith('tool://') ? value.slice('tool://'.length) : value
}

function findManifestToolGrant(manifest: AgentManifest, toolName: string) {
  return findToolGrant(manifest, toolName)
    ?? manifest.tools.find((grant) => publicToolName(grant.name) === toolName)
}
