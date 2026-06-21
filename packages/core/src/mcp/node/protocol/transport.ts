import type { IncomingMessage, ServerResponse } from 'http'
import type { JSONRPCResponse } from '../../protocol/types.js'

export function makeResult(id: string | number | null, result: unknown): JSONRPCResponse {
  return { jsonrpc: '2.0', id, result }
}

export function makeError(id: string | number | null, code: number, message: string, data?: unknown): JSONRPCResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  }
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 1024 * 1024 * 4) {
        reject(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

export function writeJSON(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    Connection: 'close',
  })
  res.end(JSON.stringify(body))
}

export function writeAccepted(res: ServerResponse): void {
  res.writeHead(202, {
    Connection: 'close',
  })
  res.end()
}

export function setCORSHeaders(res: ServerResponse, origin?: string | string[]): void {
  const requestOrigin = Array.isArray(origin) ? origin[0] : origin
  const allowOrigin = requestOrigin && isLocalHTTPOrigin(requestOrigin) ? requestOrigin : 'http://localhost'
  res.setHeader('Access-Control-Allow-Origin', allowOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Org-ID')
  res.setHeader('Access-Control-Allow-Credentials', 'false')
}

function isLocalHTTPOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}
