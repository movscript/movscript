import { useUserStore } from '@/store/userStore'
import { getAPIV1BaseURL } from '@/lib/config'

export type AgentMessageRole = 'system' | 'user' | 'assistant'
export type AgentRunStatus = 'queued' | 'in_progress' | 'requires_action' | 'completed' | 'completed_with_warnings' | 'failed' | 'cancelled'
export type AgentThreadStatus = 'idle' | 'running' | 'requires_action' | 'completed' | 'failed' | 'cancelled'
export type AgentStepStatus = 'in_progress' | 'completed' | 'failed'
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
  metadata?: Record<string, unknown>
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
  metadata?: Record<string, unknown>
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
  args?: Record<string, unknown>
  result?: unknown
  error?: string
  errorData?: unknown
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
  data?: unknown
  durationMs?: number
  createdAt: string
  completedAt?: string
}

export interface AgentToolCall {
  name: string
  args?: Record<string, unknown>
}

export interface AgentManifest {
  schema: 'movscript.agent.current'
  id: string
  version: string
  name: string
  description?: string
  soul?: string
  permissions: string[]
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
  metadata?: Record<string, unknown>
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
  metadata?: Record<string, unknown>
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
    mode: 'allow' | 'deny'
    approval?: 'never' | 'always' | 'on_write'
  }>
  model?: {
    provider: string
    modelId: string
    platformModelId?: string
    routes?: unknown[]
  }
  limits?: Record<string, number>
  metadata?: Record<string, unknown>
}

export interface AgentDebugContextPanel {
  route: { pathname: string; search?: string; hash?: string }
  projects?: Array<{ id: number; name: string; description?: string; status?: string; totalEpisodes?: number }>
  projectsError?: string
  project?: { id: number; name?: string; status?: string; description?: string; aspect_ratio?: string; visual_style?: string; project_style?: string }
  productionId?: number
  user?: { id: number; username: string; systemRole?: string }
  selection?: { entityType: string; entityId: number | string; label?: string } | null
  recentResources: Array<{ id: number; name: string; type: string; mimeType?: string; size?: number }>
  attachments: Array<{ id: string; name: string; type: string; resourceId?: number }>
  memories: Array<{ id: string; scope: string; kind: string; content: string }>
  labels: string[]
  statusDigest?: string[]
  rawContextHints?: string[]
}

export interface ResolvedAgentSkill extends AgentCatalogSkill {
  resolvedPriority: number
  activationReason: 'profile' | 'trigger' | 'default'
  compiledInstruction: string
  warnings: string[]
}

export interface AgentDebugTool {
  name: string
  description?: string
  inputSchema?: unknown
  outputSchema?: unknown
  source: 'mcp' | 'runtime' | 'plugin'
  registered: boolean
  granted: boolean
  permission?: string
  risk?: 'read' | 'draft' | 'write' | 'generate' | 'destructive' | 'ui'
  projectScoped?: boolean
  approval: 'never' | 'always' | 'on_write'
  available: boolean
  unavailableReason?: string
  requiresApproval: boolean
}

export interface ResolvedToolCatalog {
  discovered: AgentDebugTool[]
  available: AgentDebugTool[]
  blocked: AgentDebugTool[]
  byName: Record<string, AgentDebugTool>
}

export interface CompiledPromptPreview {
  system: string
  messages: Array<{ role: string; content: string }>
  debugParts: Array<{ id: string; kind: string; title: string; content: string }>
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
  agentManifest?: AgentManifest
  pendingApprovals?: AgentApprovalRequest[]
  pendingInputRequests?: AgentInputRequest[]
  policy: AgentRunPolicy
  metadata?: Record<string, unknown>
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

export interface AgentTaskArtifact {
  id: string
  type: string
  title?: string
  uri?: string
  metadata?: Record<string, unknown>
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
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  cancelledAt?: string
}

export interface AgentPlan {
  id: string
  threadId: string
  rootRunId?: string
  title: string
  status: AgentPlanStatus
  progress: number
  blockedReason?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
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
  summary?: {
    taskCount: number
    taskStatusCounts: Record<AgentTask['status'], number>
    workerCount: number
    activeWorkerCount: number
    artifactCount: number
    nameConflictCount: number
    blockedTaskIds: string[]
    needsReviewTaskIds: string[]
    failedTaskIds: string[]
  }
}

export interface DispatchPlanResult {
  plan: AgentPlan
  spawnedRuns: AgentRun[]
  blockedTaskIds: string[]
  retriedTaskIds: string[]
  timedOutRunIds: string[]
}

export interface ReplanRunResult {
  plan: AgentPlan
  createdTaskIds: string[]
  updatedTaskIds: string[]
  resetTaskIds: string[]
  dispatch?: DispatchPlanResult
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
  debug?: Record<string, unknown>
  toolCalls: AgentToolCall[]
  pendingApprovals: AgentApprovalRequest[]
  warnings: string[]
  memoryIds: string[]
  memoryCount: number
  createdAt: string
}

export interface AgentClientInput {
  message: string
  attachments?: Array<{
    id?: string
    name?: string
    type?: string
    mimeType?: string
    size?: number
    resourceId?: number
  }>
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
    selection?: {
      entityType?: string
      entityId?: number | string
      label?: string
    } | null
    recentResources?: Array<{
      id?: number
      name?: string
      type?: string
      mimeType?: string
      size?: number
    }>
    labels?: string[]
  }
}

