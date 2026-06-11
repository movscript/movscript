import { useMemo } from 'react'
import { buildAgentChatComposerViewState } from '@/features/agent/presentation/agentChatComposerViewState'
import { useAgentChatConversationProjectionState } from '@/features/agent/presentation/agentChatConversationProjectionState'
import { buildAgentChatGenerationProgressViewState } from '@/features/agent/presentation/agentChatGenerationProgressViewState'
import { buildAgentChatProviderSessionWorkViewState } from '@/features/agent/presentation/agentChatProviderSessionWorkViewState'
import { useAgentChatRunInteractionState } from '@/features/agent/presentation/useAgentChatRunInteractionState'
import type { AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'
import type { AgentThinkingState } from '@/features/agent/domain/agentThinkingState'
import type { AgentTaskGraphSnapshot, AgentRun, AgentTimelineItem } from '@/shared/infrastructure/providerSessionClient'
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
  providerSessionApproving?: boolean
  providerSessionBuilding?: boolean
  providerSessionStopping?: boolean
  providerSessionStopRequested?: boolean
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
  providerSessionApproving = false,
  providerSessionBuilding = false,
  providerSessionStopping = false,
  providerSessionStopRequested = false,
  streamingAssistantMessageId,
  streamingAssistantText,
  submittedInteractionRuns,
  timelineItems,
  uploading,
  visibleActivityEvents,
}: UseAgentChatDerivedStateOptions) {
  const activeRun = run ?? null
  const providerSessionWorkViewState = useMemo(() => buildAgentChatProviderSessionWorkViewState({
    activeRun: activeRun,
    loading,
    providerSessionApproving,
    providerSessionBuilding,
    providerSessionStopping,
    providerSessionStopRequested,
  }), [
    activeRun,
    loading,
    providerSessionApproving,
    providerSessionBuilding,
    providerSessionStopping,
    providerSessionStopRequested,
  ])
  const generationProgressViewState = useMemo(() => buildAgentChatGenerationProgressViewState({
    activeRun: activeRun,
    messages,
    timelineItems,
    visibleActivityEvents,
  }), [activeRun, messages, timelineItems, visibleActivityEvents])
  const runInteractionState = useAgentChatRunInteractionState({
    activePlanSnapshot,
    run: activeRun,
    submittedInteractionRuns,
  })
  const { conversationProjection } = useAgentChatConversationProjectionState({
    activeRun: activeRun,
    buildingSendWorkspace: providerSessionWorkViewState.buildingSendWorkspace,
    inputBlockingLoading: providerSessionWorkViewState.inputBlockingLoading,
    interactionRuns: runInteractionState.interactionRuns,
    messages,
    pendingAssistantState,
    pendingSendWorkspace,
    streamingAssistantMessageId,
    streamingAssistantText,
    timelineItems,
    visibleActivityEvents,
  })
  const composerViewState = useMemo(() => buildAgentChatComposerViewState({
    activePendingInputRequest: runInteractionState.activePendingInputRequest,
    activeRun: activeRun,
    answeringPendingInput: runInteractionState.answeringPendingInput,
    buildingSendWorkspace: providerSessionWorkViewState.buildingSendWorkspace,
    canAnswerPendingInputWithText: runInteractionState.canAnswerPendingInputWithText,
    composerAttachmentCount: composerAttachments.length,
    input,
    inputBlockingLoading: providerSessionWorkViewState.inputBlockingLoading,
    inputPlaceholder,
    messages,
    providerSessionStopRequested,
    uploading,
  }), [
    activeRun,
    providerSessionWorkViewState.buildingSendWorkspace,
    composerAttachments.length,
    input,
    providerSessionWorkViewState.inputBlockingLoading,
    inputPlaceholder,
    messages,
    runInteractionState.activePendingInputRequest,
    runInteractionState.answeringPendingInput,
    runInteractionState.canAnswerPendingInputWithText,
    providerSessionStopRequested,
    uploading,
  ])

  return {
    activeRun,
    conversationProjection,
    ...composerViewState,
    ...generationProgressViewState,
    ...providerSessionWorkViewState,
    ...runInteractionState,
  }
}
