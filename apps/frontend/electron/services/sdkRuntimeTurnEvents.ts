import type { AgentChatThreadItem } from '@movscript/core/agent/chat'
import type {
  AgentChatServerRequest,
  AgentChatServerRequestResponse,
} from '@movscript/core/agent/chat'

export type SdkRuntimeTurnEvent =
  | {
      type: 'agent.delta'
      turnId: string
      itemId: string
      delta: string
      phase?: string | null
      raw?: unknown
    }
  | {
      type: 'reasoning.delta'
      turnId: string
      itemId: string
      delta: string
      summary?: boolean
      index?: number
      raw?: unknown
    }
  | {
      type: 'item.started'
      turnId: string
      item: AgentChatThreadItem
      raw?: unknown
    }
  | {
      type: 'item.completed'
      turnId: string
      item: AgentChatThreadItem
      raw?: unknown
    }
  | {
      type: 'turn.failed'
      turnId: string
      error: { message: string; code?: string }
      raw?: unknown
    }
  | {
      type: 'turn.interrupted'
      turnId: string
      reason?: string
      raw?: unknown
    }

export interface SdkRuntimeRunPromptEventSink {
  turnId: string
  emit(event: SdkRuntimeTurnEvent): void
  requestServer?(request: AgentChatServerRequest): Promise<AgentChatServerRequestResponse | undefined>
}
