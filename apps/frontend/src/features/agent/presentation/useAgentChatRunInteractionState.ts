import { useMemo } from 'react'
import { actionableRunsForTaskGraph, interactionRunsForTaskGraph } from '@/features/agent/domain/agentPlanUi'
import { firstPendingInputRequest, runInteractionAnswerEchoesForMessages, interactionRunsForChat } from '@/features/agent/domain/agentRunInteraction'
import { buildInteractionRunsByResultMessageId } from '@/features/agent/domain/agentRunInteractionAnchors'
import type { AgentTaskGraphSnapshot, AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatMessage } from '@/features/agent/state/agentStore'

interface UseAgentChatRunInteractionStateInput {
  activePlanSnapshot?: AgentTaskGraphSnapshot
  messages: ChatMessage[]
  run: AgentRun | null
  submittedInteractionRuns: AgentRun[]
}

export function useAgentChatRunInteractionState({
  activePlanSnapshot,
  messages,
  run,
  submittedInteractionRuns,
}: UseAgentChatRunInteractionStateInput) {
  const actionableLocalRuns = useMemo(() => actionableRunsForTaskGraph(activePlanSnapshot, run), [activePlanSnapshot, run])
  const planInteractionRuns = useMemo(() => interactionRunsForTaskGraph(activePlanSnapshot, run), [activePlanSnapshot, run])
  const actionableLocalRun = actionableLocalRuns[0] ?? null
  const interactionRuns = useMemo(() => interactionRunsForChat(submittedInteractionRuns, planInteractionRuns), [planInteractionRuns, submittedInteractionRuns])
  const interactionRunsByResultMessageId = useMemo(
    () => buildInteractionRunsByResultMessageId({ messages, interactionRuns }),
    [messages, interactionRuns],
  )
  const interactionRunsWithoutResultMessage = useMemo(() => {
    const insertedRunIds = new Set(Array.from(interactionRunsByResultMessageId.values()).flat().map((interactionRun) => interactionRun.id))
    return interactionRuns.filter((interactionRun) => !insertedRunIds.has(interactionRun.id))
  }, [interactionRuns, interactionRunsByResultMessageId])
  const runInteractionAnswerEchoes = useMemo(() => runInteractionAnswerEchoesForMessages(messages, interactionRuns), [messages, interactionRuns])
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
    showLocalRunInteraction: interactionRuns.length > 0,
    runInteractionAnswerEchoes,
    interactionRuns,
    interactionRunsByResultMessageId,
    interactionRunsWithoutResultMessage,
  }
}
