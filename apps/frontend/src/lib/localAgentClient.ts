export type AgentMessageRole = 'system' | 'user' | 'assistant'
export type AgentRunStatus = 'queued' | 'in_progress' | 'requires_action' | 'completed' | 'completed_with_warnings' | 'failed'
export type AgentStepStatus = 'in_progress' | 'completed' | 'failed'
export type AgentPlanTaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
export type AgentPlannerKind = 'rule' | 'model'

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
  args?: Record<string, unknown>
  result?: unknown
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
  toolCalls: AgentToolCall[]
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

export interface AgentToolCall {
  name: string
  args?: Record<string, unknown>
}

export interface AgentManifest {
  schema: 'movscript.agent.v1' | 'movscript.agent.v2'
  id: string
  version: string
  name: string
  description?: string
  soul?: string
  skills?: AgentSkillManifest[]
  permissions: string[]
  tools: Array<{
    name: string
    mode: 'allow' | 'deny'
    approval?: 'never' | 'always' | 'on_write'
  }>
  model?: {
    provider?: string
    modelId?: string
    platformModelId?: number
  }
  metadata?: Record<string, unknown>
  sourceSchema?: 'movscript.agent.v1' | 'movscript.agent.v2'
}

export interface AgentSkillManifest {
  id: string
  name: string
  description: string
  version?: string
  enabled: boolean
  priority?: number
  instruction: string
  appliesWhen?: string
  inputHints?: string[]
  outputContract?: string
  toolHints?: string[]
  metadata?: Record<string, unknown>
}

export interface AgentDebugContextPanel {
  route: { pathname: string; search?: string; hash?: string }
  project?: { id: number; name?: string; status?: string; description?: string }
  user?: { id: number; username: string; systemRole?: string }
  selection?: { entityType: string; entityId: number | string; label?: string } | null
  recentResources: Array<{ id: number; name: string; type: string; mimeType?: string; size?: number }>
  attachments: Array<{ id: string; name: string; type: string; resourceId?: number }>
  memories: Array<{ id: string; scope: string; kind: string; content: string }>
  labels: string[]
}

export interface ResolvedAgentSkill extends AgentSkillManifest {
  resolvedPriority: number
  activationReason: 'manifest' | 'applies_when' | 'user_selected' | 'default'
  compiledInstruction: string
  warnings: string[]
}

export interface AgentDebugTool {
  name: string
  description?: string
  inputSchema?: unknown
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
  agentManifest?: AgentManifest
  envelope?: AgentInputEnvelope
  plan?: AgentTaskPlan
  pendingApprovals?: AgentApprovalRequest[]
  metadata?: Record<string, unknown>
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
  debug?: Record<string, unknown>
  planner: AgentPlannerKind
  plannerWarnings: string[]
  plan: AgentTaskPlan
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
  approvalMode: 'interactive' | 'dry_run' | 'auto_readonly'
  maxToolCalls: number
  maxIterations: number
  allowNetwork: boolean
  allowFileBytes: boolean
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
  memories: Array<{ id: string; scope: string; kind: string; content: string }>
  model?: AgentManifest['model']
  debug: {
    source: 'frontend' | 'runtime'
    warnings: string[]
    compiledPrompt?: CompiledPromptPreview
  }
}

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
    risk: string
    projectScoped: boolean
    requiresApprovalByDefault: boolean
    source?: string
  }>
  skills: AgentSkillManifest[]
  defaultAgentManifest: AgentManifest
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

export interface AgentHealth {
  ok: boolean
  service: string
  mode: string
  mcpEndpoint: string
  modelConfigPath?: string
  modelConfig?: RuntimeModelConfigPublic
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
  provider: 'openai-compatible'
  baseURL: string
  model: string
  apiKeyConfigured: boolean
  useForChat: boolean
  useForPlanner: boolean
  updatedAt?: string
  source: 'file' | 'env' | 'none'
}

export interface RuntimeModelTestResult {
  ok: boolean
  provider: string
  model: string
  baseURL: string
  latencyMs: number
  content: string
}

