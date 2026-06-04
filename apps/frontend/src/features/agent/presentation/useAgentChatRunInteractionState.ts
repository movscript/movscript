import { useMemo } from 'react'
import { actionableRunsForTaskGraph, interactionRunsForTaskGraph } from '@/features/agent/domain/agentPlanUi'
import { firstPendingInputRequest, interactionRunsForChat } from '@/features/agent/domain/agentRunInteraction'
import type { AgentTaskGraphSnapshot, AgentRun } from '@/shared/infrastructure/localAgentClient'

interface UseAgentChatRunInteractionStateInput {
  activePlanSnapshot?: AgentTaskGraphSnapshot
  run: AgentRun | null
  submittedInteractionRuns: AgentRun[]
}

export function useAgentChatRunInteractionState({
  activePlanSnapshot,
  run,
  submittedInteractionRuns,
}: UseAgentChatRunInteractionStateInput) {
  const actionableLocalRuns = useMemo(() => actionableRunsForTaskGraph(activePlanSnapshot, run), [activePlanSnapshot, run])
  const planInteractionRuns = useMemo(() => interactionRunsForTaskGraph(activePlanSnapshot, run), [activePlanSnapshot, run])
  const actionableLocalRun = actionableLocalRuns[0] ?? null
  const interactionRuns = useMemo(() => interactionRunsForChat(submittedInteractionRuns, planInteractionRuns), [planInteractionRuns, submittedInteractionRuns])
  const activePendingInputRequest = firstPendingInputRequest(actionableLocalRun)
  const answeringPendingInput = !!activePendingInputRequest
  const canAnswerPendingInputWithText = !!activePendingInputRequest
    && (activePendingInputRequest.inputType === 'text' || activePendingInputRequest.allowCustomAnswer)

  return {
    actionableLocalRun,
    actionableLocalRuns,
    activePendingInputRequest,
    answeringPendingInput,
    canAnswerPendingInputWithText,
    interactionRuns,
  }
}
