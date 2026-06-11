import { API_BASE_URL as API_BASE } from '@/shared/infrastructure/config'
import type { RawResource } from '@/types'
import { resolveResourceUrl as resolveCoreResourceUrl } from '@movscript/core/resources'

export function resolveResourceUrl(resource: RawResource): string {
  return resolveCoreResourceUrl(resource, API_BASE)
}
