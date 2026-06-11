export interface ProviderSessionRequestSignal {
  signal: AbortSignal
  cleanup: () => void
}

export function createProviderSessionRequestSignal(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): ProviderSessionRequestSignal {
  const controller = new AbortController()
  const abortFromExternal = () => {
    if (!controller.signal.aborted) controller.abort(externalSignal?.reason ?? createProviderSessionAbortError())
  }
  if (externalSignal?.aborted) abortFromExternal()
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true })

  const timer = globalThis.setTimeout(() => {
    if (!controller.signal.aborted) controller.abort(createProviderSessionTimeoutError(timeoutMs))
  }, timeoutMs)

  return {
    signal: controller.signal,
    cleanup: () => {
      globalThis.clearTimeout(timer)
      externalSignal?.removeEventListener('abort', abortFromExternal)
    },
  }
}

export function normalizePositiveTimeoutMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

export function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? createProviderSessionAbortError())
      return
    }
    const timer = globalThis.setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      globalThis.clearTimeout(timer)
      reject(signal.reason ?? createProviderSessionAbortError())
    }, { once: true })
  })
}

export function createProviderSessionAbortError(): Error {
  try {
    return new DOMException('Aborted', 'AbortError')
  } catch {
    const error = new Error('Aborted')
    error.name = 'AbortError'
    return error
  }
}

export function createProviderSessionTimeoutError(timeoutMs: number): Error {
  try {
    return new DOMException(`Provider session request timed out after ${timeoutMs}ms`, 'TimeoutError')
  } catch {
    const error = new Error(`Provider session request timed out after ${timeoutMs}ms`)
    error.name = 'TimeoutError'
    return error
  }
}
