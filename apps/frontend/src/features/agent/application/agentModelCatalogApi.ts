import { fetchAgentBackendModels as fetchAgentBackendModelsWithClient, type AgentBackendModelCatalogClient } from '@movscript/core/agent'

import { api } from '@/shared/infrastructure/api'
import type { PublicModel } from '@/types'

export function fetchAgentBackendModels(
  client: AgentBackendModelCatalogClient<PublicModel> = api,
): Promise<PublicModel[]> {
  return fetchAgentBackendModelsWithClient(client)
}
