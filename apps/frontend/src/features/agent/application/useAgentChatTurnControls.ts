import { useCallback, useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
import {
  agentChatInputsFromTextAndAttachments,
  agentChatVisibleThreadItemViewId,
  buildAgentChatRuntimeThreadReadInput,
  ensureAgentChatThreadReadyForTurn,
  type AgentChatDataSource,
  type AgentChatCollaborationMode,
  type AgentChatInput,
  type AgentChatModelSelection,
  type AgentChatRuntimeAction,
  type AgentChatRuntimeState,
  type AgentChatRuntimeView,
  type AgentChatThread,
  type AgentChatThreadControlOptions,
  type AgentChatThreadReadInput,
  type AgentChatTurn,
} from '@movscript/core/agent/chat'
import {
  agentRunProfilePresetById,
  type AgentRunProfilePresetId,
  type AgentRunProfileSelection,
} from '@/features/agent/domain/agentRunProfilePreset'
import {
  type AgentChatStartThreadInput,
  type AgentChatStartThreadResult,
} from '@/features/agent/application/useAgentChatThreadCreation'
import { clearAgentChatComposerEditor } from '@/features/agent/application/agentComposerEditorDom'
import { debugAgentChatShellLoad } from '@/features/agent/application/agentChatShellDebug'
import {
  agentChatComposerConversationId,
  buildAgentChatDraftThreadControlOptions,
  buildAgentChatQueuedInputDraft,
  buildAgentChatQueuedTurnSubmission,
  cancelAgentChatQueuedInputEdit,
  errorMessage,
  failAgentChatQueuedInputs,
  markAgentChatQueuedInputEditing,
  markAgentChatQueuedInputsSending,
  removeAgentChatQueuedInput,
  removeAgentChatQueuedInputs,
  resolveAgentChatGoalObjective,
  selectDraftAgentChatQueuedInputsForThread,
  type AgentChatQueuedInputState,
  updateAgentChatQueuedInputText,
} from '@/features/agent/presentation/agentChatDataSourceShellModel'
import {
  clearAgentConversationWorkspace,
  updateAgentConversationWorkspace,
} from '@/features/agent/state/agentConversationDraftStore'
import type { useAgentComposerController } from '@/features/agent/presentation/useAgentComposerController'

type AgentComposerController = ReturnType<typeof useAgentComposerController>

export type AgentComposerQueuedInput = AgentChatQueuedInputState<
  AgentComposerController['composerAttachments'],
  AgentComposerController['selectedWorkspaceContext']
>

type AgentChatVisibleItem = AgentChatRuntimeView['visibleItems'][number]

export function upsertAgentChatOptimisticUserItem(
  items: AgentChatVisibleItem[],
  item: AgentChatVisibleItem,
): AgentChatVisibleItem[] {
  const existingIndex = items.findIndex((candidate) => candidate.viewId === item.viewId)
  if (existingIndex < 0) return [...items, item]
  return items.map((candidate, index) => (index === existingIndex ? item : candidate))
}

export function removeAgentChatOptimisticUserItem(
  items: AgentChatVisibleItem[],
  viewId: string,
): AgentChatVisibleItem[] {
  return items.filter((item) => item.viewId !== viewId)
}

interface UseAgentChatTurnControlsInput {
  activeThread: AgentChatThread | null
  activeTurn: AgentChatTurn | null
  collaborationMode: AgentChatCollaborationMode
  composer: AgentComposerController
  composerConversationId: string
  composerInputRef: RefObject<HTMLDivElement | null>
  composerPlaceholder: string
  dataSource?: AgentChatDataSource
  dispatchRuntime: Dispatch<AgentChatRuntimeAction>
  goalModeEnabled: boolean
  markThreadFailed: (threadId: string, error?: string) => void
  markThreadReady: (threadId: string) => void
  profilePresetId: AgentRunProfilePresetId
  providerLabel: string
  queuedInputs: AgentComposerQueuedInput[]
  runtimeRef: MutableRefObject<AgentChatRuntimeState>
  selectedModelSelectionForRequest: (thread?: AgentChatThread | null) => AgentChatModelSelection
  sending: boolean
  setError: Dispatch<SetStateAction<string | null>>
  setQueuedInputs: Dispatch<SetStateAction<AgentComposerQueuedInput[]>>
  setQueuedInputsCollapsed: Dispatch<SetStateAction<boolean>>
  setSending: Dispatch<SetStateAction<boolean>>
  setOptimisticUserItems: Dispatch<SetStateAction<AgentChatRuntimeView['visibleItems']>>
  setStoppingTurn: Dispatch<SetStateAction<boolean>>
  startThreadResult: (input?: AgentChatStartThreadInput) => Promise<AgentChatStartThreadResult | null>
  stoppingTurn: boolean
  syncThreadRunProfileSettingsForTurn: (
    dataSource: AgentChatDataSource,
    thread: AgentChatThread,
    runProfile: AgentRunProfileSelection,
  ) => Promise<void>
  threadScopeKey: string
  upsertThread: (thread: AgentChatThread) => void
  upsertThreadReadResult: (thread: AgentChatThread, input: AgentChatThreadReadInput) => void
  userId: string
}

export function useAgentChatTurnControls({
  activeThread,
  activeTurn,
  collaborationMode,
  composer,
  composerConversationId,
  composerInputRef,
  composerPlaceholder,
  dataSource,
  dispatchRuntime,
  goalModeEnabled,
  markThreadFailed,
  markThreadReady,
  profilePresetId,
  providerLabel,
  queuedInputs,
  runtimeRef,
  selectedModelSelectionForRequest,
  sending,
  setError,
  setQueuedInputs,
  setQueuedInputsCollapsed,
  setSending,
  setOptimisticUserItems,
  setStoppingTurn,
  startThreadResult,
  stoppingTurn,
  syncThreadRunProfileSettingsForTurn,
  threadScopeKey,
  upsertThread,
  upsertThreadReadResult,
  userId,
}: UseAgentChatTurnControlsInput) {
  const canSend = Boolean(
    dataSource
    && (composer.input.trim() || composer.composerAttachments.length > 0)
    && !sending
    && !composer.uploading
    && (!activeTurn || dataSource.startTurn || dataSource.startTextTurn),
  )
  const canStopActiveTurn = Boolean(activeTurn && dataSource?.interruptTurn && !stoppingTurn)

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

  const sendMessage = useCallback(async (nextProfilePresetId: AgentRunProfilePresetId = profilePresetId) => {
    if (!dataSource || sending) return
    const runProfile = agentRunProfilePresetById(nextProfilePresetId)
    const composerInput = composer.getInput()
    const text = composerInput.trim()
    const sentAttachments = composer.composerAttachments
    const inputs = agentChatInputsFromTextAndAttachments(text, sentAttachments)
    if (inputs.length === 0) return
    const clientUserMessageId = `agent_user_${Date.now()}`
    const optimisticUserMessage = {
      type: 'userMessage' as const,
      id: clientUserMessageId,
      clientId: clientUserMessageId,
      content: inputs,
    }
    const optimisticUserItem: AgentChatVisibleItem = {
      viewId: agentChatVisibleThreadItemViewId('pending', optimisticUserMessage),
      item: optimisticUserMessage,
      streaming: false,
    }
    const shouldShowOptimisticUserItem = !activeTurn
    const clearOptimisticUserItem = () => {
      if (!shouldShowOptimisticUserItem) return
      setOptimisticUserItems((current) => removeAgentChatOptimisticUserItem(current, optimisticUserItem.viewId))
    }
    const previousWorkspace = {
      input: composerInput,
      attachments: composer.attachments,
      workspaceContext: composer.selectedWorkspaceContext,
    }
    let restoreConversationId = composerConversationId
    const sourceConversationId = composerConversationId
    if (shouldShowOptimisticUserItem) {
      setOptimisticUserItems((current) => upsertAgentChatOptimisticUserItem(current, optimisticUserItem))
    }
    setSending(true)
    setError(null)
    let startedThreadId: string | undefined
    try {
      const selectedWorkspaceProjectId = typeof composer.selectedWorkspaceContext.projectId === 'number'
        ? composer.selectedWorkspaceContext.projectId
        : undefined
      let thread = activeThread
      let turnDataSource = dataSource
      let firstTurnDraftControls: AgentChatThreadControlOptions | undefined
      if (thread?.status === 'notLoaded') {
        thread = await ensureAgentChatThreadReadyForTurn({
          dataSource,
          thread,
          runProfile,
          modelSelection: selectedModelSelectionForRequest(thread),
        })
        upsertThread(thread)
      }
      if (!thread) {
        firstTurnDraftControls = buildAgentChatDraftThreadControlOptions({ collaborationMode, goalModeEnabled })
        const started = await startThreadResult({
          runProfile,
          useDraftModeSettings: true,
          workspaceContext: composer.selectedWorkspaceContext,
          ...(selectedWorkspaceProjectId !== undefined ? { projectId: selectedWorkspaceProjectId } : {}),
        })
        if (!started) {
          clearOptimisticUserItem()
          return
        }
        thread = started.thread
        turnDataSource = started.dataSource
      }
      startedThreadId = thread.id
      if (!activeTurn) {
        dispatchRuntime({
          type: 'appendPendingUserItem',
          item: {
            threadId: thread.id,
            item: {
              type: 'userMessage',
              id: clientUserMessageId,
              clientId: clientUserMessageId,
              content: inputs,
            },
          },
        })
        clearOptimisticUserItem()
      }
      if (firstTurnDraftControls?.goalModeEnabled && turnDataSource.setThreadGoal && !activeTurn) {
        await turnDataSource.setThreadGoal({
          threadId: thread.id,
          objective: resolveAgentChatGoalObjective({
            attachmentNames: composer.composerAttachments.map((attachment) => attachment.name),
            fallback: composerPlaceholder,
            text,
          }),
          status: 'active',
        })
      }
      restoreConversationId = agentChatComposerConversationId(threadScopeKey, thread.id)
      if (sourceConversationId !== restoreConversationId) {
        clearAgentConversationWorkspace(userId, sourceConversationId)
      }
      updateAgentConversationWorkspace(userId, restoreConversationId, {
        input: '',
        attachments: [],
        workspaceContext: composer.selectedWorkspaceContext,
      })
      composer.updateWorkspace({ input: '', attachments: [] })
      clearAgentChatComposerEditor(composerInputRef.current)
      if (activeTurn) {
        setQueuedInputs((current) => [
          ...current,
          buildAgentChatQueuedInputDraft({
            id: `queued_input_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            threadId: thread.id,
            text,
            inputs,
            attachments: sentAttachments,
            workspaceContext: composer.selectedWorkspaceContext,
            profilePresetId: nextProfilePresetId,
            clientUserMessageId,
            createdAt: Date.now(),
          }),
        ])
        setQueuedInputsCollapsed(false)
        return
      }
      if (!firstTurnDraftControls) {
        await syncThreadRunProfileSettingsForTurn(turnDataSource, thread, runProfile)
      }
      if (turnDataSource.startTurn) {
        await turnDataSource.startTurn({
          threadId: thread.id,
          clientUserMessageId,
          inputs,
          runProfile,
          ...firstTurnDraftControls,
          ...selectedModelSelectionForRequest(thread),
        })
      } else {
        await turnDataSource.startTextTurn({
          threadId: thread.id,
          clientUserMessageId,
          text,
          runProfile,
          ...firstTurnDraftControls,
          ...selectedModelSelectionForRequest(thread),
        })
      }
      debugAgentChatShellLoad('thread-ready', {
        threadId: thread.id,
        source: 'send-message',
      })
      markThreadReady(thread.id)
      dispatchRuntime({ type: 'requestThreadRead', threadId: thread.id })
      composer.revokeAttachmentPreviewUrls(sentAttachments)
    } catch (nextError) {
      clearOptimisticUserItem()
      updateAgentConversationWorkspace(userId, restoreConversationId, previousWorkspace)
      composer.updateWorkspace(previousWorkspace)
      const message = errorMessage(nextError)
      if (startedThreadId) markThreadFailed(startedThreadId, message)
      setError(message)
    } finally {
      setSending(false)
    }
  }, [activeThread, activeTurn, collaborationMode, composer, composerConversationId, composerInputRef, composerPlaceholder, dataSource, dispatchRuntime, goalModeEnabled, markThreadFailed, markThreadReady, profilePresetId, selectedModelSelectionForRequest, sending, setError, setOptimisticUserItems, setQueuedInputs, setQueuedInputsCollapsed, setSending, startThreadResult, syncThreadRunProfileSettingsForTurn, threadScopeKey, upsertThread, userId])

  const submitQueuedInputsAsTurn = useCallback(async (ids: string[]) => {
    if (!dataSource || sending) return
    const submission = buildAgentChatQueuedTurnSubmission({
      batchClientUserMessageId: `queued_batch_${Date.now()}`,
      ids,
      items: queuedInputs,
    })
    if (!submission) return
    const { clientUserMessageId, inputs, items: threadItems, sendingIds, text, threadId } = submission
    const thread = runtimeRef.current.threads.find((candidate) => candidate.id === threadId)
    if (!thread || thread.status === 'notLoaded') return
    const runProfile = agentRunProfilePresetById(submission.profilePresetId)
    setSending(true)
    setQueuedInputs((current) => markAgentChatQueuedInputsSending(current, sendingIds))
    try {
      await syncThreadRunProfileSettingsForTurn(dataSource, thread, runProfile)
      if (dataSource.startTurn) {
        await dataSource.startTurn({
          threadId,
          clientUserMessageId,
          inputs: inputs as AgentChatInput[],
          runProfile,
          ...selectedModelSelectionForRequest(thread),
        })
      } else {
        await dataSource.startTextTurn({
          threadId,
          clientUserMessageId,
          text,
          runProfile,
          ...selectedModelSelectionForRequest(thread),
        })
      }
      debugAgentChatShellLoad('thread-ready', {
        threadId: thread.id,
        source: 'queued-inputs',
      })
      markThreadReady(thread.id)
      dispatchRuntime({ type: 'requestThreadRead', threadId: thread.id })
      for (const item of threadItems) composer.revokeAttachmentPreviewUrls(item.attachments)
      setQueuedInputs((current) => removeAgentChatQueuedInputs(current, sendingIds))
    } catch (nextError) {
      setQueuedInputs((current) => failAgentChatQueuedInputs(current, sendingIds, errorMessage(nextError)))
    } finally {
      setSending(false)
    }
  }, [composer, dataSource, dispatchRuntime, markThreadReady, queuedInputs, runtimeRef, selectedModelSelectionForRequest, sending, setQueuedInputs, setSending, syncThreadRunProfileSettingsForTurn])

  const submitQueuedInputAsTurn = useCallback(async (id: string) => {
    await submitQueuedInputsAsTurn([id])
  }, [submitQueuedInputsAsTurn])

  useEffect(() => {
    if (!activeThread || activeTurn || sending) return
    const nextQueuedInputs = selectDraftAgentChatQueuedInputsForThread(queuedInputs, activeThread.id)
    if (nextQueuedInputs.length === 0) return
    void submitQueuedInputsAsTurn(nextQueuedInputs.map((item) => item.id))
  }, [activeThread, activeTurn, queuedInputs, sending, submitQueuedInputsAsTurn])

  const stopActiveTurn = useCallback(async () => {
    if (!dataSource?.interruptTurn || !activeThread || !activeTurn || stoppingTurn) return
    setStoppingTurn(true)
    setError(null)
    try {
      await dataSource.interruptTurn({
        threadId: activeThread.id,
        turnId: activeTurn.id,
        reason: `Interrupted from ${providerLabel}.`,
      })
      const input = buildAgentChatRuntimeThreadReadInput(runtimeRef.current, activeThread.id)
      const thread = await dataSource.readThread(activeThread.id, input)
      upsertThreadReadResult(thread, input)
      const nextQueuedInputs = selectDraftAgentChatQueuedInputsForThread(queuedInputs, activeThread.id)
      if (nextQueuedInputs.length > 0) void submitQueuedInputsAsTurn(nextQueuedInputs.map((item) => item.id))
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setStoppingTurn(false)
    }
  }, [activeThread, activeTurn, dataSource, providerLabel, queuedInputs, runtimeRef, setError, setStoppingTurn, stoppingTurn, submitQueuedInputsAsTurn, upsertThreadReadResult])

  return {
    canSend,
    canStopActiveTurn,
    cancelQueuedInputEdit,
    deleteQueuedInput,
    editQueuedInput,
    sendMessage,
    steerQueuedInputNow,
    stopActiveTurn,
    submitQueuedInputAsTurn,
    updateQueuedInputText,
  }
}
