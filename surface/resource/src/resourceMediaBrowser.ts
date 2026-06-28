import type { RawResource } from '@movscript/shared'
import { surfaceDataApi } from '@movscript/shared/surface-http'
import { createObjectUrl, revokeObjectUrl } from '@movscript/shared/browser'
import {
  isResourceFileUrl as isCoreResourceFileUrl,
  resourceFilePath,
  resourceFileImageUrl,
  resourceFileUrl,
  resourceMediaCacheKey as coreResourceMediaCacheKey,
  resolveResourcePathUrl as resolveCoreResourcePathUrl,
  resolveResourceUrl as resolveCoreResourceUrl,
} from '@movscript/core/resources'

export { resourceFileImageUrl, resourceFileUrl }

export interface ResourceBlobLoadOptions {
  signal?: AbortSignal
  onDownloadProgress?: (event: { loaded: number; total?: number }) => void
}

export interface CachedMediaUrl {
  url: string
  release: () => void
}

export interface ResourceMediaBrowserConfig {
  apiBaseURL?: string | (() => string)
  authCacheScope?: string | (() => string)
  mediaAuthHeaders?: HeadersInit | (() => HeadersInit | undefined)
}

type BlobLoader = () => Promise<Blob>
type BlobTransformer = (blob: Blob) => Promise<Blob>

interface ObjectUrlEntry {
  objectUrl?: string
  objectUrlPromise?: Promise<string>
}

interface CacheEntry {
  blobPromise: Promise<Blob>
  dataUrlPromise?: Promise<string>
  full: ObjectUrlEntry
  variants: Map<string, ObjectUrlEntry>
  refCount: number
  lastAccessed: number
  byteSize?: number
}

const MAX_RESOURCE_MEDIA_CACHE_ENTRIES = 128
const MAX_RESOURCE_MEDIA_CACHE_BYTES = 256 * 1024 * 1024

const mediaCache = new Map<string, CacheEntry>()
const resourceTextCache = new Map<string, Promise<string>>()
let browserConfig: ResourceMediaBrowserConfig = {}

export function configureResourceMediaBrowser(config: ResourceMediaBrowserConfig): void {
  browserConfig = { ...browserConfig, ...config }
}

export function resolveResourceUrl(resource: RawResource): string {
  return resolveCoreResourceUrl(resource, readConfiguredAPIBaseURL())
}

export function resolveResourceFileUrl(resourceId?: number | string | null, resourceUrl?: string | null): string | undefined {
  const url = resourceFileUrl(resourceId, resourceUrl?.trim() || undefined)
  return url ? resolveConfiguredResourceUrl(url) : undefined
}

export function resolveResourceFileImageUrl(resourceId?: number | string | null, resourceUrl?: string | null): string | undefined {
  return resolveResourceFileUrl(resourceId, resourceUrl)
}

export function isResourceFileUrl(src: string): boolean {
  return isCoreResourceFileUrl(src, resourceMediaOrigin())
}

export function resourceMediaCacheKey(src: string): string {
  return coreResourceMediaCacheKey(src, {
    origin: resourceMediaOrigin(),
    authScope: readConfiguredAuthCacheScope(),
  })
}

export async function acquireCachedResourceMediaUrl(
  src: string,
  loadBlob: BlobLoader,
  options?: {
    variantKey?: string
    transformBlob?: BlobTransformer
  },
): Promise<CachedMediaUrl> {
  const key = resourceMediaCacheKey(src)
  let entry = mediaCache.get(key)
  if (!entry) {
    entry = {
      blobPromise: loadBlob(),
      full: {},
      variants: new Map(),
      refCount: 0,
      lastAccessed: Date.now(),
    }
    mediaCache.set(key, entry)
  }

  entry.refCount += 1
  entry.lastAccessed = Date.now()

  try {
    const blob = await entry.blobPromise
    entry.byteSize = blob.size
  } catch (error) {
    releaseCacheReference(key)
    mediaCache.delete(key)
    throw error
  }

  const activeEntry = mediaCache.get(key)
  if (!activeEntry) return acquireCachedResourceMediaUrl(src, loadBlob, options)

  const objectUrl = await getOrCreateObjectUrl(activeEntry, options?.variantKey, options?.transformBlob)

  activeEntry.lastAccessed = Date.now()
  pruneResourceMediaCache()
  return {
    url: objectUrl,
    release: () => releaseCacheReference(key),
  }
}

