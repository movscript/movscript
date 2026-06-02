import { runTouchesAgentCatalog } from '@/features/agent/application/agentCatalogRun'
import { useAgentPlanActionBindings, type UseAgentPlanActionBindingsInput } from '@/features/agent/presentation/useAgentPlanActionBindings'
import { useAgentRunResultActions, type UseAgentRunResultActionsInput } from '@/features/agent/presentation/useAgentRunResultActions'
import { useAgentRunStopAction, type UseAgentRunStopActionInput } from '@/features/agent/presentation/useAgentRunStopAction'
import { useAgentRunInteractionActionBindings, type UseAgentRunInteractionActionBindingsInput } from '@/features/agent/presentation/useAgentRunInteractionActionBindings'

export interface UseAgentChatActionBindingsInput {
  runResultActions: UseAgentRunResultActionsInput
  runInteractionActions: Omit<UseAgentRunInteractionActionBindingsInput, 'streamFollowUpRun' | 'appendAssistantRunResult' | 'runTouchesAgentCatalog'>
  planActions: UseAgentPlanActionBindingsInput
  stopAction: Omit<UseAgentRunStopActionInput, 'appendAssistantRunResult'>
}

export function useAgentChatActionBindings({
  runResultActions,
  runInteractionActions,
  planActions,
  stopAction,
}: UseAgentChatActionBindingsInput) {
  const {
    appendAssistantRunResult,
    streamFollowUpRun,
  } = useAgentRunResultActions(runResultActions)

  const runInteraction = useAgentRunInteractionActionBindings({
    ...runInteractionActions,
    streamFollowUpRun,
    appendAssistantRunResult,
    runTouchesAgentCatalog,
  })

  const taskGraph = useAgentPlanActionBindings(planActions)

  const stopActiveLocalRun = useAgentRunStopAction({
    ...stopAction,
    appendAssistantRunResult,
  })

  return {
    appendAssistantRunResult,
    stopActiveLocalRun,
    ...runInteraction,
    ...taskGraph,
  }
}
