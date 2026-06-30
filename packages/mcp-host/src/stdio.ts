import readline from 'node:readline'
import { resolve } from 'node:path'
import {
  makeError,
  makeResult,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type MCPJSONValue,
  type MCPTool,
} from '@movscript/core/mcp/node'
import {
  LOCAL_RUNTIME_DAEMON_CONTROL_SERVICE,
  LOCAL_RUNTIME_DAEMON_GATEWAY_SERVICE,
} from '@movscript/local-runtime'
import {
  callDaemonMCPTool,
  daemonMCPCommandTools,
  daemonMCPRuntimeBootstrapToolNames,
  daemonMCPRuntimeBootstrapTools,
  handleDaemonMCPJSONRPC,
  listDaemonMCPTools,
  readDaemonMCPResource,
} from '@movscript/local-daemon/mcp'
import {
  findRuntimeEndpoint,
  findRuntimeService,
  readRuntimeHomeSnapshot,
  resolveMovScriptHomeDir,
  type RuntimeEndpointRecord,
  type RuntimeHomeSnapshot,
} from '@movscript/runtime-contracts'

export { runtimeConfigure, runtimeStatus } from '@movscript/local-daemon/mcp'

const MCP_HOST_DEBUG = process.env.MOVSCRIPT_MCP_HOST_DEBUG === '1'
const MCP_PROXY_TIMEOUT_MS = 3000
const LOCAL_NODE_CONTROL_SERVICE = LOCAL_RUNTIME_DAEMON_CONTROL_SERVICE
const LOCAL_NODE_GATEWAY_SERVICE = LOCAL_RUNTIME_DAEMON_GATEWAY_SERVICE
const DATA_SERVICE = 'movscript.data.service'
const PROJECT_SERVICE = 'movscript.project.service'
const EDITING_SERVICE = 'movscript.editing.service'
const LOCAL_SURFACE_HOST_SERVICE = 'movscript.local-surface.host'
const MEDIA_PIPELINE_SERVICE = 'movscript.media.pipeline'

export type MCPHostJSONRPCOptions = {
  proxyToDaemon?: boolean
  daemonEndpoint?: string
  proxyTimeoutMs?: number
}

export const hostTools: MCPTool[] = daemonMCPCommandTools

const runtimeBootstrapToolNames = daemonMCPRuntimeBootstrapToolNames
const runtimeBootstrapTools = daemonMCPRuntimeBootstrapTools

export async function startMCPStdioHost(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  })
  const pending = new Set<Promise<void>>()

  rl.on('line', (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const task = (async () => {
      try {
        const payload = JSON.parse(trimmed) as JSONRPCRequest | JSONRPCRequest[]
        const response = Array.isArray(payload)
          ? (await Promise.all(payload.map((item) => handleMCPHostJSONRPC(item, { proxyToDaemon: true })))).filter((item): item is JSONRPCResponse => item !== undefined)
          : await handleMCPHostJSONRPC(payload, { proxyToDaemon: true })
        if (Array.isArray(response)) {
          if (response.length > 0) writeMessage(response)
        } else if (response !== undefined) {
          writeMessage(response)
        }
      } catch (error) {
        writeMessage(makeError(null, -32700, 'Parse error', errorMessage(error)))
      }
    })()
    pending.add(task)
    task.finally(() => pending.delete(task))
  })

  await new Promise<void>((resolveClose) => {
    rl.on('close', async () => {
      await Promise.allSettled([...pending])
      resolveClose()
    })
  })
}

export async function handleMCPHostJSONRPC(
  req: JSONRPCRequest,
  options: MCPHostJSONRPCOptions = {},
): Promise<JSONRPCResponse | undefined> {
  const isNotification = !Object.prototype.hasOwnProperty.call(req, 'id')
  const id = isNotification ? null : req.id ?? null
  if (MCP_HOST_DEBUG) {
    process.stderr.write(`[movscript-mcp-host] method=${req?.method ?? ''} id=${String(id)}\n`)
  }
  if (req.jsonrpc !== '2.0' || !req.method) {
    if (isNotification) return undefined
    return makeError(id, -32600, 'Invalid Request')
  }

  try {
    if (shouldProxyToDaemon(req, options)) {
      const endpoint = resolveDaemonMCPEndpoint(req, options)
      if (endpoint) {
        return await proxyMCPHostJSONRPCToDaemon(req, endpoint, options)
      }
      if (req.method === 'tools/list') {
        return makeResult(id, { tools: runtimeBootstrapTools })
      }
      throw new Error('MovScript daemon MCP endpoint is not available. Call runtime_daemon_ensure first, then retry this MCP request.')
    }

    return handleDaemonMCPJSONRPC(req, {
      serverInfoName: 'movscript-mcp-host',
      serverInfoVersion: '0.1.28',
    })
  } catch (error) {
    if (isNotification) return undefined
    return makeError(id, -32000, errorMessage(error))
  }
}

