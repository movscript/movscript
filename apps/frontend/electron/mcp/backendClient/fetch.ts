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
