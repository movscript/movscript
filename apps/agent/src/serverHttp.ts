import type { IncomingMessage, ServerResponse } from 'node:http'

export class AgentHTTPError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export async function readOptionalJSONObject(req: IncomingMessage, label: string): Promise<Record<string, unknown>> {
  return normalizeOptionalObject(await readJSON(req), label)
}

export function normalizeOptionalObject(body: unknown, label: string): Record<string, unknown> {
  if (body === undefined || body === null) return {}
  if (!isRecord(body)) throw new AgentHTTPError(400, `${label} must be an object`)
  return body
}

export function readJSON(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 1024 * 1024) {
        reject(new AgentHTTPError(413, 'request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new AgentHTTPError(400, 'invalid JSON request body'))
      }
    })
    req.on('error', reject)
  })
}

export function writeJSON(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

export function writeText(res: ServerResponse, status: number, value: string, contentType = 'text/plain; charset=utf-8'): void {
  res.writeHead(status, { 'Content-Type': contentType })
  res.end(value)
}

export function logSlowRequest(method: string | undefined, pathname: string, requestStartedAt: number, handlerStartedAt: number): void {
  const totalMs = Date.now() - requestStartedAt
  if (totalMs <= 100) return
  console.info(`[agent] request slow ${method ?? 'UNKNOWN'} ${pathname} total=${totalMs}ms handler=${Date.now() - handlerStartedAt}ms`)
}

export function requestPathname(req: IncomingMessage): string {
  try {
    return new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`).pathname
  } catch {
    return req.url || '/'
  }
}

export function setHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Movscript-Backend-API-Base-URL')
}

export function isLoopbackRequest(req: IncomingMessage): boolean {
  const remoteAddress = req.socket?.remoteAddress
  return !remoteAddress
    || remoteAddress === '127.0.0.1'
    || remoteAddress === '::1'
    || remoteAddress === '::ffff:127.0.0.1'
}

export function isCrossSiteBrowserRequest(req: IncomingMessage): boolean {
  const site = headerValue(req, 'sec-fetch-site')
  return site === 'cross-site'
}

export function requestAuth(req: IncomingMessage): { backendAuthToken?: string; backendAPIBaseURL?: string } {
  const header = typeof req.headers.authorization === 'string' ? req.headers.authorization.trim() : ''
  const backendAPIBaseURL = headerValue(req, 'x-movscript-backend-api-base-url')
  const auth: { backendAuthToken?: string; backendAPIBaseURL?: string } = {
    ...(backendAPIBaseURL ? { backendAPIBaseURL } : {}),
  }
  if (!header.toLowerCase().startsWith('bearer ')) return auth
  const token = header.slice('Bearer '.length).trim()
  return token ? { ...auth, backendAuthToken: token } : auth
}

export function withRequestAuth<T extends Record<string, unknown>>(body: T, req: IncomingMessage): T & { backendAuthToken?: string; backendAPIBaseURL?: string } {
  const auth = requestAuth(req)
  return Object.keys(auth).length > 0 ? { ...body, ...auth } : body
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
