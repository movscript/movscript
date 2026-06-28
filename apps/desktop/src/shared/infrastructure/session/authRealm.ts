import { normalizeAPIBaseURL } from '@/shared/infrastructure/config'

type AuthRealmSettings = {
  dataConnection?: {
    kind?: string | null
    url?: string | null
  } | null
  /** @deprecated Use dataConnection.kind. */
  launchMode?: string | null
  apiBaseURL?: string | null
  cloudAPIBaseURL?: string | null
}

export function authRealmKey(settings: AuthRealmSettings | undefined): string {
  if (settings?.dataConnection?.kind === 'local' || settings?.launchMode === 'local') return 'local'
  const baseURL = normalizeAPIBaseURL(settings?.dataConnection?.url || settings?.cloudAPIBaseURL || settings?.apiBaseURL || '')
  return `cloud:${stableRealmHash(baseURL || 'cloud')}`
}

function stableRealmHash(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index)
  }
  return (hash >>> 0).toString(36)
}
