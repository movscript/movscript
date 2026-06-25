import i18n from 'i18next'

export interface APIErrorBody {
  code?: unknown
  message?: unknown
  error?: unknown
}

const EXACT_KEYS: Record<string, string> = {
  'only video generation jobs can be cancelled': 'apiErrors.cancelVideoOnly',
  'finished jobs cannot be cancelled': 'apiErrors.cancelFinishedJob',
  'running jobs cannot be retried until they fail or time out': 'apiErrors.runningJobRetry',
  'succeeded jobs cannot be retried': 'apiErrors.succeededJobRetry',
}

export function translateApiError(input: unknown, fallbackKey = 'common.requestFailed'): string {
  const raw = stringErrorValue((input as APIErrorBody | undefined)?.message)
    ?? stringErrorValue((input as APIErrorBody | undefined)?.error)
  if (!raw) return i18n.t(fallbackKey)
  const key = EXACT_KEYS[raw]
  return key ? i18n.t(key, { defaultValue: raw }) : raw
}

function stringErrorValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object') {
    return stringErrorValue((value as Record<string, unknown>).message)
      ?? stringErrorValue((value as Record<string, unknown>).detail)
      ?? stringErrorValue((value as Record<string, unknown>).error)
  }
  return undefined
}