export interface AgentRunPolicy {
  approvalMode: 'interactive' | 'auto_readonly' | 'auto'
  sandboxMode?: boolean
  maxToolCalls: number
  maxIterations: number
  allowNetwork: boolean
  allowFileBytes: boolean
  costLimit?: {
    currency: string
    amount: number
  }
}

export type AgentRunPolicyOverride = Partial<Pick<AgentRunPolicy, 'approvalMode' | 'maxToolCalls' | 'maxIterations'>>

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
    resources: Array<{ uri: string; name?: string; description?: string; mimeType?: string }>
    tools: Array<{ name: string; description?: string; inputSchema?: unknown }>
    error?: string
  }
  registry: Array<{
    name: string
    description: string
    permission: string
    risk: string
    projectScoped: boolean
    requiresApprovalByDefault: boolean
  }>
  resolvedTools: ResolvedToolCatalog
  warnings: string[]
}

export interface AgentInspectResponse {
  mcpEndpoint: string
  resources: Array<{ uri: string; name?: string; description?: string; mimeType?: string }>
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }>
  registeredTools: Array<{
    name: string
    description: string
    permission: string
    risk: AgentDebugTool['risk']
    projectScoped: boolean
    requiresApprovalByDefault: boolean
    source?: string
    category?: string
    categories?: string[]
  }>
  skills: AgentCatalogSkill[]
  profiles: AgentCatalogProfile[]
  defaultAgentManifest: AgentManifest
  pluginCatalog?: {
    skillsDir: string
    toolsDir: string
    builtinSkillsDir?: string
    builtinToolsDir?: string
    skillCount: number
    toolCount: number
    skillPlugins?: Array<{
      pluginId: string
      path: string
    }>
    warnings?: string[]
  }
}

export interface AgentApprovalRequest {
  id: string
  runId: string
  toolName: string
  args?: Record<string, unknown>
  preview?: unknown
  reason: string
  risk?: string
  permission?: string
  status: 'pending' | 'approved' | 'rejected'
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

export interface AgentHealth {
  ok: boolean
  service: string
  mode: string
  mcpEndpoint: string
  runtime?: {
    apiVersion: number
    features: string[]
    endpoints: string[]
  }
  paths?: {
    statePath: string
    memoryPath: string
    draftPath: string
    modelConfigPath: string
  }
  modelConfigPath?: string
  modelConfig?: RuntimeModelConfigPublic
  modelCapabilities?: RuntimeModelCapabilityRoutePublic[]
  pluginCatalog?: {
    skillsDir: string
    toolsDir: string
    builtinSkillsDir?: string
    builtinToolsDir?: string
    skillCount: number
    toolCount: number
    warnings?: string[]
  }
}

export interface RuntimeModelConfigPublic {
  configured: boolean
  provider: 'backend-model-config'
  modelConfigId?: number
  model: string
  apiKind?: 'openai_chat_completions' | 'openai_responses' | 'anthropic_messages'
  baseURL?: string
  apiKeyConfigured?: boolean
  useForChat: boolean
  useForPlanner: boolean
  updatedAt?: string
  source: 'file' | 'none'
  credentialStatus?: RuntimeModelCredentialStatusPublic
  capabilities?: RuntimeModelCapabilityRoutePublic[]
}

export interface RuntimeModelCredentialStatusPublic {
  required: boolean
  configured: boolean
  sourceEnv: string[]
  acceptedEnv: string[]
}

export interface RuntimeModelCapabilityRoutePublic {
  capability: 'reasoning' | 'text' | 'planning' | 'multimodal'
  configured: boolean
  provider?: 'backend-model-config'
  modelConfigId?: number
  model?: string
  source: 'configured' | 'chat-config-fallback' | 'planner-config' | 'disabled' | 'unconfigured'
}

export interface RuntimeModelTestResult {
  ok: boolean
  provider: string
  model: string
  apiKind?: 'openai_chat_completions' | 'openai_responses' | 'anthropic_messages'
  modelConfigId?: number
  latencyMs: number
  content: string
  request: {
    url: string
    method: 'POST'
    headers: Record<string, string>
    body: {
      model: string
      messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null }>
      stream?: boolean
      temperature?: number
      response_format?: { type: 'json_object' }
      tools?: unknown
      tool_choice?: unknown
      sdk_body?: unknown
    } & Record<string, unknown>
  }
}

export type AgentMemoryScope = 'global' | 'project' | 'thread'
export type AgentMemoryKind = 'preference' | 'fact' | 'entity_ref' | 'draft' | 'decision' | 'warning'
export type AgentDraftKind =
  | 'setting_proposal'
  | 'script_split_proposal'
  | 'script'
  | 'asset_slot'
  | 'content_unit'
  | 'prompt'
  | 'note'
  | 'pipeline'
  | 'segment'
  | 'scene_moment'
  | 'asset_proposal'
  | 'project_standards_proposal'
  | 'production_proposal'
  | 'content_unit_proposal'
export type AgentDraftStatus = 'draft' | 'accepted' | 'rejected' | 'applied' | 'superseded'

export interface AgentMemory {
  id: string
  scope: AgentMemoryScope
  projectId?: number
  threadId?: string
  kind: AgentMemoryKind
  content: string
  sourceRunId?: string
  sourceMessageId?: string
  createdAt: string
  updatedAt: string
}

