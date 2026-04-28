import type { MCPClient } from '../mcpClient.js'
import type { JSONValue } from '../types.js'
import type { AgentManifest } from './agentManifest.js'

export type AgentMessageRole = 'system' | 'user' | 'assistant'
export type AgentRunStatus = 'queued' | 'in_progress' | 'requires_action' | 'completed' | 'completed_with_warnings' | 'failed'
export type AgentStepStatus = 'in_progress' | 'completed' | 'failed'
export type AgentPlanTaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
export type AgentApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface AgentMessage {
  id: string
  threadId: string
  role: AgentMessageRole
  content: string
  runId?: string
  createdAt: string
}

export interface AgentThread {
  id: string
  title?: string
  projectId?: number
  metadata?: Record<string, JSONValue>
  archived?: boolean
  lastRunStatus?: AgentRunStatus
  createdAt: string
  updatedAt: string
  messages: AgentMessage[]
}

export interface AgentThreadSummary {
  id: string
  title?: string
  projectId?: number
  metadata?: Record<string, JSONValue>
  archived: boolean
  lastRunStatus?: AgentRunStatus
  createdAt: string
  updatedAt: string
  messageCount: number
  lastMessageAt?: string
}

export interface AgentRunStep {
  id: string
  runId: string
  type: 'planning' | 'subagent' | 'tool_call' | 'message'
  status: AgentStepStatus
  title?: string
  agentId?: string
  agentRole?: string
  parentStepId?: string
  toolName?: string
  args?: Record<string, JSONValue>
  result?: JSONValue
  error?: string
  createdAt: string
  completedAt?: string
}

export interface AgentPlanTask {
  id: string
  title: string
  description: string
  agentRole: string
  status: AgentPlanTaskStatus
  toolCalls: ToolCall[]
  createdAt: string
  startedAt?: string
  completedAt?: string
  error?: string
}

export interface AgentTaskPlan {
  id: string
  objective: string
  strategy: string
  tasks: AgentPlanTask[]
  createdAt: string
  updatedAt: string
}

export interface AgentRun {
  id: string
  threadId: string
  status: AgentRunStatus
  agentManifest?: AgentManifest
  plan?: AgentTaskPlan
  pendingApprovals?: AgentApprovalRequest[]
  metadata?: Record<string, JSONValue>
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  error?: string
  warnings?: string[]
  assistantMessageId?: string
  steps: AgentRunStep[]
}

export interface AgentApprovalRequest {
  id: string
  runId: string
  toolName: string
  args?: Record<string, JSONValue>
  reason: string
  risk?: string
  permission?: string
  status: AgentApprovalStatus
  createdAt: string
  updatedAt: string
  approvedAt?: string
  rejectedAt?: string
}

export interface AgentRuntimeOptions {
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>
  store?: import('./store.js').AgentStore
  memoryStore?: import('./memory/memoryStore.js').AgentMemoryStore
  defaultAgentManifest?: AgentManifest
}

export interface CreateThreadInput {
  messages?: Array<{ role?: unknown; content?: unknown }>
  title?: unknown
  projectId?: unknown
  metadata?: unknown
  archived?: unknown
}

export interface CreateMessageInput {
  role?: unknown
  content?: unknown
}

export interface CreateRunInput {
  threadId?: unknown
  agentManifest?: unknown
  approvedToolNames?: unknown
}

export interface ApproveRunInput {
  approvedToolNames?: unknown
  approvalIds?: unknown
}

export interface RejectRunInput {
  approvalIds?: unknown
}

export interface UpdateThreadInput {
  title?: unknown
  archived?: unknown
  metadata?: unknown
}

export interface ToolCall {
  name: string
  args?: Record<string, JSONValue>
}

export interface ToolCallOutcome {
  call: ToolCall
  result?: JSONValue
  error?: string
}
