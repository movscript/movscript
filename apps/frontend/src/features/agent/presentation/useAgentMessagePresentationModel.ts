import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { buildAgentMessagePresentation } from '@/features/agent/domain/agentMessagePresentation'
import { hydrateHistoricalGeneratedAttachments } from '@/features/agent/domain/agentMessageViewModel'
import type { ChatMessage } from '@/features/agent/state/agentStore'

export function useAgentMessagePresentationModel(message: ChatMessage) {
  const initialPresentation = useMemo(() => buildAgentMessagePresentation(message), [message])
  const missingResourceIds = initialPresentation.missingTextOutputResourceIds
  const missingResourceIdsKey = missingResourceIds.join(',')
  const { data: historicalGeneratedAttachments = [] } = useQuery({
    queryKey: ['agent-historical-generated-attachments', message.id, missingResourceIdsKey],
    queryFn: () => hydrateHistoricalGeneratedAttachments(message.content, message.attachments ?? []),
    enabled: message.role !== 'user' && missingResourceIds.length > 0,
    staleTime: 60_000,
  })

  return useMemo(
    () => buildAgentMessagePresentation(message, historicalGeneratedAttachments),
    [historicalGeneratedAttachments, message],
  )
}
