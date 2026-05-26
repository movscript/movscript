import {
  backendErrorMessage,
  normalizeBackendHTTPErrorForMCP,
  parseJSONBody,
} from './normalize'

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
    return normalizeBackendHTTPErrorForMCP(this.method, this.path, this.status, this.body)
  }
}

export function errorData(error: unknown): unknown {
  if (error instanceof BackendHTTPError) return error.toJSON()
  return undefined
}
