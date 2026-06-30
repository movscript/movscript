import { resolve } from 'node:path'
import {
  callTool,
  handleJSONRPC,
  listResources,
  listTools,
  makeError,
  makeResult,
  readResource,
  setMCPDefaultWorkspaceDir,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type MCPJSONValue,
  type MCPTool,
} from '@movscript/core/mcp/node'
import {
  setMovScriptBackendAPIBaseURL,
} from '@movscript/core/backend/node'
import {
  adminCommandSpecs,
  contextCommandSpecs,
  editingCommandSpecs,
  isAdminMCPToolName,
  isContextMCPToolName,
  isEditingMCPToolName,
  isRuntimeMCPToolName,
  isSystemMCPToolName,
  isTimelineMCPToolName,
  isWorkspaceMCPToolName,
  runMovScriptAdminCommand,
  runMovScriptContextCommand,
  runMovScriptEditingCommand,
  runMovScriptRuntimeCommand,
  runMovScriptSystemCommand,
  runMovScriptTimelineCommand,
  runMovScriptWorkspaceCommand,
  runtimeCommandSpecs,
  systemCommandSpecs,
  timelineCommandSpecs,
  unwrapCommandDataWithDebug,
  workspaceCommandSpecs,
} from '@movscript/cli-commands'
import {
  LOCAL_RUNTIME_DAEMON_CONTROL_SERVICE,
  LOCAL_RUNTIME_DAEMON_GATEWAY_SERVICE,
} from '@movscript/local-runtime'
import {
  findRuntimeEndpoint,
  findRuntimeService,
  readRuntimeHomeSnapshot,
  resolveMovScriptHomeDir,
  type RuntimeEndpointRecord,
  type RuntimeHomeSnapshot,
} from '@movscript/runtime-contracts'

export { runtimeConfigure, runtimeStatus } from '@movscript/cli-commands'

const LOCAL_NODE_CONTROL_SERVICE = LOCAL_RUNTIME_DAEMON_CONTROL_SERVICE
const LOCAL_NODE_GATEWAY_SERVICE = LOCAL_RUNTIME_DAEMON_GATEWAY_SERVICE
const DATA_SERVICE = 'movscript.data.service'
const PROJECT_SERVICE = 'movscript.project.service'
const EDITING_SERVICE = 'movscript.editing.service'
const LOCAL_SURFACE_HOST_SERVICE = 'movscript.local-surface.host'
const MEDIA_PIPELINE_SERVICE = 'movscript.media.pipeline'

export type DaemonMCPJSONRPCOptions = {
  touchRuntime?: boolean
  serverInfoName?: string
  serverInfoVersion?: string
}

const adminTools: MCPTool[] = commandSpecsToMCPTools(adminCommandSpecs)
const contextTools: MCPTool[] = commandSpecsToMCPTools(contextCommandSpecs)
const editingTools: MCPTool[] = commandSpecsToMCPTools(editingCommandSpecs)
const runtimeTools: MCPTool[] = commandSpecsToMCPTools(runtimeCommandSpecs)
const systemTools: MCPTool[] = commandSpecsToMCPTools(systemCommandSpecs)
const timelineTools: MCPTool[] = commandSpecsToMCPTools(timelineCommandSpecs)
const workspaceTools: MCPTool[] = commandSpecsToMCPTools(workspaceCommandSpecs)

export const daemonMCPCommandTools: MCPTool[] = [
  ...adminTools,
  ...contextTools,
  ...editingTools,
  ...runtimeTools,
  ...systemTools,
  ...timelineTools,
  ...workspaceTools,
]

export const daemonMCPRuntimeBootstrapToolNames = new Set(runtimeTools.map((tool) => tool.name))
export const daemonMCPRuntimeBootstrapTools = mergeTools(
  daemonMCPCommandTools.filter((tool) => daemonMCPRuntimeBootstrapToolNames.has(tool.name)),
  [],
)

