import { useMemo } from 'react'
import { buildAgentMessagePresentation } from '@/features/agent/domain/agentMessagePresentation'
import type { ChatMessage } from '@/features/agent/state/agentStore'

export function useAgentMessagePresentationModel(message: ChatMessage) {
  return useMemo(() => buildAgentMessagePresentation(message), [message])
}
