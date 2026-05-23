import { sendRuntimeInputMessage, type AgentConversationMessageStore } from '@movscript/conversation'
import { localAgentClient, type AgentRun } from '@/lib/localAgentClient'
import type { AgentAttachment, ChatMessage, ChatMessageMeta } from '@/store/agentStore'

export interface SendActiveRunRuntimeInputDeps {
  userId: string
  conversationId: string
  threadId: string
  run: AgentRun
  messageStore: Pick<AgentConversationMessageStore<ChatMessage, ChatMessageMeta>, 'addMessage' | 'updateMessageMeta'>
  setConversationRun: (conversationId: string, run: AgentRun, patch?: { loading?: boolean; building?: boolean; error?: string }) => void
  setConversationRuntime: (conversationId: string, patch: { loading?: boolean; building?: boolean; error?: string }) => void
}

export async function sendActiveRunRuntimeInput(input: {
  content: string
  attachments?: AgentAttachment[]
  deps: SendActiveRunRuntimeInputDeps
}): Promise<void> {
  await sendRuntimeInputMessage<ChatMessage, ChatMessageMeta, AgentRun>({
    content: input.content,
    attachments: input.attachments,
    deps: {
      ...input.deps,
      createMessageRun: (threadId, request) => localAgentClient.createMessageRun(threadId, request),
    },
  })
}
