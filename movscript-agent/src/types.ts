export type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue }

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

export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: JSONValue
}

export interface MCPClientOptions {
  endpoint: string
}
