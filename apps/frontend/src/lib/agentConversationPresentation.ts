import type { GenerationProgressState } from '@/lib/agentGenerationMedia'
import type { AgentRun } from '@/lib/localAgentClient'
import type { ChatRunActivityEvent } from '@/store/agentStore'

export type AgentConversationBlock =
  | { id: 'assistant-stream'; type: 'assistant_stream'; content: string }
  | { id: string; type: 'generation_progress'; state: GenerationProgressState }
  | { id: 'live-run-activity'; type: 'live_run_activity'; run: AgentRun | null; events: ChatRunActivityEvent[] }
  | { id: 'thinking'; type: 'thinking' }

export interface AgentConversationPresentationInput {
  streamingAssistantMessageId?: string | null
  streamingAssistantText: string
  pendingSendDraft?: unknown
  loading?: boolean
  buildingSendDraft?: boolean
  hasPendingAssistantState?: boolean
  activeRun: AgentRun | null
  visibleActivityEvents: ChatRunActivityEvent[]
  generationProgressStates?: GenerationProgressState[]
  generationProgressState: GenerationProgressState | null
}

export interface AgentConversationPresentation {
  blocks: AgentConversationBlock[]
  hasStreamingAssistantContent: boolean
  liveBlock?: AgentConversationBlock
}

export function buildAgentConversationPresentation(input: AgentConversationPresentationInput): AgentConversationPresentation {
  const hasStreamingAssistantContent = !!input.streamingAssistantMessageId || !!input.streamingAssistantText.trim()
  const blocks: AgentConversationBlock[] = []
  const streamingText = input.streamingAssistantText.trim()
  if (streamingText) {
    blocks.push({ id: 'assistant-stream', type: 'assistant_stream', content: input.streamingAssistantText })
  }

  const blockedByDraft = !!input.pendingSendDraft
  const runIsNonTerminal = !!input.activeRun && !isTerminalAgentRunStatus(input.activeRun.status)
  const runIsActivelyGenerating = input.activeRun?.status === 'in_progress' || input.activeRun?.status === 'queued'
  const busy = !!input.loading || !!input.buildingSendDraft
  const generationProgressStates = input.generationProgressStates ?? (input.generationProgressState ? [input.generationProgressState] : [])
  const showGenerationProgress = generationProgressStates.length > 0
    && (busy || runIsActivelyGenerating)
    && !blockedByDraft
  if (showGenerationProgress) {
    blocks.push(...generationProgressStates.map((state) => ({
      id: generationProgressBlockId(state),
      type: 'generation_progress' as const,
      state,
    })))
  }

  const showLiveRunActivity = !blockedByDraft
    && (busy || runIsNonTerminal)
    && (input.visibleActivityEvents.length > 0 || !!input.activeRun)
  if (showLiveRunActivity) {
    const block: AgentConversationBlock = {
      id: 'live-run-activity',
      type: 'live_run_activity',
      run: input.activeRun,
      events: input.visibleActivityEvents,
    }
    blocks.push(block)
  }

  const showThinking = blocks.length === 0
    && (busy || !!input.hasPendingAssistantState)
    && !blockedByDraft
  if (showThinking) {
    const block: AgentConversationBlock = { id: 'thinking', type: 'thinking' }
    blocks.push(block)
  }

  return {
    blocks,
    hasStreamingAssistantContent,
    liveBlock: blocks.find((block) => block.type !== 'assistant_stream'),
  }
}

function isTerminalAgentRunStatus(status: AgentRun['status'] | undefined): boolean {
  return status === 'completed' || status === 'completed_with_warnings' || status === 'failed' || status === 'cancelled'
}

function generationProgressBlockId(state: GenerationProgressState): string {
  if (state.jobId !== undefined) return `generation-progress-job-${state.jobId}`
  if (state.outputResourceId !== undefined) return `generation-progress-resource-${state.outputResourceId}`
  return `generation-progress-${state.status}-${state.stage ?? 'unknown'}`
}