export type ProductionActionType =
  | 'AnalyzeScriptToSections'
  | 'ExtractSituations'
  | 'GenerateStoryboardScript'
  | 'GenerateKeyframeCandidates'
  | 'PrepareAssetRequirements'
  | 'BuildPreviewTimelineProposal'

export type ProductionRunStatus = 'queued' | 'running' | 'waiting_approval' | 'succeeded' | 'failed' | 'cancelled'
export type ProductionStepStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped'
export type ProductionCandidateStatus = 'candidate' | 'accepted' | 'rejected' | 'revised' | 'superseded'

export interface ProductionRunStep {
  id: string
  runId: string
  type: 'read_context' | 'analyze' | 'generate' | 'validate' | 'write_candidate' | 'request_approval'
  status: ProductionStepStatus
  inputSummary?: string
  outputSummary?: string
  error?: string
  startedAt?: string
  finishedAt?: string
}

export interface ProductionCandidate {
  id: string
  type: string
  projectId: number
  sourceActionId: string
  sourceRunId: string
  targetObject?: Record<string, unknown>
  status: ProductionCandidateStatus
  payload: Record<string, unknown>
  confidence?: number
  evidence?: string[]
  createdAt: string
  updatedAt?: string
  statusChangedAt?: string
  statusReason?: string
}

export interface ProductionRun {
  id: string
  actionId: string
  actionType: ProductionActionType
  status: ProductionRunStatus
  projectId: number
  steps: ProductionRunStep[]
  candidates: ProductionCandidate[]
  warnings: string[]
  error?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
}

export type AgentMemoryScope = 'global' | 'project' | 'thread'
export type AgentMemoryKind = 'preference' | 'fact' | 'entity_ref' | 'draft' | 'decision' | 'warning'
export type AgentDraftKind = 'script' | 'setting' | 'storyboard' | 'shot' | 'prompt' | 'note'
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
}

export interface RunMessageResult {
  run: AgentRun
  thread: AgentThread
}

export interface RunMessageOptions {
  onRunUpdate?: (run: AgentRun) => void
  timeoutMs?: number
  pollMs?: number
  agentManifest?: AgentManifest
}

const DEFAULT_LOCAL_AGENT_BASE_URL = 'http://127.0.0.1:28765'
const TERMINAL_RUN_STATUSES = new Set<AgentRunStatus>([
  'completed',
  'completed_with_warnings',
  'requires_action',
  'failed',
])

export function canStartLocalAgentFromClient(): boolean {
  return typeof window !== 'undefined' && typeof window.api?.ensureProductionRuntime === 'function'
}

export class LocalAgentClient {
  readonly baseURL: string

  constructor(baseURL = import.meta.env.VITE_LOCAL_AGENT_BASE_URL || DEFAULT_LOCAL_AGENT_BASE_URL) {
    this.baseURL = baseURL.replace(/\/+$/, '')
  }

  health(): Promise<AgentHealth> {
    return this.getJSON('/health')
  }

  inspect(): Promise<AgentInspectResponse> {
    return this.getJSON('/inspect')
  }

  async ensureRunning(): Promise<AgentHealth> {
    try {
      return await this.health()
    } catch (healthError) {
      const ensureProductionRuntime = canStartLocalAgentFromClient() ? window.api?.ensureProductionRuntime : undefined
      if (!ensureProductionRuntime) {
        throw new Error(`当前窗口没有桌面客户端启动能力。请用 Electron 桌面端打开，或手动运行：pnpm --filter movscript-production-runtime dev`)
      }

      const status = await ensureProductionRuntime({ baseURL: this.baseURL })
      if (!status.ok) {
        throw new Error(status.error || `failed to start production runtime at ${this.baseURL}`)
      }
      return this.health()
    }
  }

  createThread(input: { title?: string; projectId?: number } = {}): Promise<AgentThread> {
    return this.postJSON('/threads', input)
  }

  listThreads(): Promise<{ threads: AgentThreadSummary[] }> {
    return this.getJSON('/threads')
  }

  addMessage(threadId: string, content: string, clientInput?: AgentClientInput): Promise<AgentMessage> {
    return this.postJSON(`/threads/${encodeURIComponent(threadId)}/messages`, {
      role: 'user',
      content,
      ...(clientInput ? { clientInput } : {}),
    })
  }

