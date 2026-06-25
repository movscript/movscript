import type { AgentChatThreadItem } from '@movscript/agent-chat'
import {
  AgentChatAgentMessageItem,
  AgentChatCollabAgentToolCallItem,
  AgentChatCommandExecutionItem,
  AgentChatFileChangeItem,
  AgentChatHookPromptItem,
  AgentChatImageItem,
  AgentChatPlanItem,
  AgentChatReasoningItem,
  AgentChatSystemItem,
  AgentChatToolCallItem,
  AgentChatUserMessageItem,
  AgentChatWebSearchItem,
} from '@/features/agent/components/agent-chat-items/AgentChatNeutralItemRenderers'

export function AgentChatThreadItemView({ item, streaming }: { item: AgentChatThreadItem; streaming?: boolean }) {
  switch (item.type) {
    case 'userMessage':
      return <AgentChatUserMessageItem item={item} />
    case 'hookPrompt':
      return <AgentChatHookPromptItem item={item} />
    case 'agentMessage':
      return <AgentChatAgentMessageItem item={item} streaming={streaming} />
    case 'reasoning':
      return <AgentChatReasoningItem item={item} />
    case 'plan':
      return <AgentChatPlanItem item={item} />
    case 'commandExecution':
      return <AgentChatCommandExecutionItem item={item} />
    case 'fileChange':
      return <AgentChatFileChangeItem item={item} />
    case 'mcpToolCall':
    case 'dynamicToolCall':
      return <AgentChatToolCallItem item={item} />
    case 'collabAgentToolCall':
      return <AgentChatCollabAgentToolCallItem item={item} />
    case 'webSearch':
      return <AgentChatWebSearchItem item={item} />
    case 'imageView':
    case 'imageGeneration':
      return <AgentChatImageItem item={item} />
    case 'reviewMode':
    case 'systemNotice':
    case 'approvalReview':
    case 'contextCompaction':
    case 'unknown':
      return <AgentChatSystemItem item={item} />
    default:
      return assertNeverAgentChatThreadItem(item)
  }
}

function assertNeverAgentChatThreadItem(item: never): null {
  throw new Error(`Unhandled AgentChatThreadItem type: ${String((item as { type?: unknown }).type)}`)
}
