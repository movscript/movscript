export interface ResourceAuthCacheScopeInput {
  userId?: string | number | null
  orgId?: string | number | null
  token?: string | null
}

export interface ResourceMediaCacheKeyOptions {
  origin?: string
  authScope?: string
}

const DEFAULT_RESOURCE_MEDIA_ORIGIN = 'http://movscript.local'

export function isResourceFilePath(pathname: string): boolean {
  return /^\/(?:api\/v1\/)?resources\/\d+\/file(?:$|[?#])/.test(pathname)
}

export function isResourceFileUrl(src: string, origin = DEFAULT_RESOURCE_MEDIA_ORIGIN): boolean {
  try {
    const url = new URL(src, origin)
    return isResourceFilePath(url.pathname)
  } catch {
    return isResourceFilePath(src)
  }
}

export function resourceMediaCacheKey(src: string, options: ResourceMediaCacheKeyOptions = {}): string {
  const origin = options.origin ?? DEFAULT_RESOURCE_MEDIA_ORIGIN
  const authScope = options.authScope ?? resourceAuthCacheScopeKey({})
  try {
    const url = new URL(src, origin)
    const baseKey = `${url.origin}${url.pathname}${url.search}`
    return isResourceFilePath(url.pathname) ? `${baseKey}::${authScope}` : baseKey
  } catch {
    return isResourceFilePath(src) ? `${src}::${authScope}` : src
  }
}

export function resourceAuthCacheScopeKey(input: ResourceAuthCacheScopeInput): string {
  const user = input.userId ? String(input.userId) : 'anonymous'
  const org = input.orgId ? String(input.orgId) : 'none'
  const tokenHash = input.token ? hashResourceCacheScopeValue(input.token) : 'none'
  return `auth:user:${user}:org:${org}:token:${tokenHash}`
}

export function hashResourceCacheScopeValue(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
