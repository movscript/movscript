import { BackendHTTPError, getMCPAPIBaseURL } from '../backendClient'
import { getMCPAuthToken } from '../context/store'
import { isRecord } from '../valueUtils'

export async function backendUploadResource(bytes: Uint8Array, filename: string, mimeType: string, folderID?: string): Promise<Record<string, unknown>> {
  const body = new FormData()
  const arrayBuffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(arrayBuffer).set(bytes)
  body.append('file', new Blob([arrayBuffer], { type: mimeType }), filename)
  if (folderID) body.append('folder_id', folderID)
  const headers: Record<string, string> = {}
  if (getMCPAuthToken()) headers.Authorization = `Bearer ${getMCPAuthToken()}`
  const res = await fetch(`${getMCPAPIBaseURL()}/resources/upload`, {
    method: 'POST',
    headers,
    body,
  })
  if (!res.ok) {
    throw await BackendHTTPError.fromResponse('POST', '/resources/upload', res)
  }
  const uploaded = await res.json()
  return isRecord(uploaded) ? uploaded : { value: uploaded }
}

export function resourceIDFromUpload(resource: Record<string, unknown>): number | undefined {
  const value = resource.ID ?? resource.id
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}
