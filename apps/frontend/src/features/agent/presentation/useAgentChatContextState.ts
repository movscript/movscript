import { useTranslation } from 'react-i18next'
import { useAgentContextSummary } from '@/features/agent/presentation/useAgentContextSummary'
import { useProviderSessionContextController } from '@/features/agent/presentation/useProviderSessionContextController'
import type { ConversationAgentContextConfig } from '@/features/agent/domain/agentContextConfig'
import type { AgentSettings } from '@/features/agent/state/agentStore'

interface UseAgentChatContextStateInput {
  agentContextConfig: ConversationAgentContextConfig
  composerAttachmentsCount: number
  selectedProjectName?: string | null
  includeProjectContext: AgentSettings['includeProjectContext']
  providerSessionEnabled: boolean
  providerSessionId?: string
}

export function useAgentChatContextState({
  agentContextConfig,
  composerAttachmentsCount,
  selectedProjectName,
  includeProjectContext,
  providerSessionEnabled,
  providerSessionId,
}: UseAgentChatContextStateInput) {
  const { t } = useTranslation()
  const providerSessionContext = useProviderSessionContextController({
    enabled: providerSessionEnabled,
    sessionId: providerSessionId,
  })
  const summary = useAgentContextSummary({
    agentContextConfig,
    currentProjectName: selectedProjectName,
    composerAttachmentsCount,
    includeProjectContext,
    labels: {
      providerSession: t('agents.chat.providerSession'),
      customCapabilities: t('agents.chat.panel.capabilities.custom'),
      attachmentsCount: composerAttachmentsCount > 0 ? t('agents.chat.attachmentsCount', { count: composerAttachmentsCount }) : null,
    },
  })

  return {
    ...providerSessionContext,
    ...summary,
    agentContextConfig,
  }
}
