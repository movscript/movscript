import { API_BASE_URL as API_BASE } from '@/shared/infrastructure/config'
import type { RawResource } from '@/types'

export function resolveResourceUrl(resource: RawResource): string {
  if (resource.direct_url) return resource.direct_url
  if (/^https?:\/\//i.test(resource.url) || resource.url.startsWith('data:') || resource.url.startsWith('blob:')) return resource.url
  return `${API_BASE}${resource.url}`
}