  createRun(threadId: string, input: { agentManifest?: AgentManifest; approvedToolNames?: string[]; clientInput?: AgentClientInput } = {}): Promise<AgentRun> {
    return this.postJSON('/runs', { threadId, ...input })
  }

  createToolRun(input: {
    threadId?: string
    title?: string
    message?: string
    toolCall: AgentToolCall
    agentManifest?: AgentManifest
    approvedToolNames?: string[]
    clientInput?: AgentClientInput
  }): Promise<AgentRun> {
    return this.postJSON('/runs/tool', input)
  }

  previewRun(input: { threadId?: string; message?: string; agentManifest?: AgentManifest; approvedToolNames?: string[]; clientInput?: AgentClientInput }): Promise<AgentRunPreview> {
    return this.postJSON('/runs/preview', input)
  }

  getCapabilities(query: { projectId?: number } = {}): Promise<AgentCapabilitiesResponse> {
    const params = new URLSearchParams()
    if (typeof query.projectId === 'number') params.set('projectId', String(query.projectId))
    return this.getJSON(`/capabilities${params.size ? `?${params.toString()}` : ''}`)
  }

  getModelConfig(): Promise<RuntimeModelConfigPublic> {
    return withRuntimeModelConfigError(this.getJSON('/model-config'))
  }

  saveModelConfig(input: {
    baseURL: string
    model: string
    apiKey?: string
    useForChat?: boolean
    useForPlanner?: boolean
  }): Promise<RuntimeModelConfigPublic> {
    return withRuntimeModelConfigError(this.postJSON('/model-config', input))
  }

  testModelConfig(input: { message?: string } = {}): Promise<RuntimeModelTestResult> {
    return withRuntimeModelConfigError(this.postJSON('/model-config/test', input))
  }

  createProductionAction(input: {
    actionType: ProductionActionType
    actionId?: string
    projectId: number
    sourceObject?: Record<string, unknown>
    inputContext: Record<string, unknown>
    requestedBy?: string
  }): Promise<ProductionRun> {
    return this.postJSON('/production/actions', input)
  }

  approveRun(runId: string, input: { approvedToolNames?: string[]; approvalIds?: string[] } = {}): Promise<AgentRun> {
    return this.postJSON(`/runs/${encodeURIComponent(runId)}/approve`, input)
  }

  rejectRun(runId: string, input: { approvalIds?: string[] } = {}): Promise<AgentRun> {
    return this.postJSON(`/runs/${encodeURIComponent(runId)}/reject`, input)
  }

  async waitForRun(runId: string, options: { timeoutMs?: number; pollMs?: number; onRunUpdate?: (run: AgentRun) => void } = {}): Promise<AgentRun> {
    const timeoutMs = options.timeoutMs ?? 30_000
    const pollMs = options.pollMs ?? 300
    const deadline = Date.now() + timeoutMs

    while (true) {
      const run = await this.getJSON<AgentRun>(`/runs/${encodeURIComponent(runId)}`)
      options.onRunUpdate?.(run)
      if (TERMINAL_RUN_STATUSES.has(run.status)) return run
      if (Date.now() > deadline) throw new Error(`local runtime run ${runId} did not finish within ${timeoutMs}ms`)
      await new Promise((resolve) => setTimeout(resolve, pollMs))
    }
  }

  getThread(threadId: string): Promise<AgentThread> {
    return this.getJSON(`/threads/${encodeURIComponent(threadId)}`)
  }

  updateThread(threadId: string, input: { title?: string; archived?: boolean; metadata?: Record<string, unknown> }): Promise<AgentThread> {
    return this.patchJSON(`/threads/${encodeURIComponent(threadId)}`, input)
  }

  listMemories(query: { scope?: AgentMemoryScope; projectId?: number; threadId?: string; kind?: AgentMemoryKind } = {}): Promise<{ memories: AgentMemory[] }> {
    const params = new URLSearchParams()
    if (query.scope) params.set('scope', query.scope)
    if (typeof query.projectId === 'number') params.set('projectId', String(query.projectId))
    if (query.threadId) params.set('threadId', query.threadId)
    if (query.kind) params.set('kind', query.kind)
    return this.getJSON(`/memories${params.size ? `?${params.toString()}` : ''}`)
  }

