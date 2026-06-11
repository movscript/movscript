import { useTranslation } from 'react-i18next'
import { useAgentCommitSendWorkspace, type UseAgentCommitSendWorkspaceInput } from '@/features/agent/presentation/useAgentCommitSendWorkspace'
import { useAgentSendActions, type UseAgentSendActionsInput } from '@/features/agent/presentation/useAgentSendActions'
import { useAgentSendWorkspaceBuilder, type UseAgentSendWorkspaceBuilderInput } from '@/features/agent/presentation/useAgentSendWorkspaceBuilder'
import { useAgentSendLabels } from '@/features/agent/presentation/useAgentSendLabels'

export interface UseAgentChatSendPipelineInput {
  workspaceBuilder: Omit<UseAgentSendWorkspaceBuilderInput, 'labels'>
  commitWorkspace: Omit<UseAgentCommitSendWorkspaceInput, 'labels'>
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
  const buildSendWorkspace = useAgentSendWorkspaceBuilder({
    ...workspaceBuilder,
    labels: sendWorkspaceLabels,
  })

  const commitSendWorkspace = useAgentCommitSendWorkspace({
    ...commitWorkspace,
    labels: commitSendLabels,
  })

  return useAgentSendActions({
    ...sendActions,
    buildSendWorkspace,
    commitSendWorkspace,
    labels: sendActionLabels,
  })
}
