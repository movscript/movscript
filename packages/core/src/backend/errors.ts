export class BackendHTTPError extends Error {
  constructor(
    public readonly method: string,
    public readonly path: string,
    public readonly status: number,
    public readonly body: unknown,
    rawBody: string,
  ) {
    super(`Backend ${method} ${path} failed: HTTP ${status} ${backendErrorMessage(body, rawBody)}`)
    this.name = 'BackendHTTPError'
  }

  static async fromResponse(method: string, path: string, res: Response): Promise<BackendHTTPError> {
    const rawBody = await res.text()
    return new BackendHTTPError(method, path, res.status, parseJSONBody(rawBody), rawBody)
  }

  toJSON(): Record<string, unknown> {
    return normalizeBackendHTTPError(this.method, this.path, this.status, this.body)
  }
}

export function errorData(error: unknown): unknown {
  if (error instanceof BackendHTTPError) return error.toJSON()
  return undefined
}

export function normalizeBackendHTTPError(method: string, path: string, status: number, body: unknown): Record<string, unknown> {
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

export const normalizeBackendHTTPErrorForMCP = normalizeBackendHTTPError

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
