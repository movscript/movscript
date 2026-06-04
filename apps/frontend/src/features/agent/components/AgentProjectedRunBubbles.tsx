import { LocalAgentRunInteractionBubble } from '@/features/agent/components/AgentRunInteractionBubble'
import { LiveRunActivityBubble } from '@/features/agent/components/AgentRunActivityPanel'
import type { AgentConversationProjectionContentItem } from '@/features/agent/domain/agentConversationProjectionTypes'
import {
  agentProjectionRunActivityActions,
  agentProjectionRunInteractionActions,
  type AgentConversationProjectionActions,
} from '@/features/agent/components/AgentConversationProjectionActions'

export function AgentProjectedRunActivityBubble({
  hiddenActivityActionItemIds,
  item,
  ...actions
}: AgentConversationProjectionActions & {
  hiddenActivityActionItemIds: Set<string>
  item: Extract<AgentConversationProjectionContentItem, { type: 'run_activity' }>
}) {
  return (
    <LiveRunActivityBubble
      run={item.run}
      events={item.events}
      hiddenActionItemIds={hiddenActivityActionItemIds}
      {...agentProjectionRunActivityActions(item, actions)}
    />
  )
}

export function AgentProjectedRunInteractionBubble({
  item,
  ...actions
}: AgentConversationProjectionActions & {
  item: Extract<AgentConversationProjectionContentItem, { type: 'run_interaction' }>
}) {
  return (
    <LocalAgentRunInteractionBubble
      run={item.run}
      {...agentProjectionRunInteractionActions(item, actions)}
    />
  )
}
