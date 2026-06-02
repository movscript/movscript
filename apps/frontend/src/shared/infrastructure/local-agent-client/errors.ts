export class LocalAgentHTTPError extends Error {
  constructor(
    readonly status: number,
    readonly responseText: string,
    message: string,
  ) {
    super(`local agent returned ${status}: ${message}`)
  }
}

export function isLocalAgentNotFoundError(error: unknown): boolean {
  return error instanceof LocalAgentHTTPError
    ? error.status === 404
    : error instanceof Error && /^local agent returned 404:/.test(error.message)
}

export async function localAgentResponseError(res: Response): Promise<LocalAgentHTTPError> {
  const text = await res.text()
  const message = localAgentErrorMessage(text)
  return new LocalAgentHTTPError(res.status, text, message)
}

export async function localAgentStreamError(stream: { status: number; responseText: () => Promise<string> }): Promise<LocalAgentHTTPError> {
  const text = await stream.responseText()
  const message = localAgentErrorMessage(text)
  return new LocalAgentHTTPError(stream.status, text, message)
}

export function isRetryableRunStreamError(error: unknown): boolean {
  if (error instanceof LocalAgentHTTPError) return false
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error) {
    return error.name === 'AbortError' || error.name === 'TypeError'
  }
  return false
}

function localAgentErrorMessage(text: string): string {
  const body = text.trim()
  if (!body) return ''
  try {
    const parsed = JSON.parse(body) as unknown
    if (isLocalAgentErrorRecord(parsed)) {
      const error = parsed.error
      if (typeof error === 'string' && error.trim()) return error.trim()
      if (isLocalAgentErrorRecord(error) && typeof error.message === 'string' && error.message.trim()) return error.message.trim()
      if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim()
    }
  } catch {
    // Fall back to the raw response body.
  }
  return body
}

function isLocalAgentErrorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
