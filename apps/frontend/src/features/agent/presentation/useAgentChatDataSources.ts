import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import type { AgentSettings } from '@/features/agent/state/agentStore'
import type { PublicModel, RawResource } from '@/types'
import { fetchAgentBackendModels } from '@/features/agent/application/agentModelCatalogApi'
import { agentModelKeys } from '@/features/agent/application/agentModelQueryKeys'
import { resourceKeys } from '@/features/resources/application/resourceQueryKeys'
import { resolveAgentModelId } from '@/features/agent/application/agentDefaultModelSelection'

interface UseAgentChatDataSourcesInput {
  settings: AgentSettings
  updateSettings: (settings: Partial<AgentSettings>) => void
}

export function useAgentChatDataSources({
  settings,
  updateSettings,
}: UseAgentChatDataSourcesInput) {
  const { data: textModels = [] } = useQuery<PublicModel[]>({
    queryKey: agentModelKeys.backendCatalog(),
    queryFn: () => fetchAgentBackendModels(),
  })
  const { data: resourcesData } = useQuery<RawResource[] | { items: RawResource[] }>({
    queryKey: resourceKeys.agentPanel,
    queryFn: () => api.get('/resources', { params: { page: 1, page_size: 24, type: 'image,video,audio,text' } }).then((r) => r.data),
  })

  useEffect(() => {
    if (textModels.length <= 0 || settings.modelId === null) return
    const exists = textModels.some((model) => model.id === settings.modelId)
    if (!exists) updateSettings({ modelId: null })
  }, [settings.modelId, textModels, updateSettings])

  const modelId = resolveAgentModelId({ models: textModels, selectedModelId: settings.modelId })
  const activeModel = textModels.find((model) => model.id === modelId)
  const recentResources = Array.isArray(resourcesData) ? resourcesData : (resourcesData?.items ?? [])

  return {
    activeModel,
    modelId,
    recentResources,
    textModels,
  }
}
