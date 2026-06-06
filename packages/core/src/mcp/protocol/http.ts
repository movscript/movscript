import type { IncomingMessage, ServerResponse } from 'http'
import type { JSONRPCRequest } from './types'
import { getMCPContextSnapshot } from '../tools/focus/store'
import {
  makeError,
  readBody,
  setCORSHeaders,
  writeAccepted,
  writeJSON,
} from './transport'
import { handleJSONRPC } from './jsonRpc'

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
  setCORSHeaders(res)

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
