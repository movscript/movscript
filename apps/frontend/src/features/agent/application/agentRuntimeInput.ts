import { sendRuntimeInputMessage, type AgentConversationMessageStore } from '@movscript/conversation'
import { localAgentClient, type AgentClientInput, type AgentRun } from '@/shared/infrastructure/localAgentClient'
import { resolveAgentAttachmentDataUrl } from '@/features/agent/application/agentAttachmentDataUrl'
import type { AgentAttachment, ChatMessage, ChatMessageMeta } from '@/features/agent/state/agentStore'

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
  const attachments = await resolveRuntimeInputAttachments(input.attachments ?? [])
  await sendRuntimeInputMessage<ChatMessage, ChatMessageMeta, AgentRun, AgentClientInput>({
    content: input.content,
    attachments,
    clientInput: {
      message: input.content,
      ...(attachments.length > 0
        ? { attachments: attachments.map(agentAttachmentToClientInputRef) }
        : {}),
    },
    deps: {
      ...input.deps,
      createMessageRun: (threadId, request) => localAgentClient.createMessageRun(threadId, request),
    },
  })
}

async function resolveRuntimeInputAttachments(attachments: AgentAttachment[]): Promise<AgentAttachment[]> {
  return Promise.all(attachments.map(async (attachment) => {
    if (attachment.dataUrl || attachment.type !== 'image' || !attachment.resourceId) return attachment
    let dataUrl: string | undefined
    try {
      dataUrl = await resolveAgentAttachmentDataUrl(attachment)
    } catch {
      dataUrl = undefined
    }
    return dataUrl ? { ...attachment, dataUrl } : attachment
  }))
}

function agentAttachmentToClientInputRef(attachment: AgentAttachment) {
  return {
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    mimeType: attachment.mimeType,
    size: attachment.size,
    ...(attachment.resourceId ? { resourceId: attachment.resourceId } : {}),
    ...(attachment.dataUrl ? { dataUrl: attachment.dataUrl } : {}),
  }
}
