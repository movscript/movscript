import { getSettingsDataConnectionBaseURL, normalizeAPIBaseURL, type AppSettings } from '@/shared/infrastructure/config'
import type { ExternalResourceSource } from '@/types'

export type AppSettingsTestState =
  | { status: 'idle'; message: string }
  | { status: 'testing'; message: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

export type ExternalResourceProviderKey = 'pexels' | 'pixabay'

export const EXTERNAL_RESOURCE_PROVIDERS: Array<{
  key: ExternalResourceProviderKey
  name: string
}> = [
  {
    key: 'pexels',
    name: 'Pexels',
  },
  {
    key: 'pixabay',
    name: 'Pixabay',
  },
]

export const EMPTY_EXTERNAL_RESOURCE_SOURCES: ExternalResourceSource[] = []

export interface ResourceBlobGCResult {
  backend: string
  dry_run: boolean
  candidates: number
  deleted: number
  freed_bytes: number
}

export type ShotLibrarySourceParseResult =
  | { ok: true; sources: NonNullable<AppSettings['shotLibrarySources']>; defaultSourceId?: string }
  | { ok: false; error: string }

export function healthURL(baseURL: string): string {
  return `${normalizeAPIBaseURL(baseURL)}/health`
}

export function sourceForProvider(sources: ExternalResourceSource[], provider: ExternalResourceProviderKey) {
  return sources.find(source => source.provider_key === provider)
}

export function formatShotLibrarySources(settings: AppSettings): string {
  const sources = settings.shotLibrarySources?.length
    ? settings.shotLibrarySources
    : [{
        id: 'default',
        name: 'Movscript',
        baseURL: getSettingsDataConnectionBaseURL(settings),
        enabled: true,
      }]
  return JSON.stringify({
    defaultSourceId: settings.defaultShotLibrarySourceId ?? sources[0]?.id ?? 'default',
    sources,
  }, null, 2)
}

export function formatDefaultShotLibrarySources(apiBaseURL: string): string {
  return JSON.stringify({
    defaultSourceId: 'default',
    sources: [{
      id: 'default',
      name: 'Movscript',
      baseURL: apiBaseURL,
      enabled: true,
      readOnly: false,
    }],
  }, null, 2)
}

export function parseShotLibrarySources(value: string): ShotLibrarySourceParseResult {
  try {
    const parsed = JSON.parse(value) as Partial<AppSettings> & { sources?: unknown; defaultSourceId?: unknown }
    const sources = Array.isArray(parsed.sources)
      ? parsed.sources
      : Array.isArray(parsed.shotLibrarySources)
        ? parsed.shotLibrarySources
        : []
    const normalized = sources.map((source, index) => {
      const item = source as Record<string, unknown>
      const id = typeof item.id === 'string' ? item.id.trim() : ''
      const name = typeof item.name === 'string' ? item.name.trim() : ''
      const baseURL = typeof item.baseURL === 'string' ? item.baseURL.trim() : ''
      if (!id || !name || !baseURL) {
        throw new Error(`sources[${index}] requires id, name, and baseURL`)
      }
      if (!/^https?:\/\/.+/i.test(normalizeAPIBaseURL(baseURL))) {
        throw new Error(`sources[${index}].baseURL must be http(s)`)
      }
      return {
        id,
        name,
        baseURL: normalizeAPIBaseURL(baseURL),
        enabled: item.enabled !== false,
        readOnly: item.readOnly === true,
        authToken: typeof item.authToken === 'string' && item.authToken.trim() ? item.authToken.trim() : undefined,
      }
    })
    if (normalized.length === 0) throw new Error('sources must contain at least one item')
    const defaultSourceId = typeof parsed.defaultSourceId === 'string' ? parsed.defaultSourceId.trim() : undefined
    if (defaultSourceId && !normalized.some(source => source.id === defaultSourceId)) {
      throw new Error('defaultSourceId must match a source id')
    }
    return { ok: true, sources: normalized, defaultSourceId }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON' }
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  const formatted = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)
  return `${formatted} ${units[unitIndex]}`
}
