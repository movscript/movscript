import type { AgentConversationMessageStore } from '@/lib/agentConversationMessageStore'
import { localAgentClient, type AgentRun } from '@/lib/localAgentClient'
import type { AgentAttachment, ChatMessageMeta } from '@/store/agentStore'

export interface SendActiveRunRuntimeInputDeps {
  userId: string
  conversationId: string
  threadId: string
  run: AgentRun
  messageStore: Pick<AgentConversationMessageStore, 'addMessage' | 'updateMessageMeta'>
  setConversationRun: (conversationId: string, run: AgentRun, patch?: { loading?: boolean; building?: boolean; error?: string }) => void
  setConversationRuntime: (conversationId: string, patch: { loading?: boolean; building?: boolean; error?: string }) => void
}

export async function sendActiveRunRuntimeInput(input: {
  content: string
  attachments?: AgentAttachment[]
  deps: SendActiveRunRuntimeInputDeps
}): Promise<void> {
  const content = input.content.trim()
  if (!content && !(input.attachments && input.attachments.length > 0)) return
  const { deps } = input
  const localMessageId = deps.messageStore.addMessage(deps.userId, deps.conversationId, {
    role: 'user',
    content,
    ...(input.attachments && input.attachments.length > 0 ? { attachments: input.attachments } : {}),
    meta: {
      runtimeInput: {
        threadId: deps.threadId,
        runId: deps.run.id,
        status: 'pending',
      },
    },
  })
  try {
    const result = await localAgentClient.createMessageRun(deps.threadId, {
      message: content,
      activeRunPolicy: 'runtime_input',
      runtimeInputMode: 'soft',
    })
    const runtimeInput = result.runtimeInput
    deps.messageStore.updateMessageMeta(deps.userId, deps.conversationId, localMessageId, {
      runtimeInput: {
        threadId: deps.threadId,
        runId: runtimeInput?.runId ?? result.run.id,
        messageId: runtimeInput?.messageId ?? result.message.id,
        status: runtimeInput?.accepted ? 'accepted' : 'pending',
      },
      runtimeMessage: {
        threadId: deps.threadId,
        messageId: result.message.id,
        runId: result.run.id,
      },
    } satisfies ChatMessageMeta)
    deps.setConversationRun(deps.conversationId, result.run, { loading: true, building: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    deps.messageStore.updateMessageMeta(deps.userId, deps.conversationId, localMessageId, {
      runtimeInput: {
        threadId: deps.threadId,
        runId: deps.run.id,
        status: 'failed',
        error: message,
      },
    })
    deps.setConversationRuntime(deps.conversationId, { loading: true, building: false, error: message })
    throw error
  }
}
