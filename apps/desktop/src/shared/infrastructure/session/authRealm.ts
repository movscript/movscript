import type { AppSettings } from '@/shared/contracts/appSettings'
import { normalizeAPIBaseURL } from '@/shared/infrastructure/config'

export function authRealmKey(settings: Pick<AppSettings, 'launchMode' | 'apiBaseURL' | 'cloudAPIBaseURL' | 'localAPIBaseURL'> | undefined): string {
  if (settings?.launchMode === 'local') return 'local'
  const baseURL = normalizeAPIBaseURL(settings?.apiBaseURL || settings?.cloudAPIBaseURL || '')
  return `cloud:${stableRealmHash(baseURL || 'cloud')}`
}

function stableRealmHash(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index)
  }
  return (hash >>> 0).toString(36)
}