export interface AgentDraft {
  id: string
  projectId?: number
  kind: AgentDraftKind
  title: string
  content: string
  status: AgentDraftStatus
  source?: Record<string, unknown>
  target?: Record<string, unknown>
  createdByRunId?: string
  createdByThreadId?: string
  appliedByUserId?: number | string
  appliedAt?: string
  rejectedReason?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AgentDraftApplyReview {
  draftId: string
  draftTitle: string
  draftKind: AgentDraftKind
  target: Record<string, unknown>
  currentValue: unknown
  proposedValue: unknown
  risk: 'write'
  sideEffect: string
  requiresBackendApply: boolean
}

export interface AgentDraftApplyPreview {
  status: 'preview' | 'applied'
  review: AgentDraftApplyReview
  draft: AgentDraft
  message: string
  backendApply?: Record<string, unknown>
}

export interface AgentDraftPatchOp {
  op: 'add' | 'replace' | 'remove'
  path: string
  value?: unknown
}

export interface AgentDraftValidationIssue {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export interface AgentDraftValidationResult {
  ok: boolean
  draftId: string
  kind: AgentDraftKind
  issues: AgentDraftValidationIssue[]
}

export interface AgentDraftPatchResult {
  status: 'patched'
  draft: AgentDraft
  changedPaths: string[]
  validation: AgentDraftValidationResult
}

export interface RunMessageResult {
  run: AgentRun
  thread: AgentThread
  threadResolution: AgentThreadResolution
}

export interface AgentThreadResolution {
  requestedThreadId?: string
  threadId: string
  reusedExistingThread: boolean
  createdNewThread: boolean
  missingRequestedThread: boolean
}

export class LocalAgentHTTPError extends Error {
  constructor(
    readonly status: number,
    readonly responseText: string,
    message: string,
  ) {
    super(`local agent returned ${status}: ${message}`)
  }
}

export function isLocalAgentNotFoundError(error: unknown): boolean {
  return error instanceof LocalAgentHTTPError
    ? error.status === 404
    : error instanceof Error && /^local agent returned 404:/.test(error.message)
}

export type AgentRunStreamEvent =
  | {
    type: 'run'
    run: AgentRun
  }
  | {
    type: 'trace'
    runId: string
    event: AgentTraceEvent
    run?: AgentRun
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
    run?: AgentRun
  }
  | {
    type: 'assistant_message'
    runId: string
    message: AgentMessage
    run: AgentRun
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
    run: AgentRun
  }

export interface AgentRunTraceResponse {
  runId: string
  events: AgentTraceEvent[]
  total?: number
  hasMore?: boolean
  nextCursor?: string
}

export interface AgentRunTraceSummary {
  runId: string
  total: number
  byKind: Partial<Record<AgentTraceEventKind, number>>
  latestEvent?: AgentTraceEvent
}

export interface AgentSkillBundleFile {
  path: string
  content: string
}

export interface AgentSkillBundleInstallResult {
  status: 'installed'
  pluginId: string
  targetDir: string
  installedFiles: string[]
  catalog?: Record<string, unknown>
}

export interface AgentSkillBundleUninstallResult {
  status: 'uninstalled'
  pluginId: string
  targetDir: string
  removed: boolean
  catalog?: Record<string, unknown>
}

export interface RunMessageOptions {
  onRunUpdate?: (run: AgentRun) => void
  onStreamEvent?: (event: AgentRunStreamEvent) => void
  onAssistantDelta?: (event: Extract<AgentRunStreamEvent, { type: 'assistant_delta' }>) => void
  timeoutMs?: number
  streamRequestTimeoutMs?: number
  pollMs?: number
  agentManifest?: AgentManifest
  runPolicy?: AgentRunPolicyOverride
  signal?: AbortSignal
}

const DEFAULT_LOCAL_AGENT_BASE_URL = 'http://127.0.0.1:28765'
const DEFAULT_RUN_STREAM_HTTP_TIMEOUT_MS = 60_000
const TERMINAL_RUN_STATUSES = new Set<AgentRunStatus>([
  'completed',
  'completed_with_warnings',
  'requires_action',
  'failed',
  'cancelled',
])

export function canStartLocalAgentFromClient(): boolean {
  return typeof window !== 'undefined' && typeof window.api?.ensureAgentRuntime === 'function'
}

export class LocalAgentClient {
  readonly baseURL: string

  constructor(baseURL = runtimeLocalAgentBaseURL()) {
    this.baseURL = baseURL.replace(/\/+$/, '')
  }

  health(): Promise<AgentHealth> {
    return this.getJSON('/health', { auth: false })
  }

  inspect(): Promise<AgentInspectResponse> {
    return this.getJSON('/inspect')
  }

  async ensureRunning(): Promise<AgentHealth> {
    try {
      return await this.health()
    } catch (healthError) {
      const ensureAgentRuntime = canStartLocalAgentFromClient() ? window.api?.ensureAgentRuntime : undefined
      if (!ensureAgentRuntime) {
        throw new Error(`当前窗口没有桌面客户端启动能力。请用 Electron 桌面端打开，或手动运行：pnpm --filter movscript-agent dev`)
      }

      const status = await ensureAgentRuntime({ baseURL: this.baseURL })
      if (!status.ok) {
        throw new Error(status.error || `failed to start agent at ${this.baseURL}`)
      }
      return this.health()
    }
  }

  createThread(input: { title?: string; projectId?: number } = {}, signal?: AbortSignal): Promise<AgentThread> {
    return this.postJSON('/threads', input, signal)
  }

  listThreads(): Promise<{ threads: AgentThreadSummary[] }> {
    return this.getJSON('/threads')
  }

  addMessage(threadId: string, content: string, clientInput?: AgentClientInput, signal?: AbortSignal): Promise<AgentMessage> {
    return this.postJSON(`/threads/${encodeURIComponent(threadId)}/messages`, {
      role: 'user',
      content,
      ...(clientInput ? { clientInput } : {}),
    }, signal)
  }

