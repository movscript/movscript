import { useMemo } from 'react'
import type { AgentSettings } from '@/store/agentStore'
import type { ConversationAgentContextConfig } from '@/components/agent/AgentContextPanels'

interface UseAgentContextSummaryInput {
  agentContextConfig: ConversationAgentContextConfig
  currentProjectName: string | null | undefined
  composerAttachmentsCount: number
  includeProjectContext: AgentSettings['includeProjectContext']
  labels: {
    localRuntime: string
    customCapabilities: string
    attachmentsCount?: string | null
  }
}

export function useAgentContextSummary({
  agentContextConfig,
  currentProjectName,
  composerAttachmentsCount,
  includeProjectContext,
  labels,
}: UseAgentContextSummaryInput) {
  const activeConversationManifest = agentContextConfig.enabled ? agentContextConfig.manifest ?? undefined : undefined
  const contextLabels = useMemo(() => [
    labels.localRuntime,
    activeConversationManifest ? labels.customCapabilities : null,
    includeProjectContext ? currentProjectName : null,
    composerAttachmentsCount > 0 ? labels.attachmentsCount : null,
  ].filter(Boolean) as string[], [
    activeConversationManifest,
    composerAttachmentsCount,
    currentProjectName,
    includeProjectContext,
    labels.attachmentsCount,
    labels.customCapabilities,
    labels.localRuntime,
  ])

  return {
    activeConversationManifest,
    contextLabels,
  }
}
