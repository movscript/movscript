import { AGENT_BACKEND_MODEL_CAPABILITY_QUERY } from '@/features/agent/domain/agentModelCatalog'

export const agentModelKeys = {
  backendCatalog: (scope = 'default-backend') => ['models', 'agent-backend', AGENT_BACKEND_MODEL_CAPABILITY_QUERY, scope] as const,
}
