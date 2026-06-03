import type { GenerationProgressState } from '@/features/agent/domain/agentGenerationMedia'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export type AgentConversationBlock =
  | { id: 'assistant-stream'; type: 'assistant_stream'; content: string }
  | { id: string; type: 'generation_progress'; state: GenerationProgressState }
  | { id: 'live-run-activity'; type: 'live_run_activity'; run: AgentRun | null; events: ChatRunActivityEvent[] }
  | { id: 'thinking'; type: 'thinking' }

export interface AgentConversationPresentationInput {
  streamingAssistantMessageId?: string | null
  streamingAssistantText: string
  pendingSendWorkspace?: unknown
  loading?: boolean
  buildingSendWorkspace?: boolean
  hasPendingAssistantState?: boolean
  activeRunHasActivityMessage?: boolean
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

  const blockedByWorkspace = !!input.pendingSendWorkspace
  const runIsNonTerminal = !!input.activeRun && !isTerminalAgentRunStatus(input.activeRun.status)
  const terminalRunNeedsResultBridge = !!input.activeRun
    && isTerminalAgentRunStatus(input.activeRun.status)
    && !input.activeRunHasActivityMessage
  const busy = !!input.loading || !!input.buildingSendWorkspace
  const showLiveRunActivity = !blockedByWorkspace
    && (busy || runIsNonTerminal || terminalRunNeedsResultBridge)
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

  const showThinking = !showLiveRunActivity
    && (busy || !!input.hasPendingAssistantState)
    && !blockedByWorkspace
  if (showThinking) {
    const block: AgentConversationBlock = { id: 'thinking', type: 'thinking' }
    blocks.push(block)
  }

  if (streamingText) {
    blocks.push({ id: 'assistant-stream', type: 'assistant_stream', content: input.streamingAssistantText })
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
