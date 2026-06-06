import { useAgentChatActionBindings, type UseAgentChatActionBindingsInput } from '@/features/agent/presentation/useAgentChatActionBindings'
import { useAgentChatSendPipeline, type UseAgentChatSendPipelineInput } from '@/features/agent/presentation/useAgentChatSendPipeline'

export interface UseAgentChatInteractionControllerInput {
  actionBindings: UseAgentChatActionBindingsInput
  sendPipeline: Omit<UseAgentChatSendPipelineInput, 'commitWorkspace' | 'sendActions'> & {
    commitWorkspace: UseAgentChatSendPipelineInput['commitWorkspace']
    sendActions: Omit<UseAgentChatSendPipelineInput['sendActions'], 'answerActiveRunInput'>
  }
}

export function useAgentChatInteractionController({
  actionBindings,
  sendPipeline,
}: UseAgentChatInteractionControllerInput) {
  const actions = useAgentChatActionBindings(actionBindings)
  const send = useAgentChatSendPipeline({
    ...sendPipeline,
    sendActions: {
      ...sendPipeline.sendActions,
      answerActiveRunInput: actions.answerActiveRunInput,
    },
  })

  return {
    ...actions,
    ...send,
  }
}
