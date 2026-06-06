import { providerSessionClient, type ProviderSessionClientInput, type AgentRun } from '@/shared/infrastructure/providerSessionClient'
import { notifyAgentTimelineAcceptedSource } from '@/features/agent/application/agentTimelineBridge'
import { resolveAgentAttachmentDataUrl } from '@/features/agent/application/agentAttachmentDataUrl'
import type { AgentAttachment } from '@/features/agent/state/agentStore'

export interface SendActiveRunInputDeps {
  conversationId: string
  workspaceDir?: string
  sessionId?: string
  run: AgentRun
  setConversationRun: (conversationId: string, run: AgentRun, patch?: { loading?: boolean; building?: boolean; error?: string }) => void
  setConversationProviderSessionState: (conversationId: string, patch: { loading?: boolean; building?: boolean; error?: string }) => void
}

export async function sendActiveRunInput(input: {
  content: string
  attachments?: AgentAttachment[]
  deps: SendActiveRunInputDeps
}): Promise<void> {
  const attachments = await resolveActiveRunInputAttachments(input.attachments ?? [])
  const content = input.content.trim()
  if (!content && attachments.length === 0) return
  const sessionId = input.deps.sessionId?.trim()
  if (!sessionId) {
    throw new Error('active run input requires a provider session')
  }
  const providerSessionRunClient = providerSessionClient.forSession({
    sessionId,
    ...(input.deps.workspaceDir?.trim() ? { workspaceDir: input.deps.workspaceDir.trim() } : {}),
  })
  try {
    const messageRunInput = {
      message: content,
      sourceMessageId: sourceMessageIdForActiveRunInput(input.deps.run.id),
      activeRunMode: 'runtime_input',
      providerSessionInputMode: 'soft',
      clientInput: {
        message: content,
        ...(attachments.length > 0
          ? { attachments: attachments.map(providerSessionAttachmentToClientInputRef) }
          : {}),
      } satisfies ProviderSessionClientInput,
    } as const
    const result = await providerSessionRunClient.createSessionMessageRun(sessionId, messageRunInput)
    notifyAgentTimelineAcceptedSource(result.message, result.run)
    input.deps.setConversationRun(input.deps.conversationId, result.run, { loading: true, building: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    input.deps.setConversationProviderSessionState(input.deps.conversationId, { loading: true, building: false, error: message })
    throw error
  }
}

async function resolveActiveRunInputAttachments(attachments: AgentAttachment[]): Promise<AgentAttachment[]> {
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

function providerSessionAttachmentToClientInputRef(attachment: AgentAttachment) {
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

function sourceMessageIdForActiveRunInput(runId: string): string {
  return `active-run-input:${runId}:${Date.now().toString(36)}`
}
