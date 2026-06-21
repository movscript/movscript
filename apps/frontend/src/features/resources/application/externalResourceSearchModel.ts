import type { ExternalResourceItem } from '@/types'
import type { ExternalOrientationFilter } from '@/features/resources/application/externalResourceSearchSnapshot'

export const EXTERNAL_RESOURCE_PAGE_SIZE = 24

export const EXTERNAL_ORIENTATION_OPTIONS = [
  { value: 'all', label: '全部方向' },
  { value: 'landscape', label: '横向' },
  { value: 'portrait', label: '竖向' },
  { value: 'square', label: '方形' },
] satisfies Array<{ value: ExternalOrientationFilter; label: string }>

export function externalResourceKey(item: ExternalResourceItem) {
  return `${item.provider_key}-${item.media_type}-${item.external_id}`
}
