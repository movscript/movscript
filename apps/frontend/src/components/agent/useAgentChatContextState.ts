import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAgentContextPaneController } from '@/components/agent/useAgentContextPaneController'
import { useAgentContextSummary } from '@/components/agent/useAgentContextSummary'
import { useAgentLocalRuntimeContextController } from '@/components/agent/useAgentLocalRuntimeContextController'
import type { ConversationAgentContextConfig } from '@/components/agent/AgentContextPanels'
import type { AgentSendDraft } from '@/lib/agentSendDraft'
import type { AgentRun } from '@/lib/localAgentClient'
import type { AgentSettings } from '@/store/agentStore'
import type { Project } from '@/types'

interface UseAgentChatContextStateInput {
  activeRun: AgentRun | null
  agentContextConfig: ConversationAgentContextConfig
  building: boolean
  composerAttachmentsCount: number
  currentProject: Project | null
  draftInput: string
  includeProjectContext: AgentSettings['includeProjectContext']
  loading: boolean
  localRuntimeEnabled: boolean
  messageCount: number
  pendingSendDraft: AgentSendDraft | null
  uploading: boolean
}

export function useAgentChatContextState({
  activeRun,
  agentContextConfig,
  building,
  composerAttachmentsCount,
  currentProject,
  draftInput,
  includeProjectContext,
  loading,
  localRuntimeEnabled,
  messageCount,
  pendingSendDraft,
  uploading,
}: UseAgentChatContextStateInput) {
  const { t } = useTranslation()
  const {
    contextPaneHeight,
    setShowContext,
    showContext,
    startContextPaneResize,
  } = useAgentContextPaneController()
  const runtime = useAgentLocalRuntimeContextController({
    agentContextConfig,
    currentProject,
    enabled: localRuntimeEnabled,
  })
  const summary = useAgentContextSummary({
    agentContextConfig,
    activeRun,
    pendingSendDraft,
    currentProjectName: currentProject?.name,
    draftInput,
    loading,
    building,
    uploading,
    composerAttachmentsCount,
    includeProjectContext,
    localAgentOnline: runtime.localAgentOnline,
    modelConfigured: runtime.localAgentHealth?.modelConfig?.configured,
    labels: {
      localRuntime: t('agents.chat.localRuntime'),
      customCapabilities: t('agents.chat.panel.capabilities.custom'),
      attachmentsCount: composerAttachmentsCount > 0 ? t('agents.chat.attachmentsCount', { count: composerAttachmentsCount }) : null,
      runtimeOnline: t('agents.chat.panel.status.localRuntimeOnline'),
      runtimeOffline: t('agents.chat.panel.status.localRuntimeOffline'),
    },
    messageCount,
  })
  const toggleContext = useCallback(() => setShowContext((value) => !value), [setShowContext])

  return {
    ...runtime,
    ...summary,
    agentContextConfig,
    contextPaneHeight,
    contextThreadId: pendingSendDraft?.localRuntime?.preview?.threadId ?? activeRun?.threadId,
    showContext,
    startContextPaneResize,
    toggleContext,
  }
}
