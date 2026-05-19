import type { UseAgentChatInteractionControllerInput } from '@/components/agent/useAgentChatInteractionController'
import { buildAgentChatActionBindingsInput } from '@/components/agent/agentChatActionInputs'
import type { BuildAgentChatInteractionControllerInputOptions } from '@/components/agent/agentChatInteractionInputTypes'
import { buildAgentChatSendPipelineInput } from '@/components/agent/agentChatSendPipelineInputs'

export { buildAgentChatActionBindingsInput } from '@/components/agent/agentChatActionInputs'
export { buildAgentChatSendPipelineInput } from '@/components/agent/agentChatSendPipelineInputs'

export function buildAgentChatInteractionControllerInput(
  options: BuildAgentChatInteractionControllerInputOptions,
): UseAgentChatInteractionControllerInput {
  return {
    actionBindings: buildAgentChatActionBindingsInput(options),
    sendPipeline: buildAgentChatSendPipelineInput(options),
  }
}
