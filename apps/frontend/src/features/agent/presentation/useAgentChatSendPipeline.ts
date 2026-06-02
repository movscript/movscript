import { useTranslation } from 'react-i18next'
import { runTouchesAgentCatalog } from '@/features/agent/application/agentCatalogRun'
import { useAgentCommitSendWorkspace, type UseAgentCommitSendWorkspaceInput } from '@/features/agent/presentation/useAgentCommitSendWorkspace'
import { useAgentMCPReadiness } from '@/features/agent/presentation/useAgentMCPReadiness'
import { useAgentSendActions, type UseAgentSendActionsInput } from '@/features/agent/presentation/useAgentSendActions'
import { useAgentSendWorkspaceBuilder, type UseAgentSendWorkspaceBuilderInput } from '@/features/agent/presentation/useAgentSendWorkspaceBuilder'
import { useAgentSendLabels } from '@/features/agent/presentation/useAgentSendLabels'

export interface UseAgentChatSendPipelineInput {
  workspaceBuilder: Omit<UseAgentSendWorkspaceBuilderInput, 'assertMCPReady' | 'labels'>
  commitWorkspace: Omit<UseAgentCommitSendWorkspaceInput, 'assertMCPReady' | 'labels' | 'runTouchesAgentCatalog'>
  sendActions: Omit<UseAgentSendActionsInput, 'buildSendWorkspace' | 'commitSendWorkspace' | 'labels'>
}

export function useAgentChatSendPipeline({
  workspaceBuilder,
  commitWorkspace,
  sendActions,
}: UseAgentChatSendPipelineInput) {
  const { t } = useTranslation()
  const {
    commitSendLabels,
    sendActionLabels,
    sendWorkspaceLabels,
  } = useAgentSendLabels(t)
  const assertMCPReady = useAgentMCPReadiness()

  const buildSendWorkspace = useAgentSendWorkspaceBuilder({
    ...workspaceBuilder,
    assertMCPReady,
    labels: sendWorkspaceLabels,
  })

  const commitSendWorkspace = useAgentCommitSendWorkspace({
    ...commitWorkspace,
    assertMCPReady,
    runTouchesAgentCatalog,
    labels: commitSendLabels,
  })

  return useAgentSendActions({
    ...sendActions,
    buildSendWorkspace,
    commitSendWorkspace,
    labels: sendActionLabels,
  })
}
