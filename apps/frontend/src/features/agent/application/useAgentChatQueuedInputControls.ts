import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type {
  AgentChatDataSource,
  AgentChatThread,
  AgentChatTurn,
} from '@movscript/core/agent/chat'

import {
  cancelAgentChatQueuedInputEdit,
  errorMessage,
  failAgentChatQueuedInputs,
  markAgentChatQueuedInputEditing,
  markAgentChatQueuedInputsSending,
  removeAgentChatQueuedInput,
  type AgentChatQueuedInputState,
  updateAgentChatQueuedInputText,
} from '@/features/agent/presentation/agentChatDataSourceShellModel'
import type { useAgentComposerController } from '@/features/agent/presentation/useAgentComposerController'

type AgentComposerController = ReturnType<typeof useAgentComposerController>

export type AgentComposerQueuedInput = AgentChatQueuedInputState<
  AgentComposerController['composerAttachments'],
  AgentComposerController['selectedWorkspaceContext']
>

export function useAgentChatQueuedInputControls({
  activeThread,
  activeTurn,
  composer,
  dataSource,
  queuedInputs,
  setQueuedInputs,
}: {
  activeThread: AgentChatThread | null
  activeTurn: AgentChatTurn | null
  composer: AgentComposerController
  dataSource?: AgentChatDataSource
  queuedInputs: AgentComposerQueuedInput[]
  setQueuedInputs: Dispatch<SetStateAction<AgentComposerQueuedInput[]>>
}) {
  const deleteQueuedInput = useCallback((id: string) => {
    const removed = queuedInputs.find((item) => item.id === id)
    if (removed) composer.revokeAttachmentPreviewUrls(removed.attachments)
    setQueuedInputs((current) => removeAgentChatQueuedInput(current, id))
  }, [composer, queuedInputs, setQueuedInputs])

  const editQueuedInput = useCallback((id: string) => {
    const item = queuedInputs.find((candidate) => candidate.id === id)
    if (!item || item.status === 'sending') return
    setQueuedInputs((current) => markAgentChatQueuedInputEditing(current, id))
  }, [queuedInputs, setQueuedInputs])

  const updateQueuedInputText = useCallback((id: string, text: string) => {
    setQueuedInputs((current) => updateAgentChatQueuedInputText(current, id, text))
  }, [setQueuedInputs])

  const cancelQueuedInputEdit = useCallback((id: string) => {
    setQueuedInputs((current) => cancelAgentChatQueuedInputEdit(current, id))
  }, [setQueuedInputs])

  const steerQueuedInputNow = useCallback(async (id: string) => {
    if (!dataSource?.steerTurn || !activeThread || !activeTurn) return
    const item = queuedInputs.find((candidate) => candidate.id === id)
    if (!item || item.status === 'sending') return
    if (item.threadId !== activeThread.id) {
      setQueuedInputs((current) => failAgentChatQueuedInputs(current, new Set([id]), 'This queued message belongs to another thread.'))
      return
    }
    setQueuedInputs((current) => markAgentChatQueuedInputsSending(current, new Set([id])))
    try {
      await dataSource.steerTurn({
        threadId: item.threadId,
        turnId: activeTurn.id,
        clientUserMessageId: item.clientUserMessageId,
        inputs: item.inputs,
      })
      composer.revokeAttachmentPreviewUrls(item.attachments)
      setQueuedInputs((current) => removeAgentChatQueuedInput(current, id))
    } catch (nextError) {
      setQueuedInputs((current) => failAgentChatQueuedInputs(current, new Set([id]), errorMessage(nextError)))
    }
  }, [activeThread, activeTurn, composer, dataSource, queuedInputs, setQueuedInputs])

  return {
    cancelQueuedInputEdit,
    deleteQueuedInput,
    editQueuedInput,
    steerQueuedInputNow,
    updateQueuedInputText,
  }
}
