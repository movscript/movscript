import type { RefObject } from 'react'
import { useAgentChatDataSources } from '@/components/agent/useAgentChatDataSources'
import { useAgentComposerController } from '@/components/agent/useAgentComposerController'
import { useAgentMentionEditorSync } from '@/components/agent/useAgentMentionEditorSync'
import type { AgentSettings, ConversationDraft } from '@/store/agentStore'

interface UseAgentChatComposerStateInput {
  conversationId: string
  draft: ConversationDraft
  fileRef: RefObject<HTMLInputElement>
  inputRef: RefObject<HTMLDivElement>
  settings: AgentSettings
  updateSettings: (settings: Partial<AgentSettings>) => void
  userId: string
}

export function useAgentChatComposerState({
  conversationId,
  draft,
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
    draft,
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