  createRun(threadId: string, input: { agentManifest?: AgentManifest; approvedToolNames?: string[]; clientInput?: AgentClientInput; policy?: AgentRunPolicyOverride } = {}, signal?: AbortSignal): Promise<AgentRun> {
    return this.postJSON('/runs', { threadId, ...input }, signal)
  }

  listRuns(): Promise<{ runs: AgentRun[] }> {
    return this.getJSON('/runs')
  }

  listRunsByParent(parentRunId: string, signal?: AbortSignal): Promise<{ runs: AgentRun[] }> {
    return this.getJSON(`/runs?parentRunId=${encodeURIComponent(parentRunId)}`, { signal })
  }

  createToolRun(input: {
    threadId?: string
    title?: string
    message?: string
    toolCall: AgentToolCall
    agentManifest?: AgentManifest
    approvedToolNames?: string[]
    clientInput?: AgentClientInput
    policy?: AgentRunPolicyOverride
  }, signal?: AbortSignal): Promise<AgentRun> {
    return this.postJSON('/runs/tool', input, signal)
  }

  previewRun(input: { threadId?: string; message?: string; agentManifest?: AgentManifest; approvedToolNames?: string[]; clientInput?: AgentClientInput; policy?: AgentRunPolicyOverride }, signal?: AbortSignal): Promise<AgentRunPreview> {
    return this.postJSON('/runs/preview', input, signal)
  }

  getCapabilities(query: { projectId?: number } = {}): Promise<AgentCapabilitiesResponse> {
    const params = new URLSearchParams()
    if (typeof query.projectId === 'number') params.set('projectId', String(query.projectId))
    return this.getJSON(`/capabilities${params.size ? `?${params.toString()}` : ''}`)
  }

  installAgentSkillBundle(input: { pluginId: string; files: AgentSkillBundleFile[] }, signal?: AbortSignal): Promise<AgentSkillBundleInstallResult> {
    return this.postJSON('/agent-catalog/skills/install-bundle', input, signal)
  }

  uninstallAgentSkillBundle(input: { pluginId: string }, signal?: AbortSignal): Promise<AgentSkillBundleUninstallResult> {
    return this.postJSON('/agent-catalog/skills/uninstall-bundle', input, signal)
  }

  reloadAgentCatalog(signal?: AbortSignal): Promise<unknown> {
    return this.postJSON('/agent-catalog/reload', {}, signal)
  }

  saveDefaultAgentProfile(input: { profileId: string }, signal?: AbortSignal): Promise<AgentManifest> {
    return this.postJSON('/agent-profiles/default', input, signal)
  }

  saveDefaultToolPolicy(input: { toolGrants: AgentManifest['tools'] }, signal?: AbortSignal): Promise<AgentManifest> {
    return this.postJSON('/agent-tools/default-policy', input, signal)
  }

  saveDefaultSkillPolicy(input: { skills: Array<{ id: string; enabled: boolean }> }, signal?: AbortSignal): Promise<{ skills: AgentCatalogSkill[] }> {
    return this.postJSON('/agent-skills/default-policy', input, signal)
  }

  getModelConfig(): Promise<RuntimeModelConfigPublic> {
    return withRuntimeModelConfigError(this.getJSON('/model-config', { auth: false }))
  }

  saveModelConfig(input: {
    modelConfigId?: number
    model: string
    apiKind?: 'openai_chat_completions' | 'openai_responses' | 'anthropic_messages'
    baseURL?: string
    apiKey?: string
    useForChat?: boolean
    useForPlanner?: boolean
  }): Promise<RuntimeModelConfigPublic> {
    return withRuntimeModelConfigError(this.postJSON('/model-config', input))
  }

  clearModelConfig(): Promise<RuntimeModelConfigPublic> {
    return withRuntimeModelConfigError(this.deleteJSON('/model-config'))
  }

  testModelConfig(input: {
    message?: string
    modelConfigId?: number
    model?: string
    apiKind?: 'openai_chat_completions' | 'openai_responses' | 'anthropic_messages'
    baseURL?: string
    apiKey?: string
    useForChat?: boolean
    useForPlanner?: boolean
  } = {}): Promise<RuntimeModelTestResult> {
    return withRuntimeModelConfigError(this.postJSON('/model-config/test', input))
  }

  approveRun(runId: string, input: { approvedToolNames?: string[]; approvalIds?: string[] } = {}, signal?: AbortSignal): Promise<AgentRun> {
    return this.postJSON(`/runs/${encodeURIComponent(runId)}/approve`, input, signal)
  }

  rejectRun(runId: string, input: { approvalIds?: string[] } = {}, signal?: AbortSignal): Promise<AgentRun> {
    return this.postJSON(`/runs/${encodeURIComponent(runId)}/reject`, input, signal)
  }

  cancelRun(runId: string, input: { reason?: string } = {}, signal?: AbortSignal): Promise<AgentRun> {
    return this.postJSON(`/runs/${encodeURIComponent(runId)}/cancel`, input, signal)
  }

  getRun(runId: string, signal?: AbortSignal): Promise<AgentRun> {
    return this.getJSON(`/runs/${encodeURIComponent(runId)}`, { signal })
  }

  getPlanSnapshot(planId: string, signal?: AbortSignal): Promise<AgentPlanSnapshot> {
    return this.getJSON(`/plans/${encodeURIComponent(planId)}`, { signal })
  }

