import type { UseAgentChatInteractionControllerInput } from '@/features/agent/presentation/useAgentChatInteractionController'
import { buildAgentChatActionBindingsInput } from '@/features/agent/presentation/agentChatActionInputs'
import type { BuildAgentChatInteractionControllerInputOptions } from '@/features/agent/presentation/agentChatInteractionInputTypes'
import { buildAgentChatSendPipelineInput } from '@/features/agent/presentation/agentChatSendPipelineInputs'

export { buildAgentChatActionBindingsInput } from '@/features/agent/presentation/agentChatActionInputs'
export { buildAgentChatSendPipelineInput } from '@/features/agent/presentation/agentChatSendPipelineInputs'

export function buildAgentChatInteractionControllerInput(
  options: BuildAgentChatInteractionControllerInputOptions,
): UseAgentChatInteractionControllerInput {
  return {
    actionBindings: buildAgentChatActionBindingsInput(options),
    sendPipeline: buildAgentChatSendPipelineInput(options),
  }
}
