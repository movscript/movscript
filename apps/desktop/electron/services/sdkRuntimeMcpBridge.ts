import {
  callMCPHostTool,
  listMCPHostTools,
  readMCPHostResource,
  toMCPJSONValue,
} from '@movscript/mcp-host'

const MOVSCRIPT_MCP_SERVER_ID = 'movscript'

export function listSdkRuntimeMcpServers(): {
  servers: Array<{
    id: string
    name: string
    status: 'running'
    toolCount: number
  }>
  tools: unknown[]
} {
  const tools = listMCPHostTools()
  return {
    servers: [{
      id: MOVSCRIPT_MCP_SERVER_ID,
      name: 'MovScript',
      status: 'running',
      toolCount: tools.length,
    }],
    tools,
  }
}

export async function callSdkRuntimeMcpTool(input: {
  server: string
  tool: string
  arguments?: unknown
  _meta?: unknown
}): Promise<{
  server: string
  tool: string
  result: unknown
}> {
  const server = input.server?.trim() || MOVSCRIPT_MCP_SERVER_ID
  if (server !== MOVSCRIPT_MCP_SERVER_ID) {
    throw new Error(`SDK runtime MCP bridge does not know server: ${server}`)
  }
  return {
    server,
    tool: input.tool,
    result: await callMCPHostTool({
      name: input.tool,
      arguments: toMCPJSONValue(isRecord(input.arguments) ? input.arguments : {}),
      ...(input._meta !== undefined ? { _meta: toMCPJSONValue(input._meta) } : {}),
    }),
  }
}

export async function readSdkRuntimeMcpResource(input: {
  server: string
  uri: string
}): Promise<{
  server: string
  uri: string
  result: unknown
}> {
  const server = input.server?.trim() || MOVSCRIPT_MCP_SERVER_ID
  if (server !== MOVSCRIPT_MCP_SERVER_ID) {
    throw new Error(`SDK runtime MCP bridge does not know server: ${server}`)
  }
  return {
    server,
    uri: input.uri,
    result: await readMCPHostResource(input.uri),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
