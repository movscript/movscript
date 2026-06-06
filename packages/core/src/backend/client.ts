import {
  readMovScriptBackendAuth,
  resolveMovScriptBackendSession,
} from './config.js'
import { BackendHTTPError } from './errors.js'
import {
  getMovScriptBackendAPIBaseURL,
  getMovScriptBackendRuntimeAuthToken,
  resolveMovScriptBackendDefaultWorkspaceDir,
} from './runtime.js'

export async function backendGet(path: string): Promise<any> {
  const headers = backendHeaders()
  const res = await fetch(`${getMovScriptBackendAPIBaseURL()}${path}`, { headers })
  if (!res.ok) {
    throw await BackendHTTPError.fromResponse('GET', path, res)
  }
  return res.json()
}

export async function backendGetBinary(path: string, options: { maxBytes?: number } = {}): Promise<{ bytes: Buffer; contentType?: string; contentLength?: number }> {
  const headers = backendHeaders()
  const res = await fetch(`${getMovScriptBackendAPIBaseURL()}${path}`, { headers })
  if (!res.ok) {
    throw await BackendHTTPError.fromResponse('GET', path, res)
  }
  const contentLength = Number(res.headers.get('content-length'))
  if (options.maxBytes !== undefined && Number.isFinite(contentLength) && contentLength > options.maxBytes) {
    throw new Error(`backend GET ${path} returned content-length ${contentLength}, above maxBytes=${options.maxBytes}`)
  }
  const bytes = Buffer.from(await res.arrayBuffer())
  if (options.maxBytes !== undefined && bytes.length > options.maxBytes) {
    throw new Error(`backend GET ${path} returned ${bytes.length} bytes, above maxBytes=${options.maxBytes}`)
  }
  return {
    bytes,
    ...(res.headers.get('content-type') ? { contentType: res.headers.get('content-type') ?? undefined } : {}),
    ...(Number.isFinite(contentLength) ? { contentLength } : {}),
  }
}

export async function backendPost(path: string, body: Record<string, unknown>, userId?: unknown): Promise<any> {
  const headers = backendHeaders({ json: true, userId })
  const res = await fetch(`${getMovScriptBackendAPIBaseURL()}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw await BackendHTTPError.fromResponse('POST', path, res)
  }
  return res.json()
}

export async function backendPostMultipart(path: string, form: FormData, userId?: unknown): Promise<any> {
  const headers = backendHeaders({ userId })
  const res = await fetch(`${getMovScriptBackendAPIBaseURL()}${path}`, {
    method: 'POST',
    headers,
    body: form,
  })
  if (!res.ok) {
    throw await BackendHTTPError.fromResponse('POST', path, res)
  }
  return res.json()
}

export async function backendPatch(path: string, body: Record<string, unknown>, userId?: unknown): Promise<any> {
  const headers = backendHeaders({ json: true, userId })
  const res = await fetch(`${getMovScriptBackendAPIBaseURL()}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw await BackendHTTPError.fromResponse('PATCH', path, res)
  }
  const text = await res.text()
  return text.trim() ? JSON.parse(text) : null
}

export async function backendDelete(path: string, userId?: unknown): Promise<any> {
  const headers = backendHeaders({ userId })
  const res = await fetch(`${getMovScriptBackendAPIBaseURL()}${path}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) {
    throw await BackendHTTPError.fromResponse('DELETE', path, res)
  }
  const text = await res.text()
  return text.trim() ? JSON.parse(text) : null
}

export async function backendList(path: string): Promise<any[]> {
  const data = await backendGet(path)
  if (Array.isArray(data)) return data
  if (isRecord(data) && Array.isArray(data.items)) return data.items
  return []
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMS: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), clampNumber(timeoutMS, 1000, 600000))
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function backendHeaders(input: { json?: boolean; userId?: unknown } = {}): Record<string, string> {
  const headers: Record<string, string> = input.json ? { 'Content-Type': 'application/json' } : {}
  const authToken = getMovScriptBackendRuntimeAuthToken() || workspaceBackendAuthToken()
  if (authToken) headers.Authorization = `Bearer ${authToken}`
  const userId = typeof input.userId === 'number' || typeof input.userId === 'string'
    ? String(input.userId)
    : workspaceBackendUserId()
  if (userId) headers['X-User-ID'] = userId
  return headers
}

function workspaceBackendAuthToken(): string {
  try {
    return readMovScriptBackendAuth(resolveMovScriptBackendDefaultWorkspaceDir())?.token ?? ''
  } catch {
    return ''
  }
}

function workspaceBackendUserId(): string {
  try {
    return resolveMovScriptBackendSession({ workspaceDir: resolveMovScriptBackendDefaultWorkspaceDir() }).userId ?? ''
  } catch {
    return ''
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampNumber(value: unknown, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : min
  return Math.min(max, Math.max(min, n))
}
