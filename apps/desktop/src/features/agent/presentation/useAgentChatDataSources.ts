import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import {
  agentSettingsModelIdForProvider,
  agentSettingsModelSelectionPatch,
  type AgentSettings,
} from '@/features/agent/state/agentStore'
import type { PublicModel, RawResource } from '@/types'
import { fetchAgentBackendModels } from '@/features/agent/application/agentModelCatalogApi'
import { agentModelKeys } from '@/features/agent/application/agentModelQueryKeys'
import { resourceKeys } from '@movscript/resource-surface/data'
import { resolveAgentModelId } from '@/features/agent/application/agentDefaultModelSelection'
import { publicModelId } from '@/shared/domain/modelDisplay'

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
    const selectedModelId = agentSettingsModelIdForProvider(settings, settings.activeProviderProfileConfigId)
    if (textModels.length <= 0 || selectedModelId === null) return
    const exists = textModels.some((model) => publicModelId(model) === selectedModelId)
    if (!exists) updateSettings(agentSettingsModelSelectionPatch(settings, settings.activeProviderProfileConfigId, null))
  }, [settings, textModels, updateSettings])

  const modelId = resolveAgentModelId({
    models: textModels,
    selectedModelId: agentSettingsModelIdForProvider(settings, settings.activeProviderProfileConfigId),
  })
  const activeModel = textModels.find((model) => publicModelId(model) === modelId)
  const recentResources = Array.isArray(resourcesData) ? resourcesData : (resourcesData?.items ?? [])

  return {
    activeModel,
    modelId,
    recentResources,
    textModels,
  }
}
