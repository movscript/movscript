import type { AgentMessage } from './agentThreadProtocol.js'
import type { AgentRunExecutionMode, AgentRunRole, AgentRunStatus, AgentStepStatus } from './agentStatusProtocol.js'
import type { AgentTraceEvent } from './agentTraceProtocol.js'
import type { AgentApprovalRequest, ProviderSessionInputRequest } from './providerInteractionProtocol.js'
import type { JSONValue } from './protocolJson.js'
import type { ProviderManifest } from './providerCatalog.js'
import type { ProviderSessionInputDeliveryStatus } from './providerSessionProtocol.js'
import type { ToolCall } from './agentToolProtocol.js'

export interface AgentRunStep {
  id: string
  runId: string
  type: 'tool_call' | 'message'
  status: AgentStepStatus
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  roundSource?: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final'
  title?: string
  toolName?: string
  args?: Record<string, JSONValue>
  result?: JSONValue
  error?: string
  errorData?: JSONValue
  sandboxed?: boolean
  durationMs?: number
  createdAt: string
  completedAt?: string
}

export interface AgentRun {
  id: string
  providerSessionTreeId?: string
  /** @deprecated Prefer providerSessionTreeId for related-thread provider-session trees. */
  sessionId?: string // deprecated providerSessionTreeId compatibility mirror
  threadId: string
  status: AgentRunStatus
  role?: AgentRunRole
  parentRunId?: string
  taskGraphId?: string
  taskId?: string
  progress?: number
  blockedReason?: string
  input?: AgentRunInput
  providerManifest?: ProviderManifest
  agentManifest?: ProviderManifest
  pendingApprovals?: AgentApprovalRequest[]
  pendingInputRequests?: ProviderSessionInputRequest[]
  providerSessionLimits: ProviderSessionLimits
  metadata?: Record<string, JSONValue>
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  cancelledAt?: string
  error?: string
  warnings?: string[]
  assistantMessageId?: string
  steps: AgentRunStep[]
  traceEvents?: AgentTraceEvent[]
  streamPartial?: true
}

export interface CreateMessageRunResult {
  run: AgentRun
  message: AgentMessage
  providerSessionInput?: {
    accepted: boolean
    runId: string
    messageId: string
    deliveryStatus: ProviderSessionInputDeliveryStatus
  }
}

export interface AgentRunInput {
  schema: 'movscript.agent.run-input.v1'
  userMessage: string
  clientInput?: JSONValue
  sourceMessageId?: string
  executionMode: 'chat' | 'tool' | 'worker' | 'resume'
  parent?: {
    runId?: string
    taskGraphId?: string
    taskId?: string
  }
  task?: {
    id: string
    title: string
    description?: string
    instructions: string
    expectedArtifacts?: string[]
  }
  forcedToolCall?: ToolCall
  createdAt: string
}

export interface ProviderSessionLimits {
  approvalMode: 'interactive' | 'auto_readonly' | 'auto'
  sandboxMode?: boolean
  maxToolCalls: number
  maxIterations: number
  allowNetwork: boolean
  allowFileBytes: boolean
  execution?: AgentRunExecutionConfig
  costLimit?: {
    currency: string
    amount: number
  }
}

export interface AgentRunExecutionConfig {
  mode: AgentRunExecutionMode
  includeMemories?: boolean
  allowForcedToolCalls?: boolean
}