export async function acquireCachedInlineImageMediaUrl(
  dataUrl: string,
  loadBlob: BlobLoader,
  options?: {
    variantKey?: string
    transformBlob?: BlobTransformer
  },
): Promise<CachedMediaUrl> {
  const key = inlineImageMediaCacheKey(dataUrl)
  let entry = mediaCache.get(key)
  if (!entry) {
    entry = {
      blobPromise: loadBlob(),
      full: {},
      variants: new Map(),
      refCount: 0,
      lastAccessed: Date.now(),
    }
    mediaCache.set(key, entry)
  }

  entry.refCount += 1
  entry.lastAccessed = Date.now()

  try {
    const blob = await entry.blobPromise
    entry.byteSize = blob.size
  } catch (error) {
    releaseCacheReference(key)
    mediaCache.delete(key)
    throw error
  }

  const activeEntry = mediaCache.get(key)
  if (!activeEntry) return acquireCachedInlineImageMediaUrl(dataUrl, loadBlob, options)

  const objectUrl = await getOrCreateObjectUrl(activeEntry, options?.variantKey, options?.transformBlob)

  activeEntry.lastAccessed = Date.now()
  pruneResourceMediaCache()
  return {
    url: objectUrl,
    release: () => releaseCacheReference(key),
  }
}

export async function loadCachedResourceBlob(src: string, loadBlob: BlobLoader): Promise<Blob> {
  const key = resourceMediaCacheKey(src)
  const entry = getOrCreateCacheEntry(key, loadBlob)

  try {
    const blob = await entry.blobPromise
    entry.byteSize = blob.size
    entry.lastAccessed = Date.now()
    pruneResourceMediaCache()
    return blob
  } catch (error) {
    mediaCache.delete(key)
    throw error
  }
}

export async function loadCachedResourceDataURL(src: string, loadBlob: BlobLoader): Promise<string> {
  const key = resourceMediaCacheKey(src)
  const entry = getOrCreateCacheEntry(key, loadBlob)

  if (!entry.dataUrlPromise) {
    entry.dataUrlPromise = entry.blobPromise.then((blob) => {
      entry.byteSize = blob.size
      return blobToDataURL(blob)
    })
  }

  try {
    const dataUrl = await entry.dataUrlPromise
    entry.lastAccessed = Date.now()
    pruneResourceMediaCache()
    return dataUrl
  } catch (error) {
    mediaCache.delete(key)
    throw error
  }
}

export async function loadResourceBlob(resource: RawResource, options?: ResourceBlobLoadOptions): Promise<Blob> {
  return loadResourceUrlBlob(resolveResourceUrl(resource), options)
}

export async function loadResourceFileBlob(resourceId: number, options?: ResourceBlobLoadOptions): Promise<Blob> {
  const src = resourceFilePath(resourceId) ?? ''
  return loadCachedResourceBlob(src, () => loadResourceFileBlobUncached(resourceId, options))
}

export async function loadResourceDataURL(resource: RawResource, options?: ResourceBlobLoadOptions): Promise<string> {
  const src = resolveResourceUrl(resource)
  return loadCachedResourceDataURL(src, () => loadResourceUrlBlobUncached(src, options))
}

export async function loadResourceFileDataURL(resourceId: number, options?: ResourceBlobLoadOptions): Promise<string> {
  const src = resourceFilePath(resourceId) ?? ''
  return loadCachedResourceDataURL(src, () => loadResourceFileBlobUncached(resourceId, options))
}