export async function handleDaemonMCPJSONRPC(
  req: JSONRPCRequest,
  options: DaemonMCPJSONRPCOptions = {},
): Promise<JSONRPCResponse | undefined> {
  const isNotification = !Object.prototype.hasOwnProperty.call(req, 'id')
  const id = isNotification ? null : req.id ?? null
  if (req.jsonrpc !== '2.0' || !req.method) {
    if (isNotification) return undefined
    return makeError(id, -32600, 'Invalid Request')
  }

  try {
    switch (req.method) {
      case 'initialize':
        return makeResult(id, {
          protocolVersion: '2025-06-18',
          serverInfo: {
            name: options.serverInfoName ?? 'movscript-daemon-mcp',
            version: options.serverInfoVersion ?? '0.1.0',
          },
          capabilities: { resources: {}, tools: {} },
        })
      case 'initialized':
      case 'notifications/initialized':
      case 'notifications/cancelled':
      case 'notifications/progress':
        return undefined
      case 'ping':
        return makeResult(id, {})
      case 'tools/list':
        return makeResult(id, { tools: listDaemonMCPTools() })
      case 'tools/call':
        if (options.touchRuntime !== false) {
          await touchLocalNode().catch(() => undefined)
        }
        return makeResult(id, await callDaemonMCPTool(req.params))
      case 'resources/list':
        return makeResult(id, { resources: listResources() })
      case 'resources/read':
        return makeResult(id, await readResource(stringParam(req.params, 'uri') ?? ''))
      default:
        return handleJSONRPC(req)
    }
  } catch (error) {
    if (isNotification) return undefined
    return makeError(id, -32000, errorMessage(error))
  }
}

export function listDaemonMCPTools(): MCPTool[] {
  return mergeTools(daemonMCPCommandTools, listTools())
}

export async function callDaemonMCPTool(params: MCPJSONValue | undefined): Promise<MCPJSONValue> {
  const name = stringParam(params, 'name')
  const args = objectParam(params, 'arguments')
  if (isRuntimeMCPToolName(name)) {
    return unwrapCommandDataWithDebug(await runMovScriptRuntimeCommand(name!, args)) as MCPJSONValue
  }
  if (isContextMCPToolName(name)) {
    return unwrapCommandDataWithDebug(await runMovScriptContextCommand(name!, args)) as MCPJSONValue
  }
  if (isAdminMCPToolName(name)) {
    return unwrapCommandDataWithDebug(await runMovScriptAdminCommand(name!, args)) as MCPJSONValue
  }
  if (isSystemMCPToolName(name)) {
    return unwrapCommandDataWithDebug(await runMovScriptSystemCommand(name!, args)) as MCPJSONValue
  }
  if (isEditingMCPToolName(name)) {
    return unwrapCommandDataWithDebug(await runMovScriptEditingCommand(name!, args)) as MCPJSONValue
  }
  if (isTimelineMCPToolName(name)) {
    return unwrapCommandDataWithDebug(await runMovScriptTimelineCommand(name!, args)) as MCPJSONValue
  }
  if (isWorkspaceMCPToolName(name)) {
    return unwrapCommandDataWithDebug(await runMovScriptWorkspaceCommand(name!, args)) as MCPJSONValue
  }
  bindBackendRuntimeForCoreTools(args)
  return callTool(params)
}

export async function readDaemonMCPResource(uri: string): Promise<MCPJSONValue> {
  return readResource(uri)
}

function commandSpecsToMCPTools(tools: Array<{
  mcpToolName: string
  mcpAliases?: string[]
  description: string
  inputSchema: unknown
  outputSchema: unknown
}>): MCPTool[] {
  return tools.flatMap((tool) => [
    {
      name: tool.mcpToolName,
      description: tool.description,
      inputSchema: tool.inputSchema as MCPTool['inputSchema'],
      outputSchema: tool.outputSchema as MCPTool['outputSchema'],
    },
    ...(tool.mcpAliases ?? []).map((alias) => ({
      name: alias,
      description: `Compatibility alias for ${tool.mcpToolName}. ${tool.description}`,
      inputSchema: tool.inputSchema as MCPTool['inputSchema'],
      outputSchema: tool.outputSchema as MCPTool['outputSchema'],
    })),
  ])
}

