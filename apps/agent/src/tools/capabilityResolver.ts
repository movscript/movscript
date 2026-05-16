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
  AgentRunRole,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
} from '../state/types.js'
import { defaultToolApproval, requiresToolApproval } from './toolApprovalPolicy.js'
import { getToolAuthorizationUnavailableReason } from './toolAuthorization.js'
import { isToolVisibleForActiveBehavior } from './toolVisibility.js'

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
    const grant = findManifestToolGrant(options.manifest, name)
    const approval = grant?.approval ?? defaultToolApproval(registeredTool)
    const unavailableReason = getUnavailableReason({
      name,
      mcpTool,
      registeredTool,
      grant,
      currentProjectId: options.currentProjectId,
      activeSkills: options.activeSkills,
      userMessage: options.userMessage,
      runRole: options.runRole,
    })
    const tool: AgentDebugTool = {
      name,
      ...(registeredTool?.description || mcpTool?.description ? { description: registeredTool?.description ?? mcpTool?.description } : {}),
      ...(registeredTool?.inputSchema !== undefined || mcpTool?.inputSchema !== undefined ? { inputSchema: registeredTool?.inputSchema ?? mcpTool?.inputSchema } : {}),
      ...(registeredTool?.outputSchema !== undefined ? { outputSchema: registeredTool.outputSchema } : {}),
      source: mcpTool ? 'mcp' : registeredTool?.source === 'plugin' ? 'plugin' : 'runtime',
      ...(registeredTool?.category ? { category: registeredTool.category } : {}),
      ...(registeredTool?.categories ? { categories: registeredTool.categories } : {}),
      registered: !!registeredTool,
      granted: !!grant && grant.mode !== 'deny',
      ...(registeredTool ? { permission: registeredTool.permission } : {}),
      ...(registeredTool ? { risk: registeredTool.risk } : {}),
      ...(registeredTool ? { projectScoped: registeredTool.projectScoped } : {}),
      approval,
      available: !unavailableReason,
      ...(unavailableReason ? { unavailableReason } : {}),
      requiresApproval: requiresToolApproval(registeredTool, approval),
    }
    discovered.push(tool)
    byName[name] = tool
    if (tool.available) available.push(tool)
    else blocked.push(tool)
  }

  return { discovered, available, blocked, byName }
}

function getUnavailableReason(options: {
  name: string
  mcpTool?: MCPTool
  registeredTool?: RegisteredTool
  grant?: ReturnType<typeof findManifestToolGrant>
  currentProjectId?: number
  activeSkills?: ResolvedAgentSkill[]
  userMessage?: string
  runRole?: AgentRunRole
}) {
  const authorizationReason = getToolAuthorizationUnavailableReason({
    registeredTool: options.registeredTool,
    grant: options.grant,
    hasMCPTool: Boolean(options.mcpTool),
    currentProjectId: options.currentProjectId,
    runRole: options.runRole,
  })
  if (authorizationReason) return authorizationReason
  if (options.activeSkills && !isToolVisibleForActiveBehavior({
    toolName: options.name,
    activeSkills: options.activeSkills,
    userMessage: options.userMessage ?? '',
  })) return 'workflow_scope'
  return undefined
}

function findManifestToolGrant(manifest: AgentManifest, toolName: string) {
  return findToolGrant(manifest, toolName)
    ?? manifest.tools.find((grant) => publicToolName(grant.name) === toolName)
}
