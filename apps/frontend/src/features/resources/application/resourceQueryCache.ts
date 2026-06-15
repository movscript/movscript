import { resourceKeys } from '@/features/resources/application/resourceQueryKeys'
import type { RawResource } from '@/types'

export interface ResourceQueryCacheReader {
  getQueryData: <TData>(queryKey: readonly unknown[]) => TData | undefined
}

export function readCachedResourceById(
  queryClient: ResourceQueryCacheReader,
  id: number,
): RawResource | undefined {
  const resources = queryClient.getQueryData<RawResource[]>(resourceKeys.all) ?? []
  return resources.find((resource) => resource.ID === id)
}
