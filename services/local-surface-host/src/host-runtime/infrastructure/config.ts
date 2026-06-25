export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function normalizeAPIBaseURL(value: string | undefined | null): string {
  const trimmed = value?.trim()
  return trimmed ? trimTrailingSlash(trimmed) : ''
}

export function isLocalLaunchMode(value: string | { launchMode?: string } | undefined | null): boolean {
  const launchMode = typeof value === 'string' ? value : value?.launchMode
  return launchMode === 'local' || launchMode === 'plugin-full-local'
}

export function getAPIBaseURL(): string {
  return typeof window === 'undefined' ? '/local-api/data' : `${window.location.origin}/local-api/data`
}

export function getAPIV1BaseURL(): string {
  return `${getAPIBaseURL()}/api/v1`
}

export function getLocalAPIBaseURL(): string {
  return getAPIBaseURL()
}
