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
  full: ObjectUrlEntry
  variants: Map<string, ObjectUrlEntry>
  refCount: number
  lastAccessed: number
}

const MAX_RESOURCE_MEDIA_CACHE_ENTRIES = 128

const mediaCache = new Map<string, CacheEntry>()

export function isResourceFileUrl(src: string): boolean {
  try {
    const url = new URL(src, globalThis.location?.origin ?? 'http://movscript.local')
    return isResourceFilePath(url.pathname)
  } catch {
    return isResourceFilePath(src)
  }
}

export function resourceMediaCacheKey(src: string): string {
  try {
    const url = new URL(src, globalThis.location?.origin ?? 'http://movscript.local')
    return `${url.origin}${url.pathname}${url.search}`
  } catch {
    return src
  }
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
    await entry.blobPromise
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
  return {
    url: objectUrl,
    release: () => releaseCacheReference(key),
  }
}

export function __resetResourceMediaCacheForTests() {
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

function getOrCreateObjectUrl(entry: CacheEntry, variantKey?: string, transformBlob?: BlobTransformer): Promise<string> {
  const objectUrlEntry = getObjectUrlEntry(entry, variantKey)
  if (objectUrlEntry.objectUrl) return Promise.resolve(objectUrlEntry.objectUrl)
  if (!objectUrlEntry.objectUrlPromise) {
    objectUrlEntry.objectUrlPromise = entry.blobPromise
      .then((blob) => transformBlob ? transformBlob(blob) : blob)
      .then((blob) => {
        if (!objectUrlEntry.objectUrl) objectUrlEntry.objectUrl = URL.createObjectURL(blob)
        return objectUrlEntry.objectUrl
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

function revokeObjectUrlEntry(entry: ObjectUrlEntry) {
  if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl)
}

function pruneResourceMediaCache() {
  if (mediaCache.size <= MAX_RESOURCE_MEDIA_CACHE_ENTRIES) return

  const releasable = [...mediaCache.entries()]
    .filter(([, entry]) => entry.refCount === 0)
    .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed)

  for (const [key, entry] of releasable) {
    if (mediaCache.size <= MAX_RESOURCE_MEDIA_CACHE_ENTRIES) break
    revokeObjectUrlEntry(entry.full)
    for (const variant of entry.variants.values()) {
      revokeObjectUrlEntry(variant)
    }
    mediaCache.delete(key)
  }
}

function isResourceFilePath(pathname: string): boolean {
  return /^\/(?:api\/v1\/)?resources\/\d+\/file(?:$|[?#])/.test(pathname)
}
