import type { AgentInputAnswer } from '@/features/agent/domain/agentRunInteraction'
import type { AgentConversationProjectionContentItem } from '@/features/agent/domain/agentConversationProjectionTypes'

export interface AgentConversationProjectionActions {
  approvingLocalRun: boolean
  onAnswerLocalRunInput: (runId: string, requestId: string, answer: AgentInputAnswer) => void
  onApproveLocalRun: (runId: string, approvalIds?: string[]) => void
  onRejectLocalRun: (runId: string, approvalIds?: string[]) => void
}

export interface AgentProjectionRunBubbleActions {
  approving: boolean
  onAnswerInput?: (requestId: string, answer: AgentInputAnswer) => void
  onApprove?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
}

export function agentProjectionRunActivityActions(
  item: Extract<AgentConversationProjectionContentItem, { type: 'run_activity' }>,
  actions: AgentConversationProjectionActions,
): AgentProjectionRunBubbleActions {
  if (!item.run) return { approving: actions.approvingLocalRun }
  return agentProjectionRunActions(item.run.id, actions)
}

export function agentProjectionRunInteractionActions(
  item: Extract<AgentConversationProjectionContentItem, { type: 'run_interaction' }>,
  actions: AgentConversationProjectionActions,
): AgentProjectionRunBubbleActions {
  if (item.source !== 'live') return { approving: actions.approvingLocalRun }
  return agentProjectionRunActions(item.run.id, actions)
}

function agentProjectionRunActions(
  runId: string,
  actions: AgentConversationProjectionActions,
): AgentProjectionRunBubbleActions {
  return {
    approving: actions.approvingLocalRun,
    onApprove: (approvalIds) => actions.onApproveLocalRun(runId, approvalIds),
    onReject: (approvalIds) => actions.onRejectLocalRun(runId, approvalIds),
    onAnswerInput: (requestId, answer) => actions.onAnswerLocalRunInput(runId, requestId, answer),
  }
}
