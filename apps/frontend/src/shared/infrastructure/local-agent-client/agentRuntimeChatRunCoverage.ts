import type { AgentRunStatus } from '@movscript/protocol'
import type { AgentChatTurnStatus } from '@/features/agent/domain/agentChatProtocol'

export const AGENT_RUNTIME_CHAT_RUN_STATUS_COVERAGE: Record<AgentRunStatus, {
  neutralTurnStatus: AgentChatTurnStatus
  streamMethod: 'turn/started' | 'turn/completed'
  terminal: boolean
  note: string
}> = {
  queued: {
    neutralTurnStatus: 'inProgress',
    streamMethod: 'turn/started',
    terminal: false,
    note: 'Queued runs are active turns that may not have started executing yet.',
  },
  in_progress: {
    neutralTurnStatus: 'inProgress',
    streamMethod: 'turn/started',
    terminal: false,
    note: 'In-progress runs are active turns.',
  },
  requires_action: {
    neutralTurnStatus: 'inProgress',
    streamMethod: 'turn/started',
    terminal: false,
    note: 'Requires-action runs are still active because pending requests keep the turn open.',
  },
  completed: {
    neutralTurnStatus: 'completed',
    streamMethod: 'turn/completed',
    terminal: true,
    note: 'Completed runs finish the neutral turn successfully.',
  },
  completed_with_warnings: {
    neutralTurnStatus: 'completed',
    streamMethod: 'turn/completed',
    terminal: true,
    note: 'Completed-with-warnings runs finish the neutral turn while preserving warning details in raw state.',
  },
  failed: {
    neutralTurnStatus: 'failed',
    streamMethod: 'turn/completed',
    terminal: true,
    note: 'Failed runs finish the neutral turn with an error state.',
  },
  cancelled: {
    neutralTurnStatus: 'interrupted',
    streamMethod: 'turn/completed',
    terminal: true,
    note: 'Cancelled runs map to the neutral interrupted turn state.',
  },
}
