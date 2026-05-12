import type { MCPResource, MCPTool } from '../state/types.js'
import {
  findToolGrant,
  manifestAllowsPermission,
  type AgentManifest,
  type AgentToolApprovalMode,
} from '../manifest/agentManifest.js'
import { DEFAULT_TOOL_REGISTRY, type RegisteredTool, type ToolRegistry } from './toolRegistry.js'
import { publicToolName } from './toolNames.js'
import type {
  AgentCapabilitiesResponse,
  AgentDebugTool,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
  ToolUnavailableReason,
} from '../state/types.js'

// activeSkills and userMessage are accepted for backward-compatible call sites,
// but tool visibility is no longer gated by skill/category/appliesWhen intersection —
// any tool that is registered, MCP-reachable, manifest-granted, and permission-passing
// is exposed to the model. Approval policy (never/always/on_write) still applies.

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

  return {
    defaultAgentManifest: options.manifest,
    ...(options.updates ? { updates: options.updates } : {}),
    ...(options.pluginCatalog ? { pluginCatalog: options.pluginCatalog } : {}),
    mcp: {
      connected,
      resources,
      tools,
      ...(error ? { error } : {}),
    },
    registry: registry.list(),
    resolvedTools: resolveToolCatalog({
      mcpTools: tools,
      registry,
      manifest: options.manifest,
      currentProjectId: options.currentProjectId,
      mcpConnected: connected,
      activeSkills: options.activeSkills,
      userMessage: options.userMessage,
    }),
    warnings,
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
    const approval = grant?.approval ?? defaultApproval(registeredTool)
    const unavailableReason = getUnavailableReason({
      name,
      mcpTool,
      registeredTool,
      manifest: options.manifest,
      currentProjectId: options.currentProjectId,
      mcpConnected: options.mcpConnected ?? true,
    })
    const tool: AgentDebugTool = {
      name,
      ...(registeredTool?.description || mcpTool?.description ? { description: registeredTool?.description ?? mcpTool?.description } : {}),
      ...(registeredTool?.inputSchema !== undefined || mcpTool?.inputSchema !== undefined ? { inputSchema: registeredTool?.inputSchema ?? mcpTool?.inputSchema } : {}),
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
      requiresApproval: requiresApproval(registeredTool, approval),
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
  manifest: AgentManifest
  currentProjectId?: number
  mcpConnected: boolean
}): ToolUnavailableReason | undefined {
  if (!options.registeredTool) return 'unregistered'
  if (!options.mcpTool && options.registeredTool.source !== 'runtime') return 'mcp_unavailable'
  const grant = findManifestToolGrant(options.manifest, options.name)
  if (grant?.mode === 'deny') return 'denied'
  if (!grant) return 'not_granted'
  if (!manifestAllowsPermission(options.manifest, options.registeredTool.permission)) return 'missing_permission'
  if (options.registeredTool.projectScoped && options.currentProjectId === undefined) return 'missing_project'
  return undefined
}

function findManifestToolGrant(manifest: AgentManifest, toolName: string) {
  return findToolGrant(manifest, toolName)
    ?? manifest.tools.find((grant) => publicToolName(grant.name) === toolName)
}

function defaultApproval(tool?: RegisteredTool): AgentToolApprovalMode {
  if (!tool) return 'always'
  return tool.requiresApprovalByDefault ? 'always' : 'never'
}

function requiresApproval(tool: RegisteredTool | undefined, grantApproval: AgentToolApprovalMode): boolean {
  if (!tool) return true
  if (grantApproval === 'never') return false
  if (grantApproval === 'always') return true
  return tool.risk === 'write' || tool.risk === 'generate' || tool.risk === 'destructive'
}

