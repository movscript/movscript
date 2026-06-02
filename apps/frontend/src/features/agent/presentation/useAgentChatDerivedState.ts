import { useMemo } from 'react'
import { buildAgentConversationPresentation } from '@/features/agent/domain/agentConversationPresentation'
import { buildPendingRuntimeInputQueueItems } from '@/features/agent/domain/agentConversationThreadItems'
import { generationProgressStatesForPinnedStatus } from '@/features/agent/domain/agentPinnedStatus'
import { isStoppableAgentRun, isTerminalAgentRun } from '@/features/agent/domain/agentRunControl'
import { isRuntimeAsyncWorkHandoffRun } from '@/features/agent/domain/agentRuntimeStatusMessage'
import { getThinkingBubbleState, type ThinkingBubbleState } from '@/features/agent/presentation/agentThinkingBubbleState'
import { useAgentChatRunInteractionState } from '@/features/agent/presentation/useAgentChatRunInteractionState'
import type { AgentSendDraft } from '@/features/agent/application/agentSendDraft'
import type { AgentLivePendingAssistantState } from '@/features/agent/presentation/agentLiveRunActivity'
import type { AgentTaskGraphSnapshot, AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { AgentAttachment, ChatMessage, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export interface UseAgentChatDerivedStateOptions {
  activePlanSnapshot?: AgentTaskGraphSnapshot
  composerAttachments: AgentAttachment[]
  input: string
  inputPlaceholder: string
  loading?: boolean
  pendingAssistantState: AgentLivePendingAssistantState | null
  pendingSendDraft: AgentSendDraft | null
  run: AgentRun | null
  runtimeApproving?: boolean
  runtimeBuilding?: boolean
  runtimeStopping?: boolean
  runtimeStopRequested?: boolean
  messages: ChatMessage[]
  streamingAssistantMessageId?: string | null
  streamingAssistantText: string
  submittedInteractionRuns: AgentRun[]
  uploading: boolean
  visibleActivityEvents: ChatRunActivityEvent[]
}

export function useAgentChatDerivedState({
  activePlanSnapshot,
  composerAttachments,
  input,
  inputPlaceholder,
  loading = false,
  messages,
  pendingAssistantState,
  pendingSendDraft,
  run,
  runtimeApproving = false,
  runtimeBuilding = false,
  runtimeStopping = false,
  runtimeStopRequested = false,
  streamingAssistantMessageId,
  streamingAssistantText,
  submittedInteractionRuns,
  uploading,
  visibleActivityEvents,
}: UseAgentChatDerivedStateOptions) {
  const activeLocalRun = run ?? null
  const buildingSendDraft = runtimeBuilding
  const asyncWorkHandoffRun = isRuntimeAsyncWorkHandoffRun(activeLocalRun)
  const inputBlockingLoading = loading && !asyncWorkHandoffRun
  const thinkingState: ThinkingBubbleState = useMemo(
    () => pendingAssistantState ?? getThinkingBubbleState(activeLocalRun, visibleActivityEvents),
    [activeLocalRun, pendingAssistantState, visibleActivityEvents],
  )
  const generationProgressStates = useMemo(() => generationProgressStatesForPinnedStatus({
    messages,
    run: activeLocalRun,
    visibleActivityEvents,
  }), [activeLocalRun, messages, visibleActivityEvents])
  const generationProgressState = generationProgressStates.at(-1) ?? null
  const pendingRuntimeInputQueue = useMemo(() => buildPendingRuntimeInputQueueItems(messages), [messages])
  const conversationPresentation = useMemo(() => buildAgentConversationPresentation({
    streamingAssistantMessageId,
    streamingAssistantText,
    pendingSendDraft,
    loading: inputBlockingLoading,
    buildingSendDraft,
    hasPendingAssistantState: !!pendingAssistantState,
    activeRun: activeLocalRun,
    visibleActivityEvents,
    generationProgressStates,
    generationProgressState,
  }), [
    activeLocalRun,
    buildingSendDraft,
    generationProgressState,
    generationProgressStates,
    inputBlockingLoading,
    pendingAssistantState,
    pendingSendDraft,
    streamingAssistantMessageId,
    streamingAssistantText,
    visibleActivityEvents,
  ])

  const runInteractionState = useAgentChatRunInteractionState({
    activePlanSnapshot,
    messages,
    run: activeLocalRun,
    submittedInteractionRuns,
  })
  const canSend = (
    runInteractionState.answeringPendingInput
      ? runInteractionState.canAnswerPendingInputWithText && !!input.trim()
      : (!!input.trim() || composerAttachments.length > 0)
  ) && !uploading && !buildingSendDraft
  const hasActiveLocalWork = !isTerminalAgentRun(activeLocalRun) && (inputBlockingLoading || buildingSendDraft)
  const canStopLocalRun = !runInteractionState.answeringPendingInput && (isStoppableAgentRun(activeLocalRun) || hasActiveLocalWork || runtimeStopRequested)
  const composerPlaceholder = runInteractionState.activePendingInputRequest
    ? runInteractionState.activePendingInputRequest.inputType === 'choice'
      ? runInteractionState.activePendingInputRequest.allowCustomAnswer ? '可补充自定义答案' : '请选择上方选项'
      : runInteractionState.activePendingInputRequest.question
    : inputPlaceholder

  return {
    activeLocalRun,
    approvingLocalRun: runtimeApproving,
    buildingSendDraft,
    canSend,
    canStopLocalRun,
    composerPlaceholder,
    conversationPresentation,
    generationProgressKey: generationProgressState ? `${generationProgressState.jobId ?? ''}:${generationProgressState.outputResourceId ?? ''}:${generationProgressState.status}:${generationProgressState.stage ?? ''}` : undefined,
    generationProgressState,
    generationProgressStates,
    hasStreamingAssistantContent: conversationPresentation.hasStreamingAssistantContent,
    loading: inputBlockingLoading,
    pendingRuntimeInputQueue,
    stoppingLocalRun: runtimeStopping,
    stopRequestedBeforeRun: runtimeStopRequested,
    thinkingState,
    ...runInteractionState,
  }
}
