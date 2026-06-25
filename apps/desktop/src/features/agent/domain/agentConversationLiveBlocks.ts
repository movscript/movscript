import type { AgentRun } from '@movscript/agent-protocol'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import { isAgentRunTerminalStatus } from '@movscript/agent-protocol'

export type AgentConversationLiveBlock =
  | { id: 'assistant-stream'; type: 'assistant_stream'; content: string }
  | { id: 'live-run-activity'; type: 'live_run_activity'; run: AgentRun | null; events: ChatRunActivityEvent[] }
  | { id: 'thinking'; type: 'thinking' }

export interface AgentConversationLiveBlocksInput {
  streamingAssistantMessageId?: string | null
  streamingAssistantText: string
  pendingSendWorkspace?: unknown
  loading?: boolean
  buildingSendWorkspace?: boolean
  hasPendingAssistantState?: boolean
  activeRunHasActivityMessage?: boolean
  activeRun: AgentRun | null
  visibleActivityEvents: ChatRunActivityEvent[]
}

export interface AgentConversationLiveBlocks {
  blocks: AgentConversationLiveBlock[]
  hasStreamingAssistantContent: boolean
  primaryLiveBlock?: AgentConversationLiveBlock
}

export function buildAgentConversationLiveBlocks(input: AgentConversationLiveBlocksInput): AgentConversationLiveBlocks {
  const hasStreamingAssistantContent = !!input.streamingAssistantMessageId || !!input.streamingAssistantText.trim()
  const blocks: AgentConversationLiveBlock[] = []
  const streamingText = input.streamingAssistantText.trim()

  const blockedByWorkspace = !!input.pendingSendWorkspace
  const runIsNonTerminal = !!input.activeRun && !isAgentRunTerminalStatus(input.activeRun.status)
  const terminalRunNeedsResultBridge = !!input.activeRun
    && isAgentRunTerminalStatus(input.activeRun.status)
    && !input.activeRunHasActivityMessage
  const busy = !!input.loading || !!input.buildingSendWorkspace
  const showLiveRunActivity = !blockedByWorkspace
    && (busy || runIsNonTerminal || terminalRunNeedsResultBridge)
    && (input.visibleActivityEvents.length > 0 || !!input.activeRun)
  if (showLiveRunActivity) {
    const block: AgentConversationLiveBlock = {
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
    const block: AgentConversationLiveBlock = { id: 'thinking', type: 'thinking' }
    blocks.push(block)
  }

  if (streamingText) {
    blocks.push({ id: 'assistant-stream', type: 'assistant_stream', content: input.streamingAssistantText })
  }

  return {
    blocks,
    hasStreamingAssistantContent,
    primaryLiveBlock: blocks.find((block) => block.type !== 'assistant_stream'),
  }
}