  listDrafts(query: { projectId?: number; kind?: AgentDraftKind; status?: AgentDraftStatus; limit?: number } = {}): Promise<{ drafts: AgentDraft[] }> {
    const params = new URLSearchParams()
    if (typeof query.projectId === 'number') params.set('projectId', String(query.projectId))
    if (query.kind) params.set('kind', query.kind)
    if (query.status) params.set('status', query.status)
    if (typeof query.limit === 'number') params.set('limit', String(query.limit))
    return this.getJSON(`/drafts${params.size ? `?${params.toString()}` : ''}`)
  }

  getDraft(draftId: string): Promise<AgentDraft> {
    return this.getJSON(`/drafts/${encodeURIComponent(draftId)}`)
  }

  createDraft(input: { projectId?: number; kind?: AgentDraftKind; title: string; content: string; source?: Record<string, unknown>; target?: Record<string, unknown>; metadata?: Record<string, unknown> }): Promise<AgentDraft> {
    return this.postJSON('/draft', input)
  }

  previewApplyDraft(draftId: string, input: { target?: Record<string, unknown>; targetEntityType?: string; targetEntityId?: number | string; targetField?: string; currentValue?: unknown; proposedValue?: unknown } = {}): Promise<AgentDraftApplyPreview> {
    return this.postJSON(`/drafts/${encodeURIComponent(draftId)}/apply-preview`, input)
  }

  rejectDraft(draftId: string, reason?: string): Promise<AgentDraft> {
    return this.postJSON(`/drafts/${encodeURIComponent(draftId)}/reject`, { reason })
  }

  createMemory(input: { scope: AgentMemoryScope; kind: AgentMemoryKind; content: string; projectId?: number; threadId?: string }): Promise<AgentMemory> {
    return this.postJSON('/memories', input)
  }

  deleteMemory(memoryId: string): Promise<{ deleted: true }> {
    return this.deleteJSON(`/memories/${encodeURIComponent(memoryId)}`)
  }

  async runMessage(input: { threadId?: string; message: string; title?: string; projectId?: number; clientInput?: AgentClientInput }, options: RunMessageOptions = {}): Promise<RunMessageResult> {
    const thread = input.threadId ? await this.getThreadOrCreate(input.threadId) : await this.createThread({ title: input.title, projectId: input.projectId })
    await this.addMessage(thread.id, input.message, input.clientInput)
    const run = await this.createRun(thread.id, {
      ...(options.agentManifest ? { agentManifest: options.agentManifest } : {}),
      ...(input.clientInput ? { clientInput: input.clientInput } : {}),
    })
    options.onRunUpdate?.(run)
    const finalRun = await this.waitForRun(run.id, {
      timeoutMs: options.timeoutMs,
      pollMs: options.pollMs,
      onRunUpdate: options.onRunUpdate,
    })
    const finalThread = await this.getThread(thread.id)
    return { run: finalRun, thread: finalThread }
  }

  private async getThreadOrCreate(threadId: string): Promise<AgentThread> {
    try {
      return await this.getThread(threadId)
    } catch {
      return await this.createThread()
    }
  }

  private async getJSON<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseURL}${path}`)
    if (!res.ok) throw new Error(`local agent returned ${res.status}: ${await res.text()}`)
    return await res.json() as T
  }

  private async postJSON<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseURL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`local agent returned ${res.status}: ${await res.text()}`)
    return await res.json() as T
  }

  private async patchJSON<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseURL}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`local agent returned ${res.status}: ${await res.text()}`)
    return await res.json() as T
  }

  private async deleteJSON<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseURL}${path}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`local agent returned ${res.status}: ${await res.text()}`)
    return await res.json() as T
  }
}

export const localAgentClient = new LocalAgentClient()

async function withRuntimeModelConfigError<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('local agent returned 404')) {
      throw new Error('当前 Production Runtime 版本不支持模型配置接口。请重启桌面端，或停止旧进程后重新运行：pnpm --filter movscript-production-runtime dev')
    }
    throw error
  }
}
