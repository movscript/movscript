import type { MCPClient } from '../mcpClient.js'
import type { JSONValue, MCPResource, MCPTool } from '../types.js'
import type { AgentManifest, AgentSkillManifest } from './agentManifest.js'
import type { RegisteredTool, ToolRiskLevel } from './toolRegistry.js'
import type { AgentDraftStore } from './draftStore.js'
import type { BackendApplyClient } from './backendApplyClient.js'

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
  successCriteria?: string
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
  envelope?: AgentInputEnvelope
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

export interface AgentRunPreview {
  id: string
  threadId?: string
  message: string
  status: 'preview'
  agentManifest?: AgentManifest
  currentProjectId?: number
  context?: AgentDebugContextPanel
  skills?: ResolvedAgentSkill[]
  tools?: ResolvedToolCatalog
  policy?: AgentRunPolicy
  promptPreview?: CompiledPromptPreview
  debug?: AgentRunDebugTrace
  planner: AgentPlannerKind
  plannerWarnings: string[]
  plan: AgentTaskPlan
  toolCalls: ToolCall[]
  pendingApprovals: AgentApprovalRequest[]
  warnings: string[]
  memoryIds: string[]
  memoryCount: number
  createdAt: string
}

export interface AgentApprovalRequest {
  id: string
  runId: string
  toolName: string
  args?: Record<string, JSONValue>
  preview?: JSONValue
  reason: string
  risk?: string
  permission?: string
  status: AgentApprovalStatus
  createdAt: string
  updatedAt: string
  approvedAt?: string
  rejectedAt?: string
}

export interface AgentDebugContextPanel {
  route: {
    pathname: string
    search?: string
    hash?: string
  }
  project?: {
    id: number
    name?: string
    status?: string
    description?: string
  }
  user?: {
    id: number
    username: string
    systemRole?: string
  }
  selection?: {
    entityType: string
    entityId: number | string
    label?: string
  } | null
  recentResources: Array<{
    id: number
    name: string
    type: string
    mimeType?: string
    size?: number
  }>
  attachments: Array<{
    id: string
    name: string
    type: string
    resourceId?: number
  }>
  memories: Array<{
    id: string
    scope: string
    kind: string
    content: string
  }>
  labels: string[]
}

export interface AgentClientAttachmentRef {
  id?: string
  name?: string
  type?: string
  mimeType?: string
  size?: number
  resourceId?: number
}

export interface AgentClientResourceRef {
  id?: number
  name?: string
  type?: string
  mimeType?: string
  size?: number
}

export interface AgentClientUISnapshot {
  route?: {
    pathname?: string
    search?: string
    hash?: string
  }
  project?: {
    id?: number
    name?: string
    status?: string
    description?: string
  }
  selection?: {
    entityType?: string
    entityId?: number | string
    label?: string
  } | null
  recentResources?: AgentClientResourceRef[]
  labels?: string[]
}

export interface AgentClientInput {
  message?: unknown
  attachments?: unknown
  uiSnapshot?: unknown
}

export interface ResolvedAgentSkill extends AgentSkillManifest {
  resolvedPriority: number
  activationReason: 'manifest' | 'applies_when' | 'user_selected' | 'default'
  compiledInstruction: string
  warnings: string[]
}

export type ToolUnavailableReason =
  | 'mcp_unavailable'
  | 'unregistered'
  | 'not_granted'
  | 'denied'
  | 'missing_permission'
  | 'missing_project'
  | 'approval_required'
  | 'schema_invalid'

export interface AgentDebugTool {
  name: string
  description?: string
  inputSchema?: JSONValue
  source: 'mcp' | 'runtime' | 'plugin'
  registered: boolean
  granted: boolean
  permission?: string
  risk?: ToolRiskLevel
  projectScoped?: boolean
  approval: 'never' | 'always' | 'on_write'
  available: boolean
  unavailableReason?: ToolUnavailableReason
  requiresApproval: boolean
}

export interface ResolvedToolCatalog {
  discovered: AgentDebugTool[]
  available: AgentDebugTool[]
  blocked: AgentDebugTool[]
  byName: Record<string, AgentDebugTool>
}

export interface AgentRunPolicy {
  approvalMode: 'interactive' | 'dry_run' | 'auto_readonly'
  maxToolCalls: number
  maxIterations: number
  allowNetwork: false
  allowFileBytes: false
  costLimit?: {
    currency: string
    amount: number
  }
}

export interface AgentInputEnvelope {
  id: string
  threadId?: string
  runId?: string
  mode: 'preview' | 'run'
  message: {
    role: 'user'
    content: string
  }
  history: Array<{
    id: string
    role: AgentMessageRole
    content: string
    createdAt: string
  }>
  context: AgentDebugContextPanel
  manifest: AgentManifest
  skills: ResolvedAgentSkill[]
  tools: ResolvedToolCatalog
  policy: AgentRunPolicy
  memories: Array<{
    id: string
    scope: string
    kind: string
    content: string
  }>
  clientInput?: {
    visibleMessage: string
    attachments: AgentClientAttachmentRef[]
    uiSnapshot?: AgentClientUISnapshot
  }
  model?: AgentManifest['model']
  debug: {
    source: 'frontend' | 'runtime'
    warnings: string[]
    compiledPrompt?: CompiledPromptPreview
  }
}

export interface CompiledPromptPreview {
  system: string
  messages: Array<{ role: string; content: string }>
  debugParts: Array<{
    id: string
    kind: 'soul' | 'skill' | 'context' | 'policy' | 'tool'
    title: string
    content: string
  }>
}

export interface AgentRunDebugTrace {
  envelopeId: string
  manifestId: string
  manifestVersion: string
  skillIds: string[]
  availableToolNames: string[]
  blockedTools: Array<{
    name: string
    reason?: ToolUnavailableReason
  }>
  promptPartIds: string[]
  planner: AgentPlannerKind
  model?: AgentManifest['model']
}

export type AgentPlannerKind = 'rule' | 'model'

export interface AgentCapabilitiesResponse {
  defaultAgentManifest: AgentManifest
  pluginCatalog?: {
    skillsDir: string
    toolsDir: string
    builtinSkillsDir?: string
    builtinToolsDir?: string
    skillCount: number
    toolCount: number
  }
  mcp: {
    connected: boolean
    resources: MCPResource[]
    tools: MCPTool[]
    error?: string
  }
  registry: RegisteredTool[]
  resolvedTools: ResolvedToolCatalog
  warnings: string[]
}

export interface AgentRuntimeOptions {
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool' | 'listTools' | 'listResources'>
  store?: import('./store.js').AgentStore
  draftStore?: AgentDraftStore
  backendApplyClient?: BackendApplyClient
  memoryStore?: import('./memory/memoryStore.js').AgentMemoryStore
  defaultAgentManifest?: AgentManifest
  skillCatalog?: AgentSkillManifest[]
  toolRegistry?: import('./toolRegistry.js').ToolRegistry
  pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  pluginWarnings?: string[]
  modelPlanner?: import('./modelPlanner.js').AgentModelPlanner | false
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
  clientInput?: unknown
}

export interface CreateRunInput {
  threadId?: unknown
  agentManifest?: unknown
  approvedToolNames?: unknown
  clientInput?: unknown
}

export interface CreateToolRunInput {
  threadId?: unknown
  title?: unknown
  message?: unknown
  toolCall?: unknown
  agentManifest?: unknown
  approvedToolNames?: unknown
  clientInput?: unknown
}

export interface PreviewRunInput {
  threadId?: unknown
  message?: unknown
  agentManifest?: unknown
  approvedToolNames?: unknown
  clientInput?: unknown
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
