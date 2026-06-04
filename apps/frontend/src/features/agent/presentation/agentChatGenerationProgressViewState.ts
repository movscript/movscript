import { generationProgressStatesForPinnedStatus } from '@/features/agent/domain/agentPinnedStatus'
import type { GenerationProgressState } from '@/features/agent/domain/agentGenerationMedia'
import type { AgentRun, AgentTimelineItem } from '@/shared/infrastructure/localAgentClient'
import type { ChatMessage, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export interface AgentChatGenerationProgressViewStateInput {
  activeRun: AgentRun | null
  messages: ChatMessage[]
  timelineItems: AgentTimelineItem[]
  visibleActivityEvents: ChatRunActivityEvent[]
}

export interface AgentChatGenerationProgressViewState {
  generationProgressKey?: string
  generationProgressState: GenerationProgressState | null
  generationProgressStates: GenerationProgressState[]
}

export function buildAgentChatGenerationProgressViewState(input: AgentChatGenerationProgressViewStateInput): AgentChatGenerationProgressViewState {
  const generationProgressStates = generationProgressStatesForPinnedStatus({
    messages: input.messages,
    run: input.activeRun,
    timelineItems: input.timelineItems,
    visibleActivityEvents: input.visibleActivityEvents,
  })
  const generationProgressState = generationProgressStates.at(-1) ?? null

  return {
    generationProgressKey: generationProgressState ? generationProgressScrollKey(generationProgressState) : undefined,
    generationProgressState,
    generationProgressStates,
  }
}

function generationProgressScrollKey(state: GenerationProgressState): string {
  return `${state.jobId ?? ''}:${state.outputResourceId ?? ''}:${state.status}:${state.stage ?? ''}`
}