export async function loadResourceUrlBlob(src: string, options?: ResourceBlobLoadOptions): Promise<Blob> {
  return loadCachedResourceBlob(src, () => loadResourceUrlBlobUncached(src, options))
}

export async function loadResourceTextUrl(url: string): Promise<string> {
  const key = resourceMediaCacheKey(url)
  const cached = resourceTextCache.get(key)
  if (cached) return cached

  const loaded = loadResourceTextUrlUncached(url)
    .catch((error) => {
      resourceTextCache.delete(key)
      throw error
    })
  resourceTextCache.set(key, loaded)
  return loaded
}

export async function downloadResource(resource: RawResource): Promise<void> {
  const blob = await loadResourceBlob(resource)
  const url = createObjectUrl(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = resource.name
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  revokeObjectUrl(url)
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('failed to read blob as data URL'))
    reader.readAsDataURL(blob)
  })
}

export function __resetResourceMediaCacheForTests(): void {
  clearResourceMediaCache()
}

export function __resetResourceTextCacheForTests(): void {
  resourceTextCache.clear()
}

async function loadResourceFileBlobUncached(resourceId: number, options?: ResourceBlobLoadOptions): Promise<Blob> {
  const response = await surfaceDataApi.get(`/resources/${resourceId}/file`, {
    responseType: 'blob',
    signal: options?.signal,
    onDownloadProgress: options?.onDownloadProgress,
  })
  return response.data as Blob
}

async function loadResourceUrlBlobUncached(src: string, options?: ResourceBlobLoadOptions): Promise<Blob> {
  if (requiresResourceAPIAuth(src)) {
    const response = await surfaceDataApi.get(normalizeResourceAPIAuthPath(src), {
      baseURL: normalizeResourceAPIAuthBaseURL(src),
      responseType: 'blob',
      signal: options?.signal,
      onDownloadProgress: options?.onDownloadProgress,
    })
    return response.data as Blob
  }

  const response = await fetch(src, { signal: options?.signal })
  if (!response.ok) throw new Error(`Failed to load media: ${response.status}`)
  return response.blob()
}

async function loadResourceTextUrlUncached(url: string): Promise<string> {
  const response = await surfaceDataApi.get<string>(url, {
    baseURL: '',
    responseType: 'text',
    transformResponse: [(data: unknown) => data],
  })
  return typeof response.data === 'string' ? response.data : String(response.data ?? '')
}

function readConfiguredAPIBaseURL(): string {
  const value = browserConfig.apiBaseURL
  const resolved = typeof value === 'function' ? value() : value
  if (resolved?.trim()) return resolved.trim().replace(/\/+$/, '')
  return typeof window === 'undefined' ? '' : window.location.origin
}

export function getResourceMediaAPIBaseURL(): string {
  return readConfiguredAPIBaseURL()
}

export function getResourceMediaAuthHeaders(): HeadersInit | undefined {
  const value = browserConfig.mediaAuthHeaders
  return typeof value === 'function' ? value() : value
}

function resolveConfiguredResourceUrl(url: string): string {
  if (/^(https?:|data:|blob:)/i.test(url)) return url
  return resolveCoreResourcePathUrl(url, readConfiguredAPIBaseURL())
}

function readConfiguredAuthCacheScope(): string | undefined {
  const value = browserConfig.authCacheScope
  const resolved = typeof value === 'function' ? value() : value
  return resolved?.trim() || undefined
}

function resourceMediaOrigin(): string {
  return globalThis.location?.origin || 'http://movscript.local'
}

function clearResourceMediaCache(): void {
  for (const entry of mediaCache.values()) {
    revokeObjectUrlEntry(entry.full)
    for (const variant of entry.variants.values()) {
      revokeObjectUrlEntry(variant)
    }
  }
  mediaCache.clear()
}

