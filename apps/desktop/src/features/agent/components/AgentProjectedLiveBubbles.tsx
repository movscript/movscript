import {
  StreamingAssistantBubble,
  ThinkingBubble,
} from '@/features/agent/components/AgentChatBubbles'
import type { AgentConversationProjectionContentItem } from '@/features/agent/domain/agentConversationProjectionTypes'

export function AgentProjectedAssistantStreamBubble({
  item,
}: {
  item: Extract<AgentConversationProjectionContentItem, { type: 'assistant_stream' }>
}) {
  return <StreamingAssistantBubble content={item.content} />
}

export function AgentProjectedThinkingBubble({
  item,
}: {
  item: Extract<AgentConversationProjectionContentItem, { type: 'thinking' }>
}) {
  return <ThinkingBubble run={item.run} state={item.state} />
}
