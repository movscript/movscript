import { api } from '@/shared/infrastructure/api'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { resourceMediaCacheKey } from '@/shared/ui/resourceMediaCache'

const resourceTextCache = new Map<string, Promise<string>>()

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

export function __resetResourceTextCacheForTests(): void {
  resourceTextCache.clear()
  lastResourceTextAuthCacheScope = resourceTextAuthCacheScope()
}

async function loadResourceTextUrlUncached(url: string): Promise<string> {
  const res = await api.get<string>(url, {
    baseURL: '',
    responseType: 'text',
    transformResponse: [(data) => data],
  })
  return typeof res.data === 'string' ? res.data : String(res.data ?? '')
}

function resourceTextAuthCacheScope(): string {
  const { currentUser, currentOrgID, token } = useUserStore.getState()
  return `${currentUser?.ID ?? 'anonymous'}:${currentOrgID ?? 'none'}:${token ?? 'none'}`
}

let lastResourceTextAuthCacheScope = resourceTextAuthCacheScope()

useUserStore.subscribe(() => {
  const nextScope = resourceTextAuthCacheScope()
  if (nextScope === lastResourceTextAuthCacheScope) return
  lastResourceTextAuthCacheScope = nextScope
  resourceTextCache.clear()
})
