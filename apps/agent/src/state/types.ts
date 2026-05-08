import type { MCPClient } from '../mcpClient.js'
import type { JSONValue, MCPResource, MCPTool } from '../types.js'
import type { AgentManifest, AgentSkillManifest } from '../manifest/agentManifest.js'
import type { RegisteredTool, ToolRiskLevel } from '../tools/toolRegistry.js'
import type { AgentCatalogStateStore } from '../manifest/catalogState.js'
import type { AgentPluginBundle } from '../manifest/pluginCatalog.js'
import type { AgentDraftStore } from '../drafts/draftStore.js'
import type { BackendApplyClient } from '../drafts/backendApplyClient.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { AgentUpdateState } from '../updates/updatePolicy.js'

export type { JSONValue, MCPResource, MCPTool } from '../types.js'

export type AgentMessageRole = 'system' | 'user' | 'assistant'
export type AgentRunStatus = 'queued' | 'in_progress' | 'requires_action' | 'completed' | 'completed_with_warnings' | 'failed' | 'cancelled'
export type AgentStepStatus = 'in_progress' | 'completed' | 'failed'
export type AgentApprovalStatus = 'pending' | 'approved' | 'rejected'
export type AgentInputRequestStatus = 'pending' | 'answered' | 'cancelled'

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
  sandboxed?: boolean
  createdAt: string
  completedAt?: string
}

export type AgentTraceEventKind =
  | 'run'
  | 'thread'
  | 'message'
  | 'context'
  | 'memory'
  | 'manifest'
  | 'skill'
  | 'tool_catalog'
  | 'prompt'
  | 'policy'
  | 'reasoning'
  | 'tool_call'
  | 'model_call'
  | 'approval'
  | 'input'
  | 'assistant'
  | 'error'

export interface AgentTraceEvent {
  id: string
  runId: string
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: 'started' | 'completed' | 'blocked' | 'failed' | 'info'
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  roundSource?: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final'
  agentId?: string
  parentAgentId?: string
  stepId?: string
  toolName?: string
  data?: JSONValue
  createdAt: string
  completedAt?: string
}

export interface AgentRun {
  id: string
  threadId: string
  status: AgentRunStatus
  agentManifest?: AgentManifest
  pendingApprovals?: AgentApprovalRequest[]
  pendingInputRequests?: AgentInputRequest[]
  policy: AgentRunPolicy
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
}

export type AgentRunStreamRun = AgentRun & {
  streamPartial?: true
}

