import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import {
  type AgentPanelNewConversationPayload,
} from '@/features/agent/application/agentPanelBridge'
import { clearAgentChatComposerEditor } from '@/features/agent/application/agentComposerEditorDom'
import {
  createAgentChatDraftConversationId,
  workspaceContextFromNewConversationPayload,
} from '@/features/agent/presentation/agentChatDataSourceShellModel'
import { agentConversationRegistryActions } from '@/features/agent/state/agentConversationRegistryStore'
import { updateAgentConversationWorkspace } from '@/features/agent/state/agentConversationDraftStore'
import type { AgentConversationFocusScope } from '@/features/agent/state/agentConversationFocusScope'

interface UseAgentChatDraftConversationInput {
  composerInputRef: MutableRefObject<HTMLDivElement | null>
  setActiveThreadIdValue: (threadId: string | null) => void
  setDraftConversationId: Dispatch<SetStateAction<string>>
  setError: Dispatch<SetStateAction<string | null>>
  setHistoryOpen: Dispatch<SetStateAction<boolean>>
  focusScope?: AgentConversationFocusScope
  threadScopeKey: string
  userId: string
}

export function useAgentChatDraftConversation({
  composerInputRef,
  setActiveThreadIdValue,
  setDraftConversationId,
  setError,
  setHistoryOpen,
  focusScope,
  threadScopeKey,
  userId,
}: UseAgentChatDraftConversationInput) {
  return useCallback((input: AgentPanelNewConversationPayload = {}) => {
    const workspaceContext = workspaceContextFromNewConversationPayload(input)
    const draftId = createAgentChatDraftConversationId(threadScopeKey)
    setDraftConversationId(draftId)
    setActiveThreadIdValue(null)
    agentConversationRegistryActions().setActiveConversation(userId, draftId, focusScope)
    setHistoryOpen(false)
    setError(null)
    updateAgentConversationWorkspace(userId, draftId, {
      input: '',
      attachments: [],
      ...(workspaceContext ? { workspaceContext } : {}),
    })
    clearAgentChatComposerEditor(composerInputRef.current)
    return draftId
  }, [composerInputRef, focusScope, setActiveThreadIdValue, setDraftConversationId, setError, setHistoryOpen, threadScopeKey, userId])
}
