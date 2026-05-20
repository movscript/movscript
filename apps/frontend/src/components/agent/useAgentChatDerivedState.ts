import { useMemo } from 'react'
import { buildAgentConversationPresentation } from '@/lib/agentConversationPresentation'
import { generationProgressListFromEvents } from '@/lib/agentGenerationMedia'
import { isStoppableAgentRun, isTerminalAgentRun } from '@/lib/agentRunControl'
import { getThinkingBubbleState, type ThinkingBubbleState } from '@/components/agent/AgentChatBubbles'
import { useAgentChatWorkflowState } from '@/components/agent/useAgentChatWorkflowState'
import type { AgentSendDraft } from '@/lib/agentSendDraft'
import type { AgentLivePendingAssistantState } from '@/lib/agentLiveRunActivity'
import type { AgentPlanSnapshot, AgentRun } from '@/lib/localAgentClient'
import type { AgentAttachment, ChatMessage, ChatRunActivityEvent } from '@/store/agentStore'

export interface UseAgentChatDerivedStateOptions {
  activePlanSnapshot?: AgentPlanSnapshot
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
  const thinkingState: ThinkingBubbleState = pendingAssistantState ?? getThinkingBubbleState(activeLocalRun, visibleActivityEvents)
  const generationTraceEvents = visibleActivityEvents.length > 0 ? visibleActivityEvents : (activeLocalRun?.traceEvents ?? [])
  const generationProgressStates = generationProgressListFromEvents(generationTraceEvents)
  const generationProgressState = generationProgressStates.at(-1) ?? null
  const conversationPresentation = useMemo(() => buildAgentConversationPresentation({
    streamingAssistantMessageId,
    streamingAssistantText,
    pendingSendDraft,
    loading,
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
    loading,
    pendingAssistantState,
    pendingSendDraft,
    streamingAssistantMessageId,
    streamingAssistantText,
    visibleActivityEvents,
  ])

  const workflowState = useAgentChatWorkflowState({
    activePlanSnapshot,
    messages,
    run: activeLocalRun,
    submittedInteractionRuns,
  })
  const canSend = (
    workflowState.answeringPendingInput
      ? workflowState.canAnswerPendingInputWithText && !!input.trim()
      : (!!input.trim() || composerAttachments.length > 0)
  ) && !uploading && !buildingSendDraft
  const hasActiveLocalWork = !isTerminalAgentRun(activeLocalRun) && (loading || buildingSendDraft)
  const canStopLocalRun = !workflowState.answeringPendingInput && (isStoppableAgentRun(activeLocalRun) || hasActiveLocalWork || runtimeStopRequested)
  const composerPlaceholder = workflowState.activePendingInputRequest
    ? workflowState.activePendingInputRequest.inputType === 'choice'
      ? workflowState.activePendingInputRequest.allowCustomAnswer ? '可补充自定义答案' : '请选择上方选项'
      : workflowState.activePendingInputRequest.question
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
    loading,
    stoppingLocalRun: runtimeStopping,
    stopRequestedBeforeRun: runtimeStopRequested,
    thinkingState,
    ...workflowState,
  }
}
