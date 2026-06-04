import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatRunActivity } from '@/features/agent/state/agentStore'
import { isTerminalAgentRunStatus } from '@/features/agent/domain/agentRunControl'

export function hasRuntimeAsyncWorkHandoffActivity(input: {
  activity?: ChatRunActivity
}): boolean {
  const activity = input.activity
  if (!activity) return false
  return hasAsyncWorkStart(activity)
}

export function isRuntimeAsyncWorkHandoffRun(run: AgentRun | null | undefined): boolean {
  if (!run || !isTerminalAgentRunStatus(run.status)) return false
  return run.steps.some((step) => step.type === 'tool_call' && step.toolName === 'core_work_start')
}

function hasAsyncWorkStart(activity: ChatRunActivity): boolean {
  const step = [...(activity.steps ?? [])].reverse().find((item) => item.type === 'tool_call' && item.toolName === 'core_work_start')
  const event = [...(activity.events ?? [])].reverse().find((item) => item.kind === 'tool_call' && item.toolName === 'core_work_start')
  return !!step || !!event
}
