import type { JSONRPCResponse } from '../../protocol/types.js'

export interface MCPHealthProbeResult {
  ok: boolean
  status?: number
  error?: string
}

export interface MCPInitializeProbeResult {
  ok: boolean
  status?: number
  elapsedMs?: number
  serverInfo?: unknown
  error?: string
}

export async function probeMCPHealth(endpoint: string): Promise<MCPHealthProbeResult> {
  const healthURL = new URL(endpoint)
  healthURL.pathname = '/health'
  healthURL.search = ''
  healthURL.hash = ''

  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), 1500)
  try {
    const res = await fetch(healthURL.toString(), {
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, status: res.status }

    const body = await res.json() as { ok?: unknown }
    if (body.ok !== true) {
      return {
        ok: false,
        status: res.status,
        error: 'MCP health check did not report ok',
      }
    }

    return { ok: true, status: res.status }
  } finally {
    globalThis.clearTimeout(timer)
  }
}

export async function probeMCPInitialize(endpoint: string): Promise<MCPInitializeProbeResult> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), 1500)
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'status-probe',
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          clientInfo: { name: 'movscript-desktop-status', version: '0.1.0' },
          capabilities: {},
        },
      }),
      signal: controller.signal,
      cache: 'no-store',
    })
    const elapsedMs = Date.now() - startedAt
    const text = await res.text()
    if (!res.ok) {
      return { ok: false, status: res.status, elapsedMs, error: `HTTP ${res.status}: ${truncate(text, 500)}` }
    }
    const body = JSON.parse(text) as JSONRPCResponse
    if (body.error) {
      return { ok: false, status: res.status, elapsedMs, error: `JSON-RPC ${body.error.code}: ${body.error.message}` }
    }
    const result = isRecord(body.result) ? body.result : {}
    return { ok: true, status: res.status, elapsedMs, serverInfo: result.serverInfo }
  } catch (error) {
    return { ok: false, elapsedMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) }
  } finally {
    globalThis.clearTimeout(timer)
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
