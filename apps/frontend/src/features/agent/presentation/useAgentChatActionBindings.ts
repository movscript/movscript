import { runTouchesAgentCatalog } from '@/features/agent/application/agentCatalogRun'
import { useAgentPlanActionBindings, type UseAgentPlanActionBindingsInput } from '@/features/agent/presentation/useAgentPlanActionBindings'
import { useAgentRunResultActions, type UseAgentRunResultActionsInput } from '@/features/agent/presentation/useAgentRunResultActions'
import { useAgentRunStopAction, type UseAgentRunStopActionInput } from '@/features/agent/presentation/useAgentRunStopAction'
import { useAgentWorkflowActionBindings, type UseAgentWorkflowActionBindingsInput } from '@/features/agent/presentation/useAgentWorkflowActionBindings'

export interface UseAgentChatActionBindingsInput {
  runResultActions: UseAgentRunResultActionsInput
  workflowActions: Omit<UseAgentWorkflowActionBindingsInput, 'streamFollowUpRun' | 'appendAssistantRunResult' | 'runTouchesAgentCatalog'>
  planActions: UseAgentPlanActionBindingsInput
  stopAction: Omit<UseAgentRunStopActionInput, 'appendAssistantRunResult'>
}

export function useAgentChatActionBindings({
  runResultActions,
  workflowActions,
  planActions,
  stopAction,
}: UseAgentChatActionBindingsInput) {
  const {
    appendAssistantRunResult,
    streamFollowUpRun,
  } = useAgentRunResultActions(runResultActions)

  const workflow = useAgentWorkflowActionBindings({
    ...workflowActions,
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
    ...workflow,
    ...taskGraph,
  }
}
