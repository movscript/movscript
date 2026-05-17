import type { JSONRPCRequest, JSONRPCResponse, JSONValue, MCPClientOptions, MCPResource, MCPTool } from './types.js'
import { isRecord } from './jsonValue.js'

const TRANSIENT_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
])

const RETRY_BACKOFF_MS = [50, 200] as const

export class MCPError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly data: JSONValue | undefined,
  ) {
    super(message)
    this.name = 'MCPError'
  }
}

export class MCPClient {
  private nextId = 1
  private readonly endpoint: string
  private readonly debug = process.env.MOVSCRIPT_MCP_DEBUG === '1'

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
    const requestId = payload.id
    const startedAt = Date.now()
    const body = JSON.stringify(payload)

    if (this.debug) {
      console.info(`[mcp-client] request id=${requestId} method=${method} endpoint=${this.endpoint} bytes=${body.length}`)
    }

    let res: Response
    let attempt = 0
    while (true) {
      try {
        res = await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: options.signal,
        })
        break
      } catch (error) {
        const transient = isTransientFetchError(error) && !options.signal?.aborted
        if (!transient || attempt >= RETRY_BACKOFF_MS.length) {
          const elapsedMs = Date.now() - startedAt
          throw new Error(`MCP request failed (${method} ${this.endpoint} requestId=${requestId} elapsedMs=${elapsedMs}): ${formatError(error)}`)
        }
        const delayMs = RETRY_BACKOFF_MS[attempt]
        attempt++
        if (this.debug) {
          console.warn(`[mcp-client] retry id=${requestId} method=${method} attempt=${attempt} delayMs=${delayMs} reason=${formatError(error)}`)
        }
        // Pre-response transport failures mean the server never produced a reply, so retrying does
        // not duplicate side effects. Common cause: Electron main-process restart in dev mode
        // killing the MCP listener mid-keep-alive (3ms ECONNRESET).
        await delay(delayMs, options.signal)
      }
    }

    const elapsedMs = Date.now() - startedAt
    if (this.debug) {
      console.info(`[mcp-client] response id=${requestId} method=${method} status=${res.status} elapsedMs=${elapsedMs}`)
    }

    if (!res.ok) {
      throw new Error(`MCP HTTP ${res.status} (${method} ${this.endpoint} requestId=${requestId} elapsedMs=${elapsedMs}): ${await safeReadResponseText(res)}`)
    }

    let json: JSONRPCResponse<T>
    try {
      json = await res.json() as JSONRPCResponse<T>
    } catch (error) {
      throw new Error(`MCP invalid JSON (${method} ${this.endpoint} requestId=${requestId} elapsedMs=${Date.now() - startedAt}): ${formatError(error)}`)
    }
    if (json.error) {
      throw new MCPError(
        `MCP ${json.error.code} (${method} ${this.endpoint} requestId=${requestId} elapsedMs=${Date.now() - startedAt}): ${json.error.message}${json.error.data !== undefined ? `; data=${formatJSONValue(json.error.data)}` : ''}`,
        json.error.code,
        json.error.data,
      )
    }
    if (json.result === undefined) {
      throw new Error(`MCP ${method} returned no result (${this.endpoint} requestId=${requestId} elapsedMs=${Date.now() - startedAt})`)
    }
    return json.result
  }
}

function formatJSONValue(value: JSONValue): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

async function safeReadResponseText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch (error) {
    return `failed to read response body: ${formatError(error)}`
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

function isTransientFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const candidates: unknown[] = [error]
  const cause = (error as Error & { cause?: unknown }).cause
  if (cause !== undefined) candidates.push(cause)
  for (const candidate of candidates) {
    if (candidate instanceof Error) {
      const code = (candidate as Error & { code?: unknown }).code
      if (typeof code === 'string' && TRANSIENT_ERROR_CODES.has(code)) return true
      if (/socket hang up/i.test(candidate.message)) return true
      continue
    }
    if (isRecord(candidate)) {
      if (typeof candidate.code === 'string' && TRANSIENT_ERROR_CODES.has(candidate.code)) return true
      if (typeof candidate.message === 'string' && /socket hang up/i.test(candidate.message)) return true
    }
  }
  return false
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new Error('aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
