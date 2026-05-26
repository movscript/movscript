import {
  fetchWithTimeout,
  parseJSONBody,
} from '../backendClient'
import {
  createGenerationToolServer,
  normalizeGenerationToolsSettings,
} from '../../../src/shared/domain/generationTools'
import type {
  GenerationToolServer,
  GenerationToolServerType,
} from '../../../src/shared/contracts/generationTools'
import { sanitizeGenerationToolServerForMCP } from './sanitize'

export async function testMCPGenerationToolServer(input: Partial<GenerationToolServer>): Promise<Record<string, unknown>> {
  const serverType: GenerationToolServerType = input.type === 'webui' ? 'webui' : 'comfyui'
  const normalized = normalizeGenerationToolsSettings({
    preferLocalServers: true,
    servers: [createGenerationToolServer(serverType, {
      ...input,
      scope: 'local',
      enabled: true,
    })],
  }).servers[0]
  const path = normalized.type === 'comfyui' ? '/system_stats' : '/sdapi/v1/progress?skip_current_image=true'
  const startedAt = Date.now()
  try {
    const res = await fetchWithTimeout(`${normalized.baseURL}${path}`, {
      method: 'GET',
      headers: generationToolServerHeaders(normalized, false),
    }, normalized.timeoutMS)
    const rawBody = await res.text()
    const data = parseJSONBody(rawBody)
    return {
      success: res.ok,
      latency_ms: Date.now() - startedAt,
      status_code: res.status,
      message: res.ok ? '连接成功' : `HTTP ${res.status}`,
      server: sanitizeGenerationToolServerForMCP(normalized),
      data,
    }
  } catch (error) {
    return {
      success: false,
      latency_ms: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
      server: sanitizeGenerationToolServerForMCP(normalized),
    }
  }
}

export async function callGenerationToolServer(server: GenerationToolServer, path: string, request: { method: 'GET' | 'POST'; body?: Record<string, unknown> }): Promise<unknown> {
  const startedAt = Date.now()
  const url = `${server.baseURL}${path.startsWith('/') ? path : `/${path}`}`
  const headers = generationToolServerHeaders(server, request.body !== undefined)
  const res = await fetchWithTimeout(url, {
    method: request.method,
    headers,
    ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
  }, server.timeoutMS)
  const rawBody = await res.text()
  const data = parseJSONBody(rawBody)
  if (!res.ok) {
    throw new Error(`${server.type} server ${server.name} ${request.method} ${path} failed: HTTP ${res.status} ${typeof data === 'string' ? data : rawBody.slice(0, 300)}`)
  }
  return {
    status: 'ok',
    server: sanitizeGenerationToolServerForMCP(server),
    data,
    timings: {
      totalMs: Date.now() - startedAt,
    },
  }
}

export function generationToolServerHeaders(server: GenerationToolServer, withJSONBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {}
  if (withJSONBody) headers['Content-Type'] = 'application/json'
  if (server.authKind === 'bearer' && server.token) {
    headers.Authorization = `Bearer ${server.token}`
  } else if (server.authKind === 'basic' && server.username && server.password) {
    headers.Authorization = `Basic ${Buffer.from(`${server.username}:${server.password}`).toString('base64')}`
  }
  return headers
}
