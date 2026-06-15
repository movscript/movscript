import { useQuery } from '@tanstack/react-query'
import { resourceKeys } from '@/features/resources/application/resourceQueryKeys'
import { api } from '@/shared/infrastructure/api'
import type { RawResource } from '@/types'

type AgentChatRecentResourcesResponse = RawResource[] | { items: RawResource[] }

export function useAgentChatRecentResources(): RawResource[] {
  const { data } = useQuery<AgentChatRecentResourcesResponse>({
    queryKey: resourceKeys.agentPanel,
    queryFn: () => api.get('/resources', {
      params: {
        page: 1,
        page_size: 24,
        type: 'image,video,audio,text',
      },
    }).then((response) => response.data),
  })

  return Array.isArray(data) ? data : (data?.items ?? [])
}
