import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'
import type { ChatRunActivity } from '@/features/agent/state/agentStore'
import { isAgentRunTerminalStatus } from '@movscript/core/agent/protocol'

export function hasAgentAsyncWorkHandoffActivity(input: {
  activity?: ChatRunActivity
}): boolean {
  const activity = input.activity
  if (!activity) return false
  return hasAsyncWorkStart(activity)
}

export function isAgentAsyncWorkHandoffRun(run: AgentRun | null | undefined): boolean {
  if (!run || !isAgentRunTerminalStatus(run.status)) return false
  return run.steps.some((step) => step.type === 'tool_call' && step.toolName === 'core_work_start')
}

function hasAsyncWorkStart(activity: ChatRunActivity): boolean {
  const step = [...(activity.steps ?? [])].reverse().find((item) => item.type === 'tool_call' && item.toolName === 'core_work_start')
  const event = [...(activity.events ?? [])].reverse().find((item) => item.kind === 'tool_call' && item.toolName === 'core_work_start')
  return !!step || !!event
}