function releaseCacheReference(key: string): void {
  const entry = mediaCache.get(key)
  if (!entry) return
  entry.refCount = Math.max(0, entry.refCount - 1)
  entry.lastAccessed = Date.now()
  pruneResourceMediaCache()
}

function getOrCreateCacheEntry(key: string, loadBlob: BlobLoader): CacheEntry {
  let entry = mediaCache.get(key)
  if (!entry) {
    entry = {
      blobPromise: loadBlob(),
      full: {},
      variants: new Map(),
      refCount: 0,
      lastAccessed: Date.now(),
    }
    mediaCache.set(key, entry)
  }
  return entry
}

function getOrCreateObjectUrl(entry: CacheEntry, variantKey?: string, transformBlob?: BlobTransformer): Promise<string> {
  const objectUrlEntry = getObjectUrlEntry(entry, variantKey)
  if (objectUrlEntry.objectUrl) return Promise.resolve(objectUrlEntry.objectUrl)
  if (!objectUrlEntry.objectUrlPromise) {
    objectUrlEntry.objectUrlPromise = entry.blobPromise
      .then((blob) => transformBlob ? transformBlob(blob) : blob)
      .then((blob) => {
        if (!objectUrlEntry.objectUrl) objectUrlEntry.objectUrl = createObjectUrl(blob)
        return objectUrlEntry.objectUrl
      })
      .catch((error) => {
        objectUrlEntry.objectUrlPromise = undefined
        throw error
      })
  }
  return objectUrlEntry.objectUrlPromise
}

function getObjectUrlEntry(entry: CacheEntry, variantKey: string | undefined): ObjectUrlEntry {
  if (!variantKey) return entry.full
  let variant = entry.variants.get(variantKey)
  if (!variant) {
    variant = {}
    entry.variants.set(variantKey, variant)
  }
  return variant
}

function revokeObjectUrlEntry(entry: ObjectUrlEntry): void {
  revokeObjectUrl(entry.objectUrl)
}

function pruneResourceMediaCache(): void {
  if (mediaCache.size <= MAX_RESOURCE_MEDIA_CACHE_ENTRIES && totalCacheBytes() <= MAX_RESOURCE_MEDIA_CACHE_BYTES) return
  const entries = Array.from(mediaCache.entries())
    .filter(([, entry]) => entry.refCount <= 0)
    .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)

  for (const [key, entry] of entries) {
    if (mediaCache.size <= MAX_RESOURCE_MEDIA_CACHE_ENTRIES && totalCacheBytes() <= MAX_RESOURCE_MEDIA_CACHE_BYTES) break
    revokeObjectUrlEntry(entry.full)
    for (const variant of entry.variants.values()) {
      revokeObjectUrlEntry(variant)
    }
    mediaCache.delete(key)
  }
}

function totalCacheBytes(): number {
  let total = 0
  for (const entry of mediaCache.values()) {
    total += entry.byteSize ?? 0
  }
  return total
}

function inlineImageMediaCacheKey(dataUrl: string): string {
  return `inline-image:${dataUrl.slice(0, 256)}:${dataUrl.length}`
}

function requiresResourceAPIAuth(src: string): boolean {
  try {
    const url = new URL(src, window.location.origin)
    return url.pathname.startsWith('/api/v1/resources/')
  } catch {
    return src.startsWith('/api/v1/resources/')
  }
}

function normalizeResourceAPIAuthPath(src: string): string {
  try {
    const url = new URL(src, window.location.origin)
    return url.pathname.replace(/^\/api\/v1/, '') + url.search
  } catch {
    return src.replace(/^\/api\/v1/, '')
  }
}

function normalizeResourceAPIAuthBaseURL(src: string): string | undefined {
  try {
    const url = new URL(src, window.location.origin)
    if (url.origin !== window.location.origin) return `${url.origin}/api/v1`
  } catch {
    return undefined
  }
  return undefined
}