function runtimeDiscoveredEndpoints(runtimeHome: RuntimeHomeSnapshot): Record<string, string> {
  const endpoints: Record<string, string> = {}
  setEndpoint(endpoints, 'control', runtimeHome, LOCAL_NODE_CONTROL_SERVICE)
  setEndpoint(endpoints, 'gateway', runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)
  setEndpoint(endpoints, 'dataService', runtimeHome, DATA_SERVICE)
  setEndpoint(endpoints, 'projectService', runtimeHome, PROJECT_SERVICE)
  setEndpoint(endpoints, 'editingService', runtimeHome, EDITING_SERVICE)
  setEndpoint(endpoints, 'surfaceHost', runtimeHome, LOCAL_SURFACE_HOST_SERVICE)
  setEndpoint(endpoints, 'mediaPipeline', runtimeHome, MEDIA_PIPELINE_SERVICE)
  return endpoints
}

function setEndpoint(output: Record<string, string>, key: string, runtimeHome: RuntimeHomeSnapshot, serviceName: string): void {
  const endpoint = endpointURL(
    findRuntimeEndpoint(runtimeHome, serviceName)
      ?? findRuntimeService(runtimeHome, serviceName)?.endpoint,
  )
  if (endpoint) output[key] = endpoint
}

async function touchLocalNode(): Promise<void> {
  const homeDir = resolveMovScriptHomeDir()
  const endpoint = endpointURL(findRuntimeEndpoint(readRuntimeHomeSnapshot(homeDir), LOCAL_NODE_CONTROL_SERVICE))
  if (!endpoint) return
  await fetch(`${endpoint}/touch`, { method: 'POST', signal: AbortSignal.timeout(750) })
}

function resolveRuntimeHomeArg(args: Record<string, unknown>): string {
  const homeDir = stringValue(args.homeDir ?? args.home_dir ?? args.movscriptHome ?? args.movscript_home)
  return homeDir ? resolve(homeDir) : resolveMovScriptHomeDir()
}

function bindBackendRuntimeForCoreTools(args: Record<string, unknown>): void {
  const homeDir = resolveRuntimeHomeArg(args)
  const runtimeHome = readRuntimeHomeSnapshot(homeDir)
  const endpoints = runtimeDiscoveredEndpoints(runtimeHome)
  const backendEndpoint = endpoints.gateway ?? endpoints.dataService
  if (backendEndpoint) setMovScriptBackendAPIBaseURL(backendEndpoint)
  if (backendEndpoint && args.mcp_base_url === undefined && args.mcpBaseURL === undefined) {
    args.mcp_base_url = backendEndpoint
  }

  const agentSurfaceEndpoint = endpoints.gateway ?? endpoints.surfaceHost
  if (agentSurfaceEndpoint && args.frontend_origin === undefined && args.frontendOrigin === undefined) {
    args.frontend_origin = agentSurfaceEndpoint
  }

  const workspaceDir = stringValue(args.workspaceDir ?? args.workspace_dir)
    ?? stringValue(args.projectDir ?? args.project_dir)
    ?? stringValue(args.projectPath ?? args.project_path)
    ?? stringValue(args.cwd)
    ?? process.env.MOVSCRIPT_WORKSPACE_DIR
  if (workspaceDir) setMCPDefaultWorkspaceDir(resolve(workspaceDir))
}

function endpointURL(endpoint: RuntimeEndpointRecord | undefined): string | undefined {
  if (!endpoint) return undefined
  if (endpoint.protocol && endpoint.protocol !== 'http' && endpoint.protocol !== 'https') return undefined
  if (endpoint.url) return endpoint.url
  if (endpoint.baseURL) return endpoint.baseURL
  if (endpoint.port && endpoint.protocol === 'http') return `http://127.0.0.1:${endpoint.port}`
  if (endpoint.port) return `http://127.0.0.1:${endpoint.port}`
  return undefined
}

function mergeTools(primary: MCPTool[], secondary: MCPTool[]): MCPTool[] {
  const seen = new Set<string>()
  const tools: MCPTool[] = []
  for (const tool of [...primary, ...secondary]) {
    if (seen.has(tool.name)) continue
    seen.add(tool.name)
    tools.push(tool)
  }
  return tools
}

function objectParam(value: MCPJSONValue | undefined, key: string): Record<string, unknown> {
  if (!isRecord(value)) return {}
  const candidate = value[key]
  return isRecord(candidate) ? candidate : {}
}

function stringParam(value: MCPJSONValue | undefined, key: string): string | undefined {
  if (!isRecord(value)) return undefined
  return stringValue(value[key])
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
