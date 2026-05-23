export const AGENT_PROTOCOL_VERSION = 'movscript.agent.protocol.v1'
export const AGENT_RUNTIME_SNAPSHOT_V2_SCHEMA = 'movscript.agent.runtime-snapshot.v2'
export const AGENT_RUNTIME_EVENT_V2_SCHEMA = 'movscript.agent.runtime-event.v2'
export const EVENT_STATE_DEBUG_V1_SCHEMA = 'movscript.agent.event-state-debug.v1'

export type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue }

export type AgentMessageRole = 'system' | 'user' | 'assistant'
export type AgentRunStatus = 'queued' | 'in_progress' | 'requires_action' | 'completed' | 'completed_with_warnings' | 'failed' | 'cancelled'
export type AgentThreadStatus = 'idle' | 'running' | 'requires_action' | 'completed' | 'failed' | 'cancelled'
export type AgentStepStatus = 'in_progress' | 'completed' | 'failed'
export type AgentRunRole = 'planner' | 'worker'
export type AgentThreadRole = 'root' | 'planner' | 'worker'
export type AgentPlanTaskStatus = 'pending' | 'in_progress' | 'completed'
export type AgentTaskGraphStatus = 'pending' | 'running' | 'blocked' | 'needs_review' | 'done' | 'failed' | 'cancelled'
export type AgentTaskStatus = 'pending' | 'running' | 'blocked' | 'needs_review' | 'done' | 'failed' | 'cancelled'
export type AgentApprovalStatus = 'pending' | 'approved' | 'rejected'
export type AgentInputRequestStatus = 'pending' | 'answered' | 'cancelled'
export type AgentWorkflowProfile = 'standard' | 'compact' | 'deep'
export type AgentDraftKind =
  | 'setting_proposal'
  | 'asset_proposal'
  | 'project_standards_proposal'
  | 'production_proposal'
  | 'content_unit_proposal'

export type AgentToolRiskLevel = 'read' | 'draft' | 'write' | 'generate' | 'destructive' | 'ui'
export type AgentToolApprovalMode = 'never' | 'always' | 'on_write'
export type AgentToolGrantMode = 'allow' | 'deny'

export interface MCPResource {
  uri: string
  name?: string
  description?: string
  mimeType?: string
}

export interface MCPTool {
  name: string
  description?: string
  inputSchema?: JSONValue
  outputSchema?: JSONValue
}

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
  title?: string
  agentName?: string
  agentRole?: AgentThreadRole
  parentThreadId?: string
  parentRunId?: string
  projectId?: number
  metadata?: Record<string, JSONValue>
  currentPlan?: AgentPlan
  planRevisions?: AgentPlanRevision[]
  archived?: boolean
  status?: AgentThreadStatus
  activeRunId?: string
  lastRunId?: string
  lastRunStatus?: AgentRunStatus
  createdAt: string
  updatedAt: string
  messages: AgentMessage[]
}

