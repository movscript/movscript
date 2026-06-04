import { isRuntimeAsyncWorkHandoffRun } from '@/features/agent/domain/agentRuntimeWorkHandoff'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'

export interface AgentChatRuntimeWorkViewStateInput {
  activeRun: AgentRun | null
  loading: boolean
  runtimeApproving: boolean
  runtimeBuilding: boolean
  runtimeStopping: boolean
  runtimeStopRequested: boolean
}

export interface AgentChatRuntimeWorkViewState {
  approvingLocalRun: boolean
  buildingSendWorkspace: boolean
  inputBlockingLoading: boolean
  loading: boolean
  stoppingLocalRun: boolean
  stopRequestedBeforeRun: boolean
}

export function buildAgentChatRuntimeWorkViewState(input: AgentChatRuntimeWorkViewStateInput): AgentChatRuntimeWorkViewState {
  const inputBlockingLoading = input.loading && !isRuntimeAsyncWorkHandoffRun(input.activeRun)

  return {
    approvingLocalRun: input.runtimeApproving,
    buildingSendWorkspace: input.runtimeBuilding,
    inputBlockingLoading,
    loading: inputBlockingLoading,
    stoppingLocalRun: input.runtimeStopping,
    stopRequestedBeforeRun: input.runtimeStopRequested,
  }
}
