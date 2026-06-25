import type { IncomingMessage, ServerResponse } from 'http'
import { getMovScriptBackendAPIBaseURL, getMovScriptBackendRuntimeAuthToken } from '../../../backend/node/runtime.js'
import type { JSONRPCRequest } from '../../protocol/types.js'
import { getMCPContextSnapshot } from '../tools/focus/store.js'
import {
  makeError,
  readBody,
  setCORSHeaders,
  writeAccepted,
  writeJSON,
} from './transport.js'
import { handleJSONRPC } from './jsonRpc.js'
import { handleAgentSurfaceDataRequest, isAgentSurfaceDataRequest } from './agentSurfaceData.js'

const MCP_DEBUG = process.env.MOVSCRIPT_MCP_DEBUG === '1'
let nextHTTPRequestId = 1

export async function handleMCPHTTP(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestId = nextHTTPRequestId++
  const startedAt = Date.now()
  res.on('finish', () => {
    if (MCP_DEBUG) {
      console.info(`[mcp] http finish requestId=${requestId} method=${req.method ?? ''} url=${req.url ?? ''} status=${res.statusCode} elapsedMs=${Date.now() - startedAt}`)
    }
  })
  setCORSHeaders(res, req.headers.origin)

  if (req.method === 'OPTIONS') {
    debugHTTPStart(requestId, req)
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/health') {
    debugHTTPStart(requestId, req)
    writeJSON(res, 200, { ok: true, service: 'movscript-mcp', updatedAt: getMCPContextSnapshot().updatedAt })
    return
  }

  if (isAgentAPIProxyRequest(req)) {
    debugHTTPStart(requestId, req)
    await handleAgentAPIProxy(req, res)
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
    if (MCP_DEBUG) {
      console.info(`[mcp] http body requestId=${requestId} bytes=${body.length}`)
    }
    const payload = JSON.parse(body) as JSONRPCRequest | JSONRPCRequest[]
    if (Array.isArray(payload)) {
      const responses = await Promise.all(payload.map((item) => handleJSONRPC(item, requestId)))
      const responseBodies = responses.filter((item) => item !== undefined)
      if (responseBodies.length > 0) writeJSON(res, 200, responseBodies)
      else writeAccepted(res)
    } else {
      const responseBody = await handleJSONRPC(payload, requestId)
      if (responseBody !== undefined) writeJSON(res, 200, responseBody)
      else writeAccepted(res)
    }
  } catch (error) {
    console.error(`[mcp] http error requestId=${requestId} method=${req.method ?? ''} url=${req.url ?? ''} elapsedMs=${Date.now() - startedAt}`, error)
    writeJSON(res, 200, makeError(null, -32700, 'Parse error', String(error)))
  }
}

function isAgentAPIProxyRequest(req: IncomingMessage): boolean {
  return !!req.url && req.url.startsWith('/agent-api/v1/')
}

async function handleAgentAPIProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!req.url || !req.method) {
    writeJSON(res, 400, { error: 'invalid proxy request' })
    return
  }
  const targetFullPath = req.url.replace(/^\/agent-api\/v1/, '')
  const targetPath = targetFullPath.split('?', 1)[0] ?? ''
  if (!targetPath.startsWith('/')) {
    writeJSON(res, 400, { error: 'invalid proxy path' })
    return
  }
  if (isAgentSurfaceDataRequest(targetPath)) {
    await handleAgentSurfaceDataRequest(req, res, targetPath)
    return
  }
  const targetURL = `${getMovScriptBackendAPIBaseURL().replace(/\/+$/, '')}${targetFullPath}`
  const headers = proxyRequestHeaders(req)
  const method = req.method.toUpperCase()
  const hasBody = !['GET', 'HEAD'].includes(method)
  const proxyBody = hasBody ? await readProxyBody(req) : undefined
  const body = proxyBody ? new Uint8Array(proxyBody) : undefined

  const response = await fetch(targetURL, {
    method,
    headers,
    ...(body ? { body } : {}),
  })

  const responseHeaders: Record<string, string> = {}
  const contentType = response.headers.get('content-type')
  const contentLength = response.headers.get('content-length')
  const contentDisposition = response.headers.get('content-disposition')
  if (contentType) responseHeaders['Content-Type'] = contentType
  if (contentLength) responseHeaders['Content-Length'] = contentLength
  if (contentDisposition) responseHeaders['Content-Disposition'] = contentDisposition
  responseHeaders.Connection = 'close'
  res.writeHead(response.status, responseHeaders)
  const bytes = Buffer.from(await response.arrayBuffer())
  res.end(bytes)
}

function proxyRequestHeaders(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {}
  const contentType = req.headers['content-type']
  if (typeof contentType === 'string') headers['Content-Type'] = contentType
  const accept = req.headers.accept
  if (typeof accept === 'string') headers.Accept = accept
  const token = getMovScriptBackendRuntimeAuthToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const orgId = req.headers['x-org-id']
  if (typeof orgId === 'string' && orgId.trim()) headers['X-Org-ID'] = orgId
  return headers
}

function readProxyBody(req: IncomingMessage): Promise<Buffer | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : undefined))
    req.on('error', reject)
  })
}


function debugHTTPStart(requestId: number, req: IncomingMessage): void {
  if (!MCP_DEBUG) return
  console.info([
    `[mcp] http start requestId=${requestId}`,
    `method=${req.method ?? ''}`,
    `url=${req.url ?? ''}`,
    `remote=${req.socket.remoteAddress ?? ''}:${req.socket.remotePort ?? ''}`,
    `contentLength=${req.headers['content-length'] ?? ''}`,
  ].join(' '))
}
