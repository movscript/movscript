import type { JSONRPCRequest, JSONRPCResponse, JSONValue, MCPClientOptions, MCPResource, MCPTool } from './types.js'

export class MCPClient {
  private nextId = 1
  private readonly endpoint: string

  constructor(options: MCPClientOptions) {
    this.endpoint = options.endpoint
  }

  async initialize(): Promise<JSONValue> {
    return this.request('initialize', {
      protocolVersion: '2025-06-18',
      clientInfo: { name: 'movscript-production-runtime', version: '0.1.0' },
      capabilities: {},
    })
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

  async callTool(name: string, args: Record<string, JSONValue> = {}): Promise<JSONValue> {
    return this.request('tools/call', { name, arguments: args })
  }

  private async request<T = JSONValue>(method: string, params?: JSONValue): Promise<T> {
    const payload: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: this.nextId++,
      method,
      params,
    }

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

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
