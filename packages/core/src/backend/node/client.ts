import {
  readMovScriptBackendAuth,
  resolveMovScriptBackendSession,
} from './config.js'
import { BackendHTTPError, BackendNetworkError } from '../errors.js'
import {
  getMovScriptBackendAPIBaseURL,
  getMovScriptBackendRuntimeAuthToken,
  resolveMovScriptBackendDefaultWorkspaceDir,
} from './runtime.js'

export async function backendGet(path: string): Promise<any> {
  const headers = backendHeaders()
  const res = await backendFetch('GET', path, { headers })
  if (!res.ok) {
    throw await BackendHTTPError.fromResponse('GET', path, res)
  }
  return res.json()
}

export interface BackendBinaryProgress {
  path: string
  receivedBytes: number
  totalBytes?: number
  done: boolean
}

export async function backendGetBinary(path: string, options: {
  maxBytes?: number
  onProgress?: (progress: BackendBinaryProgress) => void
} = {}): Promise<{ bytes: Buffer; contentType?: string; contentLength?: number }> {
  const headers = backendHeaders()
  const res = await backendFetch('GET', path, { headers })
  if (!res.ok) {
    throw await BackendHTTPError.fromResponse('GET', path, res)
  }
  const contentLengthHeader = res.headers.get('content-length')
  const contentLength = contentLengthHeader === null ? NaN : Number(contentLengthHeader)
  if (options.maxBytes !== undefined && Number.isFinite(contentLength) && contentLength > options.maxBytes) {
    throw new Error(`backend GET ${path} returned content-length ${contentLength}, above maxBytes=${options.maxBytes}`)
  }
  const bytes = await readBinaryResponse(path, res, {
    maxBytes: options.maxBytes,
    contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
    onProgress: options.onProgress,
  })
  if (options.maxBytes !== undefined && bytes.length > options.maxBytes) {
    throw new Error(`backend GET ${path} returned ${bytes.length} bytes, above maxBytes=${options.maxBytes}`)
  }
  return {
    bytes,
    ...(res.headers.get('content-type') ? { contentType: res.headers.get('content-type') ?? undefined } : {}),
    ...(Number.isFinite(contentLength) ? { contentLength } : {}),
  }
}

async function readBinaryResponse(
  path: string,
  res: Response,
  options: {
    maxBytes?: number
    contentLength?: number
    onProgress?: (progress: BackendBinaryProgress) => void
  },
): Promise<Buffer> {
  if (!res.body) {
    const bytes = Buffer.from(await res.arrayBuffer())
    options.onProgress?.({
      path,
      receivedBytes: bytes.length,
      ...(options.contentLength !== undefined ? { totalBytes: options.contentLength } : {}),
      done: true,
    })
    return bytes
  }

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let receivedBytes = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    receivedBytes += value.byteLength
    if (options.maxBytes !== undefined && receivedBytes > options.maxBytes) {
      throw new Error(`backend GET ${path} returned more than maxBytes=${options.maxBytes}`)
    }
    chunks.push(value)
    options.onProgress?.({
      path,
      receivedBytes,
      ...(options.contentLength !== undefined ? { totalBytes: options.contentLength } : {}),
      done: false,
    })
  }
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
  options.onProgress?.({
    path,
    receivedBytes,
    ...(options.contentLength !== undefined ? { totalBytes: options.contentLength } : {}),
    done: true,
  })
  return bytes
}

export async function backendPost(path: string, body: Record<string, unknown>, userId?: unknown): Promise<any> {
  const headers = backendHeaders({ json: true, userId })
  const res = await backendFetch('POST', path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw await BackendHTTPError.fromResponse('POST', path, res)
  }
  return res.json()
}

export async function backendPut(path: string, body: Record<string, unknown>, userId?: unknown): Promise<any> {
  const headers = backendHeaders({ json: true, userId })
  const res = await backendFetch('PUT', path, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw await BackendHTTPError.fromResponse('PUT', path, res)
  }
  const text = await res.text()
  return text.trim() ? JSON.parse(text) : null
}

export async function backendPostMultipart(path: string, form: FormData, userId?: unknown): Promise<any> {
  const headers = backendHeaders({ userId })
  const res = await backendFetch('POST', path, {
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
  const res = await backendFetch('PATCH', path, {
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
  const res = await backendFetch('DELETE', path, {
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

async function backendFetch(method: string, path: string, init: RequestInit): Promise<Response> {
  const url = `${getMovScriptBackendAPIBaseURL()}${path}`
  try {
    return await fetch(url, init)
  } catch (error) {
    throw new BackendNetworkError(method, path, url, error)
  }
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
