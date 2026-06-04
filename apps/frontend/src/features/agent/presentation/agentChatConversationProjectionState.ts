import { buildAgentConversationProjection } from '@/features/agent/domain/agentConversationProjection'
import type {
  AgentConversationProjection,
} from '@/features/agent/domain/agentConversationProjectionTypes'
import { buildAgentConversationLiveBlocks } from '@/features/agent/domain/agentConversationLiveBlocks'
import { buildAgentConversationProjectionRunInteractions } from '@/features/agent/domain/agentConversationProjectionRunInteractions'
import { visibleStreamingAssistantTextForTranscript } from '@/features/agent/domain/agentMessageBoundaries'
import { filterActivityEventsForRun, timelineItemsContainRunActivity } from '@/features/agent/domain/agentTimelineActivityItems'
import { getAgentThinkingState, type AgentThinkingState } from '@/features/agent/domain/agentThinkingState'
import type { AgentRun, AgentTimelineItem } from '@/shared/infrastructure/localAgentClient'
import type { ChatMessage, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export interface AgentChatConversationProjectionStateInput {
  activeRun: AgentRun | null
  buildingSendWorkspace: boolean
  inputBlockingLoading: boolean
  interactionRuns: AgentRun[]
  messages: ChatMessage[]
  pendingAssistantState: AgentThinkingState | null
  pendingSendWorkspace: unknown
  streamingAssistantMessageId?: string | null
  streamingAssistantText: string
  timelineItems: AgentTimelineItem[]
  visibleActivityEvents: ChatRunActivityEvent[]
}

export interface AgentChatConversationProjectionState {
  conversationProjection: AgentConversationProjection
}

export function buildAgentChatConversationProjectionState(input: AgentChatConversationProjectionStateInput): AgentChatConversationProjectionState {
  const activeRunVisibleActivityEvents = filterActivityEventsForRun(input.visibleActivityEvents, input.activeRun?.id)
  const thinkingState = input.pendingAssistantState ?? getAgentThinkingState(input.activeRun, activeRunVisibleActivityEvents)
  const activeRunHasActivityMessage = input.activeRun
    ? timelineItemsContainRunActivity(input.timelineItems, input.activeRun.id)
    : false
  const visibleStreamingAssistantText = visibleStreamingAssistantTextForTranscript({
    transcriptMessages: input.messages,
    streamingAssistantMessageId: input.streamingAssistantMessageId,
    streamingAssistantText: input.streamingAssistantText,
  })
  const runInteractions = buildAgentConversationProjectionRunInteractions({
    interactionRuns: input.interactionRuns,
    messages: input.messages,
    timelineItems: input.timelineItems,
  })
  const conversationLiveBlocks = buildAgentConversationLiveBlocks({
    streamingAssistantMessageId: input.streamingAssistantMessageId,
    streamingAssistantText: visibleStreamingAssistantText,
    pendingSendWorkspace: input.pendingSendWorkspace,
    loading: input.inputBlockingLoading,
    buildingSendWorkspace: input.buildingSendWorkspace,
    hasPendingAssistantState: !!input.pendingAssistantState,
    activeRunHasActivityMessage,
    activeRun: input.activeRun,
    visibleActivityEvents: activeRunVisibleActivityEvents,
  })

  return {
    conversationProjection: buildAgentConversationProjection({
      activeRun: input.activeRun,
      liveBlocks: conversationLiveBlocks.blocks,
      runInteractions,
      thinkingState,
      timelineItems: input.timelineItems,
      transcriptMessages: input.messages,
    }),
  }
}
