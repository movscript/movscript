import type { AgentConversationLifecycle, AgentMessageRole, AgentRunStatus, AgentThreadRole, AgentThreadStatus } from './agentStatusProtocol.js'
import type { AgentPlan, AgentPlanRevision } from './agentPlanProtocol.js'
import type { AgentContextDiagnostic } from './agentPromptDebugProtocol.js'
import type { JSONValue } from './protocolJson.js'
import type { ProviderSessionStatusMessage } from './agentConversationProtocol.js'

export interface AgentMessage {
  id: string
  threadId: string
  role: AgentMessageRole
  content: string
  clientInput?: JSONValue
  runId?: string
  metadata?: Record<string, JSONValue>
  createdAt: string
}

export interface AgentThread {
  id: string
  sessionId?: string
  lifecycle?: AgentConversationLifecycle
  expiresAt?: string
  title?: string
  agentName?: string
  agentRole?: AgentThreadRole
  parentThreadId?: string
  parentRunId?: string
  projectId?: number
  metadata?: Record<string, JSONValue>
  currentPlan?: AgentPlan
  planRevisions?: AgentPlanRevision[]
  runtimeStatuses?: ProviderSessionStatusRecord[]
  contextDiagnostics?: AgentContextDiagnosticRecord[]
  archived?: boolean
  status?: AgentThreadStatus
  activeRunId?: string
  lastRunId?: string
  lastRunStatus?: AgentRunStatus
  createdAt: string
  updatedAt: string
  messages: AgentMessage[]
}

export interface AgentContextDiagnosticRecord {
  id: string
  threadId: string
  runId?: string
  command?: string
  content: string
  diagnostic: AgentContextDiagnostic
  createdAt: string
}

export interface ProviderSessionStatusRecord {
  id: string
  threadId: string
  runId?: string
  content: string
  status: ProviderSessionStatusMessage
  createdAt: string
}

export interface AgentSession {
  id: string
  lifecycle?: AgentConversationLifecycle
  expiresAt?: string
  title?: string
  projectId?: number
  metadata?: Record<string, JSONValue>
  rootThreadId?: string
  interactiveThreadId?: string
  activeThreadId?: string
  status?: AgentThreadStatus
  createdAt: string
  updatedAt: string
}

export interface AgentSessionSummary extends AgentSession {
  threadCount: number
}

export interface AgentThreadSummary {
  id: string
  sessionId?: string
  lifecycle?: AgentConversationLifecycle
  expiresAt?: string
  title?: string
  agentName?: string
  agentRole?: AgentThreadRole
  parentThreadId?: string
  parentRunId?: string
  projectId?: number
  metadata?: Record<string, JSONValue>
  currentPlan?: AgentPlan
  archived: boolean
  status?: AgentThreadStatus
  activeRunId?: string
  lastRunId?: string
  lastRunStatus?: AgentRunStatus
  createdAt: string
  updatedAt: string
  messageCount: number
  lastMessageAt?: string
}

export interface AgentThreadListPage {
  threads: AgentThreadSummary[]
  total: number
  limit: number
  hasMore: boolean
  nextCursor?: string
}

export interface AgentThreadDeletionResult {
  deleted: boolean
  threadId: string
  deletedRunIds: string[]
  deletedTaskGraphIds: string[]
  deletedTaskIds: string[]
  deletedProviderWorkIds: string[]
  deletedProviderInteractionIds: string[]
  deletedProviderContinuationIds: string[]
}

export interface AgentThreadClearResult {
  deleted: boolean
  deletedThreadIds: string[]
  deletedRunIds: string[]
  deletedTaskGraphIds: string[]
  deletedTaskIds: string[]
  deletedProviderWorkIds: string[]
  deletedProviderInteractionIds: string[]
  deletedProviderContinuationIds: string[]
}
