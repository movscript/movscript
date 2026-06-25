import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  getMCPContextSnapshot,
  getMCPServerStatus,
  handleMCPHTTP,
  installMCPContextWorkspaceBackendAuthPersistence,
  makeError,
  readBody,
  setCORSHeaders,
  setEditingRuntimePort,
  setMCPDefaultWorkspaceDir,
  startMCPHTTPServer,
  stopMCPServer,
  updateMCPContextSnapshot,
  writeAccepted,
  writeJSON,
  type EditingRuntimePort,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type MCPServerStatus,
} from '@movscript/core/mcp/node'
import { handleMCPHostJSONRPC } from './stdio.js'

const MCP_HOST_HTTP_DEBUG = process.env.MOVSCRIPT_MCP_HOST_HTTP_DEBUG === '1'
let nextHTTPRequestId = 1

export type { EditingRuntimePort, MCPServerStatus }

export {
  getMCPServerStatus,
  installMCPContextWorkspaceBackendAuthPersistence,
  setEditingRuntimePort,
  setMCPDefaultWorkspaceDir,
  stopMCPServer,
  updateMCPContextSnapshot,
}

export async function startMCPHostHTTPServer(): Promise<number> {
  return startMCPHTTPServer(handleMCPHostHTTP)
}

export async function handleMCPHostHTTP(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestId = nextHTTPRequestId++
  const startedAt = Date.now()
  res.on('finish', () => {
    if (MCP_HOST_HTTP_DEBUG) {
      console.info(`[mcp-host] http finish requestId=${requestId} method=${req.method ?? ''} url=${req.url ?? ''} status=${res.statusCode} elapsedMs=${Date.now() - startedAt}`)
    }
  })

  if (isAgentAPIProxyRequest(req)) {
    await handleMCPHTTP(req, res)
    return
  }

  setCORSHeaders(res, req.headers.origin)

  if (req.method === 'OPTIONS') {
    debugHTTPStart(requestId, req)
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/health') {
    debugHTTPStart(requestId, req)
    writeJSON(res, 200, { ok: true, service: 'movscript-mcp-host', updatedAt: getMCPContextSnapshot().updatedAt })
    return
  }

  if (req.url !== '/mcp' || req.method !== 'POST') {
    debugHTTPStart(requestId, req)
    writeJSON(res, 404, { error: 'not found' })
    return
  }

  try {
    debugHTTPStart(requestId, req)
    const body = await readBody(req)
    const payload = JSON.parse(body) as JSONRPCRequest | JSONRPCRequest[]
    const response = Array.isArray(payload)
      ? (await Promise.all(payload.map((item) => handleMCPHostJSONRPC(item)))).filter((item): item is JSONRPCResponse => item !== undefined)
      : await handleMCPHostJSONRPC(payload)
    if (Array.isArray(response)) {
      if (response.length > 0) writeJSON(res, 200, response)
      else writeAccepted(res)
      return
    }
    if (response !== undefined) writeJSON(res, 200, response)
    else writeAccepted(res)
  } catch (error) {
    console.error(`[mcp-host] http error requestId=${requestId} method=${req.method ?? ''} url=${req.url ?? ''} elapsedMs=${Date.now() - startedAt}`, error)
    writeJSON(res, 200, makeError(null, -32700, 'Parse error', errorMessage(error)))
  }
}

function isAgentAPIProxyRequest(req: IncomingMessage): boolean {
  return !!req.url && req.url.startsWith('/agent-api/v1/')
}

function debugHTTPStart(requestId: number, req: IncomingMessage): void {
  if (!MCP_HOST_HTTP_DEBUG) return
  console.info([
    `[mcp-host] http start requestId=${requestId}`,
    `method=${req.method ?? ''}`,
    `url=${req.url ?? ''}`,
    `remote=${req.socket.remoteAddress ?? ''}:${req.socket.remotePort ?? ''}`,
    `contentLength=${req.headers['content-length'] ?? ''}`,
  ].join(' '))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
