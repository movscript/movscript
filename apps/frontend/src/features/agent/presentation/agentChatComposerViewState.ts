import { buildPendingActiveRunInputQueueItems } from '@movscript/core/agent/protocol'
import { isStoppableAgentRun, isTerminalAgentRun } from '@/features/agent/domain/agentRunControl'
import type { AgentPendingInputRequest } from '@/features/agent/domain/agentRunInteraction'
import type { AgentRun } from '@movscript/core/agent/protocol'
import type { ChatMessage } from '@/features/agent/state/agentStore'

export interface AgentChatComposerViewStateInput {
  activePendingInputRequest: AgentPendingInputRequest | null | undefined
  activeRun: AgentRun | null
  answeringPendingInput: boolean
  buildingSendWorkspace: boolean
  canAnswerPendingInputWithText: boolean
  composerAttachmentCount: number
  input: string
  inputBlockingLoading: boolean
  inputPlaceholder: string
  messages: ChatMessage[]
  providerSessionStopRequested: boolean
  uploading: boolean
}

export function buildAgentChatComposerViewState(input: AgentChatComposerViewStateInput) {
  const canSend = (
    input.answeringPendingInput
      ? input.canAnswerPendingInputWithText && !!input.input.trim()
      : (!!input.input.trim() || input.composerAttachmentCount > 0)
  ) && !input.uploading && !input.buildingSendWorkspace
  const hasActiveProviderSessionWork = !isTerminalAgentRun(input.activeRun) && (input.inputBlockingLoading || input.buildingSendWorkspace)
  const canStopActiveRun = !input.answeringPendingInput
    && (isStoppableAgentRun(input.activeRun) || hasActiveProviderSessionWork || input.providerSessionStopRequested)

  return {
    canSend,
    canStopActiveRun,
    composerPlaceholder: composerPlaceholderForPendingInput(input.activePendingInputRequest, input.inputPlaceholder),
    pendingActiveRunInputQueue: buildPendingActiveRunInputQueueItems(input.messages),
  }
}

function composerPlaceholderForPendingInput(
  request: AgentPendingInputRequest | null | undefined,
  fallback: string,
): string {
  if (!request) return fallback
  if (request.inputType !== 'choice') return request.question
  return request.allowCustomAnswer ? '可补充自定义答案' : '请选择上方选项'
}
