import type { AgentInputAnswer } from '@/features/agent/domain/agentRunInteraction'
import type { AgentRunApprovalDecisionInput } from '@/features/agent/application/agentRunInteractionActions'
import type { AgentConversationProjectionContentItem } from '@/features/agent/domain/agentConversationProjectionTypes'

export interface AgentConversationProjectionActions {
  approvingActiveRun: boolean
  onAnswerRunInput: (runId: string, requestId: string, answer: AgentInputAnswer) => void
  onApproveRun: (runId: string, approvalIds?: string[], approvalDecision?: AgentRunApprovalDecisionInput) => void
  onRejectRun: (runId: string, approvalIds?: string[]) => void
}

export interface AgentProjectionRunBubbleActions {
  approving: boolean
  onAnswerInput?: (requestId: string, answer: AgentInputAnswer) => void
  onApprove?: (approvalIds?: string[]) => void
  onApproveForSession?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
}

export function agentProjectionRunActivityActions(
  item: Extract<AgentConversationProjectionContentItem, { type: 'run_activity' }>,
  actions: AgentConversationProjectionActions,
): AgentProjectionRunBubbleActions {
  if (!item.run) return { approving: actions.approvingActiveRun }
  return agentProjectionRunActions(item.run.id, actions)
}

export function agentProjectionRunInteractionActions(
  item: Extract<AgentConversationProjectionContentItem, { type: 'run_interaction' }>,
  actions: AgentConversationProjectionActions,
): AgentProjectionRunBubbleActions {
  if (item.source !== 'live') return { approving: actions.approvingActiveRun }
  return agentProjectionRunActions(item.run.id, actions)
}

function agentProjectionRunActions(
  runId: string,
  actions: AgentConversationProjectionActions,
): AgentProjectionRunBubbleActions {
  return {
    approving: actions.approvingActiveRun,
    onApprove: (approvalIds) => actions.onApproveRun(runId, approvalIds),
    onApproveForSession: (approvalIds) => actions.onApproveRun(runId, approvalIds, { scope: 'session' }),
    onReject: (approvalIds) => actions.onRejectRun(runId, approvalIds),
    onAnswerInput: (requestId, answer) => actions.onAnswerRunInput(runId, requestId, answer),
  }
}