  createPlan(input: {
    threadId: string
    title?: string
    goal?: string
    message?: string
    maxTasks?: number
    tasks?: Array<Partial<AgentTask> & { title?: string }>
    createPlannerRun?: boolean
    agentManifest?: AgentManifest
    policy?: AgentRunPolicyOverride
  }, signal?: AbortSignal): Promise<AgentPlanSnapshot> {
    return this.postJSON('/plans', input, signal)
  }

  getPlanTasks(planId: string, signal?: AbortSignal): Promise<{ planId: string; tasks: AgentTask[] }> {
    return this.getJSON(`/plans/${encodeURIComponent(planId)}/tasks`, { signal })
  }

  updateTask(taskId: string, input: Partial<AgentTask>, signal?: AbortSignal): Promise<AgentTask> {
    return this.patchJSON(`/tasks/${encodeURIComponent(taskId)}`, input, signal)
  }

  dispatchPlan(planId: string, input: {
    plannerRunId?: string
    taskIds?: string[]
    maxWorkers?: number
    maxTaskAttempts?: number
    retryFailed?: boolean
    workerTimeoutMs?: number
    agentManifest?: AgentManifest
    policy?: AgentRunPolicyOverride
  } = {}, signal?: AbortSignal): Promise<DispatchPlanResult> {
    return this.postJSON(`/plans/${encodeURIComponent(planId)}/dispatch`, input, signal)
  }

  getChildRuns(runId: string, signal?: AbortSignal): Promise<{ runId: string; children: AgentRun[] }> {
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/children`, { signal })
  }

  replanRun(runId: string, input: {
    tasks?: Array<Partial<AgentTask> & { title?: string }>
    addTasks?: Array<Partial<AgentTask> & { title: string }>
    updates?: Array<Partial<AgentTask> & { id: string }>
    updateTasks?: Array<Partial<AgentTask> & { id: string }>
    resetTaskIds?: string[]
    resetBlocked?: boolean
    resetNeedsReview?: boolean
    resetFailed?: boolean
    resetCancelled?: boolean
    dispatch?: boolean
    maxWorkers?: number
    maxTaskAttempts?: number
    retryFailed?: boolean
    workerTimeoutMs?: number
  } = {}, signal?: AbortSignal): Promise<ReplanRunResult> {
    return this.postJSON(`/runs/${encodeURIComponent(runId)}/replan`, input, signal)
  }

  cancelRunTree(runId: string, input: { reason?: string } = {}, signal?: AbortSignal): Promise<{ cancelledRunIds: string[] }> {
    return this.postJSON(`/runs/${encodeURIComponent(runId)}/cancel-tree`, input, signal)
  }

  getRunTraceEvents(runId: string, query: { cursor?: string; limit?: number; kind?: AgentTraceEventKind } = {}): Promise<AgentRunTraceResponse> {
    const params = new URLSearchParams()
    if (query.cursor) params.set('cursor', query.cursor)
    if (typeof query.limit === 'number') params.set('limit', String(query.limit))
    if (query.kind) params.set('kind', query.kind)
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/trace${params.size ? `?${params.toString()}` : ''}`)
  }

