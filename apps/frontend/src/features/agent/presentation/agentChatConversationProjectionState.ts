import { startTransition, useEffect, useRef, useState } from 'react'
import { buildAgentConversationProjection } from '@/features/agent/domain/agentConversationProjection'
import type {
  AgentConversationProjection,
} from '@/features/agent/domain/agentConversationProjectionTypes'
import { buildAgentConversationLiveBlocks } from '@/features/agent/domain/agentConversationLiveBlocks'
import { buildAgentConversationProjectionRunInteractions } from '@/features/agent/domain/agentConversationProjectionRunInteractions'
import { visibleStreamingAssistantTextForTranscript } from '@/features/agent/domain/agentMessageBoundaries'
import { filterActivityEventsForRun, timelineItemsContainRunActivity } from '@/features/agent/domain/agentTimelineActivityItems'
import { getAgentThinkingState, type AgentThinkingState } from '@/features/agent/domain/agentThinkingState'
import type { AgentRun, AgentTimelineItem } from '@/shared/infrastructure/providerSessionClient'
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

const EMPTY_AGENT_CHAT_CONVERSATION_PROJECTION_STATE: AgentChatConversationProjectionState = {
  conversationProjection: { items: [] },
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

export function useAgentChatConversationProjectionState(input: AgentChatConversationProjectionStateInput): AgentChatConversationProjectionState {
  const [state, setState] = useState<AgentChatConversationProjectionState>(EMPTY_AGENT_CHAT_CONVERSATION_PROJECTION_STATE)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    let cancelled = false

    const cancelSchedule = scheduleAgentConversationProjectionCompute(() => {
      if (cancelled || requestId !== requestIdRef.current) return
      const nextState = buildAgentChatConversationProjectionState(input)
      if (cancelled || requestId !== requestIdRef.current) return
      startTransition(() => {
        if (!cancelled && requestId === requestIdRef.current) setState(nextState)
      })
    })

    return () => {
      cancelled = true
      cancelSchedule()
    }
  }, [
    input.activeRun,
    input.buildingSendWorkspace,
    input.inputBlockingLoading,
    input.interactionRuns,
    input.messages,
    input.pendingAssistantState,
    input.pendingSendWorkspace,
    input.streamingAssistantMessageId,
    input.streamingAssistantText,
    input.timelineItems,
    input.visibleActivityEvents,
  ])

  return state
}

function scheduleAgentConversationProjectionCompute(callback: () => void): () => void {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, { timeout: 120 })
    return () => window.cancelIdleCallback(handle)
  }
  const handle = globalThis.setTimeout(callback, 0)
  return () => globalThis.clearTimeout(handle)
}
