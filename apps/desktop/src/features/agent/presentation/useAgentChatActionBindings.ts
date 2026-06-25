import { useAgentPlanActionBindings, type UseAgentPlanActionBindingsInput } from '@/features/agent/presentation/useAgentPlanActionBindings'
import { useAgentRunResultActions, type UseAgentRunResultActionsInput } from '@/features/agent/presentation/useAgentRunResultActions'
import { useAgentRunStopAction, type UseAgentRunStopActionInput } from '@/features/agent/presentation/useAgentRunStopAction'
import { useAgentRunInteractionActionBindings, type UseAgentRunInteractionActionBindingsInput } from '@/features/agent/presentation/useAgentRunInteractionActionBindings'

export interface UseAgentChatActionBindingsInput {
  runResultActions: UseAgentRunResultActionsInput
  runInteractionActions: Omit<UseAgentRunInteractionActionBindingsInput, 'streamFollowUpRun'>
  planActions: UseAgentPlanActionBindingsInput
  stopAction: UseAgentRunStopActionInput
}

export function useAgentChatActionBindings({
  runResultActions,
  runInteractionActions,
  planActions,
  stopAction,
}: UseAgentChatActionBindingsInput) {
  const { streamFollowUpRun } = useAgentRunResultActions(runResultActions)

  const runInteraction = useAgentRunInteractionActionBindings({
    ...runInteractionActions,
    streamFollowUpRun,
  })

  const taskGraph = useAgentPlanActionBindings(planActions)

  const stopActiveRun = useAgentRunStopAction(stopAction)

  return {
    stopActiveRun,
    ...runInteraction,
    ...taskGraph,
  }
}
