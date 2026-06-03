import { useMemo } from 'react'
import { buildAgentMessagePresentation } from '@/features/agent/domain/agentMessagePresentation'
import type { ChatMessage, ChatRunActivity } from '@/features/agent/state/agentStore'

export function useAgentMessagePresentationModel(message: ChatMessage, timelineActivity?: ChatRunActivity) {
  return useMemo(() => buildAgentMessagePresentation(message, { timelineActivity }), [message, timelineActivity])
}
