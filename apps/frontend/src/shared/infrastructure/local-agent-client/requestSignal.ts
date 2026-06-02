export function createLocalAgentRequestSignal(externalSignal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const abortFromExternal = () => {
    if (!controller.signal.aborted) controller.abort(externalSignal?.reason ?? createLocalAgentAbortError())
  }
  if (externalSignal?.aborted) abortFromExternal()
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true })

  const timer = globalThis.setTimeout(() => {
    if (!controller.signal.aborted) controller.abort(createLocalAgentTimeoutError(timeoutMs))
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
      reject(signal.reason ?? createLocalAgentAbortError())
      return
    }
    const timer = globalThis.setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      globalThis.clearTimeout(timer)
      reject(signal.reason ?? createLocalAgentAbortError())
    }, { once: true })
  })
}

export function createLocalAgentAbortError(): Error {
  try {
    return new DOMException('Aborted', 'AbortError')
  } catch {
    const error = new Error('Aborted')
    error.name = 'AbortError'
    return error
  }
}

function createLocalAgentTimeoutError(timeoutMs: number): Error {
  try {
    return new DOMException(`Local agent request timed out after ${timeoutMs}ms`, 'TimeoutError')
  } catch {
    const error = new Error(`Local agent request timed out after ${timeoutMs}ms`)
    error.name = 'TimeoutError'
    return error
  }
}
