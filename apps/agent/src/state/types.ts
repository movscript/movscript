import type { MCPClient } from '../mcpClient.js'
import type { JSONValue, MCPResource, MCPTool } from '../types.js'
import type { AgentManifest } from '../catalog/agentManifest.js'
import type { RegisteredTool, ToolRiskLevel } from '../tools/toolRegistry.js'
import type { AgentCatalogStateStore } from '../catalog/state.js'
import type { AgentDraftStore } from '../drafts/draftStore.js'
import type { BackendApplyClient } from '../drafts/backendApplyClient.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { AgentUpdateState } from '../updates/updatePolicy.js'

export type { JSONValue, MCPResource, MCPTool } from '../types.js'

export type AgentMessageRole = 'system' | 'user' | 'assistant'
export type AgentRunStatus = 'queued' | 'in_progress' | 'requires_action' | 'completed' | 'completed_with_warnings' | 'failed' | 'cancelled'
export type AgentThreadStatus = 'idle' | 'running' | 'requires_action' | 'completed' | 'failed' | 'cancelled'
export type AgentStepStatus = 'in_progress' | 'completed' | 'failed'
export type AgentApprovalStatus = 'pending' | 'approved' | 'rejected'
export type AgentInputRequestStatus = 'pending' | 'answered' | 'cancelled'
export type AgentRunRole = 'planner' | 'worker'
export type AgentPlanStatus = 'pending' | 'running' | 'blocked' | 'needs_review' | 'done' | 'failed' | 'cancelled'
export type AgentTaskStatus = 'pending' | 'running' | 'blocked' | 'needs_review' | 'done' | 'failed' | 'cancelled'

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
  status?: AgentThreadStatus
  activeRunId?: string
  lastRunId?: string
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
  status?: AgentThreadStatus
  activeRunId?: string
  lastRunId?: string
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
  errorData?: JSONValue
  sandboxed?: boolean
  durationMs?: number
  createdAt: string
  completedAt?: string
}

export const AGENT_TRACE_EVENT_KINDS = [
  'run',
  'thread',
  'message',
  'context',
  'memory',
  'manifest',
  'skill',
  'tool_catalog',
  'prompt',
  'policy',
  'reasoning',
  'tool_call',
  'model_call',
  'approval',
  'input',
  'assistant',
  'task',
  'plan',
  'error',
] as const

export type AgentTraceEventKind = typeof AGENT_TRACE_EVENT_KINDS[number]

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
  durationMs?: number
  createdAt: string
  completedAt?: string
}

