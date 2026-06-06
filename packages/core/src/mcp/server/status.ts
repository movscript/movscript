import type { Server } from 'node:http'
import { addressPort, mcpEndpointForPort } from './listen.js'
import {
  probeMCPHealth,
  probeMCPInitialize,
  type MCPHealthProbeResult,
  type MCPInitializeProbeResult,
} from './probes.js'

export const DEFAULT_MCP_PORT = 18765

export interface MCPServerStatus {
  ok: boolean
  listening: boolean
  endpoint: string
  port?: number
  health?: MCPHealthProbeResult
  initialize?: MCPInitializeProbeResult
  error?: string
}

export async function probeMCPServerStatus(input: {
  server: Server | null
  endpoint?: string
}): Promise<MCPServerStatus> {
  const endpoint = input.endpoint || process.env.MOVSCRIPT_MCP_ENDPOINT || mcpEndpointForPort(DEFAULT_MCP_PORT)
  const port = resolveMCPServerPort(input.server, endpoint)
  if (!input.server?.listening) {
    return {
      ok: false,
      listening: false,
      endpoint,
      port,
      error: 'MCP server is not running',
    }
  }

  try {
    const health = await probeMCPHealth(endpoint)
    if (!health.ok) {
      return {
        ok: false,
        listening: true,
        endpoint,
        port,
        health,
        error: health.error ?? `MCP health check returned HTTP ${health.status ?? 'unknown'}`,
      }
    }

    const initialize = await probeMCPInitialize(endpoint)
    return {
      ok: initialize.ok,
      listening: true,
      endpoint,
      port,
      health,
      initialize,
      ...(initialize.ok ? {} : { error: initialize.error ?? 'MCP initialize probe failed' }),
    }
  } catch (error) {
    return {
      ok: false,
      listening: true,
      endpoint,
      port,
      health: { ok: false, error: error instanceof Error ? error.message : String(error) },
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function resolveMCPServerPort(server: Server | null, endpoint: string): number {
  if (server) return addressPort(server) ?? portFromEndpoint(endpoint)
  return portFromEndpoint(endpoint)
}

function portFromEndpoint(endpoint: string): number {
  return Number(new URL(endpoint).port || DEFAULT_MCP_PORT)
}
