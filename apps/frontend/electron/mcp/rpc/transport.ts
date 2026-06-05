import type { IncomingMessage, ServerResponse } from 'http'
import type { JSONRPCResponse } from '../types'

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

export function setCORSHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}
