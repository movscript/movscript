import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { createObjectUrl, revokeObjectUrl } from '@/shared/ui/objectUrl'
import {
  isResourceFileUrl as isCoreResourceFileUrl,
  hashResourceCacheScopeValue,
  resourceAuthCacheScopeKey,
  resourceMediaCacheKey as coreResourceMediaCacheKey,
} from '@movscript/core/resources'

export interface CachedMediaUrl {
  url: string
  release: () => void
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

export function isResourceFileUrl(src: string): boolean {
  return isCoreResourceFileUrl(src, resourceMediaOrigin())
}

export function resourceMediaCacheKey(src: string): string {
  return coreResourceMediaCacheKey(src, {
    origin: resourceMediaOrigin(),
    authScope: resourceAuthCacheScope(),
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
  if (!activeEntry) {
    return acquireCachedResourceMediaUrl(src, loadBlob, options)
  }

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
  if (!activeEntry) {
    return acquireCachedInlineImageMediaUrl(dataUrl, loadBlob, options)
  }

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

export function __resetResourceMediaCacheForTests() {
  clearResourceMediaCache()
}

function clearResourceMediaCache() {
  for (const entry of mediaCache.values()) {
    revokeObjectUrlEntry(entry.full)
    for (const variant of entry.variants.values()) {
      revokeObjectUrlEntry(variant)
    }
  }
  mediaCache.clear()
}

function releaseCacheReference(key: string) {
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

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('failed to read blob as data URL'))
    reader.readAsDataURL(blob)
  })
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

function revokeObjectUrlEntry(entry: ObjectUrlEntry) {
  revokeObjectUrl(entry.objectUrl)
}

function pruneResourceMediaCache() {
  if (mediaCache.size <= MAX_RESOURCE_MEDIA_CACHE_ENTRIES && totalCachedBytes() <= MAX_RESOURCE_MEDIA_CACHE_BYTES) return

  const releasable = [...mediaCache.entries()]
    .filter(([, entry]) => entry.refCount === 0)
    .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed)

  for (const [key, entry] of releasable) {
    if (mediaCache.size <= MAX_RESOURCE_MEDIA_CACHE_ENTRIES && totalCachedBytes() <= MAX_RESOURCE_MEDIA_CACHE_BYTES) break
    revokeObjectUrlEntry(entry.full)
    for (const variant of entry.variants.values()) {
      revokeObjectUrlEntry(variant)
    }
    mediaCache.delete(key)
  }
}

function totalCachedBytes() {
  let total = 0
  for (const entry of mediaCache.values()) {
    total += entry.byteSize ?? 0
  }
  return total
}

function inlineImageMediaCacheKey(dataUrl: string): string {
  const headerEnd = dataUrl.indexOf(',')
  const header = (headerEnd >= 0 ? dataUrl.slice(0, headerEnd) : dataUrl).slice(0, 128)
  return `inline-image:${header}:len:${dataUrl.length}:hash:${hashResourceCacheScopeValue(dataUrl)}`
}

function resourceMediaOrigin(): string {
  return globalThis.location?.origin ?? 'http://movscript.local'
}

function resourceAuthCacheScope(): string {
  const { currentUser, currentOrgID, token } = useUserStore.getState()
  return resourceAuthCacheScopeKey({
    userId: currentUser?.ID,
    orgId: currentOrgID,
    token,
  })
}

let lastResourceAuthCacheScope = resourceAuthCacheScope()

useUserStore.subscribe(() => {
  const nextScope = resourceAuthCacheScope()
  if (nextScope === lastResourceAuthCacheScope) return
  lastResourceAuthCacheScope = nextScope
  clearResourceMediaCache()
})