  getRunTraceSummary(runId: string): Promise<AgentRunTraceSummary> {
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/trace/summary`)
  }

  answerRunInput(runId: string, input: { requestId?: string; choiceIds?: string[]; text?: string }, signal?: AbortSignal): Promise<AgentRun> {
    return this.postJSON(`/runs/${encodeURIComponent(runId)}/input`, input, signal)
  }

  async waitForRun(runId: string, options: { timeoutMs?: number; pollMs?: number; onRunUpdate?: (run: AgentRun) => void; signal?: AbortSignal } = {}): Promise<AgentRun> {
    const timeoutMs = options.timeoutMs ?? 30_000
    const pollMs = options.pollMs ?? 300
    const deadline = Date.now() + timeoutMs

    while (true) {
      const run = await this.getRun(runId, options.signal)
      options.onRunUpdate?.(run)
      if (TERMINAL_RUN_STATUSES.has(run.status)) return run
      if (Date.now() > deadline) throw new Error(`local runtime run ${runId} did not finish within ${timeoutMs}ms`)
      await sleepWithAbort(pollMs, options.signal)
    }
  }

  async streamRun(runId: string, options: RunMessageOptions = {}): Promise<AgentRun> {
    const overallStartedAt = Date.now()
    const overallTimeoutMs = normalizePositiveTimeoutMs(options.timeoutMs)
    const streamRequestTimeoutMs = normalizePositiveTimeoutMs(options.streamRequestTimeoutMs) ?? DEFAULT_RUN_STREAM_HTTP_TIMEOUT_MS
    let lastKnownRun: AgentRun | undefined
    const timeoutMs = options.timeoutMs ?? 30_000
    const externalSignal = options.signal
    const fullRunOrLatest = async (run: AgentRun): Promise<AgentRun> => {
      if (run.streamPartial) {
        const fullRun = await this.getRun(run.id, externalSignal).catch(() => undefined)
        if (fullRun) return fullRun
      }
      return run
    }

    let streamRequestCount = 0
    while (true) {
      if (externalSignal?.aborted) throw externalSignal.reason ?? createLocalAgentAbortError()
      const remainingOverallMs = overallTimeoutMs === undefined
        ? undefined
        : overallTimeoutMs - (Date.now() - overallStartedAt)
      if (remainingOverallMs !== undefined && remainingOverallMs <= 0) {
        const latestRun = await this.getRun(runId, externalSignal).catch(() => undefined)
        if (latestRun) {
          lastKnownRun = latestRun
          options.onRunUpdate?.(latestRun)
          if (TERMINAL_RUN_STATUSES.has(latestRun.status)) return await fullRunOrLatest(latestRun)
        }
        throw new Error(`local runtime stream for run ${runId} timed out after ${timeoutMs}ms across ${streamRequestCount} HTTP request${streamRequestCount === 1 ? '' : 's'}`)
      }

      const controller = new AbortController()
      let streamRequestTimedOut = false
      const abortFromExternal = () => {
        if (!controller.signal.aborted) controller.abort(externalSignal?.reason)
      }
      if (externalSignal?.aborted) abortFromExternal()
      else externalSignal?.addEventListener('abort', abortFromExternal, { once: true })

      const requestTimeoutMs = Math.max(1, Math.min(streamRequestTimeoutMs, remainingOverallMs ?? streamRequestTimeoutMs))
      const requestTimeout = globalThis.setTimeout(() => {
        streamRequestTimedOut = true
        controller.abort(createLocalAgentAbortError())
      }, requestTimeoutMs)

      try {
        streamRequestCount += 1
        const attempt = await this.readRunStreamAttempt(runId, options, controller.signal)
        lastKnownRun = attempt.run
        if (TERMINAL_RUN_STATUSES.has(attempt.run.status)) return await fullRunOrLatest(attempt.run)
        options.onRunUpdate?.(attempt.run)
      } catch (error) {
        if (externalSignal?.aborted) throw externalSignal.reason ?? createLocalAgentAbortError()

        const latestRun = await this.getRun(runId, externalSignal).catch(() => undefined)
        if (latestRun) {
          lastKnownRun = latestRun
          options.onRunUpdate?.(latestRun)
          if (TERMINAL_RUN_STATUSES.has(latestRun.status)) return await fullRunOrLatest(latestRun)
        }

        if (streamRequestTimedOut || (latestRun && isRetryableRunStreamError(error))) {
          continue
        }

        const fallbackRun = lastKnownRun ?? latestRun
        if (fallbackRun && TERMINAL_RUN_STATUSES.has(fallbackRun.status)) return await fullRunOrLatest(fallbackRun)
        throw error
      } finally {
        globalThis.clearTimeout(requestTimeout)
        externalSignal?.removeEventListener('abort', abortFromExternal)
      }
    }
  }

  private async readRunStreamAttempt(runId: string, options: RunMessageOptions, signal: AbortSignal): Promise<{ run: AgentRun }> {
    const res = await fetch(`${this.baseURL}/runs/${encodeURIComponent(runId)}/stream`, {
      headers: this.authHeaders({ Accept: 'text/event-stream' }),
      signal,
    })
    if (!res.ok) throw await localAgentResponseError(res)
    if (!res.body) return { run: await this.waitForRun(runId, { ...options, signal }) }

    let latestRun = await this.getRun(runId, signal)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const processBlock = (block: string): AgentRun | undefined => {
      const parsed = parseSSEBlock(block)
      if (!parsed) return undefined
      let event: AgentRunStreamEvent
      try {
        event = JSON.parse(parsed.data) as AgentRunStreamEvent
      } catch {
        return undefined
      }
      options.onStreamEvent?.(event)
      if ('run' in event && event.run) {
        latestRun = event.run
      }
      if ((event.type === 'run' || event.type === 'done' || event.type === 'assistant_message') && event.run) {
        options.onRunUpdate?.(event.run)
      }
      if (event.type === 'assistant_delta') {
        options.onAssistantDelta?.(event)
      }
      if (TERMINAL_RUN_STATUSES.has(latestRun.status)) return latestRun
      return undefined
    }
    const finishFromStream = async (run: AgentRun): Promise<{ run: AgentRun }> => {
      await reader.cancel().catch(() => undefined)
      return { run }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let normalized = buffer.replace(/\r\n/g, '\n')
      let separatorIndex = normalized.indexOf('\n\n')
      while (separatorIndex >= 0) {
        const terminalRun = processBlock(normalized.slice(0, separatorIndex))
        if (terminalRun) return await finishFromStream(terminalRun)
        normalized = normalized.slice(separatorIndex + 2)
        separatorIndex = normalized.indexOf('\n\n')
      }
      buffer = normalized
    }
    const tail = decoder.decode()
    if (tail) buffer += tail
    if (buffer.trim()) {
      const terminalRun = processBlock(buffer)
      if (terminalRun) return await finishFromStream(terminalRun)
    }
    if (latestRun.streamPartial && TERMINAL_RUN_STATUSES.has(latestRun.status)) {
      return await finishFromStream(latestRun)
    }
    return { run: latestRun }
  }

  getThread(threadId: string, signal?: AbortSignal): Promise<AgentThread> {
    return this.getJSON(`/threads/${encodeURIComponent(threadId)}`, { signal })
  }

  updateThread(threadId: string, input: { title?: string; archived?: boolean; metadata?: Record<string, unknown> }, signal?: AbortSignal): Promise<AgentThread> {
    return this.patchJSON(`/threads/${encodeURIComponent(threadId)}`, input, signal)
  }

  listMemories(query: { scope?: AgentMemoryScope; projectId?: number; threadId?: string; kind?: AgentMemoryKind } = {}): Promise<{ memories: AgentMemory[] }> {
    const params = new URLSearchParams()
    if (query.scope) params.set('scope', query.scope)
    if (typeof query.projectId === 'number') params.set('projectId', String(query.projectId))
    if (query.threadId) params.set('threadId', query.threadId)
    if (query.kind) params.set('kind', query.kind)
    return this.getJSON(`/memories${params.size ? `?${params.toString()}` : ''}`)
  }

  listDrafts(query: { projectId?: number; kind?: AgentDraftKind; status?: AgentDraftStatus | AgentDraftStatus[]; threadId?: string; runId?: string; pageKey?: string; pageType?: string; pageRoute?: string; pageEntityType?: string; pageEntityId?: number | string; limit?: number } = {}): Promise<{ drafts: AgentDraft[] }> {
    const params = new URLSearchParams()
    if (typeof query.projectId === 'number') params.set('projectId', String(query.projectId))
    if (query.kind) params.set('kind', query.kind)
    if (Array.isArray(query.status)) {
      for (const status of query.status) params.append('status', status)
    } else if (query.status) {
      params.set('status', query.status)
    }
    if (query.threadId) params.set('threadId', query.threadId)
    if (query.runId) params.set('runId', query.runId)
    if (query.pageKey) params.set('pageKey', query.pageKey)
    if (query.pageType) params.set('pageType', query.pageType)
    if (query.pageRoute) params.set('pageRoute', query.pageRoute)
    if (query.pageEntityType) params.set('pageEntityType', query.pageEntityType)
    if (query.pageEntityId !== undefined) params.set('pageEntityId', String(query.pageEntityId))
    if (typeof query.limit === 'number') params.set('limit', String(query.limit))
    return this.getJSON(`/drafts${params.size ? `?${params.toString()}` : ''}`)
  }

  getDraft(draftId: string): Promise<AgentDraft> {
    return this.getJSON(`/drafts/${encodeURIComponent(draftId)}`)
  }

  createDraft(input: { projectId?: number; kind?: AgentDraftKind; title: string; content: string; source?: Record<string, unknown>; target?: Record<string, unknown>; seed?: Record<string, unknown>; metadata?: Record<string, unknown> }): Promise<AgentDraft> {
    return this.postJSON('/draft', input)
  }

  updateDraft(draftId: string, input: { status?: AgentDraftStatus; title?: string; content?: string; target?: Record<string, unknown>; metadata?: Record<string, unknown> }): Promise<AgentDraft> {
    return this.patchJSON(`/drafts/${encodeURIComponent(draftId)}`, input)
  }

  patchDraft(draftId: string, input: { ops: AgentDraftPatchOp[]; expectedUpdatedAt?: string; metadata?: Record<string, unknown> }): Promise<AgentDraftPatchResult> {
    return this.postJSON(`/drafts/${encodeURIComponent(draftId)}/patch`, input)
  }

  validateDraft(draftId: string): Promise<AgentDraftValidationResult> {
    return this.postJSON(`/drafts/${encodeURIComponent(draftId)}/validate`, {})
  }

  previewApplyDraft(draftId: string, input: { target?: Record<string, unknown>; targetEntityType?: string; targetEntityId?: number | string; targetField?: string; currentValue?: unknown; proposedValue?: unknown } = {}): Promise<AgentDraftApplyPreview> {
    return this.postJSON(`/drafts/${encodeURIComponent(draftId)}/apply-preview`, input)
  }

  applyDraft(draftId: string, input: { target?: Record<string, unknown>; targetEntityType?: string; targetEntityId?: number | string; targetField?: string; currentValue?: unknown; proposedValue?: unknown } = {}): Promise<AgentDraftApplyPreview> {
    return this.postJSON(`/drafts/${encodeURIComponent(draftId)}/apply`, input)
  }

  rejectDraft(draftId: string, reason?: string): Promise<AgentDraft> {
    return this.postJSON(`/drafts/${encodeURIComponent(draftId)}/reject`, { reason })
  }

  createMemory(input: { scope: AgentMemoryScope; kind: AgentMemoryKind; content: string; projectId?: number; threadId?: string }): Promise<AgentMemory> {
    return this.postJSON('/memories', input)
  }

  deleteMemory(memoryId: string, signal?: AbortSignal): Promise<{ deleted: true }> {
    return this.deleteJSON(`/memories/${encodeURIComponent(memoryId)}`, signal)
  }

  async runMessage(input: { threadId?: string; message: string; title?: string; projectId?: number; clientInput?: AgentClientInput }, options: RunMessageOptions = {}): Promise<RunMessageResult> {
    const resolvedThread = await this.resolveMessageThread(input, options.signal)
    const thread = resolvedThread.thread
    await this.addMessage(thread.id, input.message, input.clientInput, options.signal)
    const run = await this.createRun(thread.id, {
      ...(options.agentManifest ? { agentManifest: options.agentManifest } : {}),
      ...(input.clientInput ? { clientInput: input.clientInput } : {}),
      ...(options.runPolicy ? { policy: options.runPolicy } : {}),
    }, options.signal)
    options.onRunUpdate?.(run)
    const finalRun = await this.waitForRun(run.id, {
      timeoutMs: options.timeoutMs,
      pollMs: options.pollMs,
      onRunUpdate: options.onRunUpdate,
      signal: options.signal,
    })
    const finalThread = await this.getThread(thread.id)
    return { run: finalRun, thread: finalThread, threadResolution: resolvedThread.resolution }
  }

  async runMessageStream(input: { threadId?: string; message: string; title?: string; projectId?: number; clientInput?: AgentClientInput }, options: RunMessageOptions = {}): Promise<RunMessageResult> {
    const resolvedThread = await this.resolveMessageThread(input, options.signal)
    const thread = resolvedThread.thread
    await this.addMessage(thread.id, input.message, input.clientInput, options.signal)
    const run = await this.createRun(thread.id, {
      ...(options.agentManifest ? { agentManifest: options.agentManifest } : {}),
      ...(input.clientInput ? { clientInput: input.clientInput } : {}),
      ...(options.runPolicy ? { policy: options.runPolicy } : {}),
    }, options.signal)
    options.onRunUpdate?.(run)
    const finalRun = await this.streamRun(run.id, options)
    const finalThread = await this.getThread(thread.id)
    return { run: finalRun, thread: finalThread, threadResolution: resolvedThread.resolution }
  }

  private async resolveMessageThread(input: { threadId?: string; title?: string; projectId?: number }, signal?: AbortSignal): Promise<{
    thread: AgentThread
    resolution: AgentThreadResolution
  }> {
    if (!input.threadId) {
      const thread = await this.createThread({ title: input.title, projectId: input.projectId }, signal)
      return {
        thread,
        resolution: {
          threadId: thread.id,
          reusedExistingThread: false,
          createdNewThread: true,
          missingRequestedThread: false,
        },
      }
    }

    try {
      const thread = await this.getThread(input.threadId, signal)
      return {
        thread,
        resolution: {
          requestedThreadId: input.threadId,
          threadId: thread.id,
          reusedExistingThread: true,
          createdNewThread: false,
          missingRequestedThread: false,
        },
      }
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? createLocalAgentAbortError()
      if (!isLocalAgentNotFoundError(error)) throw error
      const thread = await this.createThread({ title: input.title, projectId: input.projectId }, signal)
      return {
        thread,
        resolution: {
          requestedThreadId: input.threadId,
          threadId: thread.id,
          reusedExistingThread: false,
          createdNewThread: true,
          missingRequestedThread: true,
        },
      }
    }
  }

  private async getJSON<T>(path: string, options: { auth?: boolean; signal?: AbortSignal } = {}): Promise<T> {
    const res = await fetch(`${this.baseURL}${path}`, {
      headers: options.auth === false ? {} : this.authHeaders(),
      signal: options.signal,
    })
    if (!res.ok) throw await localAgentResponseError(res)
    return await res.json() as T
  }

  private async postJSON<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.baseURL}${path}`, {
      method: 'POST',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(this.withBackendContext(body)),
      signal,
    })
    if (!res.ok) throw await localAgentResponseError(res)
    return await res.json() as T
  }

