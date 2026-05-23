import { useMemo } from 'react'
import { actionableRunsForTaskGraph, interactionRunsForTaskGraph } from '@/lib/agentPlanUi'
import { firstPendingInputRequest, workflowAnswerEchoesForMessages, workflowRunsForChat } from '@/lib/agentWorkflowInteraction'
import type { AgentTaskGraphSnapshot, AgentRun } from '@/lib/localAgentClient'
import type { ChatMessage } from '@/store/agentStore'

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

export function buildWorkflowRunsByResultMessageId({
  messages,
  workflowRuns,
}: {
  messages: ChatMessage[]
  workflowRuns: AgentRun[]
}): Map<string, AgentRun[]> {
  const workflowRunById = new Map(workflowRuns.map((workflowRun) => [workflowRun.id, workflowRun]))
  const insertedRunIds = new Set<string>()
  const runsByMessageId = new Map<string, AgentRun[]>()
  const messagesById = buildWorkflowAnchorMessagesById(messages)

  for (const message of messages) {
    if (message.role !== 'assistant') continue
    const runId = workflowAnchorRunId(message)
    const workflowRun = runId ? workflowRunById.get(runId) : undefined
    if (!workflowRun || insertedRunIds.has(workflowRun.id)) continue
    insertWorkflowRun(runsByMessageId, insertedRunIds, message.id, workflowRun)
  }

  for (const workflowRun of workflowRuns) {
    if (insertedRunIds.has(workflowRun.id)) continue
    const displayAnchorMessageId = workflowDisplayAnchorMessageId(workflowRun)
    const displayAnchorMessage = displayAnchorMessageId ? messagesById.get(displayAnchorMessageId) : undefined
    if (displayAnchorMessage) {
      insertWorkflowRun(runsByMessageId, insertedRunIds, displayAnchorMessage.id, workflowRun)
      continue
    }
    const sourceMessageId = workflowRun.input?.sourceMessageId?.trim()
    const sourceMessage = sourceMessageId ? messagesById.get(sourceMessageId) : undefined
    if (!sourceMessage) continue
    insertWorkflowRun(runsByMessageId, insertedRunIds, sourceMessage.id, workflowRun)
  }
  return runsByMessageId
}

function buildWorkflowAnchorMessagesById(messages: ChatMessage[]): Map<string, ChatMessage> {
  const byId = new Map<string, ChatMessage>()
  for (const message of messages) {
    byId.set(message.id, message)
    const runtimeMessageId = message.meta?.runtimeMessage?.messageId?.trim()
    if (runtimeMessageId) byId.set(runtimeMessageId, message)
  }
  return byId
}

function workflowDisplayAnchorMessageId(workflowRun: AgentRun): string | undefined {
  for (const approval of workflowRun.pendingApprovals ?? []) {
    const messageId = approval.displayAnchor?.messageId
    if (typeof messageId === 'string' && messageId.trim()) return messageId.trim()
  }
  for (const request of workflowRun.pendingInputRequests ?? []) {
    const messageId = request.displayAnchor?.messageId
    if (typeof messageId === 'string' && messageId.trim()) return messageId.trim()
  }
  return undefined
}

function workflowAnchorRunId(message: ChatMessage): string | undefined {
  return normalizeRunId(message.meta?.localRunActivity?.runId)
    ?? normalizeRunId(message.meta?.runtimeMessage?.runId)
}

function insertWorkflowRun(
  runsByMessageId: Map<string, AgentRun[]>,
  insertedRunIds: Set<string>,
  messageId: string,
  workflowRun: AgentRun,
) {
  insertedRunIds.add(workflowRun.id)
  const runs = runsByMessageId.get(messageId) ?? []
  runs.push(workflowRun)
  runsByMessageId.set(messageId, runs)
}

function normalizeRunId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
