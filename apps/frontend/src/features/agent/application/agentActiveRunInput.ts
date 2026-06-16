import { providerSessionClient, type ProviderSessionClientInput, type AgentRun } from '@/shared/infrastructure/providerSessionClient'
import { notifyAgentTimelineAcceptedSource } from '@/features/agent/application/agentTimelineBridge'
import { resolveAgentAttachmentDataUrl } from '@/features/agent/application/agentAttachmentDataUrl'
import { prepareProviderSessionAttachmentRefs } from '@movscript/core/agent'
import type { AgentAttachment } from '@/features/agent/state/agentStore'

export interface SendActiveRunInputDeps {
  conversationId: string
  movScriptHomeDir?: string
  /** @deprecated Use movScriptHomeDir for the desktop control/home directory. */
  workspaceDir?: string
  sessionId?: string
  run: AgentRun
  setConversationRun: (conversationId: string, run: AgentRun, patch?: { loading?: boolean; building?: boolean; error?: string }) => void
  updateConversationRuntimeState: (conversationId: string, patch: { loading?: boolean; building?: boolean; error?: string }) => void
}

export async function sendActiveRunInput(input: {
  content: string
  attachments?: AgentAttachment[]
  deps: SendActiveRunInputDeps
}): Promise<void> {
  const attachments = await resolveActiveRunInputAttachmentRefs(input.attachments ?? [])
  const content = input.content.trim()
  if (!content && attachments.length === 0) return
  const sessionId = input.deps.sessionId?.trim()
  if (!sessionId) {
    throw new Error('active run input requires a provider session')
  }
  const providerSessionRunClient = providerSessionClient.forSession({
    sessionId,
    ...(input.deps.movScriptHomeDir?.trim() || input.deps.workspaceDir?.trim()
      ? {
          movScriptHomeDir: input.deps.movScriptHomeDir?.trim() || input.deps.workspaceDir?.trim(),
          workspaceDir: input.deps.movScriptHomeDir?.trim() || input.deps.workspaceDir?.trim(),
        }
      : {}),
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
          ? { attachments }
          : {}),
      } satisfies ProviderSessionClientInput,
    } as const
    const result = await providerSessionRunClient.createSessionMessageRun(sessionId, messageRunInput)
    notifyAgentTimelineAcceptedSource(result.message, result.run)
    input.deps.setConversationRun(input.deps.conversationId, result.run, { loading: true, building: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    input.deps.updateConversationRuntimeState(input.deps.conversationId, { loading: true, building: false, error: message })
    throw error
  }
}

async function resolveActiveRunInputAttachmentRefs(attachments: AgentAttachment[]): Promise<NonNullable<ProviderSessionClientInput['attachments']>> {
  return prepareProviderSessionAttachmentRefs(attachments, {
    resolver: {
      resolveDataUrl: ({ attachment }) => resolveAgentAttachmentDataUrl(attachment),
    },
  })
}

function sourceMessageIdForActiveRunInput(runId: string): string {
  return `active-run-input:${runId}:${Date.now().toString(36)}`
}
