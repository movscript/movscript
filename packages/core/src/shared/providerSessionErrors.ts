export class ProviderSessionHTTPError extends Error {
  constructor(
    readonly status: number,
    readonly responseText: string,
    message: string,
  ) {
    super(`provider session returned ${status}: ${message}`)
  }
}

export interface ProviderSessionErrorResponseLike {
  status: number
  text(): Promise<string>
}

export interface ProviderSessionErrorStreamLike {
  status: number
  responseText(): Promise<string>
}

export function isProviderSessionNotFoundError(error: unknown): boolean {
  return error instanceof ProviderSessionHTTPError
    ? error.status === 404
    : error instanceof Error && /^provider session returned 404:/.test(error.message)
}

export async function providerSessionResponseError(
  res: ProviderSessionErrorResponseLike,
): Promise<ProviderSessionHTTPError> {
  const text = await res.text()
  const message = providerSessionErrorMessage(text)
  return new ProviderSessionHTTPError(res.status, text, message)
}

export async function providerSessionStreamError(
  stream: ProviderSessionErrorStreamLike,
): Promise<ProviderSessionHTTPError> {
  const text = await stream.responseText()
  const message = providerSessionErrorMessage(text)
  return new ProviderSessionHTTPError(stream.status, text, message)
}

export function isRetryableRunStreamError(error: unknown): boolean {
  if (error instanceof ProviderSessionHTTPError) return false
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error) {
    return error.name === 'AbortError' || error.name === 'TypeError'
  }
  return false
}

export function providerSessionErrorMessage(text: string): string {
  const body = text.trim()
  if (!body) return ''
  try {
    const parsed = JSON.parse(body) as unknown
    if (isProviderSessionErrorRecord(parsed)) {
      const error = parsed.error
      if (typeof error === 'string' && error.trim()) return error.trim()
      if (isProviderSessionErrorRecord(error) && typeof error.message === 'string' && error.message.trim()) return error.message.trim()
      if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim()
    }
  } catch {
    // Fall back to the raw response body.
  }
  return body
}

function isProviderSessionErrorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
