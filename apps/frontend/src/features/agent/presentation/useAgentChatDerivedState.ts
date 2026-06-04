import { useMemo } from 'react'
import { buildAgentChatComposerViewState } from '@/features/agent/presentation/agentChatComposerViewState'
import { buildAgentChatConversationProjectionState } from '@/features/agent/presentation/agentChatConversationProjectionState'
import { buildAgentChatGenerationProgressViewState } from '@/features/agent/presentation/agentChatGenerationProgressViewState'
import { buildAgentChatRuntimeWorkViewState } from '@/features/agent/presentation/agentChatRuntimeWorkViewState'
import { useAgentChatRunInteractionState } from '@/features/agent/presentation/useAgentChatRunInteractionState'
import type { AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'
import type { AgentThinkingState } from '@/features/agent/domain/agentThinkingState'
import type { AgentTaskGraphSnapshot, AgentRun, AgentTimelineItem } from '@/shared/infrastructure/localAgentClient'
import type { AgentAttachment, ChatMessage, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export interface UseAgentChatDerivedStateOptions {
  activePlanSnapshot?: AgentTaskGraphSnapshot
  composerAttachments: AgentAttachment[]
  input: string
  inputPlaceholder: string
  loading?: boolean
  pendingAssistantState: AgentThinkingState | null
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
  timelineItems: AgentTimelineItem[]
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
  timelineItems,
  uploading,
  visibleActivityEvents,
}: UseAgentChatDerivedStateOptions) {
  const activeLocalRun = run ?? null
  const runtimeWorkViewState = useMemo(() => buildAgentChatRuntimeWorkViewState({
    activeRun: activeLocalRun,
    loading,
    runtimeApproving,
    runtimeBuilding,
    runtimeStopping,
    runtimeStopRequested,
  }), [
    activeLocalRun,
    loading,
    runtimeApproving,
    runtimeBuilding,
    runtimeStopping,
    runtimeStopRequested,
  ])
  const generationProgressViewState = useMemo(() => buildAgentChatGenerationProgressViewState({
    activeRun: activeLocalRun,
    messages,
    timelineItems,
    visibleActivityEvents,
  }), [activeLocalRun, messages, timelineItems, visibleActivityEvents])
  const runInteractionState = useAgentChatRunInteractionState({
    activePlanSnapshot,
    run: activeLocalRun,
    submittedInteractionRuns,
  })
  const { conversationProjection } = useMemo(() => buildAgentChatConversationProjectionState({
    activeRun: activeLocalRun,
    buildingSendWorkspace: runtimeWorkViewState.buildingSendWorkspace,
    inputBlockingLoading: runtimeWorkViewState.inputBlockingLoading,
    interactionRuns: runInteractionState.interactionRuns,
    messages,
    pendingAssistantState,
    pendingSendWorkspace,
    streamingAssistantMessageId,
    streamingAssistantText,
    timelineItems,
    visibleActivityEvents,
  }), [
    activeLocalRun,
    runtimeWorkViewState.buildingSendWorkspace,
    runtimeWorkViewState.inputBlockingLoading,
    runInteractionState.interactionRuns,
    messages,
    pendingAssistantState,
    pendingSendWorkspace,
    streamingAssistantMessageId,
    streamingAssistantText,
    timelineItems,
    visibleActivityEvents,
  ])
  const composerViewState = useMemo(() => buildAgentChatComposerViewState({
    activePendingInputRequest: runInteractionState.activePendingInputRequest,
    activeRun: activeLocalRun,
    answeringPendingInput: runInteractionState.answeringPendingInput,
    buildingSendWorkspace: runtimeWorkViewState.buildingSendWorkspace,
    canAnswerPendingInputWithText: runInteractionState.canAnswerPendingInputWithText,
    composerAttachmentCount: composerAttachments.length,
    input,
    inputBlockingLoading: runtimeWorkViewState.inputBlockingLoading,
    inputPlaceholder,
    messages,
    runtimeStopRequested,
    uploading,
  }), [
    activeLocalRun,
    runtimeWorkViewState.buildingSendWorkspace,
    composerAttachments.length,
    input,
    runtimeWorkViewState.inputBlockingLoading,
    inputPlaceholder,
    messages,
    runInteractionState.activePendingInputRequest,
    runInteractionState.answeringPendingInput,
    runInteractionState.canAnswerPendingInputWithText,
    runtimeStopRequested,
    uploading,
  ])

  return {
    activeLocalRun,
    conversationProjection,
    ...composerViewState,
    ...generationProgressViewState,
    ...runtimeWorkViewState,
    ...runInteractionState,
  }
}
