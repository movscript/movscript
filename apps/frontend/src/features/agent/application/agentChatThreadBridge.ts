import { createEventBus } from '@/shared/application/eventBus'

export interface AgentChatThreadChannelPayload {
  threadId: string
  sourceId?: string
}

type AgentChatThreadChannelMap = Record<string, AgentChatThreadChannelPayload>

const agentChatThreadChannelBus = createEventBus<AgentChatThreadChannelMap>()

export function publishAgentChatThreadOpen(input: {
  channel: string
  threadId: string | null | undefined
  sourceId?: string
}): void {
  const channel = input.channel.trim()
  const threadId = input.threadId?.trim()
  if (!channel || !threadId) return
  agentChatThreadChannelBus.publish(channel, {
    threadId,
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
  })
}

export function subscribeAgentChatThreadOpen(
  channel: string,
  handler: (payload: AgentChatThreadChannelPayload) => void,
) {
  const normalizedChannel = channel.trim()
  if (!normalizedChannel) return () => {}
  return agentChatThreadChannelBus.subscribe(normalizedChannel, handler)
}
