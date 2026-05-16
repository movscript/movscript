export interface RunBackendAuth {
  backendAuthToken?: string
  backendAPIBaseURL?: string
}

export function normalizeBackendAuthToken(value: unknown): Pick<RunBackendAuth, 'backendAuthToken'> {
  return typeof value === 'string' && value.trim() ? { backendAuthToken: value.trim() } : {}
}

export function normalizeBackendAPIBaseURL(value: unknown): Pick<RunBackendAuth, 'backendAPIBaseURL'> {
  return typeof value === 'string' && value.trim() ? { backendAPIBaseURL: value.trim().replace(/\/+$/, '') } : {}
}

export function normalizeRunBackendAuth(value: unknown): RunBackendAuth {
  const record = isRecord(value) ? value : {}
  return {
    ...normalizeBackendAuthToken(record.backendAuthToken ?? value),
    ...normalizeBackendAPIBaseURL(record.backendAPIBaseURL),
  }
}

export function mergeRunBackendAuth(current: RunBackendAuth, next: RunBackendAuth): RunBackendAuth {
  return {
    ...current,
    ...(next.backendAuthToken ? { backendAuthToken: next.backendAuthToken } : {}),
    ...(next.backendAPIBaseURL ? { backendAPIBaseURL: next.backendAPIBaseURL } : {}),
  }
}

export function mergeNormalizedRunBackendAuth(current: RunBackendAuth | undefined, value: unknown): RunBackendAuth | undefined {
  const next = mergeRunBackendAuth(current ?? {}, normalizeRunBackendAuth(value))
  return Object.keys(next).length > 0 ? next : undefined
}

export function runBackendAuthMetadata(auth: RunBackendAuth): Record<string, string> {
  return {
    ...(auth.backendAuthToken ? { backendAuthToken: auth.backendAuthToken } : {}),
    ...(auth.backendAPIBaseURL ? { backendAPIBaseURL: auth.backendAPIBaseURL } : {}),
  }
}

export class RuntimeRunAuthRegistry {
  private readonly authByRunId = new Map<string, RunBackendAuth>()

  remember(runId: string, value: unknown): void {
    const next = mergeNormalizedRunBackendAuth(this.authByRunId.get(runId), value)
    if (next) this.authByRunId.set(runId, next)
  }

  get(runId: string): RunBackendAuth {
    return this.authByRunId.get(runId) ?? {}
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
