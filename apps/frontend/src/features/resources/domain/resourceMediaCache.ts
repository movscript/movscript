export interface CachedMediaUrl {
  url: string
  release: () => void
}

type BlobLoader = () => Promise<Blob>

interface CacheEntry {
  blobPromise: Promise<Blob>
  objectUrl?: string
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
    if (!isResourceFilePath(url.pathname)) return src
    return `${url.origin}${url.pathname}${url.search}`
  } catch {
    return src
  }
}

export async function acquireCachedResourceMediaUrl(src: string, loadBlob: BlobLoader): Promise<CachedMediaUrl> {
  if (!isResourceFileUrl(src)) {
    const blob = await loadBlob()
    const url = URL.createObjectURL(blob)
    return {
      url,
      release: () => URL.revokeObjectURL(url),
    }
  }

  const key = resourceMediaCacheKey(src)
  let entry = mediaCache.get(key)
  if (!entry) {
    entry = {
      blobPromise: loadBlob(),
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
    return acquireCachedResourceMediaUrl(src, loadBlob)
  }

  if (!activeEntry.objectUrl) {
    const blob = await activeEntry.blobPromise
    activeEntry.objectUrl = URL.createObjectURL(blob)
  }

  activeEntry.lastAccessed = Date.now()
  return {
    url: activeEntry.objectUrl,
    release: () => releaseCacheReference(key),
  }
}

export function __resetResourceMediaCacheForTests() {
  for (const entry of mediaCache.values()) {
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl)
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

function pruneResourceMediaCache() {
  if (mediaCache.size <= MAX_RESOURCE_MEDIA_CACHE_ENTRIES) return

  const releasable = [...mediaCache.entries()]
    .filter(([, entry]) => entry.refCount === 0)
    .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed)

  for (const [key, entry] of releasable) {
    if (mediaCache.size <= MAX_RESOURCE_MEDIA_CACHE_ENTRIES) break
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl)
    mediaCache.delete(key)
  }
}

function isResourceFilePath(pathname: string): boolean {
  return /^\/(?:api\/v1\/)?resources\/\d+\/file(?:$|[?#])/.test(pathname)
}
