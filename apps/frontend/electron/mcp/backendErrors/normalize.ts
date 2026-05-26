import { isRecord } from '../valueUtils'

export function normalizeBackendHTTPErrorForMCP(method: string, path: string, status: number, body: unknown): Record<string, unknown> {
  const bodyRecord = isRecord(body) ? body : undefined
  return {
    type: 'backend_http_error',
    method,
    path,
    status,
    ...(bodyRecord ? { body: bodyRecord } : {}),
    ...(bodyRecord && typeof bodyRecord.code === 'string' ? { code: bodyRecord.code } : {}),
    ...(bodyRecord && typeof bodyRecord.field === 'string' ? { field: bodyRecord.field } : {}),
    ...(bodyRecord && Array.isArray(bodyRecord.allowed_values) ? { allowed_values: bodyRecord.allowed_values } : {}),
    ...(bodyRecord && isRecord(bodyRecord.suggested_fix) ? { suggested_fix: bodyRecord.suggested_fix } : {}),
    ...(bodyRecord && Number.isInteger(bodyRecord.required_min) ? { required_min: bodyRecord.required_min } : {}),
    ...(bodyRecord && Number.isInteger(bodyRecord.allowed_max) ? { allowed_max: bodyRecord.allowed_max } : {}),
    ...(bodyRecord && Number.isInteger(bodyRecord.actual_count) ? { actual_count: bodyRecord.actual_count } : {}),
    ...(bodyRecord && isRecord(bodyRecord.details) ? { details: bodyRecord.details } : {}),
  }
}

export function parseJSONBody(rawBody: string): unknown {
  if (!rawBody.trim()) return undefined
  try {
    return JSON.parse(rawBody)
  } catch {
    return rawBody
  }
}

export function backendErrorMessage(body: unknown, rawBody: string): string {
  if (isRecord(body) && typeof body.error === 'string') return body.error
  return rawBody
}
