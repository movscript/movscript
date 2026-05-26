import { useMemo } from 'react'
import { actionableRunsForTaskGraph, interactionRunsForTaskGraph } from '@/features/agent/domain/agentPlanUi'
import { firstPendingInputRequest, workflowAnswerEchoesForMessages, workflowRunsForChat } from '@/features/agent/domain/agentWorkflowInteraction'
import { buildWorkflowRunsByResultMessageId } from '@/features/agent/domain/agentWorkflowRunAnchors'
import type { AgentTaskGraphSnapshot, AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatMessage } from '@/features/agent/state/agentStore'

interface UseAgentChatWorkflowStateInput {
  activePlanSnapshot?: AgentTaskGraphSnapshot
  messages: ChatMessage[]
  run: AgentRun | null
  submittedInteractionRuns: AgentRun[]
}

export function useAgentChatWorkflowState({
  activePlanSnapshot,
  messages,
  run,
  submittedInteractionRuns,
}: UseAgentChatWorkflowStateInput) {
  const actionableLocalRuns = useMemo(() => actionableRunsForTaskGraph(activePlanSnapshot, run), [activePlanSnapshot, run])
  const interactionRuns = useMemo(() => interactionRunsForTaskGraph(activePlanSnapshot, run), [activePlanSnapshot, run])
  const actionableLocalRun = actionableLocalRuns[0] ?? null
  const workflowRuns = useMemo(() => workflowRunsForChat(submittedInteractionRuns, interactionRuns), [interactionRuns, submittedInteractionRuns])
  const workflowRunsByResultMessageId = useMemo(
    () => buildWorkflowRunsByResultMessageId({ messages, workflowRuns }),
    [messages, workflowRuns],
  )
  const workflowRunsWithoutResultMessage = useMemo(() => {
    const insertedRunIds = new Set(Array.from(workflowRunsByResultMessageId.values()).flat().map((workflowRun) => workflowRun.id))
    return workflowRuns.filter((workflowRun) => !insertedRunIds.has(workflowRun.id))
  }, [workflowRuns, workflowRunsByResultMessageId])
  const workflowAnswerEchoes = useMemo(() => workflowAnswerEchoesForMessages(messages, workflowRuns), [messages, workflowRuns])
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
    showLocalWorkflow: workflowRuns.length > 0,
    workflowAnswerEchoes,
    workflowRuns,
    workflowRunsByResultMessageId,
    workflowRunsWithoutResultMessage,
  }
}
