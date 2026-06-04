import type { AgentThinkingState } from '@/features/agent/domain/agentThinkingState'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatMessage, ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export type AgentConversationProjectionContentItem =
  | {
    id: string
    type: 'message'
    item: {
      message: ChatMessage
      activity: {
        timelineActivity?: ChatRunActivity
        embeddedInteractionRun: AgentRun | null
        embeddedInteractionEvents: ChatRunActivityEvent[]
      }
    }
  }
  | {
    id: string
    type: 'assistant_stream'
    content: string
  }
  | {
    id: string
    type: 'run_activity'
    run: AgentRun | null
    events: ChatRunActivityEvent[]
  }
  | {
    id: string
    type: 'run_interaction'
    run: AgentRun
    source: 'live' | 'historical'
  }
  | {
    id: string
    type: 'thinking'
    run: AgentRun | null
    state: AgentThinkingState
  }

export type AgentConversationProjectionItem =
  | AgentConversationProjectionContentItem
  | {
    id: string
    type: 'run_turn'
    runId: string
    items: AgentConversationProjectionContentItem[]
  }

export interface AgentConversationProjection {
  items: AgentConversationProjectionItem[]
}
