import { useTranslation } from 'react-i18next'
import { runTouchesAgentCatalog } from '@/lib/agentCatalogRun'
import { useAgentCommitSendDraft, type UseAgentCommitSendDraftInput } from '@/components/agent/useAgentCommitSendDraft'
import { useAgentMCPReadiness } from '@/components/agent/useAgentMCPReadiness'
import { useAgentRuntimeThreadHydration, type UseAgentRuntimeThreadHydrationInput } from '@/components/agent/useAgentRuntimeThreadHydration'
import { useAgentSendActions, type UseAgentSendActionsInput } from '@/components/agent/useAgentSendActions'
import { useAgentSendDraftBuilder, type UseAgentSendDraftBuilderInput } from '@/components/agent/useAgentSendDraftBuilder'
import { useAgentSendLabels } from '@/components/agent/useAgentSendLabels'

export interface UseAgentChatSendPipelineInput {
  draftBuilder: Omit<UseAgentSendDraftBuilderInput, 'assertMCPReady' | 'labels'>
  commitDraft: Omit<UseAgentCommitSendDraftInput, 'assertMCPReady' | 'labels' | 'runTouchesAgentCatalog'>
  runtimeThreadHydration: UseAgentRuntimeThreadHydrationInput
  sendActions: Omit<UseAgentSendActionsInput, 'buildSendDraft' | 'commitSendDraft' | 'labels'>
}

export function useAgentChatSendPipeline({
  draftBuilder,
  commitDraft,
  runtimeThreadHydration,
  sendActions,
}: UseAgentChatSendPipelineInput) {
  const { t } = useTranslation()
  const {
    commitSendLabels,
    sendActionLabels,
    sendDraftLabels,
  } = useAgentSendLabels(t)
  const assertMCPReady = useAgentMCPReadiness()

  const buildSendDraft = useAgentSendDraftBuilder({
    ...draftBuilder,
    assertMCPReady,
    labels: sendDraftLabels,
  })

  const commitSendDraft = useAgentCommitSendDraft({
    ...commitDraft,
    assertMCPReady,
    runTouchesAgentCatalog,
    labels: commitSendLabels,
  })

  useAgentRuntimeThreadHydration(runtimeThreadHydration)

  return useAgentSendActions({
    ...sendActions,
    buildSendDraft,
    commitSendDraft,
    labels: sendActionLabels,
  })
}