export interface AgentSession {
  id: string
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

export interface AgentThreadDeletionResult {
  deleted: boolean
  threadId: string
  deletedRunIds: string[]
  deletedTaskGraphIds: string[]
  deletedTaskIds: string[]
  deletedRuntimeWorkIds: string[]
  deletedRuntimeInteractionIds: string[]
  deletedRuntimeContinuationIds: string[]
}

export interface AgentThreadClearResult {
  deleted: boolean
  deletedThreadIds: string[]
  deletedRunIds: string[]
  deletedTaskGraphIds: string[]
  deletedTaskIds: string[]
  deletedRuntimeWorkIds: string[]
  deletedRuntimeInteractionIds: string[]
  deletedRuntimeContinuationIds: string[]
}

export interface AgentPlanTask {
  step: string
  status: AgentPlanTaskStatus
}

export interface AgentPlan {
  schema: 'movscript.agent.plan.v1'
  id: string
  threadId: string
  runId?: string
  explanation?: string
  items: AgentPlanTask[]
  completedCount: number
  totalCount: number
  createdAt: string
  updatedAt: string
}

export interface AgentPlanRevision {
  schema: 'movscript.agent.plan-revision.v1'
  id: string
  planId: string
  threadId: string
  runId?: string
  explanation?: string
  snapshot: AgentPlan
  createdAt: string
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

export interface AgentManifest {
  schema: 'movscript.agent.current'
  id: string
  version: string
  name: string
  description?: string
  soul?: string
  tools: Array<{
    name: string
    mode: 'allow' | 'deny'
    approval?: 'never' | 'always' | 'on_write'
  }>
  skills?: Array<{
    id: string
    enabled?: boolean
  }>
  model?: {
    provider?: string
    modelId?: string
    platformModelId?: number
  }
  metadata?: Record<string, JSONValue>
}

export interface AgentCatalogSkill {
  id: string
  kind?: 'persona' | 'workflow' | 'policy' | 'expertise'
  name: string
  description: string
  version?: string
  category?: string
  categories?: string[]
  enabled: boolean
  priority?: number
  instruction: string
  instructionTemplate?: string
  loadMode?: 'core' | 'on_demand' | 'manual'
  activationScope?: 'turn' | 'run' | 'thread'
  tags?: string[]
  aliases?: string[]
  useWhen?: string[]
  dependencies?: string[]
  conflicts?: string[]
  toolRefs?: string[]
  schemaRefs?: string[]
  tokenEstimate?: number
  outputContract?: string
  toolHints?: string[]
  metadata?: Record<string, JSONValue>
}

export interface AgentCatalogProfile {
  schema: 'movscript.agent.profile.v1'
  id: string
  version: string
  name: string
  description?: string
  enabledPacks: string[]
  persona: string | null
  enabledWorkflows: string[]
  enabledPolicies: string[]
  toolGrants: Array<{
    name: string
    mode: AgentToolGrantMode
    approval?: AgentToolApprovalMode
  }>
  model?: {
    provider: string
    modelId: string
    platformModelId?: string
    routes?: unknown[]
  }
  limits?: Record<string, number>
  metadata?: Record<string, JSONValue>
}

export interface ResolvedAgentSkill extends AgentCatalogSkill {
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
  risk?: AgentToolRiskLevel
  projectScoped?: boolean
  approval: AgentToolApprovalMode
  available: boolean
  unavailableReason?: ToolUnavailableReason | string
  requiresApproval: boolean
  resolution?: {
    authorized: boolean
    visible: boolean
    reason?: ToolUnavailableReason | string
    grantSource: 'manifest' | 'none'
    approval: AgentToolApprovalMode
    activeSkillIds: string[]
  }
}

export interface ResolvedToolCatalog {
  discovered: AgentDebugTool[]
  available: AgentDebugTool[]
  blocked: AgentDebugTool[]
  byName: Record<string, AgentDebugTool>
}

export interface AgentRegisteredTool {
  name: string
  description: string
  permission: string
  risk: AgentToolRiskLevel | string
  source?: 'runtime' | 'plugin' | 'mcp'
  category?: string
  categories?: string[]
  inputSchema?: JSONValue
  outputSchema?: JSONValue
  projectScoped: boolean
  requiresApprovalByDefault: boolean
}

export interface AgentPluginCatalogInfo {
  skillsDir: string
  toolsDir: string
  builtinSkillsDir?: string
  builtinToolsDir?: string
  skillCount: number
  toolCount: number
  metadata?: Record<string, unknown>
  skillPlugins?: Array<{
    pluginId: string
    path: string
  }>
  warnings?: string[]
}

export interface AgentMCPStatus {
  connected: boolean
  resources: MCPResource[]
  tools: MCPTool[]
  error?: string
}

export interface AgentCapabilitiesResponse {
  defaultAgentManifest: AgentManifest
  updates?: unknown
  pluginCatalog?: AgentPluginCatalogInfo
  mcp: AgentMCPStatus
  registry: AgentRegisteredTool[]
  resolvedTools: ResolvedToolCatalog
  warnings: string[]
}

export interface AgentInspectResponse {
  mcpEndpoint: string
  resources: MCPResource[]
  tools: MCPTool[]
  registeredTools: AgentRegisteredTool[]
  skills: AgentCatalogSkill[]
  profiles: AgentCatalogProfile[]
  defaultAgentManifest: AgentManifest
  pluginCatalog?: AgentPluginCatalogInfo
}

export const RUNTIME_MODEL_API_KINDS = [
  'openai_chat_completions',
  'openai_responses',
  'anthropic_messages',
] as const

export type RuntimeModelAPIKind = typeof RUNTIME_MODEL_API_KINDS[number]

export const RUNTIME_MODEL_CAPABILITIES = ['reasoning', 'text', 'planning', 'multimodal'] as const

export type RuntimeModelCapability = typeof RUNTIME_MODEL_CAPABILITIES[number]

export type RuntimeModelRouteSource =
  | 'configured'
  | 'chat-config-fallback'
  | 'planner-config'
  | 'disabled'
  | 'unconfigured'

export interface RuntimeModelCredentialStatusPublic {
  required: boolean
  configured: boolean
  sourceEnv: string[]
  acceptedEnv: string[]
}

export interface RuntimeModelCapabilityRoutePublic {
  capability: RuntimeModelCapability
  configured: boolean
  provider?: 'backend-model-config'
  modelConfigId?: number
  model?: string
  source: RuntimeModelRouteSource
}

export interface RuntimeModelConfigPublic {
  configured: boolean
  provider: 'backend-model-config'
  modelConfigId?: number
  model: string
  apiKind: RuntimeModelAPIKind
  baseURL?: string
  apiKeyConfigured: boolean
  useForChat: boolean
  useForPlanner: boolean
  updatedAt?: string
  source: 'file' | 'none'
  credentialStatus: RuntimeModelCredentialStatusPublic
  capabilities?: RuntimeModelCapabilityRoutePublic[]
}

export interface RuntimeModelChatToolCallPublic {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface RuntimeModelChatMessagePublic {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: RuntimeModelChatToolCallPublic[]
}

export interface RuntimeModelRequestSnapshotPublic {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: Record<string, unknown> & {
    model: string
    messages: RuntimeModelChatMessagePublic[]
    stream?: boolean
    temperature?: number
    response_format?: { type: 'json_object' }
    tools?: unknown
    tool_choice?: unknown
    sdk_body?: unknown
  }
}

export interface RuntimeModelTestResult {
  ok: boolean
  provider: string
  model: string
  apiKind: RuntimeModelAPIKind
  modelConfigId?: number
  latencyMs: number
  content: string
  request: RuntimeModelRequestSnapshotPublic
}

export type RuntimeDisplayAnchorPlacement = 'before' | 'after' | 'inside_run_group'

export interface RuntimeDisplayAnchor {
  threadId: string
  runId?: string
  messageId?: string
  taskId?: string
  placement: RuntimeDisplayAnchorPlacement
  reason?: string
}

export interface AgentApprovalRequest {
  id: string
  runId: string
  interactionId?: string
  displayThreadId?: string
  displayAnchor?: RuntimeDisplayAnchor
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
  displayThreadId?: string
  displayAnchor?: RuntimeDisplayAnchor
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
  taskGraphId: string
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

export interface AgentTaskGraph {
  id: string
  sessionId?: string
  threadId: string
  rootRunId?: string
  title: string
  status: AgentTaskGraphStatus
  progress: number
  blockedReason?: string
  metadata?: Record<string, JSONValue>
  createdAt: string
  updatedAt: string
  completedAt?: string
  failedAt?: string
  cancelledAt?: string
}

export interface AgentTaskGraphSummary {
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

export interface AgentTaskGraphSnapshot {
  taskGraph: AgentTaskGraph
  tasks: AgentTask[]
  runs: AgentRun[]
  nameConflicts?: Array<{
    subagentName: string
    taskIds: string[]
  }>
  summary?: AgentTaskGraphSummary
}

export interface DispatchTaskGraphResult {
  taskGraph: AgentTaskGraph
  spawnedRuns: AgentRun[]
  blockedTaskIds: string[]
  retriedTaskIds: string[]
  timedOutRunIds: string[]
}

export interface UpdateTaskGraphResult {
  taskGraph: AgentTaskGraph
  createdTaskIds: string[]
  updatedTaskIds: string[]
  resetTaskIds: string[]
  dispatch?: DispatchTaskGraphResult
}

export interface AgentRun {
  id: string
  sessionId?: string
  threadId: string
  status: AgentRunStatus
  role?: AgentRunRole
  parentRunId?: string
  taskGraphId?: string
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
  streamPartial?: true
}

export interface AgentThreadResolution {
  requestedThreadId?: string
  threadId: string
  reusedExistingThread: boolean
  createdNewThread: boolean
  missingRequestedThread: boolean
}

export interface RunMessageResult {
  run: AgentRun
  thread: AgentThread
  threadResolution: AgentThreadResolution
  sourceMessage?: AgentMessage
}

export interface CreateMessageRunResult {
  run: AgentRun
  message: AgentMessage
  runtimeInput?: {
    accepted: boolean
    runId: string
    messageId: string
    status: string
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

export interface AgentClientInput {
  message: string
  attachments?: AgentClientAttachmentRef[]
  uiSnapshot?: {
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
    }
    productionId?: number
    draftId?: string
    agent?: {
      key?: string
      name?: string
    }
    selection?: {
      entityType?: string
      entityId?: number | string
      label?: string
    } | null
    recentResources?: AgentClientResourceRef[]
    labels?: string[]
  }
}

export type RuntimeWorkKind = 'generation_job' | 'subagent_run'
export type RuntimeWorkMode = 'async'
export type RuntimeWorkStatus = 'pending_approval' | 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled' | 'timeout'
export type RuntimeWorkContinuationMode = 'none' | 'any_completed' | 'all_completed' | 'all_settled' | 'manual_selection'

export interface RuntimeWorkExternalHandle {
  provider: string
  type: string
  id: string | number
}

export interface RuntimeWork {
  id: string
  sessionId?: string
  threadId: string
  runId: string
  kind: RuntimeWorkKind
  mode: RuntimeWorkMode
  status: RuntimeWorkStatus
  request: unknown
  continuationPolicy?: {
    mode: RuntimeWorkContinuationMode
    groupId?: string
  }
  externalHandle?: RuntimeWorkExternalHandle
  result?: unknown
  error?: string
  timeoutMs?: number
  pollIntervalMs?: number
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface RuntimeWorkStartInput {
  sessionId?: string
  threadId: string
  runId: string
  kind: RuntimeWorkKind
  request: Record<string, JSONValue>
  continuationPolicy?: RuntimeWork['continuationPolicy']
  timeoutMs?: number
  pollIntervalMs?: number
  signal?: AbortSignal
}

export interface RuntimeWorkWaitInput {
  workIds: string[]
  mode?: 'all' | 'any'
  timeoutMs?: number
  pollIntervalMs?: number
  signal?: AbortSignal
  onWork?: (work: RuntimeWork) => void
}

export interface RuntimeWorkWaitResult {
  status: 'completed' | 'partial' | 'timeout' | 'failed' | 'cancelled'
  done: boolean
  mode: 'all' | 'any'
  workIds: string[]
  works: RuntimeWork[]
  completed: RuntimeWork[]
  pending: RuntimeWork[]
  failed: RuntimeWork[]
  cancelled: RuntimeWork[]
  timeoutMs: number
  message: string
}

export type RuntimeInteractionKind = 'approval' | 'input' | 'selection'
export type RuntimeInteractionStatus = 'pending' | 'approved' | 'rejected' | 'answered' | 'cancelled'

export interface RuntimeInteraction {
  id: string
  threadId: string
  runId: string
  sessionId?: string
  originThreadId?: string
  originRunId?: string
  displayThreadId?: string
  displayAnchor?: RuntimeDisplayAnchor
  workId?: string
  kind: RuntimeInteractionKind
  status: RuntimeInteractionStatus
  payload: unknown
  result?: unknown
  createdAt: string
  updatedAt: string
  resolvedAt?: string
}

export type RuntimeContinuationStatus = 'waiting' | 'ready' | 'consumed' | 'cancelled'

export interface RuntimeContinuation {
  id: string
  threadId: string
  runId: string
  status: RuntimeContinuationStatus
  trigger:
    | { type: 'work_completed'; workIds: string[]; mode: 'any' | 'all' }
    | { type: 'interaction_resolved'; interactionIds: string[]; mode: 'any' | 'all' }
    | { type: 'manual' }
  nextInput?: {
    workResults?: string[]
    interactionResults?: string[]
    message?: string
  }
  createdAt: string
  updatedAt: string
  consumedAt?: string
  cancelledAt?: string
}

export type AgentRuntimeScopeType = 'thread' | 'session' | 'run' | 'plan'

export interface AgentRuntimeScopeRef {
  type: AgentRuntimeScopeType
  id: string
}

export interface AgentRuntimeEntitiesV2 {
  sessions?: AgentSession[]
  threads?: AgentThread[]
  messages?: AgentMessage[]
  runs?: AgentRun[]
  steps?: AgentRunStep[]
  traces?: AgentTraceEvent[]
  interactions?: RuntimeInteraction[]
  works?: RuntimeWork[]
  continuations?: RuntimeContinuation[]
  plans?: AgentPlan[]
  planRevisions?: AgentPlanRevision[]
  taskGraphs?: AgentTaskGraphSnapshot[]
}

export interface AgentRuntimeSnapshotV2 {
  schema: typeof AGENT_RUNTIME_SNAPSHOT_V2_SCHEMA
  protocolVersion: typeof AGENT_PROTOCOL_VERSION
  scope: AgentRuntimeScopeRef
  cursor: string
  ordinal: number
  generatedAt: string
  entities: AgentRuntimeEntitiesV2
}

export type AgentRuntimeEntityType = keyof AgentRuntimeEntitiesV2

export type AgentRuntimeEventKind =
  | 'session.upserted'
  | 'thread.upserted'
  | 'message.upserted'
  | 'run.upserted'
  | 'step.upserted'
  | 'trace.upserted'
  | 'interaction.upserted'
  | 'work.upserted'
  | 'continuation.upserted'
  | 'plan.upserted'
  | 'plan_revision.upserted'
  | 'task_graph.upserted'
  | 'assistant.delta'
  | 'scope.done'

export interface AgentRuntimeEventCausalityV2 {
  sessionId?: string
  threadId?: string
  runId?: string
  messageId?: string
  stepId?: string
  traceId?: string
  interactionId?: string
  workId?: string
  continuationId?: string
  planId?: string
  planRevisionId?: string
  taskGraphId?: string
  taskId?: string
  sourceEventId?: string
}

export type AgentRuntimeEventEntityV2 =
  | { type: 'session'; value: AgentSession }
  | { type: 'thread'; value: AgentThread }
  | { type: 'message'; value: AgentMessage }
  | { type: 'run'; value: AgentRun }
  | { type: 'step'; value: AgentRunStep }
  | { type: 'trace'; value: AgentTraceEvent }
  | { type: 'interaction'; value: RuntimeInteraction }
  | { type: 'work'; value: RuntimeWork }
  | { type: 'continuation'; value: RuntimeContinuation }
  | { type: 'plan'; value: AgentPlan }
  | { type: 'plan_revision'; value: AgentPlanRevision }
  | { type: 'task_graph'; value: AgentTaskGraphSnapshot }

export interface AgentRuntimeAssistantDeltaV2 {
  runId: string
  traceId: string
  delta: string
  accumulated: string
  createdAt: string
  roundIndex?: number
  roundLabel?: string
}

export interface AgentRuntimeEventV2 {
  schema: typeof AGENT_RUNTIME_EVENT_V2_SCHEMA
  protocolVersion: typeof AGENT_PROTOCOL_VERSION
  id: string
  scope: AgentRuntimeScopeRef
  ordinal: number
  cursor: string
  emittedAt: string
  kind: AgentRuntimeEventKind
  causality?: AgentRuntimeEventCausalityV2
  entity?: AgentRuntimeEventEntityV2
  assistantDelta?: AgentRuntimeAssistantDeltaV2
}

export type EventStateDropReason =
  | 'duplicate_event'
  | 'invalid_schema'
  | 'invalid_shape'
  | 'ordinal_regression'
  | 'ordinal_gap'
  | 'stale_entity'
  | 'kind_entity_mismatch'
  | 'delta_regression'

export interface EventStateDebugReportV1 {
  schema: typeof EVENT_STATE_DEBUG_V1_SCHEMA
  generatedAt: string
  scope: AgentRuntimeScopeRef
  input: {
    lastSnapshotCursor?: string
    currentCursor?: string
    currentOrdinal?: number
    eventsRead: string[]
    eventsAccepted: string[]
    eventsDropped: Array<{ eventId?: string; ordinal?: number; kind?: string; reason: EventStateDropReason; detail?: string }>
    gaps: Array<{ expectedOrdinal: number; receivedOrdinal: number; action: 'snapshot_required' }>
  }
  normalized: {
    sessions: AgentSession[]
    threads: AgentThread[]
    messages: AgentMessage[]
    runs: AgentRun[]
    steps: AgentRunStep[]
    traces: AgentTraceEvent[]
    interactions: RuntimeInteraction[]
    works: RuntimeWork[]
    continuations: RuntimeContinuation[]
    plans: AgentPlan[]
    planRevisions: AgentPlanRevision[]
    taskGraphs: AgentTaskGraphSnapshot[]
    assistantDeltas: AgentRuntimeAssistantDeltaV2[]
  }
  mergeDecisions: Array<{ entityType: string; entityId: string; decision: 'insert' | 'replace' | 'keep_existing' | 'drop'; reason: string; previousRevision?: string | number; nextRevision?: string | number }>
  projection: {
    conversationMessages: Array<{ id: string; role: 'user' | 'assistant'; content: string; runId?: string; messageId?: string; traceId?: string; status?: string }>
    pendingInteractions: RuntimeInteraction[]
    activeRunIds: string[]
  }
  invariants: Array<{ name: string; status: 'pass' | 'fail'; detail?: string }>
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

export interface AgentWorkflowConfig {
  profile: AgentWorkflowProfile
  includeMemories?: boolean
  allowForcedToolCalls?: boolean
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
  agentTaskGraph?: {
    id: string
    title: string
    status: AgentTaskGraphStatus
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
    summary?: AgentTaskGraphSummary
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
    reason?: ToolUnavailableReason | string
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
  'taskGraph',
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

export interface ToolCall {
  id?: string
  name: string
  args?: Record<string, JSONValue>
  arguments?: Record<string, JSONValue>
}

export interface AgentTraceQuery {
  cursor?: string
  limit?: number
  kind?: AgentTraceEventKind
}

export interface AgentRunTracePage {
  runId: string
  events: AgentTraceEvent[]
  total: number
  hasMore: boolean
  nextCursor?: string
}

export interface AgentRunTraceSummary {
  runId: string
  total: number
  byKind: Partial<Record<AgentTraceEventKind, number>>
  latestEvent?: AgentTraceEvent
}

export interface AgentAttachment {
  id: string
  name: string
  type: 'image' | 'video' | 'audio' | 'text' | 'file'
  mimeType: string
  size: number
  url?: string
  previewUrl?: string
  resourceId?: number
  generated?: {
    jobId?: number
    jobType?: string
    providerName?: string
    modelDisplay?: string
    modelIdentifier?: string
    modelConfigId?: number
    status?: string
    stage?: string
  }
}

export interface AgentTaskArtifactRef {
  type: 'draft'
  draftId: string
  projectId?: number
  draftKind?: AgentDraftKind
  title?: string
  schema?: string
  source?: Record<string, unknown>
  target?: Record<string, unknown>
  metadata?: Record<string, unknown>
  filePath?: string
  sourceRunId?: string
  sourceThreadId?: string
  updatedAt?: string
}

export interface AgentChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: AgentAttachment[]
  meta?: AgentChatMessageMeta
  timestamp: number
}

export interface AgentConversation {
  id: string
  title: string
  messages: AgentChatMessage[]
  runtimeSessionId?: string
  runtimeThreadId?: string
  createdAt: number
  updatedAt: number
}

export interface AgentConversationDraft {
  input: string
  attachments: AgentAttachment[]
}

export interface AgentRuntimeMessageRef {
  threadId: string
  messageId?: string
  runId?: string
}

export interface AgentRuntimeInputRef {
  threadId?: string
  runId?: string
  messageId?: string
  status: 'pending' | 'accepted' | 'consumed' | 'failed'
  error?: string
}

export interface AgentChatMessageMeta {
  modelId?: number | null
  agentName?: string
  permissionMode?: 'ask' | 'suggest' | 'auto'
  contextLabels?: string[]
  runtimeMessage?: AgentRuntimeMessageRef
  runtimeInput?: AgentRuntimeInputRef
  contextDiagnostic?: AgentContextDiagnostic
  generationJobs?: AgentGenerationJob[]
  generationParamAudits?: AgentGenerationParamAudit[]
  generationValidationErrors?: AgentGenerationValidationError[]
  draftArtifacts?: AgentTaskArtifactRef[]
  localRunActivity?: AgentRunActivity
  planRevision?: AgentPlanRevision
}

export interface AgentContextDiagnostic {
  schema: 'movscript.local_context_diagnostic.v1'
  command?: Record<string, unknown>
  modelGatewayCalled: boolean
  messages: Array<{ role: string; content: string }>
  systemPrompt?: string
  debugParts: Array<{ id: string; kind: string; title: string; content: string }>
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
  tools: {
    available: AgentContextDiagnosticTool[]
    blocked: AgentContextDiagnosticTool[]
    discoveredCount: number
    modelTools: Array<{ name: string; description?: string; parameters?: unknown }>
  }
  skills: Array<{
    id: string
    name: string
    category?: string
    activationReason?: string
    resolvedPriority?: number
  }>
  warnings: string[]
}

export interface AgentContextDiagnosticTool {
  name: string
  description?: string
  source?: string
  registered?: boolean
  granted?: boolean
  available?: boolean
  permission?: string
  risk?: string
  projectScoped?: boolean
  approval?: string
  requiresApproval?: boolean
  unavailableReason?: string
  inputSchema?: unknown
  outputSchema?: unknown
  resolution?: {
    authorized: boolean
    visible: boolean
    reason?: string
    grantSource: 'manifest' | 'none'
    approval: 'never' | 'always' | 'on_write'
    activeSkillIds: string[]
  }
}

export interface AgentGenerationJob {
  jobId?: number
  jobType?: string
  providerName?: string
  modelDisplay?: string
  modelIdentifier?: string
  modelConfigId?: number
  status: string
  stage?: string
  progress?: number
  terminal: boolean
  outputResourceId?: number
  outputResourceIds?: number[]
  message?: string
  firstSeenAt?: string
  updatedAt?: string
  completedAt?: string
}

export interface AgentGenerationParamAudit {
  stepId?: string
  jobId?: number
  auditVersion?: number
  modelConfigId?: number
  modelContractLoaded: boolean
  paramsSchemaLoaded: boolean
  paramsSchemaRuleCount?: number
  supportedParams: string[]
  providedExtraParams: string[]
  submittedExtraParams: string[]
  droppedExtraParams: string[]
  droppedTopLevelParams: string[]
  dropReasons?: Record<string, string>
  renamedExtraParams?: Record<string, string>
  extraParamsParseError?: string
  preflightErrors?: AgentGenerationParamPreflightError[]
  inputRequirements?: AgentGenerationInputRequirements
  submittedInputs?: AgentGenerationSubmittedInputs
  inputPreflightErrors?: AgentGenerationInputPreflightError[]
  repairNote?: string
}

export interface AgentGenerationInputRequirement {
  min: number
  max: number
}

export interface AgentGenerationInputRequirements {
  image: AgentGenerationInputRequirement
  video: AgentGenerationInputRequirement
}

export interface AgentGenerationSubmittedInputs {
  image: number
  video: number
}

export interface AgentGenerationParamPreflightError {
  code: string
  field: string
  message: string
  allowedValues?: Array<string | number | boolean>
  suggestedFix?: Record<string, unknown>
}

export interface AgentGenerationInputPreflightError {
  code: string
  field: 'image' | 'video'
  message: string
  requiredMin: number
  allowedMax: number
  actualCount: number
}

export interface AgentGenerationValidationError {
  stepId?: string
  code: string
  field?: string
  message: string
  allowedValues?: Array<string | number | boolean>
  suggestedFix?: Record<string, unknown>
  requiredMin?: number
  allowedMax?: number
  actualCount?: number
}

export interface AgentRunActivity {
  runId: string
  threadId: string
  status: string
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  error?: string
  warnings?: string[]
  approvals?: AgentRunActivityApproval[]
  inputs?: AgentRunActivityInputRequest[]
  steps: AgentRunActivityStep[]
  events: AgentRunActivityEvent[]
}

export interface AgentRunActivityApproval {
  id: string
  runId?: string
  interactionId?: string
  displayThreadId?: string
  displayAnchor?: RuntimeDisplayAnchor
  toolName: string
  args?: Record<string, unknown>
  preview?: unknown
  reason: string
  risk?: string
  permission?: string
  status: string
  createdAt: string
  updatedAt: string
  approvedAt?: string
  rejectedAt?: string
}

export interface AgentRunActivityInputRequest {
  id: string
  runId?: string
  displayThreadId?: string
  displayAnchor?: RuntimeDisplayAnchor
  title: string
  summary?: string
  question: string
  inputType: string
  choices: Array<{ id: string; label: string; description?: string }>
  allowCustomAnswer: boolean
  status: string
  createdAt: string
  updatedAt: string
  answeredAt?: string
  answer?: {
    choiceIds?: string[]
    text?: string
  }
}

export interface AgentRunActivityStep {
  id: string
  type: 'tool_call' | 'message'
  status: string
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  roundSource?: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final'
  title?: string
  toolName?: string
  args?: unknown
  result?: unknown
  error?: string
  sandboxed?: boolean
  durationMs?: number
  createdAt: string
  completedAt?: string
}

export interface AgentRunActivityEvent {
  id: string
  kind: string
  title: string
  summary?: string
  status: string
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  roundSource?: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final'
  toolName?: string
  stepId?: string
  data?: unknown
  durationMs?: number
  createdAt: string
  completedAt?: string
}
