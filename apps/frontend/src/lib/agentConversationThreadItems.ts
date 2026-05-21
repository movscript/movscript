import { isWorkflowAnswerEchoMessage, workflowRunFromActivity } from '@/lib/agentWorkflowInteraction'
import type { AgentRun } from '@/lib/localAgentClient'
import type { ChatMessage } from '@/store/agentStore'

export interface AgentConversationMessageItem {
  beforeMessageWorkflowRuns: AgentRun[]
  liveWorkflowRuns: AgentRun[] | null
  message: ChatMessage
  showMessage: boolean
}

export function buildAgentConversationMessageItems({
  messages,
  workflowAnswerEchoes,
  workflowRunsByResultMessageId,
}: {
  messages: ChatMessage[]
  workflowAnswerEchoes: Set<string>
  workflowRunsByResultMessageId: Map<string, AgentRun[]>
}): AgentConversationMessageItem[] {
  return messages.flatMap((message) => {
    if (isWorkflowAnswerEchoMessage(message, workflowAnswerEchoes)) return []
    const liveWorkflowRuns = workflowRunsByResultMessageId.get(message.id) ?? null
    const historicalWorkflowRun = liveWorkflowRuns ? null : workflowRunFromActivity(message.meta?.localRunActivity)
    const beforeMessageWorkflowRuns = liveWorkflowRuns ?? (historicalWorkflowRun ? [historicalWorkflowRun] : [])
    return [{
      beforeMessageWorkflowRuns,
      liveWorkflowRuns,
      message,
      showMessage: !isWorkflowPlaceholderMessage(message, beforeMessageWorkflowRuns),
    }]
  })
}

function isWorkflowPlaceholderMessage(message: ChatMessage, workflowRuns: AgentRun[]): boolean {
  if (message.role !== 'assistant' || workflowRuns.length === 0) return false
  return workflowRuns.some((run) => {
    if (run.status !== 'requires_action' || !hasWorkflowInteraction(run)) return false
    if (isRequiredActionSummaryMessage(message.content, run)) return true
    const runtimeMessage = message.meta?.runtimeMessage
    return runtimeMessage?.runId === run.id && !runtimeMessage.messageId
  })
}

function hasWorkflowInteraction(run: AgentRun): boolean {
  return (run.pendingInputRequests?.length ?? 0) > 0 || (run.pendingApprovals?.length ?? 0) > 0
}

function isRequiredActionSummaryMessage(content: string, run: AgentRun): boolean {
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return false
  const approvalLines = (run.pendingApprovals ?? [])
    .filter((approval) => approval.status === 'pending')
    .map((approval) => `- ${approval.toolName}: ${approval.reason}`)
  if (matchesSummaryLines(lines, approvalLines)) return true

  const inputLines = (run.pendingInputRequests ?? [])
    .filter((request) => request.status === 'pending')
    .map((request) => `- ${request.title}: ${request.question}`)
  return matchesSummaryLines(lines, inputLines)
}

function matchesSummaryLines(lines: string[], expectedItems: string[]): boolean {
  if (expectedItems.length === 0) return false
  if (lines.length !== expectedItems.length + 1) return false
  return expectedItems.every((item) => lines.includes(item))
}
