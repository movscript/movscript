import {
  listResources,
  makeError,
  makeResult,
  readResource,
  renderMarkdown,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type MCPJSONValue,
  type MCPTool,
  toMCPJSONValue,
} from '@movscript/core/mcp/node'
import {
  adminCommandSpecs,
  contextCommandSpecs,
  domainCommandSpecs,
  editingCommandSpecs,
  isAdminMCPToolName,
  isContextMCPToolName,
  isDomainMCPToolName,
  isEditingMCPToolName,
  isProductionEditingMCPToolName,
  isRuntimeMCPToolName,
  isSystemMCPToolName,
  productionEditingCommandSpecs,
  runMovScriptAdminCommand,
  runMovScriptContextCommand,
  runMovScriptDomainCommand,
  runMovScriptEditingCommand,
  runMovScriptProductionEditingCommand,
  runMovScriptRuntimeCommand,
  runMovScriptSystemCommand,
  runtimeCommandSpecs,
  systemCommandSpecs,
  unwrapCommandDataWithDebug,
} from '@movscript/cli-commands'
import {
  LOCAL_RUNTIME_DAEMON_CONTROL_SERVICE,
} from '@movscript/local-runtime'
import {
  findRuntimeEndpoint,
  readRuntimeHomeSnapshot,
  resolveMovScriptHomeDir,
  type RuntimeEndpointRecord,
} from '@movscript/runtime-contracts'

export { runtimeConfigure, runtimeStatus } from '@movscript/cli-commands'

const LOCAL_NODE_CONTROL_SERVICE = LOCAL_RUNTIME_DAEMON_CONTROL_SERVICE

export type DaemonMCPJSONRPCOptions = {
  touchRuntime?: boolean
  serverInfoName?: string
  serverInfoVersion?: string
}

const adminTools: MCPTool[] = commandSpecsToMCPTools(adminCommandSpecs)
const contextTools: MCPTool[] = commandSpecsToMCPTools(contextCommandSpecs)
const domainTools: MCPTool[] = commandSpecsToMCPTools(domainCommandSpecs)
const editingTools: MCPTool[] = commandSpecsToMCPTools(editingCommandSpecs)
const productionEditingTools: MCPTool[] = commandSpecsToMCPTools(productionEditingCommandSpecs)
const runtimeTools: MCPTool[] = commandSpecsToMCPTools(runtimeCommandSpecs)
const systemTools: MCPTool[] = commandSpecsToMCPTools(systemCommandSpecs)

export const daemonMCPCommandTools: MCPTool[] = [
  ...adminTools,
  ...contextTools,
  ...domainTools,
  ...editingTools,
  ...productionEditingTools,
  ...runtimeTools,
  ...systemTools,
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
        return makeResult(id, toMCPCallToolResult(await callDaemonMCPTool(req.params)))
      case 'resources/list':
        return makeResult(id, { resources: listResources() })
      case 'resources/read':
        return makeResult(id, await readResource(stringParam(req.params, 'uri') ?? ''))
      default:
        if (isNotification) return undefined
        return makeError(id, -32601, 'Method not found')
    }
  } catch (error) {
    if (isNotification) return undefined
    return makeError(id, -32000, errorMessage(error))
  }
}

export function listDaemonMCPTools(): MCPTool[] {
  return [...daemonMCPCommandTools]
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
  if (isDomainMCPToolName(name)) {
    return unwrapCommandDataWithDebug(await runMovScriptDomainCommand(name!, args)) as MCPJSONValue
  }
  if (isEditingMCPToolName(name)) {
    return unwrapCommandDataWithDebug(await runMovScriptEditingCommand(name!, args)) as MCPJSONValue
  }
  if (isProductionEditingMCPToolName(name)) {
    return unwrapCommandDataWithDebug(await runMovScriptProductionEditingCommand(name!, args)) as MCPJSONValue
  }
  throw new Error(`unknown daemon MCP tool: ${name ?? '<missing>'}`)
}

export function toMCPCallToolResult(value: unknown): MCPJSONValue {
  const normalized = toMCPJSONValue(value ?? null)
  if (isCallToolResultLike(normalized)) return normalizeCallToolResult(normalized)
  const passthroughFields = isRecord(normalized) ? normalized : {}
  return {
    ...passthroughFields,
    content: [
      {
        type: 'text',
        text: renderMarkdown(value ?? null),
      },
    ],
    structuredContent: normalized,
    data: normalized,
  }
}

function normalizeCallToolResult(value: Record<string, MCPJSONValue>): MCPJSONValue {
  const data = value.data
  const structuredContent = value.structuredContent ?? value.structured_content ?? data
  const result: Record<string, MCPJSONValue> = {
    ...value,
    content: Array.isArray(value.content) ? value.content : [],
  }
  if (structuredContent !== undefined) result.structuredContent = toMCPJSONValue(structuredContent)
  if (value.isError !== undefined) result.isError = toMCPJSONValue(value.isError)
  if (value._meta !== undefined) result._meta = toMCPJSONValue(value._meta)
  if (data !== undefined) result.data = toMCPJSONValue(data)
  return result
}

export async function readDaemonMCPResource(uri: string): Promise<MCPJSONValue> {
  return readResource(uri)
}

function commandSpecsToMCPTools(tools: Array<{
  mcpToolName: string
  mcpAliases?: string[]
  description: string
  stability?: string
  inputSchema: unknown
  outputSchema: unknown
}>): MCPTool[] {
  return tools.flatMap((tool) => {
    const description = tool.stability === 'temporary_fallback'
      ? `Temporary fallback (migration-only): ${tool.description}`
      : tool.description
    return [
      {
        name: tool.mcpToolName,
        description,
        inputSchema: tool.inputSchema as MCPTool['inputSchema'],
        outputSchema: tool.outputSchema as MCPTool['outputSchema'],
      },
      ...(tool.mcpAliases ?? []).map((alias) => ({
        name: alias,
        description: tool.stability === 'temporary_fallback'
          ? `Temporary fallback compatibility alias for ${tool.mcpToolName}. ${tool.description}`
          : `Compatibility alias for ${tool.mcpToolName}. ${tool.description}`,
        inputSchema: tool.inputSchema as MCPTool['inputSchema'],
        outputSchema: tool.outputSchema as MCPTool['outputSchema'],
      })),
    ]
  })
}

async function touchLocalNode(): Promise<void> {
  const homeDir = resolveMovScriptHomeDir()
  const endpoint = endpointURL(findRuntimeEndpoint(readRuntimeHomeSnapshot(homeDir), LOCAL_NODE_CONTROL_SERVICE))
  if (!endpoint) return
  await fetch(`${endpoint}/touch`, { method: 'POST', signal: AbortSignal.timeout(750) })
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

function isCallToolResultLike(value: MCPJSONValue): value is Record<string, MCPJSONValue> {
  return isRecord(value)
    && (
      isMCPContentArray(value.content)
      || value.structuredContent !== undefined
      || value.structured_content !== undefined
      || value.isError !== undefined
      || value._meta !== undefined
    )
}

function isMCPContentArray(value: unknown): value is MCPJSONValue[] {
  return Array.isArray(value)
    && value.every((item) => isRecord(item) && typeof item.type === 'string')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
