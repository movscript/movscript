export type AgentMessageRole = 'system' | 'user' | 'assistant'
export type AgentRunStatus = 'queued' | 'in_progress' | 'requires_action' | 'completed' | 'completed_with_warnings' | 'failed' | 'cancelled'
export const AGENT_RUN_TERMINAL_STATUSES = ['completed', 'completed_with_warnings', 'failed', 'cancelled'] as const satisfies readonly AgentRunStatus[]
export const AGENT_RUN_STREAM_SETTLED_STATUSES = [...AGENT_RUN_TERMINAL_STATUSES, 'requires_action'] as const satisfies readonly AgentRunStatus[]
export const AGENT_RUN_STOPPABLE_STATUSES = ['queued', 'in_progress', 'requires_action'] as const satisfies readonly AgentRunStatus[]
export type AgentThreadStatus = 'idle' | 'running' | 'requires_action' | 'completed' | 'failed' | 'cancelled'
export type AgentConversationLifecycle = 'provisional' | 'active' | 'abandoned'
export type AgentStepStatus = 'in_progress' | 'completed' | 'failed'
export type AgentRunRole = 'planner' | 'worker'
export type AgentThreadRole = 'root' | 'planner' | 'worker'
export type AgentRunExecutionMode = 'standard' | 'compact' | 'deep'

export function isAgentRunTerminalStatus(status: AgentRunStatus | undefined): boolean {
  return !!status && (AGENT_RUN_TERMINAL_STATUSES as readonly string[]).includes(status)
}

export function isAgentRunStreamSettledStatus(status: AgentRunStatus | undefined): boolean {
  return !!status && (AGENT_RUN_STREAM_SETTLED_STATUSES as readonly string[]).includes(status)
}

export function isAgentRunStoppableStatus(status: AgentRunStatus | undefined): boolean {
  return !!status && (AGENT_RUN_STOPPABLE_STATUSES as readonly string[]).includes(status)
}
