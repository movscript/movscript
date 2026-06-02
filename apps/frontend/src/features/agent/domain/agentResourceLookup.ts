import { api } from '@/shared/infrastructure/api'
import type { RawResource } from '@/types'

export async function fetchResourceById(id: number): Promise<RawResource | undefined> {
  try {
    const { data } = await api.get<RawResource[] | { items: RawResource[] }>('/resources', {
      params: { page: 1, page_size: 200, type: 'image,video' },
    })
    const resources = Array.isArray(data) ? data : data.items
    return resources.find((resource) => resource.ID === id)
  } catch {
    return undefined
  }
}
