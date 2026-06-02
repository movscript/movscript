import type { RefObject } from 'react'
import { useAgentChatDataSources } from '@/features/agent/presentation/useAgentChatDataSources'
import { useAgentComposerController } from '@/features/agent/presentation/useAgentComposerController'
import { useAgentMentionEditorSync } from '@/features/agent/presentation/useAgentMentionEditorSync'
import type { AgentSettings, ConversationWorkspace } from '@/features/agent/state/agentStore'

interface UseAgentChatComposerStateInput {
  conversationId: string
  workspace: ConversationWorkspace
  fileRef: RefObject<HTMLInputElement>
  inputRef: RefObject<HTMLDivElement>
  settings: AgentSettings
  updateSettings: (settings: Partial<AgentSettings>) => void
  userId: string
}

export function useAgentChatComposerState({
  conversationId,
  workspace,
  fileRef,
  inputRef,
  settings,
  updateSettings,
  userId,
}: UseAgentChatComposerStateInput) {
  const {
    activeModel,
    modelId,
    recentResources,
  } = useAgentChatDataSources({
    settings,
    updateSettings,
  })
  const composer = useAgentComposerController({
    userId,
    conversationId,
    workspace,
    recentResources,
    fileRef,
    inputRef,
  })

  useAgentMentionEditorSync({
    conversationId,
    input: composer.input,
    inputRef,
    resourceAttachmentIndex: composer.resourceAttachmentIndex,
  })

  return {
    activeModel,
    modelId,
    ...composer,
  }
}
