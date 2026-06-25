import { isAgentAsyncWorkHandoffRun } from '@/features/agent/domain/agentAsyncWorkHandoff'
import type { AgentRun } from '@movscript/agent-protocol'

export interface AgentChatProviderSessionWorkViewStateInput {
  activeRun: AgentRun | null
  loading: boolean
  providerSessionApproving: boolean
  providerSessionBuilding: boolean
  providerSessionStopping: boolean
  providerSessionStopRequested: boolean
}

export interface AgentChatProviderSessionWorkViewState {
  approvingActiveRun: boolean
  buildingSendWorkspace: boolean
  inputBlockingLoading: boolean
  loading: boolean
  stoppingActiveRun: boolean
  stopRequestedBeforeRun: boolean
}

export function buildAgentChatProviderSessionWorkViewState(input: AgentChatProviderSessionWorkViewStateInput): AgentChatProviderSessionWorkViewState {
  const inputBlockingLoading = input.loading && !isAgentAsyncWorkHandoffRun(input.activeRun)

  return {
    approvingActiveRun: input.providerSessionApproving,
    buildingSendWorkspace: input.providerSessionBuilding,
    inputBlockingLoading,
    loading: inputBlockingLoading,
    stoppingActiveRun: input.providerSessionStopping,
    stopRequestedBeforeRun: input.providerSessionStopRequested,
  }
}
