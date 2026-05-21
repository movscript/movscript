import { useTranslation } from 'react-i18next'
import { useAgentContextSummary } from '@/components/agent/useAgentContextSummary'
import { useAgentLocalRuntimeContextController } from '@/components/agent/useAgentLocalRuntimeContextController'
import type { ConversationAgentContextConfig } from '@/components/agent/AgentContextPanels'
import type { AgentSettings } from '@/store/agentStore'
import type { Project } from '@/types'

interface UseAgentChatContextStateInput {
  agentContextConfig: ConversationAgentContextConfig
  composerAttachmentsCount: number
  currentProject: Project | null
  includeProjectContext: AgentSettings['includeProjectContext']
  localRuntimeEnabled: boolean
}

export function useAgentChatContextState({
  agentContextConfig,
  composerAttachmentsCount,
  currentProject,
  includeProjectContext,
  localRuntimeEnabled,
}: UseAgentChatContextStateInput) {
  const { t } = useTranslation()
  const runtime = useAgentLocalRuntimeContextController({
    enabled: localRuntimeEnabled,
  })
  const summary = useAgentContextSummary({
    agentContextConfig,
    currentProjectName: currentProject?.name,
    composerAttachmentsCount,
    includeProjectContext,
    labels: {
      localRuntime: t('agents.chat.localRuntime'),
      customCapabilities: t('agents.chat.panel.capabilities.custom'),
      attachmentsCount: composerAttachmentsCount > 0 ? t('agents.chat.attachmentsCount', { count: composerAttachmentsCount }) : null,
    },
  })

  return {
    ...runtime,
    ...summary,
    agentContextConfig,
  }
}
