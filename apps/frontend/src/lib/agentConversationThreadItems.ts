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
  const runtimeMessage = message.meta?.runtimeMessage
  if (!runtimeMessage) return false
  if (runtimeMessage?.messageId) return false
  return workflowRuns.some((run) => run.status === 'requires_action' && hasWorkflowInteraction(run))
}

function hasWorkflowInteraction(run: AgentRun): boolean {
  return (run.pendingInputRequests?.length ?? 0) > 0 || (run.pendingApprovals?.length ?? 0) > 0
}
