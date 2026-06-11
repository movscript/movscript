import {
  AGENT_BACKEND_MODEL_CAPABILITY_QUERY,
  fetchAgentBackendModels as fetchAgentBackendModelsWithClient,
  mergeAgentBackendModels,
  publicAgentBackendModelId,
  type AgentBackendModelCatalogClient,
} from '@movscript/core/agent'
import { api } from '@/shared/infrastructure/api'
import type { PublicModel } from '@/types'

export {
  AGENT_BACKEND_MODEL_CAPABILITY_QUERY,
  mergeAgentBackendModels,
  publicAgentBackendModelId,
}

export function fetchAgentBackendModels(
  client: AgentBackendModelCatalogClient<PublicModel> = api,
): Promise<PublicModel[]> {
  return fetchAgentBackendModelsWithClient(client)
}