  private async patchJSON<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.baseURL}${path}`, {
      method: 'PATCH',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(this.withBackendContext(body)),
      signal,
    })
    if (!res.ok) throw await localAgentResponseError(res)
    return await res.json() as T
  }

  private async deleteJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.baseURL}${path}`, {
      method: 'DELETE',
      headers: this.authHeaders(),
      signal,
    })
    if (!res.ok) throw await localAgentResponseError(res)
    return await res.json() as T
  }

  private authHeaders(base: Record<string, string> = {}): Record<string, string> {
    const token = useUserStore.getState().token
    return token ? { ...base, Authorization: `Bearer ${token}` } : base
  }

  private withBackendContext(body: Record<string, unknown>): Record<string, unknown> {
    return {
      ...body,
      backendAPIBaseURL: getAPIV1BaseURL(),
    }
  }
}

function runtimeLocalAgentBaseURL(): string {
  return import.meta.env?.VITE_LOCAL_AGENT_BASE_URL || DEFAULT_LOCAL_AGENT_BASE_URL
}

export const localAgentClient = new LocalAgentClient()

async function localAgentResponseError(res: Response): Promise<LocalAgentHTTPError> {
  const text = await res.text()
  const message = localAgentErrorMessage(text)
  return new LocalAgentHTTPError(res.status, text, message)
}

