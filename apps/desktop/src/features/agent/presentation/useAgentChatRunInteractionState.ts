import { useMemo } from 'react'
import { actionableRunsForTaskGraph, interactionRunsForTaskGraph } from '@/features/agent/domain/agentPlanUi'
import { firstPendingInputRequest, interactionRunsForChat } from '@/features/agent/domain/agentRunInteraction'
import type { AgentTaskGraphSnapshot, AgentRun } from '@movscript/agent-protocol'

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
  const actionableRuns = useMemo(() => actionableRunsForTaskGraph(activePlanSnapshot, run), [activePlanSnapshot, run])
  const planInteractionRuns = useMemo(() => interactionRunsForTaskGraph(activePlanSnapshot, run), [activePlanSnapshot, run])
  const actionableRun = actionableRuns[0] ?? null
  const interactionRuns = useMemo(() => interactionRunsForChat(submittedInteractionRuns, planInteractionRuns), [planInteractionRuns, submittedInteractionRuns])
  const activePendingInputRequest = firstPendingInputRequest(actionableRun)
  const answeringPendingInput = !!activePendingInputRequest
  const canAnswerPendingInputWithText = !!activePendingInputRequest
    && (activePendingInputRequest.inputType === 'text' || activePendingInputRequest.allowCustomAnswer)

  return {
    actionableRun,
    actionableRuns,
    activePendingInputRequest,
    answeringPendingInput,
    canAnswerPendingInputWithText,
    interactionRuns,
  }
}
