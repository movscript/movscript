import type { AgentMessageRole, AgentRunStep } from '@movscript/protocol'
import type { AgentChatThreadItem } from '@/features/agent/domain/agentChatThreadItems'

export type AgentRuntimeChatMessageRole = AgentMessageRole
export type AgentRuntimeChatRunStepType = AgentRunStep['type']
export type AgentRuntimeChatRunStepStatus = AgentRunStep['status']

export const AGENT_RUNTIME_CHAT_MESSAGE_ROLE_COVERAGE: Record<AgentRuntimeChatMessageRole, {
  neutralItem: Extract<AgentChatThreadItem, { type: 'userMessage' | 'agentMessage' | 'systemNotice' }>['type']
  note: string
}> = {
  user: {
    neutralItem: 'userMessage',
    note: 'Runtime user messages become neutral userMessage items with structured clientInput attachments when present.',
  },
  assistant: {
    neutralItem: 'agentMessage',
    note: 'Runtime assistant messages become neutral agentMessage transcript items.',
  },
  system: {
    neutralItem: 'systemNotice',
    note: 'Runtime system messages become neutral systemNotice items.',
  },
}

export const AGENT_RUNTIME_CHAT_RUN_STEP_TYPE_COVERAGE: Record<AgentRuntimeChatRunStepType, {
  neutralItem: 'reasoning' | 'dynamicToolCall' | 'mcpToolCall'
  note: string
}> = {
  message: {
    neutralItem: 'reasoning',
    note: 'Runtime message steps are projected into neutral reasoning/process items.',
  },
  tool_call: {
    neutralItem: 'dynamicToolCall',
    note: 'Runtime tool calls become neutral dynamic tool calls, or mcpToolCall when the tool name identifies an MCP tool.',
  },
}

export const AGENT_RUNTIME_CHAT_RUN_STEP_STATUS_COVERAGE: Record<AgentRuntimeChatRunStepStatus, {
  lifecycle: 'running' | 'completed' | 'failed'
  dynamicToolSuccess: boolean | null
  mcpStatus: string
  note: string
}> = {
  in_progress: {
    lifecycle: 'running',
    dynamicToolSuccess: null,
    mcpStatus: 'inProgress',
    note: 'In-progress steps remain pending/running in the neutral UI.',
  },
  completed: {
    lifecycle: 'completed',
    dynamicToolSuccess: true,
    mcpStatus: 'completed',
    note: 'Completed tool steps are successful results in the neutral UI.',
  },
  failed: {
    lifecycle: 'failed',
    dynamicToolSuccess: false,
    mcpStatus: 'failed',
    note: 'Failed tool steps surface diagnostic error state in the neutral UI.',
  },
}
