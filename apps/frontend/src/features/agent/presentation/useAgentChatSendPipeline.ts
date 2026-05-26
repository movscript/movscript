import { useTranslation } from 'react-i18next'
import { runTouchesAgentCatalog } from '@/features/agent/application/agentCatalogRun'
import { useAgentCommitSendDraft, type UseAgentCommitSendDraftInput } from '@/features/agent/presentation/useAgentCommitSendDraft'
import { useAgentMCPReadiness } from '@/features/agent/presentation/useAgentMCPReadiness'
import { useAgentRuntimeThreadHydration, type UseAgentRuntimeThreadHydrationInput } from '@/features/agent/presentation/useAgentRuntimeThreadHydration'
import { useAgentSendActions, type UseAgentSendActionsInput } from '@/features/agent/presentation/useAgentSendActions'
import { useAgentSendDraftBuilder, type UseAgentSendDraftBuilderInput } from '@/features/agent/presentation/useAgentSendDraftBuilder'
import { useAgentSendLabels } from '@/features/agent/presentation/useAgentSendLabels'

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
