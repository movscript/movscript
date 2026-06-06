import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import {
  addressPort,
  isAddressInUseError,
  listenOnPort,
  mcpEndpointForPort,
} from './listen'
import {
  DEFAULT_MCP_PORT,
  probeMCPServerStatus,
  type MCPServerStatus,
} from '../serverStatus'

const MAX_PORT_PROBES = 20

let server: Server | null = null

export type { MCPServerStatus } from '../serverStatus'

export async function getMCPServerStatus(): Promise<MCPServerStatus> {
  return probeMCPServerStatus({ server })
}

export async function startMCPHTTPServer(handleHTTP: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void): Promise<number> {
  if (server?.listening) return addressPort(server) ?? DEFAULT_MCP_PORT

  const requestedPort = Number(process.env.MOVSCRIPT_MCP_PORT || DEFAULT_MCP_PORT)
  const ports = process.env.MOVSCRIPT_MCP_PORT
    ? [requestedPort]
    : Array.from({ length: MAX_PORT_PROBES }, (_item, index) => requestedPort + index)
  let lastError: unknown
  for (const port of ports) {
    const nextServer = createServer(handleHTTP)
    // Keep-alive intentionally disabled: clients may otherwise reuse a half-open
    // socket after Electron main-process restarts (dev hot reload) and observe a 3ms ECONNRESET.
    // Pair with the per-response `Connection: close` header in writeJSON so every fetch opens a
    // fresh TCP connection.
    nextServer.keepAliveTimeout = 0
    try {
      await listenOnPort(nextServer, port)
      server = nextServer
      process.env.MOVSCRIPT_MCP_ENDPOINT = mcpEndpointForPort(port)
      console.info(`[mcp] MovScript MCP server listening on ${process.env.MOVSCRIPT_MCP_ENDPOINT}`)
      return port
    } catch (error) {
      lastError = error
      nextServer.close()
      if (!isAddressInUseError(error)) throw error
      if (process.env.MOVSCRIPT_MCP_PORT) {
        throw new Error(`MovScript MCP port ${port} is already in use. Stop the existing process or set MOVSCRIPT_MCP_PORT to a free port.`)
      }
      console.warn(`[mcp] port ${port} is already in use; trying ${port + 1}`)
    }
  }

  throw new Error(`Unable to start MovScript MCP server near port ${requestedPort}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

export async function stopMCPServer(): Promise<void> {
  if (!server) return
  await new Promise<void>((resolve) => server!.close(() => resolve()))
  server = null
}
