import type { AgentApprovalRequest, AgentInputRequest, AgentTraceEventKind, ToolCallOutcome } from '../state/types.js'
import type { RuntimeModelChatMessage } from '../model/modelConfig.js'

export interface AgentLoopTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: 'started' | 'completed' | 'blocked' | 'failed' | 'info'
  roundIndex: number
  roundLabel: string
  roundSource: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final'
  stepId?: string
  toolName?: string
  data?: unknown
}

export type AgentLoopResult =
  | { status: 'completed'; finalContent: string; toolOutcomes: ToolCallOutcome[]; warnings: string[] }
  | { status: 'requires_action'; pendingApprovals: AgentApprovalRequest[]; pendingInputRequests?: AgentInputRequest[]; messages: RuntimeModelChatMessage[]; toolOutcomes: ToolCallOutcome[]; warnings: string[] }
  | { status: 'failed'; error: string }

export { runAgentGraph as runAgentLoop } from './agentGraph.js'
