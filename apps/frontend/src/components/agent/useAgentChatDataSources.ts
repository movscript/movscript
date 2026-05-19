import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AgentSettings } from '@/store/agentStore'
import type { PublicModel, RawResource } from '@/types'

interface UseAgentChatDataSourcesInput {
  settings: AgentSettings
  updateSettings: (settings: Partial<AgentSettings>) => void
}

export function useAgentChatDataSources({
  settings,
  updateSettings,
}: UseAgentChatDataSourcesInput) {
  const { data: textModels = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', 'text'],
    queryFn: () => api.get('/models?capability=text').then((r) => r.data),
  })
  const { data: resourcesData } = useQuery<RawResource[] | { items: RawResource[] }>({
    queryKey: ['resources', 'agent-panel'],
    queryFn: () => api.get('/resources', { params: { page: 1, page_size: 24, type: 'image,video,audio,text' } }).then((r) => r.data),
  })

  useEffect(() => {
    if (textModels.length <= 0 || settings.modelId === null) return
    const exists = textModels.some((model) => model.id === settings.modelId)
    if (!exists) updateSettings({ modelId: null })
  }, [settings.modelId, textModels, updateSettings])

  const modelId = settings.modelId ?? textModels[0]?.id ?? null
  const activeModel = textModels.find((model) => model.id === modelId)
  const recentResources = Array.isArray(resourcesData) ? resourcesData : (resourcesData?.items ?? [])

  return {
    activeModel,
    modelId,
    recentResources,
    textModels,
  }
}
