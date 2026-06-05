import { getMCPAuthToken } from '../context/store'
import { BackendHTTPError } from '../backendErrors'
import { getMCPAPIBaseURL } from './baseURL'

export async function backendGet(path: string): Promise<any> {
  const headers = backendHeaders()
  const res = await fetch(`${getMCPAPIBaseURL()}${path}`, { headers })
  if (!res.ok) {
    throw await BackendHTTPError.fromResponse('GET', path, res)
  }
  return res.json()
}

export async function backendGetBinary(path: string, options: { maxBytes?: number } = {}): Promise<{ bytes: Buffer; contentType?: string; contentLength?: number }> {
  const headers = backendHeaders()
  const res = await fetch(`${getMCPAPIBaseURL()}${path}`, { headers })
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
  const res = await fetch(`${getMCPAPIBaseURL()}${path}`, {
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
  const res = await fetch(`${getMCPAPIBaseURL()}${path}`, {
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
  const res = await fetch(`${getMCPAPIBaseURL()}${path}`, {
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

function backendHeaders(input: { json?: boolean; userId?: unknown } = {}): Record<string, string> {
  const headers: Record<string, string> = input.json ? { 'Content-Type': 'application/json' } : {}
  const authToken = getMCPAuthToken()
  if (authToken) headers.Authorization = `Bearer ${authToken}`
  if (typeof input.userId === 'number' || typeof input.userId === 'string') headers['X-User-ID'] = String(input.userId)
  return headers
}
