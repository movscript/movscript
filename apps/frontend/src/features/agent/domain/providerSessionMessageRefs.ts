import type { AgentChatMessageMeta } from '@/features/agent/domain/agentProtocol'

export function providerSessionMessageRef(message: { meta?: AgentChatMessageMeta }) {
  return message.meta?.providerSessionMessage ?? message.meta?.runtimeMessage
}

export function providerSessionInputRef(message: { meta?: AgentChatMessageMeta }) {
  return message.meta?.providerSessionInput ?? message.meta?.runtimeInput
}
