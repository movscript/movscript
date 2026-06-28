export interface ResourceUrlLike {
  url: string
  direct_url?: string | null
}

export interface RawResourceRef {
  kind: 'raw-resource'
  resourceId: string
  projectId?: string | number
  scope?: string
  revision?: string | number
}

export type ResourceRef = RawResourceRef
export type RawResourceRefInput = RawResourceRef | number | string | null | undefined

export function isAbsoluteDisplayResourceUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')
}

export function resolveResourceUrl(resource: ResourceUrlLike, apiBaseURL: string): string {
  if (resource.direct_url) return resource.direct_url
  if (isAbsoluteDisplayResourceUrl(resource.url)) return resource.url
  return resolveResourcePathUrl(resource.url, apiBaseURL)
}

export function resolveResourcePathUrl(url: string, apiBaseURL: string): string {
  if (!url.startsWith('/')) return url
  const base = apiBaseURL.trim().replace(/\/+$/, '')
  if (!base) return url
  if (url.startsWith('/api/')) return `${base}${url}`
  return `${base}/api/v1${url}`
}

export function rawResourceRef(
  resourceId: number | string,
  options: Omit<RawResourceRef, 'kind' | 'resourceId'> = {},
): RawResourceRef | undefined {
  const normalizedResourceId = normalizeResourceIdValue(resourceId)
  if (!normalizedResourceId) return undefined
  return {
    kind: 'raw-resource',
    resourceId: normalizedResourceId,
    ...options,
  }
}

export function normalizeRawResourceRef(input: unknown): RawResourceRef | undefined {
  if (typeof input === 'number' || typeof input === 'string') {
    const resourceId = normalizeResourceIdValue(input)
    return resourceId ? { kind: 'raw-resource', resourceId } : undefined
  }
  if (!isRecord(input)) return undefined
  const kind = typeof input.kind === 'string' ? input.kind.trim() : ''
  const resourceId = normalizeResourceIdValue(input.resourceId ?? input.resource_id ?? input.id)
  if (!resourceId) return undefined
  return {
    kind: 'raw-resource',
    resourceId,
    ...(input.projectId !== undefined || input.project_id !== undefined ? { projectId: stringOrNumber(input.projectId ?? input.project_id) ?? String(input.projectId ?? input.project_id) } : {}),
    ...(typeof input.scope === 'string' && input.scope.trim() ? { scope: input.scope.trim() } : {}),
    ...(input.revision !== undefined ? { revision: stringOrNumber(input.revision) ?? String(input.revision) } : {}),
    ...(kind && kind !== 'raw-resource' ? { scope: kind } : {}),
  }
}

export function normalizeRawResourceRefs(input: unknown): RawResourceRef[] {
  const values = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(/[,;\s]+/).filter(Boolean)
      : [input]
  const refs = new Map<string, RawResourceRef>()
  for (const value of values) {
    const ref = normalizeRawResourceRef(value)
    if (ref) refs.set(rawResourceRefKey(ref), ref)
  }
  return [...refs.values()]
}

export function rawResourceRefKey(ref: Pick<RawResourceRef, 'resourceId' | 'projectId' | 'scope'>): string {
  return [
    ref.scope ?? '',
    ref.projectId !== undefined ? String(ref.projectId) : '',
    ref.resourceId,
  ].join(':')
}

export function rawResourceId(input: RawResourceRefInput): string | undefined {
  return normalizeRawResourceRef(input)?.resourceId
}

export function resourceFilePath(resourceId?: RawResourceRefInput): string | undefined {
  const normalizedResourceId = rawResourceId(resourceId)
  if (!normalizedResourceId) return undefined
  return `/api/v1/resources/${encodeURIComponent(normalizedResourceId)}/file`
}

export function resourceFileUrl(resourceId?: RawResourceRefInput, resourceUrl?: string): string | undefined {
  if (resourceUrl) return resourceUrl
  return resourceFilePath(resourceId)
}

export function resourceFileImageUrl(resourceId?: RawResourceRefInput, resourceUrl?: string): string | undefined {
  return resourceFileUrl(resourceId, resourceUrl)
}

function normalizeResourceIdValue(value: unknown): string | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? String(value) : undefined
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || isAbsoluteDisplayResourceUrl(trimmed) || /^\/(?:api\/)?v?\d*\/?resources\//i.test(trimmed)) return undefined
  const marker = /^\{\{\s*(?:raw-)?resource(?:::|:)\s*([^}\s]+)\s*\}\}$/i.exec(trimmed)
    ?? /^\[\[\s*(?:raw-)?resource(?:::|:)\s*([^\]\s]+)\s*\]\]$/i.exec(trimmed)
    ?? /^@\[resource:\s*([^\]\s]+)\s*\]$/i.exec(trimmed)
  const unwrapped = resourceIdFromMentionPayload(marker?.[1]) ?? resourceIdFromMentionPayload(trimmed.replace(/^(?:raw-)?resource(?:::|:)/i, ''))
  if (!unwrapped) return undefined
  const normalized = unwrapped.trim()
  if (!normalized || /^(?:https?:|data:|blob:|\/)/i.test(normalized)) return undefined
  return normalized
}

function resourceIdFromMentionPayload(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parts = trimmed.split(':').map((part) => part.trim()).filter(Boolean)
  if (parts.length <= 1) return trimmed
  return parts[parts.length - 1]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringOrNumber(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}
