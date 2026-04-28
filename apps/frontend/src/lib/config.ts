const DEFAULT_API_ORIGIN = 'http://localhost:8765'

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export const API_BASE_URL = trimTrailingSlash(
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_ORIGIN
)

export const API_V1_BASE_URL = `${API_BASE_URL}/api/v1`