function localAgentErrorMessage(text: string): string {
  const body = text.trim()
  if (!body) return ''
  try {
    const parsed = JSON.parse(body) as unknown
    if (isLocalAgentErrorRecord(parsed)) {
      const error = parsed.error
      if (typeof error === 'string' && error.trim()) return error.trim()
      if (isLocalAgentErrorRecord(error) && typeof error.message === 'string' && error.message.trim()) return error.message.trim()
      if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim()
    }
  } catch {
    // Fall back to the raw response body.
  }
  return body
}

function isLocalAgentErrorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePositiveTimeoutMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function isRetryableRunStreamError(error: unknown): boolean {
  if (error instanceof LocalAgentHTTPError) return false
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error) {
    return error.name === 'AbortError' || error.name === 'TypeError'
  }
  return false
}

async function withRuntimeModelConfigError<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('local agent returned 404')) {
      throw new Error('当前 Agent 版本不支持模型配置接口。请重启桌面端，或停止旧进程后重新运行：pnpm --filter movscript-agent dev')
    }
    throw error
  }
}

function parseSSEBlock(block: string): { event?: string; data: string } | undefined {
  const lines = block.replace(/\r\n/g, '\n').split('\n')
  const dataLines: string[] = []
  let event: string | undefined
  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart())
    }
  }
  if (dataLines.length === 0) return undefined
  return { event, data: dataLines.join('\n').trim() }
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? createLocalAgentAbortError())
      return
    }
    const timer = globalThis.setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      globalThis.clearTimeout(timer)
      reject(signal.reason ?? createLocalAgentAbortError())
    }, { once: true })
  })
}

function createLocalAgentAbortError(): Error {
  try {
    return new DOMException('Aborted', 'AbortError')
  } catch {
    const error = new Error('Aborted')
    error.name = 'AbortError'
    return error
  }
}
