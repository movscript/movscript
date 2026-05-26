import { startMCPServer } from '../mcp/server'

export async function ensureMCPServerReady(): Promise<void> {
  const port = await startMCPServer()
  console.info(`[bootstrap] MCP server ready at http://127.0.0.1:${port}/mcp`)
}
