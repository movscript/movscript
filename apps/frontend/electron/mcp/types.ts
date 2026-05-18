export type MCPPrimitive = string | number | boolean | null
export type MCPJSONValue = MCPPrimitive | MCPJSONValue[] | { [key: string]: MCPJSONValue }

export interface JSONRPCRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: MCPJSONValue
}

export interface JSONRPCError {
  code: number
  message: string
  data?: unknown
}

export interface JSONRPCResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: JSONRPCError
}

export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface MCPObjectSchema {
  type: 'object'
  properties: Record<string, MCPJSONValue>
  required?: string[]
  anyOf?: Array<{ required: string[] }>
  allOf?: Array<{ anyOf: Array<{ required: string[] }> }>
  additionalProperties?: boolean
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: MCPObjectSchema
  outputSchema?: MCPObjectSchema
}

export interface MCPContextSnapshot {
  route: {
    pathname: string
    search: string
    hash: string
  }
  project: {
    id: number
    name: string
    description?: string
    status?: string
    totalEpisodes?: number
  } | null
  productionId?: number | null
  user: {
    id: number
    username: string
    systemRole: string
  } | null
  selection: {
    entityType?: string
    entityId?: number
    label?: string
  } | null
  updatedAt: string
}
