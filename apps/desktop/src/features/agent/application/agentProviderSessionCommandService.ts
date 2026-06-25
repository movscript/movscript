import {
  agentProviderSessionCompatibilityClient,
  agentProviderSessionTreeIdForCompatibilityInput,
} from '@/features/agent/infrastructure/agentProviderSessionCompatibility'

export interface AgentProviderSessionCommandScope {
  providerSessionTreeId?: string
  sessionId?: string // deprecated legacy provider-session input; normalize to providerSessionTreeId.
  workspaceDir?: string
}

export function createAgentProviderSessionCommandService(scope: AgentProviderSessionCommandScope = {}) {
  const client = scopedProviderSessionCommandClient(scope)
  return {
    answerRunInput: (...args: Parameters<typeof client.answerRunInput>) => client.answerRunInput(...args),
    approveInteraction: (...args: Parameters<typeof client.approveInteraction>) => client.approveInteraction(...args),
    cancelRun: (...args: Parameters<typeof client.cancelRun>) => client.cancelRun(...args),
    cancelRunTree: (...args: Parameters<typeof client.cancelRunTree>) => client.cancelRunTree(...args),
    dispatchTaskGraph: (...args: Parameters<typeof client.dispatchTaskGraph>) => client.dispatchTaskGraph(...args),
    getRun: (...args: Parameters<typeof client.getRun>) => client.getRun(...args),
    rejectInteraction: (...args: Parameters<typeof client.rejectInteraction>) => client.rejectInteraction(...args),
    replanRun: (...args: Parameters<typeof client.replanRun>) => client.replanRun(...args),
    streamRun: (...args: Parameters<typeof client.streamRun>) => client.streamRun(...args),
    updateTask: (...args: Parameters<typeof client.updateTask>) => client.updateTask(...args),
  }
}

export type AgentProviderSessionCommandService = ReturnType<typeof createAgentProviderSessionCommandService>

function scopedProviderSessionCommandClient(scope: AgentProviderSessionCommandScope) {
  const providerSessionTreeId = agentProviderSessionTreeIdForCompatibilityInput(scope)
  const compatibilityClient = agentProviderSessionCompatibilityClient('provider-session-command-compat')
  return providerSessionTreeId
    ? compatibilityClient.forSession({
        sessionId: providerSessionTreeId,
        ...(scope.workspaceDir?.trim() ? { workspaceDir: scope.workspaceDir.trim() } : {}),
      })
    : compatibilityClient
}
