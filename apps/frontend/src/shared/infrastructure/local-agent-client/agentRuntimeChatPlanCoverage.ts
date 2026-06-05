import type { AgentPlanTaskStatus } from '@movscript/protocol'
import type { AgentChatPlanStatusIntent } from '@/features/agent/domain/agentChatProcessItemViews'

export const AGENT_RUNTIME_CHAT_PLAN_TASK_STATUS_COVERAGE: Record<AgentPlanTaskStatus, {
  neutralPlanStatus: AgentPlanTaskStatus
  renderIntent: AgentChatPlanStatusIntent
  streamMethod: 'turn/plan/updated'
  note: string
}> = {
  pending: {
    neutralPlanStatus: 'pending',
    renderIntent: 'neutral',
    streamMethod: 'turn/plan/updated',
    note: 'Pending runtime plan tasks remain pending neutral plan steps.',
  },
  in_progress: {
    neutralPlanStatus: 'in_progress',
    renderIntent: 'info',
    streamMethod: 'turn/plan/updated',
    note: 'In-progress runtime plan tasks render as informational active plan steps.',
  },
  completed: {
    neutralPlanStatus: 'completed',
    renderIntent: 'success',
    streamMethod: 'turn/plan/updated',
    note: 'Completed runtime plan tasks render as successful plan steps.',
  },
}
