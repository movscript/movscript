export type AgentMessageRole = 'system' | 'user' | 'assistant'
export type AgentRunStatus = 'queued' | 'in_progress' | 'requires_action' | 'completed' | 'completed_with_warnings' | 'failed'
export type AgentStepStatus = 'in_progress' | 'completed' | 'failed'
export type AgentPlanTaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'

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
  schema: 'movscript.agent.v1'
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
  metadata?: Record<string, unknown>
}

export interface AgentRun {
  id: string
  threadId: string
  status: AgentRunStatus
  agentManifest?: AgentManifest
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

export interface AgentApprovalRequest {
  id: string
  runId: string
  toolName: string
  args?: Record<string, unknown>
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
}

export type AgentMemoryScope = 'global' | 'project' | 'thread'
export type AgentMemoryKind = 'preference' | 'fact' | 'entity_ref' | 'draft' | 'decision' | 'warning'

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
  return typeof window !== 'undefined' && typeof window.api?.ensureLocalAgent === 'function'
}

export class LocalAgentClient {
  readonly baseURL: string

  constructor(baseURL = import.meta.env.VITE_LOCAL_AGENT_BASE_URL || DEFAULT_LOCAL_AGENT_BASE_URL) {
    this.baseURL = baseURL.replace(/\/+$/, '')
  }

  health(): Promise<AgentHealth> {
    return this.getJSON('/health')
  }

  async ensureRunning(): Promise<AgentHealth> {
    try {
      return await this.health()
    } catch (healthError) {
      const ensureLocalAgent = canStartLocalAgentFromClient() ? window.api?.ensureLocalAgent : undefined
      if (!ensureLocalAgent) {
        throw new Error(`当前窗口没有桌面客户端启动能力。请用 Electron 桌面端打开，或手动运行：cd movscript-agent && npm run dev`)
      }

      const status = await ensureLocalAgent({ baseURL: this.baseURL })
      if (!status.ok) {
        throw new Error(status.error || `failed to start local agent at ${this.baseURL}`)
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

  addMessage(threadId: string, content: string): Promise<AgentMessage> {
    return this.postJSON(`/threads/${encodeURIComponent(threadId)}/messages`, {
      role: 'user',
      content,
    })
  }

  createRun(threadId: string, input: { agentManifest?: AgentManifest; approvedToolNames?: string[] } = {}): Promise<AgentRun> {
    return this.postJSON('/runs', { threadId, ...input })
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
      if (Date.now() > deadline) throw new Error(`local agent run ${runId} did not finish within ${timeoutMs}ms`)
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

  createMemory(input: { scope: AgentMemoryScope; kind: AgentMemoryKind; content: string; projectId?: number; threadId?: string }): Promise<AgentMemory> {
    return this.postJSON('/memories', input)
  }

  deleteMemory(memoryId: string): Promise<{ deleted: true }> {
    return this.deleteJSON(`/memories/${encodeURIComponent(memoryId)}`)
  }

  async runMessage(input: { threadId?: string; message: string; title?: string; projectId?: number }, options: RunMessageOptions = {}): Promise<RunMessageResult> {
    const thread = input.threadId ? await this.getThreadOrCreate(input.threadId) : await this.createThread({ title: input.title, projectId: input.projectId })
    await this.addMessage(thread.id, input.message)
    const run = await this.createRun(thread.id, {
      ...(options.agentManifest ? { agentManifest: options.agentManifest } : {}),
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
