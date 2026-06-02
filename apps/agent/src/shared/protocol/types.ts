import type {
  JSONValue,
  MCPResource as ProtocolMCPResource,
  MCPTool as ProtocolMCPTool,
} from '@movscript/protocol'

export type { JSONValue } from '@movscript/protocol'

export interface JSONRPCRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: JSONValue
}

export interface JSONRPCResponse<T = JSONValue> {
  jsonrpc: '2.0'
  id: number
  result?: T
  error?: {
    code: number
    message: string
    data?: JSONValue
  }
}

export type MCPResource = ProtocolMCPResource & {
  name: string
}

export type MCPTool = ProtocolMCPTool & {
  description: string
  inputSchema: JSONValue
}

export interface MCPClientOptions {
  endpoint: string
}
