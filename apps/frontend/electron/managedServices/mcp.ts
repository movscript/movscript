import { startMCPServer } from '../mcp/server'
import {
  resolveAgentRuntimeControlTransportInput,
  type AgentRuntimeControlTransportKind,
} from '../services/agentRuntime/transport'

let mcpReadyPromise: Promise<number> | null = null
let loggedReadyEndpoint: string | null = null

export async function ensureMCPServerReady(): Promise<void> {
  mcpReadyPromise ??= startMCPServer().catch((error) => {
    mcpReadyPromise = null
    throw error
  })
  const port = await mcpReadyPromise
  const endpoint = `http://127.0.0.1:${port}/mcp`
  if (loggedReadyEndpoint !== endpoint) {
    loggedReadyEndpoint = endpoint
    console.info(`[bootstrap] MCP server ready at ${endpoint}`)
  }
}

export async function registerDesktopMCPProviderWithAgent(input: {
  baseURL?: string
  transportKind?: AgentRuntimeControlTransportKind
  socketPath?: string
} = {}): Promise<void> {
  const endpoint = process.env.MOVSCRIPT_MCP_ENDPOINT
  if (!endpoint) return
  const { transport } = resolveAgentRuntimeControlTransportInput(input)
  const res = await transport.request('/runtime/tool-providers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerId: 'desktop-main',
      endpoint,
      label: 'Desktop MCP provider',
    }),
  })
  if (!res.ok) {
    throw new Error(`Failed to register desktop MCP provider with agent runtime: HTTP ${res.status} ${await res.text().catch(() => '')}`)
  }
  console.info(`[bootstrap] registered desktop MCP provider with agent at ${transport.endpointLabel}`)
}
