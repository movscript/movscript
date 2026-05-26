import { useAgentChatActionBindings, type UseAgentChatActionBindingsInput } from '@/features/agent/presentation/useAgentChatActionBindings'
import { useAgentChatSendPipeline, type UseAgentChatSendPipelineInput } from '@/features/agent/presentation/useAgentChatSendPipeline'

export interface UseAgentChatInteractionControllerInput {
  actionBindings: UseAgentChatActionBindingsInput
  sendPipeline: Omit<UseAgentChatSendPipelineInput, 'commitDraft' | 'sendActions'> & {
    commitDraft: Omit<UseAgentChatSendPipelineInput['commitDraft'], 'appendAssistantRunResult'>
    sendActions: Omit<UseAgentChatSendPipelineInput['sendActions'], 'answerActiveLocalRunInput'>
  }
}

export function useAgentChatInteractionController({
  actionBindings,
  sendPipeline,
}: UseAgentChatInteractionControllerInput) {
  const actions = useAgentChatActionBindings(actionBindings)
  const send = useAgentChatSendPipeline({
    ...sendPipeline,
    commitDraft: {
      ...sendPipeline.commitDraft,
      appendAssistantRunResult: actions.appendAssistantRunResult,
    },
    sendActions: {
      ...sendPipeline.sendActions,
      answerActiveLocalRunInput: actions.answerActiveLocalRunInput,
    },
  })

  return {
    ...actions,
    ...send,
  }
}