export interface AgentRun {
  id: string
  threadId: string
  status: AgentRunStatus
  role?: AgentRunRole
  parentRunId?: string
  planId?: string
  taskId?: string
  progress?: number
  blockedReason?: string
  input?: AgentRunInput
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

export interface AgentRunInput {
  schema: 'movscript.agent.run-input.v1'
  userMessage: string
  clientInput?: JSONValue
  sourceMessageId?: string
  executionMode: 'chat' | 'tool' | 'worker' | 'resume'
  parent?: {
    runId?: string
    planId?: string
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

export interface AgentPlan {
  id: string
  threadId: string
  rootRunId?: string
  title: string
  status: AgentPlanStatus
  progress: number
  blockedReason?: string
  metadata?: Record<string, JSONValue>
  createdAt: string
  updatedAt: string
  completedAt?: string
  failedAt?: string
  cancelledAt?: string
}

export interface AgentTaskArtifact {
  id: string
  type: string
  title?: string
  uri?: string
  metadata?: Record<string, JSONValue>
  createdAt: string
}

export interface AgentTask {
  id: string
  planId: string
  parentId?: string
  deps: string[]
  title: string
  description?: string
  status: AgentTaskStatus
  progress: number
  ownerRunId?: string
  blockedReason?: string
  artifacts: AgentTaskArtifact[]
  metadata?: Record<string, JSONValue>
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  cancelledAt?: string
}

export interface AgentPlanSnapshot {
  plan: AgentPlan
  tasks: AgentTask[]
  runs: AgentRun[]
  nameConflicts?: Array<{
    subagentName: string
    taskIds: string[]
  }>
  summary?: AgentPlanSummary
}

export interface AgentPlanSummary {
  taskCount: number
  taskStatusCounts: Record<AgentTaskStatus, number>
  workerCount: number
  activeWorkerCount: number
  artifactCount: number
  nameConflictCount: number
  blockedTaskIds: string[]
  needsReviewTaskIds: string[]
  failedTaskIds: string[]
}

export type AgentRunStreamRun = AgentRun & {
  streamPartial?: true
}

export type AgentPlanStreamEvent =
  | {
    type: 'snapshot'
    snapshot: AgentPlanSnapshot
  }
  | {
    type: 'task'
    planId: string
    task: AgentTask
    snapshot: AgentPlanSnapshot
  }
  | {
    type: 'run'
    planId: string
    run: AgentRunStreamRun
    snapshot: AgentPlanSnapshot
  }
  | {
    type: 'trace'
    planId: string
    runId: string
    event: AgentTraceEvent
    snapshot: AgentPlanSnapshot
  }
  | {
    type: 'done'
    snapshot: AgentPlanSnapshot
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
    run?: AgentRunStreamRun
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
    type: 'thread_title'
    runId: string
    threadId: string
    title: string
    updatedAt: string
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
    aspect_ratio?: string
    visual_style?: string
    project_style?: string
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
  agentPlan?: {
    id: string
    title: string
    status: AgentPlanStatus
    progress: number
    role?: AgentRunRole
    currentTaskId?: string
    rootRunId?: string
    tasks: Array<{
      id: string
      subagentName?: string
      title: string
      status: AgentTaskStatus
      progress: number
      deps: string[]
      ownerRunId?: string
      blockedReason?: string
    }>
    workers: Array<{
      id: string
      subagentName?: string
      status: AgentRunStatus
      taskId?: string
      parentRunId?: string
      progress?: number
      blockedReason?: string
    }>
    nameConflicts?: Array<{
      subagentName: string
      taskIds: string[]
    }>
    artifacts: Array<{
      id: string
      type: string
      title?: string
      uri?: string
      taskId: string
      subagentName?: string
      sourceRunId?: string
      sourceTaskId?: string
      sourceTaskTitle?: string
      sourceTaskStatus?: AgentTaskStatus
      sourceTaskOwnerRunId?: string
      toolName?: string
      policy?: string
    }>
    summary?: AgentPlanSummary
  }
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
  pageContext?: {
    pageKey?: string
    pageType?: string
    pageRoute?: string
    pageEntityType?: string
    pageEntityId?: number | string
    draftId?: string
  }
  project?: {
    id?: number
    name?: string
    status?: string
    description?: string
    aspect_ratio?: string
    visual_style?: string
    project_style?: string
  }
  productionId?: number
  draftId?: string
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

export interface ResolvedAgentSkill {
  id: string
  name: string
  description: string
  version?: string
  category?: string
  categories?: string[]
  enabled: boolean
  priority?: number
  instruction: string
  outputContract?: string
  toolHints?: string[]
  metadata?: Record<string, JSONValue>
  resolvedPriority: number
  activationReason: 'profile' | 'trigger' | 'default'
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
  | 'wrong_run_role'
  | 'workflow_scope'

export interface AgentDebugTool {
  name: string
  description?: string
  inputSchema?: JSONValue
  outputSchema?: JSONValue
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
  promptStats?: {
    totalChars: number
    systemChars?: number
    conversationChars?: number
    budget?: {
      limitChars: number
      usedChars: number
      remainingChars: number
      usageRatio: number
      status: string
    }
    parts: Array<{ id: string; title: string; kind: string; layer: string; chars: number }>
    byLayer: Record<string, number>
    byContextLayer?: Record<string, number>
  }
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
  layerTrace?: {
    profileId: string
    profileVersion: string
    profileLayers: Array<{ source: string; id: string; version: string }>
    personaId?: string
    policyIds: string[]
    workflowIds: string[]
    intentSignals?: Array<{
      intent: string
      source: string
      confidence: string
      evidence: string
    }>
    workflowTriggers?: Array<{
      id: string
      matched: boolean
      matchedTriggerKind?: string
      priority: number
      selected: boolean
      reason: string
    }>
  }
}

export interface AgentCapabilitiesResponse {
  defaultAgentManifest: AgentManifest
  updates?: AgentUpdateState
  pluginCatalog?: {
    skillsDir: string
    toolsDir: string
    builtinSkillsDir?: string
    builtinToolsDir?: string
    skillCount: number
    toolCount: number
    metadata?: Record<string, JSONValue>
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
  toolRegistry?: import('../tools/toolRegistry.js').ToolRegistry
  pluginCatalog?: import('../catalog/loader.js').AgentPluginCatalog
  catalogStateStore?: AgentCatalogStateStore
  pluginCatalogLoader?: (options?: Record<string, never>) => import('../catalog/loader.js').AgentPluginCatalog
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
  userMessage?: unknown
  task?: unknown
  agentManifest?: unknown
  approvedToolNames?: unknown
  clientInput?: unknown
  policy?: unknown
  backendAuthToken?: unknown
  backendAPIBaseURL?: unknown
  sandboxMode?: unknown
  role?: unknown
  parentRunId?: unknown
  planId?: unknown
  taskId?: unknown
  progress?: unknown
  blockedReason?: unknown
  metadata?: unknown
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
  role?: unknown
  parentRunId?: unknown
  planId?: unknown
  taskId?: unknown
  progress?: unknown
  blockedReason?: unknown
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

export interface CreatePlanInput {
  threadId?: unknown
  title?: unknown
  goal?: unknown
  message?: unknown
  tasks?: unknown
  maxTasks?: unknown
  metadata?: unknown
  createPlannerRun?: unknown
  agentManifest?: unknown
  clientInput?: unknown
  policy?: unknown
  approvedToolNames?: unknown
  backendAuthToken?: unknown
  backendAPIBaseURL?: unknown
  sandboxMode?: unknown
}

export interface DispatchPlanInput {
  planId?: unknown
  plannerRunId?: unknown
  taskIds?: unknown
  maxWorkers?: unknown
  maxTaskAttempts?: unknown
  retryFailed?: unknown
  workerTimeoutMs?: unknown
  agentManifest?: unknown
  approvedToolNames?: unknown
  policy?: unknown
  backendAuthToken?: unknown
  backendAPIBaseURL?: unknown
  sandboxMode?: unknown
}

export interface DispatchPlanResult {
  plan: AgentPlan
  spawnedRuns: AgentRun[]
  blockedTaskIds: string[]
  retriedTaskIds: string[]
  timedOutRunIds: string[]
}

export interface ReplanRunInput extends DispatchPlanInput {
  tasks?: unknown
  addTasks?: unknown
  updates?: unknown
  updateTasks?: unknown
  resetTaskIds?: unknown
  resetBlocked?: unknown
  resetNeedsReview?: unknown
  resetFailed?: unknown
  resetCancelled?: unknown
  dispatch?: unknown
}

export interface ReplanRunResult {
  plan: AgentPlan
  createdTaskIds: string[]
  updatedTaskIds: string[]
  resetTaskIds: string[]
  dispatch?: DispatchPlanResult
}

export interface CreatePlanTaskInput {
  id?: unknown
  parentId?: unknown
  deps?: unknown
  title?: unknown
  description?: unknown
  subagentName?: unknown
  subagentNames?: unknown
  maxTaskAttempts?: unknown
  workerTimeoutMs?: unknown
  metadata?: unknown
}

export interface UpdatePlanTaskInput {
  id?: unknown
  parentId?: unknown
  deps?: unknown
  title?: unknown
  description?: unknown
  status?: unknown
  progress?: unknown
  ownerRunId?: unknown
  blockedReason?: unknown
  artifacts?: unknown
  metadata?: unknown
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
  arguments?: Record<string, JSONValue>
}

export interface ToolCallOutcome {
  call: ToolCall
  result?: JSONValue
  error?: string
  rollback?: ToolCallRollbackRecord
}

export interface ToolCallRollbackRecord {
  policy: 'not_applicable' | 'manual_compensation' | 'reversible'
  reason: string
  artifactType?: string
  artifactUri?: string
  metadata?: Record<string, JSONValue>
}
