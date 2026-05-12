import type { JSONRPCRequest, JSONRPCResponse, JSONValue, MCPClientOptions, MCPResource, MCPTool } from './types.js'

export class MCPClient {
  private nextId = 1
  private readonly endpoint: string

  constructor(options: MCPClientOptions) {
    this.endpoint = options.endpoint
  }

  async initialize(options: { signal?: AbortSignal } = {}): Promise<JSONValue> {
    return this.request('initialize', {
      protocolVersion: '2025-06-18',
      clientInfo: { name: 'movscript-agent', version: '0.1.0' },
      capabilities: {},
    }, options)
  }

  async listResources(): Promise<MCPResource[]> {
    const result = await this.request<{ resources: MCPResource[] }>('resources/list')
    return result.resources
  }

  async readResource(uri: string): Promise<JSONValue> {
    return this.request('resources/read', { uri })
  }

  async listTools(): Promise<MCPTool[]> {
    const result = await this.request<{ tools: MCPTool[] }>('tools/list')
    return result.tools
  }

  async callTool(name: string, args: Record<string, JSONValue> = {}, options: { signal?: AbortSignal } = {}): Promise<JSONValue> {
    return this.request('tools/call', { name, arguments: args }, options)
  }

  private async request<T = JSONValue>(method: string, params?: JSONValue, options: { signal?: AbortSignal } = {}): Promise<T> {
    const payload: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: this.nextId++,
      method,
      params,
    }

    let res: Response
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: options.signal,
      })
    } catch (error) {
      throw new Error(`MCP request failed (${method} ${this.endpoint}): ${formatError(error)}`)
    }

    if (!res.ok) {
      throw new Error(`MCP HTTP ${res.status}: ${await res.text()}`)
    }

    const json = await res.json() as JSONRPCResponse<T>
    if (json.error) {
      throw new Error(`MCP ${json.error.code}: ${json.error.message}`)
    }
    if (json.result === undefined) {
      throw new Error(`MCP ${method} returned no result`)
    }
    return json.result
  }
}

function formatError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const details = collectErrorDetails(error)
  return details.length > 0 ? `${error.message}; ${details.join(', ')}` : error.message
}

function collectErrorDetails(error: Error): string[] {
  const details: string[] = []
  details.push(`name=${error.name}`)

  const anyError = error as Error & {
    cause?: unknown
    code?: unknown
    errno?: unknown
    syscall?: unknown
    address?: unknown
    port?: unknown
    hostname?: unknown
  }

  if (typeof anyError.code === 'string') details.push(`code=${anyError.code}`)
  if (typeof anyError.errno === 'string' || typeof anyError.errno === 'number') details.push(`errno=${String(anyError.errno)}`)
  if (typeof anyError.syscall === 'string') details.push(`syscall=${anyError.syscall}`)
  if (typeof anyError.address === 'string') details.push(`address=${anyError.address}`)
  if (typeof anyError.port === 'string' || typeof anyError.port === 'number') details.push(`port=${String(anyError.port)}`)
  if (typeof anyError.hostname === 'string') details.push(`hostname=${anyError.hostname}`)

  if (anyError.cause instanceof Error) {
    details.push(`cause=${summarizeCause(anyError.cause)}`)
  } else if (isRecord(anyError.cause)) {
    const causeParts: string[] = []
    for (const key of ['code', 'errno', 'syscall', 'address', 'port', 'hostname', 'message'] as const) {
      const value = anyError.cause[key]
      if (typeof value === 'string' || typeof value === 'number') causeParts.push(`${key}=${String(value)}`)
    }
    if (causeParts.length > 0) details.push(`cause=${causeParts.join(' ')}`)
  } else if (anyError.cause !== undefined) {
    details.push(`cause=${String(anyError.cause)}`)
  }

  return details
}

function summarizeCause(error: Error): string {
  const parts: string[] = [error.message]
  const anyError = error as Error & {
    code?: unknown
    errno?: unknown
    syscall?: unknown
    address?: unknown
    port?: unknown
    hostname?: unknown
  }
  for (const [key, value] of Object.entries({
    code: anyError.code,
    errno: anyError.errno,
    syscall: anyError.syscall,
    address: anyError.address,
    port: anyError.port,
    hostname: anyError.hostname,
  })) {
    if (typeof value === 'string' || typeof value === 'number') parts.push(`${key}=${String(value)}`)
  }
  return parts.join(' ')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