export type AgentRunStreamEvent =
  | {
    type: 'run'
    run: AgentRunStreamRun
  }
  | {
    type: 'trace'
    runId: string
    event: AgentTraceEvent
    run: AgentRunStreamRun
  }
  | {
    type: 'assistant_delta'
    runId: string
    traceEventId: string
    delta: string
    accumulated: string
    roundIndex?: number
    roundLabel?: string
    createdAt: string
    run?: AgentRunStreamRun
  }
  | {
    type: 'assistant_message'
    runId: string
    message: AgentMessage
    run: AgentRunStreamRun
  }
  | {
    type: 'done'
    run: AgentRunStreamRun
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

export interface AgentInputChoice {
  id: string
  label: string
  description?: string
}

export interface AgentInputRequest {
  id: string
  runId: string
  title: string
  summary?: string
  question: string
  inputType: 'choice' | 'text' | 'confirmation'
  choices: AgentInputChoice[]
  allowCustomAnswer: boolean
  status: AgentInputRequestStatus
  createdAt: string
  updatedAt: string
  answeredAt?: string
  answer?: {
    choiceIds?: string[]
    text?: string
  }
}

export interface AgentDebugContextPanel {
  route: {
    pathname: string
    search?: string
    hash?: string
  }
  projects: Array<{
    id: number
    name: string
    description?: string
    status?: string
    totalEpisodes?: number
  }>
  projectsError?: string
  project?: {
    id: number
    name?: string
    status?: string
    description?: string
  }
  productionId?: number
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
    projectId: number
    title: string
    kind: string
    content: string
  }>
  labels: string[]
  statusDigest?: string[]
  rawContextHints?: string[]
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
  productionId?: number
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
  | 'inactive'
  | 'missing_permission'
  | 'missing_project'
  | 'approval_required'
  | 'schema_invalid'

export interface AgentDebugTool {
  name: string
  description?: string
  inputSchema?: JSONValue
  source: 'mcp' | 'runtime' | 'plugin'
  category?: string
  categories?: string[]
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
  approvalMode: 'interactive' | 'auto_readonly' | 'auto'
  sandboxMode?: boolean
  maxToolCalls: number
  maxIterations: number
  allowNetwork: boolean
  allowFileBytes: boolean
  workflow?: AgentWorkflowConfig
  costLimit?: {
    currency: string
    amount: number
  }
}

export type AgentWorkflowProfile = 'standard' | 'compact' | 'deep'

export interface AgentWorkflowConfig {
  profile: AgentWorkflowProfile
  includeMemories?: boolean
  allowForcedToolCalls?: boolean
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
  manifestId: string
  manifestVersion: string
  skillIds: string[]
  availableToolNames: string[]
  blockedTools: Array<{
    name: string
    reason?: ToolUnavailableReason
  }>
  promptPartIds: string[]
  model?: AgentManifest['model']
}

export interface AgentCapabilitiesResponse {
  defaultAgentManifest: AgentManifest
  updates?: AgentUpdateState
  pluginCatalog?: {
    skillsDir: string
    toolsDir: string
    builtinSkillsDir?: string
    builtinToolsDir?: string
    bundlesDir?: string
    builtinBundlesDir?: string
    skillCount: number
    toolCount: number
    bundleCount?: number
    activeBundleIds?: string[]
    availableBundleIds?: string[]
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
  memoryStore?: import('../memory/memoryStore.js').AgentMemoryStore
  defaultAgentManifest?: AgentManifest
  skillCatalog?: AgentSkillManifest[]
  toolRegistry?: import('../tools/toolRegistry.js').ToolRegistry
  catalogStateStore?: AgentCatalogStateStore
  pluginCatalogLoader?: (options?: { enabledBundleIds?: string[] }) => {
    manifest: AgentManifest
    skills: AgentSkillManifest[]
    registry: import('../tools/toolRegistry.js').ToolRegistry
    warnings: string[]
    skillsDir: string
    toolsDir: string
    builtinSkillsDir: string
    builtinToolsDir: string
    bundlesDir: string
    builtinBundlesDir: string
    bundles: AgentPluginBundle[]
    activeBundleIds: string[]
    availableBundleIds: string[]
  }
  contractResolver?: AgentRuntimeContractResolver
  pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  pluginWarnings?: string[]
  updateState?: AgentUpdateState
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
  policy?: unknown
  backendAuthToken?: unknown
  backendAPIBaseURL?: unknown
  sandboxMode?: unknown
}

export interface CreateToolRunInput {
  threadId?: unknown
  title?: unknown
  message?: unknown
  toolCall?: unknown
  agentManifest?: unknown
  approvedToolNames?: unknown
  clientInput?: unknown
  policy?: unknown
  backendAuthToken?: unknown
  backendAPIBaseURL?: unknown
  sandboxMode?: unknown
}

export interface PreviewRunInput {
  threadId?: unknown
  message?: unknown
  agentManifest?: unknown
  approvedToolNames?: unknown
  clientInput?: unknown
  policy?: unknown
  backendAuthToken?: unknown
  backendAPIBaseURL?: unknown
  sandboxMode?: unknown
}

export interface ApproveRunInput {
  approvedToolNames?: unknown
  approvalIds?: unknown
  backendAuthToken?: unknown
  backendAPIBaseURL?: unknown
}

export interface RejectRunInput {
  approvalIds?: unknown
}

export interface CancelRunInput {
  reason?: unknown
}

export interface AnswerRunInputRequestInput {
  requestId?: unknown
  choiceIds?: unknown
  text?: unknown
  backendAuthToken?: unknown
  backendAPIBaseURL?: unknown
}

export interface UpdateThreadInput {
  title?: unknown
  archived?: unknown
  metadata?: unknown
}

export interface ToolCall {
  id?: string
  name: string
  args?: Record<string, JSONValue>
}

export interface ToolCallOutcome {
  call: ToolCall
  result?: JSONValue
  error?: string
}
