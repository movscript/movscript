import { useMemo } from 'react'
import { buildAgentConversationPresentation } from '@/features/agent/domain/agentConversationPresentation'
import {
  isUiOnlyAssistantChatMessage,
  visibleAssistantActivityRunId,
  visibleAssistantRuntimeMessageRunId,
} from '@/features/agent/domain/agentMessageBoundaries'
import { buildPendingRuntimeInputQueueItems } from '@/features/agent/domain/agentConversationThreadItems'
import { generationProgressStatesForPinnedStatus } from '@/features/agent/domain/agentPinnedStatus'
import { isStoppableAgentRun, isTerminalAgentRun } from '@/features/agent/domain/agentRunControl'
import { isRuntimeAsyncWorkHandoffRun } from '@/features/agent/domain/agentRuntimeStatusMessage'
import { getThinkingBubbleState, type ThinkingBubbleState } from '@/features/agent/presentation/agentThinkingBubbleState'
import { useAgentChatRunInteractionState } from '@/features/agent/presentation/useAgentChatRunInteractionState'
import type { AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'
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
  pendingSendWorkspace: AgentSendWorkspace | null
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
  pendingSendWorkspace,
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
  const buildingSendWorkspace = runtimeBuilding
  const asyncWorkHandoffRun = isRuntimeAsyncWorkHandoffRun(activeLocalRun)
  const inputBlockingLoading = loading && !asyncWorkHandoffRun
  const activeRunVisibleActivityEvents = useMemo(() => filterActivityEventsForRun(visibleActivityEvents, activeLocalRun?.id), [activeLocalRun?.id, visibleActivityEvents])
  const generationProgressActivityEvents = visibleActivityEvents
  const thinkingState: ThinkingBubbleState = useMemo(
    () => pendingAssistantState ?? getThinkingBubbleState(activeLocalRun, activeRunVisibleActivityEvents),
    [activeLocalRun, activeRunVisibleActivityEvents, pendingAssistantState],
  )
  const generationProgressStates = useMemo(() => generationProgressStatesForPinnedStatus({
    messages,
    run: activeLocalRun,
    visibleActivityEvents: generationProgressActivityEvents,
  }), [activeLocalRun, generationProgressActivityEvents, messages])
  const generationProgressState = generationProgressStates.at(-1) ?? null
  const pendingRuntimeInputQueue = useMemo(() => buildPendingRuntimeInputQueueItems(messages), [messages])
  const activeRunHasActivityMessage = useMemo(() => activeLocalRun
    ? agentMessagesContainRunActivity(messages, activeLocalRun.id)
    : false, [activeLocalRun, messages])
  const visibleStreamingAssistantText = useMemo(() => {
    const streamingRunId = streamingAssistantMessageId ? runIdFromStreamingAssistantMessageId(streamingAssistantMessageId) : undefined
    if (!streamingRunId) return streamingAssistantText
    const hasFinalAssistantMessage = messages.some((message) => assistantMessageCompletesStreamingRun(message, streamingRunId))
    return hasFinalAssistantMessage ? '' : streamingAssistantText
  }, [messages, streamingAssistantMessageId, streamingAssistantText])
  const conversationPresentation = useMemo(() => buildAgentConversationPresentation({
    streamingAssistantMessageId,
    streamingAssistantText: visibleStreamingAssistantText,
    pendingSendWorkspace,
    loading: inputBlockingLoading,
    buildingSendWorkspace,
    hasPendingAssistantState: !!pendingAssistantState,
    activeRunHasActivityMessage,
    activeRun: activeLocalRun,
    visibleActivityEvents: activeRunVisibleActivityEvents,
    generationProgressStates,
    generationProgressState,
  }), [
    activeLocalRun,
    activeRunHasActivityMessage,
    buildingSendWorkspace,
    generationProgressState,
    generationProgressStates,
    inputBlockingLoading,
    pendingAssistantState,
    pendingSendWorkspace,
    streamingAssistantMessageId,
    visibleStreamingAssistantText,
    activeRunVisibleActivityEvents,
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
  ) && !uploading && !buildingSendWorkspace
  const hasActiveLocalWork = !isTerminalAgentRun(activeLocalRun) && (inputBlockingLoading || buildingSendWorkspace)
  const canStopLocalRun = !runInteractionState.answeringPendingInput && (isStoppableAgentRun(activeLocalRun) || hasActiveLocalWork || runtimeStopRequested)
  const composerPlaceholder = runInteractionState.activePendingInputRequest
    ? runInteractionState.activePendingInputRequest.inputType === 'choice'
      ? runInteractionState.activePendingInputRequest.allowCustomAnswer ? '可补充自定义答案' : '请选择上方选项'
      : runInteractionState.activePendingInputRequest.question
    : inputPlaceholder

  return {
    activeLocalRun,
    approvingLocalRun: runtimeApproving,
    buildingSendWorkspace,
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

function runIdFromStreamingAssistantMessageId(messageId: string): string | undefined {
  return messageId.startsWith('stream-') ? messageId.slice('stream-'.length) : undefined
}

export function agentMessagesContainRunActivity(messages: ChatMessage[], runId: string): boolean {
  return messages.some((message) => visibleAssistantActivityRunId(message) === runId)
}

export function assistantMessageCompletesStreamingRun(message: ChatMessage, runId: string): boolean {
  if (isUiOnlyAssistantChatMessage(message)) return false
  return visibleAssistantRuntimeMessageRunId(message) === normalizeRunId(runId)
}

export function filterActivityEventsForRun(events: ChatRunActivityEvent[], runId: string | undefined): ChatRunActivityEvent[] {
  if (!runId) return events.filter((event) => !activityEventRunId(event))
  return events.filter((event) => {
    const eventRunId = activityEventRunId(event)
    return !eventRunId || eventRunId === runId
  })
}

function activityEventRunId(event: ChatRunActivityEvent): string | undefined {
  return typeof event.runId === 'string' && event.runId.trim() ? event.runId.trim() : undefined
}

function normalizeRunId(runId: string | undefined): string | undefined {
  return typeof runId === 'string' && runId.trim() ? runId.trim() : undefined
}
