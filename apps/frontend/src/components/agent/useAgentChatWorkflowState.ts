import { useMemo } from 'react'
import { actionableRunForPlan } from '@/lib/agentPlanUi'
import { firstPendingInputRequest, workflowAnswerEchoesForMessages, workflowRunsForChat } from '@/lib/agentWorkflowInteraction'
import type { AgentPlanSnapshot, AgentRun } from '@/lib/localAgentClient'
import type { ChatMessage } from '@/store/agentStore'

interface UseAgentChatWorkflowStateInput {
  activePlanSnapshot?: AgentPlanSnapshot
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
  const actionableLocalRun = actionableRunForPlan(activePlanSnapshot, run)
  const workflowRuns = useMemo(() => workflowRunsForChat(submittedInteractionRuns, actionableLocalRun), [actionableLocalRun, submittedInteractionRuns])
  const workflowRunsByResultMessageId = useMemo(() => {
    const workflowRunById = new Map(workflowRuns.map((workflowRun) => [workflowRun.id, workflowRun]))
    const insertedRunIds = new Set<string>()
    const runsByMessageId = new Map<string, AgentRun[]>()
    for (const message of messages) {
      const runId = message.meta?.localRunActivity?.runId
      const workflowRun = runId ? workflowRunById.get(runId) : undefined
      if (!workflowRun || insertedRunIds.has(workflowRun.id)) continue
      insertedRunIds.add(workflowRun.id)
      runsByMessageId.set(message.id, [workflowRun])
    }
    return runsByMessageId
  }, [messages, workflowRuns])
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
