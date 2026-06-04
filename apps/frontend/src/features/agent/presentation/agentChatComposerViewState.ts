import { buildPendingRuntimeInputQueueItems } from '@/features/agent/domain/agentRuntimeInputMessages'
import { isStoppableAgentRun, isTerminalAgentRun } from '@/features/agent/domain/agentRunControl'
import type { AgentPendingInputRequest } from '@/features/agent/domain/agentRunInteraction'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
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
  runtimeStopRequested: boolean
  uploading: boolean
}

export function buildAgentChatComposerViewState(input: AgentChatComposerViewStateInput) {
  const canSend = (
    input.answeringPendingInput
      ? input.canAnswerPendingInputWithText && !!input.input.trim()
      : (!!input.input.trim() || input.composerAttachmentCount > 0)
  ) && !input.uploading && !input.buildingSendWorkspace
  const hasActiveLocalWork = !isTerminalAgentRun(input.activeRun) && (input.inputBlockingLoading || input.buildingSendWorkspace)
  const canStopLocalRun = !input.answeringPendingInput
    && (isStoppableAgentRun(input.activeRun) || hasActiveLocalWork || input.runtimeStopRequested)

  return {
    canSend,
    canStopLocalRun,
    composerPlaceholder: composerPlaceholderForPendingInput(input.activePendingInputRequest, input.inputPlaceholder),
    pendingRuntimeInputQueue: buildPendingRuntimeInputQueueItems(input.messages),
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