export function listMCPHostTools(): MCPTool[] {
  return listDaemonMCPTools()
}

export async function callMCPHostTool(params: MCPJSONValue | undefined): Promise<MCPJSONValue> {
  return callDaemonMCPTool(params)
}

export async function readMCPHostResource(uri: string): Promise<MCPJSONValue> {
  return readDaemonMCPResource(uri)
}

function shouldProxyToDaemon(req: JSONRPCRequest, options: MCPHostJSONRPCOptions): boolean {
  if (options.proxyToDaemon === false) return false
  if (process.env.MOVSCRIPT_MCP_STDIO_PROXY === '0') return false
  if (process.env.MOVSCRIPT_MCP_HOST_PROXY_TO_DAEMON === '0') return false
  if (req.method === 'tools/list' || req.method === 'resources/list' || req.method === 'resources/read') return true
  if (req.method !== 'tools/call') return false
  const name = stringParam(req.params, 'name')
  return Boolean(name && !runtimeBootstrapToolNames.has(name))
}

function resolveDaemonMCPEndpoint(req: JSONRPCRequest, options: MCPHostJSONRPCOptions): string | undefined {
  const explicit = stringValue(options.daemonEndpoint ?? process.env.MOVSCRIPT_DAEMON_MCP_ENDPOINT)
  if (explicit) return normalizeMcpEndpoint(explicit)
  const args = objectParam(req.params, 'arguments')
  const homeDir = resolveRuntimeHomeArg(args)
  const endpoints = runtimeDiscoveredEndpoints(readRuntimeHomeSnapshot(homeDir))
  return endpoints.mcp
}

function normalizeMcpEndpoint(value: string): string {
  const trimmed = value.trim()
  if (trimmed.endsWith('/v1/mcp')) return trimmed
  if (trimmed.endsWith('/mcp')) return trimmed
  return `${trimmed.replace(/\/+$/, '')}/v1/mcp`
}

async function proxyMCPHostJSONRPCToDaemon(
  req: JSONRPCRequest,
  endpoint: string,
  options: MCPHostJSONRPCOptions,
): Promise<JSONRPCResponse | undefined> {
  const timeoutMs = options.proxyTimeoutMs ?? positiveNumberValue(Number(process.env.MOVSCRIPT_MCP_PROXY_TIMEOUT_MS)) ?? MCP_PROXY_TIMEOUT_MS
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (response.status === 202 || response.status === 204) return undefined
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`MovScript daemon MCP endpoint ${endpoint} returned HTTP ${response.status}${text ? `: ${text}` : ''}`)
  }
  if (!text.trim()) return undefined
  return JSON.parse(text) as JSONRPCResponse
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
  if (endpoints.gateway) endpoints.mcp = runtimeMcpEndpoint(endpoints.gateway)
  return endpoints
}

function setEndpoint(output: Record<string, string>, key: string, runtimeHome: RuntimeHomeSnapshot, serviceName: string): void {
  const endpoint = endpointURL(
    findRuntimeEndpoint(runtimeHome, serviceName)
      ?? findRuntimeService(runtimeHome, serviceName)?.endpoint,
  )
  if (endpoint) output[key] = endpoint
}

function runtimeMcpEndpoint(baseURL: string): string {
  const normalized = normalizeBaseURL(baseURL)
  return `${normalized}/v1/mcp`
}

function resolveRuntimeHomeArg(args: Record<string, unknown>): string {
  const homeDir = stringValue(args.homeDir ?? args.home_dir ?? args.movscriptHome ?? args.movscript_home)
  return homeDir ? resolve(homeDir) : resolveMovScriptHomeDir()
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

function objectParam(value: MCPJSONValue | undefined, key: string): Record<string, unknown> {
  if (!isRecord(value)) return {}
  const candidate = value[key]
  return isRecord(candidate) ? candidate : {}
}

function stringParam(value: MCPJSONValue | undefined, key: string): string | undefined {
  if (!isRecord(value)) return undefined
  return stringValue(value[key])
}

function normalizeBaseURL(value: string): string {
  return value.trim().replace(/\/+$/, '').replace(/\/api\/v1$/, '')
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function positiveNumberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function writeMessage(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
