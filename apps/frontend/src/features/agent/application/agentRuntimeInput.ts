import { sendRuntimeInputMessage, type AgentConversationMessageStore } from '@movscript/conversation'
import { localAgentClient, type AgentClientInput, type AgentRun } from '@/shared/infrastructure/localAgentClient'
import { blobToDataURL, loadResourceFileBlob } from '@/shared/ui/resourceBlob'
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
    const dataUrl = await resolveAttachmentDataUrl(attachment)
    return dataUrl ? { ...attachment, dataUrl } : attachment
  }))
}

async function resolveAttachmentDataUrl(attachment: AgentAttachment): Promise<string | undefined> {
  if (!attachment.resourceId) return undefined
  return blobToDataURL(await loadResourceFileBlob(attachment.resourceId))
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
