import { useCallback, useEffect, useRef } from 'react'
import {
  agentChatInputsFromTextAndAttachments,
  agentChatVisibleThreadItemViewId,
  buildAgentChatRuntimeThreadReadInput,
  ensureAgentChatThreadReadyForTurn,
  type AgentChatInput,
  type AgentChatThreadControlOptions,
} from '@movscript/agent-chat'
import {
  agentRunProfilePresetById,
  type AgentRunProfilePresetId,
} from '@/features/agent/domain/agentRunProfilePreset'
import { clearAgentChatComposerEditor } from '@/features/agent/application/agentComposerEditorDom'
import { debugAgentChatShellLoad } from '@/features/agent/application/agentChatShellDebug'
import {
  agentChatComposerConversationId,
  buildAgentChatDraftThreadControlOptions,
  buildAgentChatQueuedInputDraft,
  buildAgentChatQueuedTurnSubmission,
  errorMessage,
  failAgentChatQueuedInputs,
  markAgentChatQueuedInputsSending,
  removeAgentChatQueuedInputs,
  resolveAgentChatGoalObjective,
  selectDraftAgentChatQueuedInputsForThread,
} from '@/features/agent/presentation/agentChatDataSourceShellModel'
import {
  clearAgentConversationWorkspace,
  updateAgentConversationWorkspace,
} from '@/features/agent/state/agentConversationDraftStore'
import { useAgentChatQueuedInputControls } from '@/features/agent/application/useAgentChatQueuedInputControls'
import {
  removeAgentChatOptimisticUserItem,
  upsertAgentChatOptimisticUserItem,
  type AgentChatTurnControlsInput,
  type AgentChatVisibleItem,
} from '@/features/agent/application/agentChatTurnControlTypes'

export type { AgentComposerQueuedInput } from '@/features/agent/application/useAgentChatQueuedInputControls'

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
  sendDisabledReason,
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
}: AgentChatTurnControlsInput) {
  const turnSubmitInFlightRef = useRef(false)
  const canSend = Boolean(
    dataSource
    && (composer.input.trim() || composer.composerAttachments.length > 0)
    && !sendDisabledReason
    && !sending
    && !composer.uploading
    && (!activeTurn || dataSource.startTurn || dataSource.startTextTurn),
  )
  const canStopActiveTurn = Boolean(activeTurn && dataSource?.interruptTurn && !stoppingTurn)

  const {
    cancelQueuedInputEdit,
    deleteQueuedInput,
    editQueuedInput,
    steerQueuedInputNow,
    updateQueuedInputText,
  } = useAgentChatQueuedInputControls({
    activeThread,
    activeTurn,
    composer,
    dataSource,
    queuedInputs,
    setQueuedInputs,
  })

  const sendMessage = useCallback(async (nextProfilePresetId: AgentRunProfilePresetId = profilePresetId) => {
    if (!dataSource || sending || turnSubmitInFlightRef.current) return
    if (sendDisabledReason) {
      setError(sendDisabledReason)
      return
    }
    const runProfile = agentRunProfilePresetById(nextProfilePresetId)
    const composerInput = composer.getInput()
    const text = composerInput.trim()
    const sentAttachments = composer.composerAttachments
    const inputs = agentChatInputsFromTextAndAttachments(text, sentAttachments)
    if (inputs.length === 0) return
    turnSubmitInFlightRef.current = true
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
      turnSubmitInFlightRef.current = false
      setSending(false)
    }
  }, [activeThread, activeTurn, collaborationMode, composer, composerConversationId, composerInputRef, composerPlaceholder, dataSource, dispatchRuntime, goalModeEnabled, markThreadFailed, markThreadReady, profilePresetId, selectedModelSelectionForRequest, sendDisabledReason, sending, setError, setOptimisticUserItems, setQueuedInputs, setQueuedInputsCollapsed, setSending, startThreadResult, syncThreadRunProfileSettingsForTurn, threadScopeKey, upsertThread, userId])

  const submitQueuedInputsAsTurn = useCallback(async (ids: string[]) => {
    if (!dataSource || sending || turnSubmitInFlightRef.current) return
    if (sendDisabledReason) {
      setError(sendDisabledReason)
      return
    }
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
    turnSubmitInFlightRef.current = true
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
      turnSubmitInFlightRef.current = false
      setSending(false)
    }
  }, [composer, dataSource, dispatchRuntime, markThreadReady, queuedInputs, runtimeRef, selectedModelSelectionForRequest, sendDisabledReason, sending, setError, setQueuedInputs, setSending, syncThreadRunProfileSettingsForTurn])

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
