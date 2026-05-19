import { runTouchesAgentCatalog } from '@/lib/agentCatalogRun'
import { useAgentPlanActionBindings, type UseAgentPlanActionBindingsInput } from '@/components/agent/useAgentPlanActionBindings'
import { useAgentRunResultActions, type UseAgentRunResultActionsInput } from '@/components/agent/useAgentRunResultActions'
import { useAgentRunStopAction, type UseAgentRunStopActionInput } from '@/components/agent/useAgentRunStopAction'
import { useAgentWorkflowActionBindings, type UseAgentWorkflowActionBindingsInput } from '@/components/agent/useAgentWorkflowActionBindings'

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

  const plan = useAgentPlanActionBindings(planActions)

  const stopActiveLocalRun = useAgentRunStopAction({
    ...stopAction,
    appendAssistantRunResult,
  })

  return {
    appendAssistantRunResult,
    stopActiveLocalRun,
    ...workflow,
    ...plan,
  }
}
