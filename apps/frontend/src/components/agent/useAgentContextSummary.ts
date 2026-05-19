import { useMemo } from 'react'
import { buildAgentProductWorkflow } from '@/lib/agentProductWorkflow'
import type { AgentSettings } from '@/store/agentStore'
import type { AgentSendDraft } from '@/lib/agentSendDraft'
import type { AgentRun } from '@/lib/localAgentClient'
import {
  EMPTY_PAGE_CONTEXT_SUMMARY,
  agentContextFromRun,
  pageContextFromAgentContext,
  type ConversationAgentContextConfig,
} from '@/components/agent/AgentContextPanels'

interface UseAgentContextSummaryInput {
  agentContextConfig: ConversationAgentContextConfig
  activeRun: AgentRun | null
  pendingSendDraft: AgentSendDraft | null
  currentProjectName: string | null | undefined
  draftInput: string
  loading: boolean
  building: boolean
  uploading: boolean
  composerAttachmentsCount: number
  includeProjectContext: AgentSettings['includeProjectContext']
  localAgentOnline: boolean
  modelConfigured: boolean | undefined
  labels: {
    localRuntime: string
    customCapabilities: string
    attachmentsCount?: string | null
    runtimeOnline: string
    runtimeOffline: string
  }
  messageCount: number
}

export function useAgentContextSummary({
  agentContextConfig,
  activeRun,
  pendingSendDraft,
  currentProjectName,
  draftInput,
  loading,
  building,
  uploading,
  composerAttachmentsCount,
  includeProjectContext,
  localAgentOnline,
  modelConfigured,
  labels,
  messageCount,
}: UseAgentContextSummaryInput) {
  const activeConversationManifest = agentContextConfig.enabled ? agentContextConfig.manifest ?? undefined : undefined
  const agentRuntimeContext = pendingSendDraft?.localRuntime?.preview?.context
    ?? agentContextFromRun(activeRun)
  const agentPageContext = pageContextFromAgentContext(agentRuntimeContext)
    ?? EMPTY_PAGE_CONTEXT_SUMMARY
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
  const contextSubtitle = agentRuntimeContext?.labels.length
    ? agentRuntimeContext.labels.join(' / ')
    : localAgentOnline
      ? labels.runtimeOnline
      : labels.runtimeOffline
  const productWorkflow = useMemo(() => buildAgentProductWorkflow({
    messageCount,
    draftInput,
    loading,
    building,
    uploading,
    activeRun,
    runtimeOnline: localAgentOnline,
    modelConfigured,
    currentProjectName: includeProjectContext ? currentProjectName ?? null : null,
    contextLabels,
    hasCustomManifest: !!activeConversationManifest,
  }), [
    activeConversationManifest,
    activeRun,
    building,
    contextLabels,
    currentProjectName,
    draftInput,
    includeProjectContext,
    loading,
    localAgentOnline,
    messageCount,
    modelConfigured,
    uploading,
  ])

  return {
    activeConversationManifest,
    agentPageContext,
    agentRuntimeContext,
    contextLabels,
    contextSubtitle,
    productWorkflow,
  }
}
