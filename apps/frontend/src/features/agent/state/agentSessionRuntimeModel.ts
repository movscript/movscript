import type { AgentRun, AgentThread } from '@movscript/core/agent/protocol'
import type { ConversationWorkspace } from '@/features/agent/state/agentStore'
import type { AgentPageTaskRun } from '@/features/agent/state/agentSessionTaskModel'
import type { AgentSessionWorkspaceContext } from '@movscript/core/agent'
import type { AgentChatProviderKind, AgentChatTurnStatus, AgentThreadControlState } from '@movscript/core/agent/chat'

export interface AgentConversationThreadBinding {
  conversationId: string
  provider?: AgentChatProviderKind
  providerId?: string
  providerInstanceId?: string
  providerThreadId: string
  providerSessionTreeId?: string
  providerThreadCwd?: string
  updatedAt: number
}

export interface AgentConversationRuntimeState {
  conversationId: string
  activeTurnId?: string
  turnStatus?: AgentChatTurnStatus
  activeRunId?: string
  threadControl?: AgentThreadControlState
  run?: AgentRun
  status?: string
  loading: boolean
  building: boolean
  approving: boolean
  stopping: boolean
  stopRequested: boolean
  error?: string
  updatedAt: number
}

export type AgentConversationRuntimePatch = Partial<Omit<AgentConversationRuntimeState, 'conversationId' | 'updatedAt'>>

export type AgentConversationRunPatch = AgentConversationRuntimePatch & {
  providerSessionTreeId?: string
}

export interface AgentStandaloneTaskState {
  taskId: string
  taskType: string
  title?: string
  prompt: string
  status: 'running' | 'completed' | 'cancelled' | 'error' | 'requires_action'
  runId?: string
  threadId?: string
  run?: AgentRun
  thread?: AgentThread
  result?: string
  error?: string
  startedAt: number
  updatedAt: number
  settledAt?: number
}

export const EMPTY_CONVERSATION_WORKSPACE: ConversationWorkspace = {
  input: '',
  attachments: [],
}

export function compactRun(run: AgentRun): AgentRun
export function compactRun(run: AgentPageTaskRun | undefined): AgentPageTaskRun | undefined
export function compactRun(run: AgentPageTaskRun | undefined): AgentPageTaskRun | undefined {
  if (!run) return undefined
  if (!('steps' in run)) return run
  return {
    ...run,
    steps: run.steps.map((step) => ({
      ...step,
      args: undefined,
      result: undefined,
    })),
    traceEvents: [],
  }
}

export function defaultConversationRuntimeState(conversationId: string): AgentConversationRuntimeState {
  return {
    conversationId,
    loading: false,
    building: false,
    approving: false,
    stopping: false,
    stopRequested: false,
    updatedAt: Date.now(),
  }
}
