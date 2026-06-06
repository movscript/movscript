import { startMCPServer } from '../mcp/server'

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
