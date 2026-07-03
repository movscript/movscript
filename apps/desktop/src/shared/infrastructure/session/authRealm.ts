import { normalizeAPIBaseURL } from '@/shared/infrastructure/config'

type AuthRealmSettings = {
  dataConnection?: {
    kind?: string | null
    url?: string | null
  } | null
  cloudAPIBaseURL?: string | null
}

export function authRealmKey(settings: AuthRealmSettings | undefined): string {
  if (settings?.dataConnection?.kind === 'local') return 'local'
  const baseURL = normalizeAPIBaseURL(settings?.dataConnection?.url || settings?.cloudAPIBaseURL || '')
  return `cloud:${stableRealmHash(baseURL || 'cloud')}`
}

function stableRealmHash(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index)
  }
  return (hash >>> 0).toString(36)
}
