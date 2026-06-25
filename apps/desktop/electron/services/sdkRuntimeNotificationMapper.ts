import type { AgentChatNotification } from '@movscript/agent-chat'
import type { SdkRuntimeTurnEvent } from './sdkRuntimeTurnEvents'

export function sdkRuntimeNotificationFromTurnEvent(event: SdkRuntimeTurnEvent): AgentChatNotification {
  switch (event.type) {
    case 'agent.delta':
      return {
        method: 'item/agentMessage/delta',
        params: {
          turnId: event.turnId,
          itemId: event.itemId,
          delta: event.delta,
          phase: event.phase ?? null,
        },
        raw: event.raw,
      }
    case 'reasoning.delta':
      return {
        method: event.summary ? 'item/reasoning/summaryTextDelta' : 'item/reasoning/textDelta',
        params: {
          turnId: event.turnId,
          itemId: event.itemId,
          delta: event.delta,
          ...(event.summary ? { summaryIndex: event.index ?? 0 } : { contentIndex: event.index ?? 0 }),
        },
        raw: event.raw,
      }
    case 'item.started':
      return {
        method: 'item/started',
        params: {
          turnId: event.turnId,
          item: event.item,
        },
        raw: event.raw,
      }
    case 'item.completed':
      return {
        method: 'item/completed',
        params: {
          turnId: event.turnId,
          item: event.item,
        },
        raw: event.raw,
      }
    case 'turn.failed':
      return {
        method: 'turn/failed',
        params: {
          turnId: event.turnId,
          error: event.error,
        },
        raw: event.raw,
      }
    case 'turn.interrupted':
      return {
        method: 'turn/interrupted',
        params: {
          turnId: event.turnId,
          ...(event.reason ? { reason: event.reason } : {}),
        },
        raw: event.raw,
      }
  }
}
