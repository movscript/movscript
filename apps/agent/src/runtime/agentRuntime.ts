import type { MCPClient } from '../mcpClient.js'
import type { JSONValue } from '../types.js'
import { DEFAULT_AGENT_MANIFEST, normalizeAgentManifest, type AgentManifest } from './agentManifest.js'
import { buildConfiguredAssistantContent, extractRequestedToolCallsFromAssistantContent } from './assistantMessage.js'
import { extractAgentContext, parseToolResult } from './context.js'
import { resolveAgentCapabilities } from './capabilityResolver.js'
import { MemoryManager } from './memory/memoryManager.js'
import { InMemoryAgentMemoryStore, type AgentMemoryStore } from './memory/memoryStore.js'
import type { AgentMemory, MemoryQuery } from './memory/types.js'
import { compilePromptPreview } from './promptCompiler.js'
import { resolveAgentSkills } from './skillResolver.js'
import { InMemoryAgentStore, type AgentStore } from './store.js'
import { applyToolPolicy } from './toolPolicy.js'
import { DEFAULT_TOOL_REGISTRY, type ToolRegistry, type ToolRiskLevel } from './toolRegistry.js'
import {
  InMemoryAgentDraftStore,
  normalizeDraftKind,
  normalizeDraftStatus,
  type AgentDraft,
  type AgentDraftKind,
  type AgentDraftStatus,
  type AgentDraftStore,
} from './draftStore.js'
import { buildApplyDraftPreview, markDraftApplied, rejectDraft } from './draftApply.js'
import { BackendApplyClient, type BackendApplyResult } from './backendApplyClient.js'
import type { BlockedToolCall } from './toolPolicy.js'
import type {
  AgentApprovalRequest,
  AgentMessage,
  AgentMessageRole,
  AgentRunPreview,
  AgentRun,
  AgentTraceEvent,
  AgentTraceEventKind,
  AgentRunStep,
  AgentRuntimeOptions,
  AgentCapabilitiesResponse,
  AgentClientAttachmentRef,
  AgentClientResourceRef,
  AgentClientUISnapshot,
  AgentDebugContextPanel,
  AgentRunDebugTrace,
  AgentRunPolicy,
  AgentThread,
  AgentThreadSummary,
  ApproveRunInput,
  CreateMessageInput,
  CreateRunInput,
  CreateToolRunInput,
  CreateThreadInput,
  PreviewRunInput,
  RejectRunInput,
  ToolCallOutcome,
  ToolCall,
  UpdateThreadInput,
} from './types.js'

type AgentRunRoundInfo = {
  roundId: string
  roundIndex: number
  roundLabel: string
  roundSource: NonNullable<AgentRunStep['roundSource']>
}

export type {
  AgentMessage,
  AgentMessageRole,
  AgentRun,
  AgentRunPreview,
  AgentRunStatus,
  AgentRunStep,
  AgentRuntimeOptions,
  AgentApprovalRequest,
  AgentCapabilitiesResponse,
  AgentDebugContextPanel,
  AgentRunDebugTrace,
  AgentRunPolicy,
  AgentStepStatus,
  AgentThread,
  AgentThreadSummary,
  ApproveRunInput,
  CreateMessageInput,
  CreateRunInput,
  CreateToolRunInput,
  CreateThreadInput,
  PreviewRunInput,
  RejectRunInput,
  UpdateThreadInput,
  ToolCall,
  ToolCallOutcome,
} from './types.js'
export type { AgentMemory, AgentMemoryKind, AgentMemoryScope, MemoryQuery } from './memory/types.js'
export type { AgentManifest, AgentToolGrant, AgentSkillManifest } from './agentManifest.js'
export { DEFAULT_AGENT_MANIFEST, normalizeAgentManifest } from './agentManifest.js'
export { InMemoryAgentMemoryStore } from './memory/memoryStore.js'
export { InMemoryAgentStore } from './store.js'
export {
  FileAgentDraftStore,
  InMemoryAgentDraftStore,
  normalizeDraftKind,
  normalizeDraftStatus,
  resolveAgentDraftPath,
} from './draftStore.js'
export { DEFAULT_TOOL_REGISTRY, StaticToolRegistry } from './toolRegistry.js'
export {
  loadAgentPluginCatalog,
  resolveAgentSkillsDir,
  resolveAgentToolsDir,
  resolveBuiltinAgentSkillsDir,
  resolveBuiltinAgentToolsDir,
} from './pluginCatalog.js'

export class AgentRuntime {
  private readonly mcpClient: Pick<MCPClient, 'initialize' | 'callTool' | 'listTools' | 'listResources'>
  private readonly store: AgentStore
  private readonly draftStore: AgentDraftStore
  private readonly backendApplyClient: BackendApplyClient
  private readonly memoryStore: AgentMemoryStore
  private readonly memoryManager: MemoryManager
  private readonly defaultAgentManifest: AgentManifest
  private readonly skillCatalog: AgentManifest['skills']
  private readonly toolRegistry: ToolRegistry
  private readonly pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  private readonly pluginWarnings: string[]
  private readonly runAuth = new Map<string, string>()

  constructor(options: AgentRuntimeOptions) {
    this.mcpClient = options.mcpClient
    this.store = options.store ?? new InMemoryAgentStore()
    this.draftStore = options.draftStore ?? new InMemoryAgentDraftStore()
    this.backendApplyClient = options.backendApplyClient ?? new BackendApplyClient()
    this.memoryStore = options.memoryStore ?? new InMemoryAgentMemoryStore()
    this.memoryManager = new MemoryManager(this.memoryStore)
    this.defaultAgentManifest = options.defaultAgentManifest ?? DEFAULT_AGENT_MANIFEST
    this.skillCatalog = options.skillCatalog ?? []
    this.toolRegistry = options.toolRegistry ?? DEFAULT_TOOL_REGISTRY
    this.pluginCatalogInfo = options.pluginCatalogInfo
    this.pluginWarnings = options.pluginWarnings ?? []
  }

  async getCapabilities(input: { agentManifest?: unknown; currentProjectId?: number; includeResources?: boolean } = {}): Promise<AgentCapabilitiesResponse> {
    const agentManifest = normalizeAgentManifest(input.agentManifest ?? this.defaultAgentManifest)
    return resolveAgentCapabilities({
      mcpClient: this.mcpClient,
      manifest: agentManifest,
      currentProjectId: input.currentProjectId,
      includeResources: input.includeResources,
      registry: this.toolRegistry,
      pluginCatalog: this.pluginCatalogInfo,
      warnings: this.pluginWarnings,
    })
  }

  listRegisteredTools(): ReturnType<ToolRegistry['list']> {
    return this.toolRegistry.list()
  }

  listSkillCatalog(): AgentManifest['skills'] {
    return this.skillCatalog
  }

  getDefaultAgentManifest(): AgentManifest {
    return this.defaultAgentManifest
  }

  createThread(input: CreateThreadInput = {}): AgentThread {
    const now = isoNow()
    const thread: AgentThread = {
      id: makeId('thread'),
      ...(typeof input.title === 'string' && input.title.trim() ? { title: input.title.trim() } : {}),
      ...(typeof input.projectId === 'number' && Number.isFinite(input.projectId) ? { projectId: input.projectId } : {}),
      ...(isRecord(input.metadata) ? { metadata: input.metadata as Record<string, JSONValue> } : {}),
      archived: input.archived === true,
      createdAt: now,
      updatedAt: now,
      messages: [],
    }
    this.store.createThread(thread)

    for (const message of input.messages ?? []) {
      if (!isMessageRole(message.role) || typeof message.content !== 'string') continue
      this.addMessage(thread.id, { role: message.role, content: message.content })
    }

    return this.requireThread(thread.id)
  }

  listThreads(): AgentThread[] {
    return this.store.listThreads()
  }

  listThreadSummaries(): AgentThreadSummary[] {
    return this.store.listThreadSummaries()
  }

  getThread(id: string): AgentThread | undefined {
    return this.store.getThread(id)
  }

  updateThread(id: string, input: UpdateThreadInput): AgentThread {
    const thread = this.requireThread(id)
    if (typeof input.title === 'string') {
      const title = input.title.trim()
      if (title) thread.title = title
      else delete thread.title
    }
    if (typeof input.archived === 'boolean') thread.archived = input.archived
    if (isRecord(input.metadata)) {
      thread.metadata = { ...(thread.metadata ?? {}), ...(input.metadata as Record<string, JSONValue>) }
    }
    thread.updatedAt = isoNow()
    this.store.updateThread(thread)
    return thread
  }

  addMessage(threadId: string, input: CreateMessageInput): AgentMessage {
    const thread = this.requireThread(threadId)
    const role = isMessageRole(input.role) ? input.role : 'user'
    const clientInput = normalizeClientInput(input.clientInput)
    const content = role === 'user' && clientInput
      ? buildRuntimeUserMessage(clientInput)
      : typeof input.content === 'string' ? input.content.trim() : ''
    if (!content) {
      throw new Error('message content is required')
    }

    const message = this.createMessage(threadId, role, content)
    thread.messages.push(message)
    if (clientInput) {
      thread.metadata = {
        ...(thread.metadata ?? {}),
        lastClientInput: clientInput as unknown as JSONValue,
      }
    }
    thread.updatedAt = message.createdAt
    this.store.updateThread(thread)
    return message
  }

  createRun(input: CreateRunInput): AgentRun {
    if (typeof input.threadId !== 'string' || !input.threadId) {
      throw new Error('threadId is required')
    }
    const thread = this.requireThread(input.threadId)
    const clientInput = normalizeClientInput(input.clientInput)
    if (clientInput) {
      thread.metadata = {
        ...(thread.metadata ?? {}),
        lastClientInput: clientInput as unknown as JSONValue,
      }
      this.store.updateThread(thread)
    }

    const now = isoNow()
    const agentManifest = normalizeAgentManifest(input.agentManifest ?? this.defaultAgentManifest)
    const policy = defaultRunPolicy({
      sandboxMode: input.sandboxMode === true,
    })
    const run: AgentRun = {
      id: makeId('run'),
      threadId: input.threadId,
      status: 'queued',
      agentManifest,
      policy,
      createdAt: now,
      updatedAt: now,
      steps: [],
      traceEvents: [],
      ...(normalizeApprovedToolNames(input.approvedToolNames).length > 0
        ? { metadata: { approvedToolNames: normalizeApprovedToolNames(input.approvedToolNames) } }
        : {}),
    }
    if (clientInput) {
      run.metadata = {
        ...(run.metadata ?? {}),
        clientInput: clientInput as unknown as JSONValue,
      }
    }
    this.store.createRun(run)
    thread.lastRunStatus = run.status
    thread.updatedAt = now
    this.store.updateThread(thread)
    this.rememberRunAuth(run.id, input.backendAuthToken)
    void this.executeRun(run.id)
    return run
  }

  createToolRun(input: CreateToolRunInput): AgentRun {
    const toolCall = normalizeToolCall(input.toolCall)
    if (!toolCall) throw new Error('toolCall is required')
    const thread = typeof input.threadId === 'string' && input.threadId
      ? this.requireThread(input.threadId)
      : this.createThread({
        title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : `Tool run: ${toolCall.name}`,
      })
    const clientInput = normalizeClientInput(input.clientInput)
    const message = clientInput
      ? buildRuntimeUserMessage(clientInput)
      : typeof input.message === 'string' && input.message.trim()
        ? input.message.trim()
        : `Run tool ${toolCall.name}`
    const userMessage = this.createMessage(thread.id, 'user', message)
    thread.messages.push(userMessage)
    if (clientInput) {
      thread.metadata = {
        ...(thread.metadata ?? {}),
        lastClientInput: clientInput as unknown as JSONValue,
      }
    }
    thread.updatedAt = userMessage.createdAt
    this.store.updateThread(thread)

    const now = isoNow()
    const approvedToolNames = normalizeApprovedToolNames(input.approvedToolNames)
    const policy = defaultRunPolicy({
      sandboxMode: input.sandboxMode === true,
    })
    const run: AgentRun = {
      id: makeId('run'),
      threadId: thread.id,
      status: 'queued',
      agentManifest: normalizeAgentManifest(input.agentManifest ?? this.defaultAgentManifest),
      policy,
      createdAt: now,
      updatedAt: now,
      steps: [],
      traceEvents: [],
      metadata: {
        forcedToolCall: toolCall as unknown as JSONValue,
        ...(approvedToolNames.length > 0 ? { approvedToolNames } : {}),
        ...(clientInput ? { clientInput: clientInput as unknown as JSONValue } : {}),
      },
    }
    this.store.createRun(run)
    thread.lastRunStatus = run.status
    thread.updatedAt = now
    this.store.updateThread(thread)
    this.rememberRunAuth(run.id, input.backendAuthToken)
    void this.executeRun(run.id)
    return run
  }

  async previewRun(input: PreviewRunInput): Promise<AgentRunPreview> {
    const thread = typeof input.threadId === 'string' && input.threadId
      ? this.requireThread(input.threadId)
      : undefined
    const clientInput = normalizeClientInput(input.clientInput)
    const explicitMessage = clientInput
      ? buildRuntimeUserMessage(clientInput)
      : typeof input.message === 'string' && input.message.trim().length > 0
        ? input.message.trim()
        : undefined
    const lastUser = thread
      ? [...thread.messages].reverse().find((message) => message.role === 'user')
      : undefined
    const message = explicitMessage ?? lastUser?.content
    if (!message) throw new Error('preview requires a message or a thread with a user message')

    const now = isoNow()
    const agentManifest = normalizeAgentManifest(input.agentManifest ?? this.defaultAgentManifest)
    await this.mcpClient.initialize()
    const contextResult = await this.mcpClient.callTool('movscript.get_context_pack', {})
    const context = extractAgentContext(contextResult)
    const memories = this.memoryManager.loadRelevantMemories({
      ...(typeof context.currentProjectId === 'number' ? { projectId: context.currentProjectId } : {}),
      threadId: thread?.id ?? 'preview',
    })
    const skills = resolveAgentSkills(agentManifest, message, this.skillCatalog)
    const capabilities = await resolveAgentCapabilities({
      mcpClient: this.mcpClient,
      manifest: agentManifest,
      currentProjectId: context.currentProjectId,
      registry: this.toolRegistry,
      pluginCatalog: this.pluginCatalogInfo,
      warnings: this.pluginWarnings,
    })
    const debugContext = buildDebugContext(contextResult, memories, clientInput)
    const policy = defaultRunPolicy({ sandboxMode: input.sandboxMode !== false })
    const promptPreview = compilePromptPreview({
      manifest: agentManifest,
      skills,
      context: debugContext,
      tools: capabilities.resolvedTools,
      policy,
      memories,
      history: thread?.messages ?? [],
      userMessage: message,
    })
    const warnings: string[] = [...capabilities.warnings]
    const pendingApprovals: AgentApprovalRequest[] = []
    const approvedToolNames = normalizeApprovedToolNames(input.approvedToolNames)
    const proposedToolCalls = decideNextToolCalls({
      message,
      memories,
      context: debugContext,
    })
    const toolPolicy = applyToolPolicy(proposedToolCalls, {
      currentProjectId: context.currentProjectId,
      manifest: agentManifest,
      catalog: capabilities.resolvedTools,
      registry: this.toolRegistry,
      approvedToolNames,
      sandboxMode: policy.sandboxMode === true,
    })
    warnings.push(...toolPolicy.warnings.filter((warning) => !warnings.includes(warning)))
    pendingApprovals.push(
      ...toolPolicy.blockedToolCalls
        .filter((blocked) => blocked.reason === 'approval_required')
        .map((blocked) => this.toApprovalRequest('preview', blocked)),
    )

    return {
      id: makeId('preview'),
      ...(thread ? { threadId: thread.id } : {}),
      message,
      status: 'preview',
      agentManifest,
      ...(typeof context.currentProjectId === 'number' ? { currentProjectId: context.currentProjectId } : {}),
      context: debugContext,
      skills,
      tools: capabilities.resolvedTools,
      policy,
      promptPreview,
      debug: buildDebugTrace(agentManifest, skills, capabilities.resolvedTools, promptPreview.debugParts.map((part) => part.id)),
      toolCalls: toolPolicy.toolCalls,
      pendingApprovals,
      warnings,
      memoryIds: memories.map((memory) => memory.id),
      memoryCount: memories.length,
      createdAt: now,
    }
  }

  listRuns(): AgentRun[] {
    return this.store.listRuns()
  }

  getRun(id: string): AgentRun | undefined {
    return this.store.getRun(id)
  }

  approveRun(runId: string, input: ApproveRunInput = {}): AgentRun {
    const run = this.requireRun(runId)
    if (run.status !== 'requires_action') {
      throw new Error(`run ${runId} is not waiting for approval`)
    }

    const now = isoNow()
    const selectedApprovalIds = new Set(normalizeStringArray(input.approvalIds))
    const selectedToolNames = new Set(normalizeStringArray(input.approvedToolNames))
    const approvals = run.pendingApprovals ?? []
    const approvingAll = selectedApprovalIds.size === 0 && selectedToolNames.size === 0
    const approvedToolNames = new Set(getApprovedToolNames(run))

    run.pendingApprovals = approvals.map((approval) => {
      const approve = approvingAll || selectedApprovalIds.has(approval.id) || selectedToolNames.has(approval.toolName)
      if (!approve) return approval
      approvedToolNames.add(approval.toolName)
      return {
        ...approval,
        status: 'approved',
        approvedAt: now,
        updatedAt: now,
      }
    })

    run.metadata = {
      ...(run.metadata ?? {}),
      approvedToolNames: Array.from(approvedToolNames),
    }
    run.status = 'queued'
    run.updatedAt = now
    this.recordTraceEvent(run, {
      kind: 'approval',
      title: 'Approval granted',
      summary: approvingAll ? 'Approved all pending tool calls.' : `Approved ${selectedApprovalIds.size + selectedToolNames.size} pending action(s).`,
      status: 'completed',
      data: {
        approvalIds: Array.from(selectedApprovalIds),
        toolNames: Array.from(selectedToolNames),
        approvedToolNames: Array.from(approvedToolNames),
      },
    })
    this.store.updateRun(run)
    this.updateThreadRunStatus(run.threadId, run.status)
    this.rememberRunAuth(run.id, input.backendAuthToken)
    void this.executeRun(run.id)
    return run
  }

  rejectRun(runId: string, input: RejectRunInput = {}): AgentRun {
    const run = this.requireRun(runId)
    if (run.status !== 'requires_action') {
      throw new Error(`run ${runId} is not waiting for approval`)
    }

    const now = isoNow()
    const selectedApprovalIds = new Set(normalizeStringArray(input.approvalIds))
    const rejectingAll = selectedApprovalIds.size === 0
    const rejectedToolNames: string[] = []

    run.pendingApprovals = (run.pendingApprovals ?? []).map((approval) => {
      const reject = approval.status === 'pending' && (rejectingAll || selectedApprovalIds.has(approval.id))
      if (!reject) return approval
      rejectedToolNames.push(approval.toolName)
      return {
        ...approval,
        status: 'rejected',
        rejectedAt: now,
        updatedAt: now,
      }
    })

    const warning = `用户拒绝执行工具：${rejectedToolNames.join(', ') || 'unknown'}`
    run.warnings = Array.from(new Set([...(run.warnings ?? []), warning]))
    this.recordTraceEvent(run, {
      kind: 'approval',
      title: 'Approval rejected',
      summary: warning,
      status: 'blocked',
      data: { rejectedToolNames },
    })
    run.status = 'completed_with_warnings'
    run.completedAt = now
    run.updatedAt = now

    const thread = this.requireThread(run.threadId)
    const assistant = this.createMessage(
      thread.id,
      'assistant',
      `已取消需要确认的工具调用。\n\n${warning}`,
      run.id,
    )
    thread.messages.push(assistant)
    thread.updatedAt = assistant.createdAt
    thread.lastRunStatus = run.status
    run.assistantMessageId = assistant.id

    const step = this.createStep(run, 'message')
    step.status = 'completed'
    step.result = { messageId: assistant.id, rejectedToolNames }
    step.completedAt = now

    this.store.updateThread(thread)
    this.store.updateRun(run)
    return run
  }

  listMemories(query: MemoryQuery = {}): AgentMemory[] {
    return this.memoryStore.listMemories(query)
  }

  listDrafts(query: {
    projectId?: unknown
    kind?: unknown
    status?: unknown
    sourceEntityType?: unknown
    sourceEntityId?: unknown
    limit?: unknown
  } = {}): AgentDraft[] {
    return this.draftStore.listDrafts(normalizeDraftQuery(query))
  }

  createLocalDraft(input: {
    projectId?: unknown
    kind?: unknown
    title?: unknown
    content?: unknown
    source?: unknown
    target?: unknown
    metadata?: unknown
  }): AgentDraft {
    return this.draftStore.createDraft({
      projectId: typeof input.projectId === 'number' && Number.isFinite(input.projectId) ? input.projectId : undefined,
      kind: input.kind,
      title: input.title,
      content: input.content,
      source: input.source,
      target: input.target,
      metadata: input.metadata,
    })
  }

  getDraft(id: string): AgentDraft | undefined {
    return this.draftStore.getDraft(id)
  }

  previewApplyDraft(input: {
    draftId?: unknown
    target?: unknown
    targetEntityType?: unknown
    targetEntityId?: unknown
    targetField?: unknown
    currentValue?: unknown
    proposedValue?: unknown
  }): JSONValue {
    return buildApplyDraftPreview(this.draftStore, input) as unknown as JSONValue
  }

  rejectDraft(input: { draftId?: unknown; reason?: unknown }): AgentDraft {
    return rejectDraft(this.draftStore, input.draftId, input.reason)
  }

  createMemory(input: Parameters<AgentMemoryStore['createMemory']>[0]): AgentMemory {
    return this.memoryStore.createMemory(input)
  }

  deleteMemory(id: string): boolean {
    return this.memoryStore.deleteMemory(id)
  }

  private async executeRun(runId: string): Promise<void> {
    const run = this.store.getRun(runId)
    if (!run) return

    run.status = 'in_progress'
    run.startedAt = isoNow()
    run.updatedAt = run.startedAt
    const setupRound = buildRunRound(0, 'Setup', 'setup')
    this.recordTraceEvent(run, {
      kind: 'run',
      title: 'Run started',
      summary: `Thread ${run.threadId} entered the agentic loop.`,
      status: 'started',
      round: setupRound,
      data: {
        policy: run.policy,
        manifestId: run.agentManifest?.id,
        sandboxMode: run.policy.sandboxMode === true,
      },
    })
    this.store.updateRun(run)
    this.updateThreadRunStatus(run.threadId, run.status)

    try {
      const thread = this.requireThread(run.threadId)
      const lastUser = [...thread.messages].reverse().find((message) => message.role === 'user')
      if (!lastUser) throw new Error('run requires at least one user message')
      const clientInput = normalizeClientInput(run.metadata?.clientInput ?? thread.metadata?.lastClientInput)
      this.recordTraceEvent(run, {
        kind: 'message',
        title: 'User message loaded',
        summary: lastUser.content.slice(0, 180),
        status: 'completed',
        round: setupRound,
        data: {
          messageId: lastUser.id,
          hasClientInput: Boolean(clientInput),
          attachmentCount: clientInput?.attachments.length ?? 0,
        },
      })
      this.store.updateRun(run)

      const contextResult = await this.callTool(run, 'movscript.get_context_pack', {}, setupRound)
      const context = extractAgentContext(contextResult)
      if (typeof context.currentProjectId === 'number') {
        thread.projectId = context.currentProjectId
        this.store.updateThread(thread)
      }
      const memories = this.memoryManager.loadRelevantMemories({
        projectId: context.currentProjectId,
        threadId: thread.id,
      })
      this.recordTraceEvent(run, {
        kind: 'memory',
        title: 'Relevant memories loaded',
        summary: `${memories.length} memory item(s) matched this run.`,
        status: 'completed',
        round: setupRound,
        data: {
          memoryIds: memories.map((memory) => memory.id),
          kinds: Array.from(new Set(memories.map((memory) => memory.kind))),
        },
      })
      const agentManifest = run.agentManifest ?? this.defaultAgentManifest
      const capabilities = await resolveAgentCapabilities({
        mcpClient: this.mcpClient,
        manifest: agentManifest,
        currentProjectId: context.currentProjectId,
        registry: this.toolRegistry,
        pluginCatalog: this.pluginCatalogInfo,
        warnings: this.pluginWarnings,
      })
      const skills = resolveAgentSkills(agentManifest, lastUser.content, this.skillCatalog)
      const debugContext = buildDebugContext(contextResult, memories, clientInput)
      this.recordTraceEvent(run, {
        kind: 'context',
        title: 'Runtime context resolved',
        summary: debugContext.project
          ? `Project #${debugContext.project.id} ${debugContext.project.name ?? ''}`.trim()
          : 'No project context selected.',
        status: 'completed',
        round: setupRound,
        data: {
          route: debugContext.route,
          project: debugContext.project,
          selection: debugContext.selection,
          recentResourceCount: debugContext.recentResources.length,
          attachmentCount: debugContext.attachments.length,
        },
      })
      this.recordTraceEvent(run, {
        kind: 'manifest',
        title: 'Agent manifest resolved',
        summary: `${agentManifest.name} (${agentManifest.id}@${agentManifest.version})`,
        status: 'completed',
        round: setupRound,
        data: {
          id: agentManifest.id,
          version: agentManifest.version,
          permissions: agentManifest.permissions,
          toolGrants: agentManifest.tools.map((tool) => ({
            name: tool.name,
            mode: tool.mode,
            approval: tool.approval,
          })),
        },
      })
      this.recordTraceEvent(run, {
        kind: 'skill',
        title: 'Skills activated',
        summary: skills.length > 0 ? skills.map((skill) => skill.name).join(', ') : 'No skills activated.',
        status: 'completed',
        round: setupRound,
        data: {
          skills: skills.map((skill) => ({
            id: skill.id,
            name: skill.name,
            activationReason: skill.activationReason,
            priority: skill.resolvedPriority,
            warnings: skill.warnings,
          })),
        },
      })
      this.recordTraceEvent(run, {
        kind: 'tool_catalog',
        title: 'Tool catalog resolved',
        summary: `${capabilities.resolvedTools.available.length} available, ${capabilities.resolvedTools.blocked.length} blocked.`,
        status: 'completed',
        round: setupRound,
        data: {
          availableToolNames: capabilities.resolvedTools.available.map((tool) => tool.name),
          blockedTools: capabilities.resolvedTools.blocked.map((tool) => ({
            name: tool.name,
            reason: tool.unavailableReason,
          })),
          warnings: capabilities.warnings,
        },
      })
      const promptPreview = compilePromptPreview({
        manifest: agentManifest,
        skills,
        context: debugContext,
        tools: capabilities.resolvedTools,
        policy: run.policy,
        memories,
        history: thread.messages.filter((message) => message.id !== lastUser.id),
        userMessage: lastUser.content,
      })
      const warnings: string[] = [...capabilities.warnings]
      const toolResults: ToolCallOutcome[] = []
      let toolCallCount = 0
      run.metadata = {
        ...(run.metadata ?? {}),
        debugTrace: buildDebugTrace(agentManifest, skills, capabilities.resolvedTools, promptPreview.debugParts.map((part) => part.id)) as unknown as JSONValue,
        context: debugContext as unknown as JSONValue,
        promptPreview: promptPreview as unknown as JSONValue,
      }
      this.recordTraceEvent(run, {
        kind: 'prompt',
        title: 'Prompt compiled',
        summary: `${promptPreview.messages.length} outbound message(s), ${promptPreview.debugParts.length} debug part(s).`,
        status: 'completed',
        round: setupRound,
        data: {
          promptPartIds: promptPreview.debugParts.map((part) => part.id),
          messages: promptPreview.messages.map((message) => ({
            role: message.role,
            chars: message.content.length,
          })),
        },
      })
      this.store.updateRun(run)

      let nextRoundIndex = 1
      for (let iteration = 0; iteration < run.policy.maxIterations; iteration += 1) {
        const decisionRound = buildRunRound(nextRoundIndex++, `Runtime decision ${iteration + 1}`, 'runtime_rule')
        const proposedToolCalls = decideNextToolCalls({
          message: lastUser.content,
          memories,
          context: debugContext,
          forcedToolCall: iteration === 0 ? normalizeToolCall(run.metadata?.forcedToolCall) : undefined,
          toolResults,
        })
        this.recordTraceEvent(run, {
          kind: 'policy',
          title: `Iteration ${iteration + 1}: proposed tool calls`,
          summary: proposedToolCalls.length > 0
            ? proposedToolCalls.map((call) => call.name).join(', ')
            : 'No further tool calls proposed.',
          status: 'info',
          round: decisionRound,
          data: {
            iteration: iteration + 1,
            proposedToolCalls,
            previousToolResultCount: toolResults.length,
          },
        })
        if (proposedToolCalls.length === 0) break
        const remainingToolCalls = run.policy.maxToolCalls - toolCallCount
        if (remainingToolCalls <= 0) {
          warnings.push(`已达到工具调用上限 ${run.policy.maxToolCalls}`)
          break
        }
        const policy = applyToolPolicy(proposedToolCalls.slice(0, remainingToolCalls), {
          currentProjectId: context.currentProjectId,
          manifest: agentManifest,
          catalog: capabilities.resolvedTools,
          registry: this.toolRegistry,
          approvedToolNames: getApprovedToolNames(run),
          sandboxMode: run.policy.sandboxMode === true,
        })
        warnings.push(...policy.warnings.filter((warning) => !warnings.includes(warning)))
        this.recordTraceEvent(run, {
          kind: 'policy',
          title: `Iteration ${iteration + 1}: tool policy evaluated`,
          summary: `${policy.toolCalls.length} allowed, ${policy.blockedToolCalls.length} blocked.`,
          status: policy.blockedToolCalls.some((blocked) => blocked.reason === 'approval_required') ? 'blocked' : 'completed',
          round: decisionRound,
          data: {
            iteration: iteration + 1,
            allowedToolCalls: policy.toolCalls,
            blockedToolCalls: policy.blockedToolCalls.map((blocked) => ({
              call: blocked.call,
              reason: blocked.reason,
              message: blocked.message,
              tool: blocked.tool ? {
                name: blocked.tool.name,
                risk: blocked.tool.risk,
                permission: blocked.tool.permission,
              } : undefined,
            })),
            warnings: policy.warnings,
          },
        })
        const pendingApprovals = policy.blockedToolCalls
          .filter((blocked) => blocked.reason === 'approval_required')
          .map((blocked) => this.toApprovalRequest(run.id, blocked))
        if (pendingApprovals.length > 0) {
          const now = isoNow()
          run.pendingApprovals = mergePendingApprovals(run.pendingApprovals ?? [], pendingApprovals, now)
          run.warnings = warnings.length > 0 ? warnings : undefined
          run.status = 'requires_action'
          run.updatedAt = now
          this.recordTraceEvent(run, {
            kind: 'approval',
            title: 'Approval required',
            summary: `${pendingApprovals.length} tool action(s) paused the run.`,
            status: 'blocked',
            round: decisionRound,
            data: {
              approvals: pendingApprovals,
            },
          })
          this.store.updateRun(run)
          this.updateThreadRunStatus(run.threadId, run.status)
          return
        }

        for (const call of policy.toolCalls) {
          toolCallCount += 1
          try {
            const result = await this.callTool(run, call.name, call.args, decisionRound)
            toolResults.push({ call, result })
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            warnings.push(`${call.name} 未完成：${message}`)
            toolResults.push({ call, error: message })
          }
        }

        if (policy.toolCalls.length === 0) break
      }

      if (toolCallCount >= run.policy.maxToolCalls) {
        const extraCalls = decideNextToolCalls({
          message: lastUser.content,
          memories,
          context: debugContext,
          toolResults,
        })
        if (extraCalls.length > 0) warnings.push(`已达到工具调用上限 ${run.policy.maxToolCalls}`)
      }

      let currentModelRound = buildRunRound(nextRoundIndex++, 'Model round 1', 'model')
      let assistantContent = await buildConfiguredAssistantContent(
        lastUser.content,
        toolResults,
        warnings,
        memories,
        run,
        this.getRunAuth(run.id),
        (event) => {
          this.recordTraceEvent(run, {
            kind: 'model_call',
            title: modelTraceTitle(event.phase),
            summary: summarizeModelTrace(event.trace, event.error),
            status: event.phase === 'request' ? 'started' : event.phase === 'error' ? 'failed' : event.trace.response?.ok === false ? 'failed' : 'completed',
            round: currentModelRound,
            data: {
              phase: event.phase,
              ...event.trace,
              ...(event.error ? { error: event.error } : {}),
            },
          })
          this.store.updateRun(run)
        },
      )

      for (let modelIteration = 0; modelIteration < run.policy.maxIterations; modelIteration += 1) {
        const requestedToolCalls = extractRequestedToolCallsFromAssistantContent(assistantContent)
        if (requestedToolCalls.length === 0) break

        this.recordTraceEvent(run, {
          kind: 'policy',
          title: `Model iteration ${modelIteration + 1}: requested tool calls`,
          summary: requestedToolCalls.map((call) => call.name).join(', '),
          status: 'info',
          round: currentModelRound,
          data: {
            iteration: modelIteration + 1,
            requestedToolCalls,
            toolResultCount: toolResults.length,
          },
        })

        const remainingToolCalls = run.policy.maxToolCalls - toolCallCount
        if (remainingToolCalls <= 0) {
          warnings.push(`已达到工具调用上限 ${run.policy.maxToolCalls}`)
          break
        }

        const policy = applyToolPolicy(requestedToolCalls.slice(0, remainingToolCalls), {
          currentProjectId: context.currentProjectId,
          manifest: agentManifest,
          catalog: capabilities.resolvedTools,
          registry: this.toolRegistry,
          approvedToolNames: getApprovedToolNames(run),
          sandboxMode: run.policy.sandboxMode === true,
        })
        warnings.push(...policy.warnings.filter((warning) => !warnings.includes(warning)))
        this.recordTraceEvent(run, {
          kind: 'policy',
          title: `Model iteration ${modelIteration + 1}: tool policy evaluated`,
          summary: `${policy.toolCalls.length} allowed, ${policy.blockedToolCalls.length} blocked.`,
          status: policy.blockedToolCalls.some((blocked) => blocked.reason === 'approval_required') ? 'blocked' : 'completed',
          round: currentModelRound,
          data: {
            iteration: modelIteration + 1,
            allowedToolCalls: policy.toolCalls,
            blockedToolCalls: policy.blockedToolCalls.map((blocked) => ({
              call: blocked.call,
              reason: blocked.reason,
              message: blocked.message,
              tool: blocked.tool ? {
                name: blocked.tool.name,
                risk: blocked.tool.risk,
                permission: blocked.tool.permission,
              } : undefined,
            })),
            warnings: policy.warnings,
          },
        })

        const pendingApprovals = policy.blockedToolCalls
          .filter((blocked) => blocked.reason === 'approval_required')
          .map((blocked) => this.toApprovalRequest(run.id, blocked))
        if (pendingApprovals.length > 0) {
          const now = isoNow()
          run.pendingApprovals = mergePendingApprovals(run.pendingApprovals ?? [], pendingApprovals, now)
          run.warnings = warnings.length > 0 ? warnings : undefined
          run.status = 'requires_action'
          run.updatedAt = now
          this.recordTraceEvent(run, {
            kind: 'approval',
            title: 'Approval required',
            summary: `${pendingApprovals.length} tool action(s) paused the run.`,
            status: 'blocked',
            round: currentModelRound,
            data: {
              approvals: pendingApprovals,
            },
          })
          this.store.updateRun(run)
          this.updateThreadRunStatus(run.threadId, run.status)
          return
        }

        if (policy.toolCalls.length === 0) break
        for (const call of policy.toolCalls) {
          toolCallCount += 1
          try {
            const result = await this.callTool(run, call.name, call.args, currentModelRound)
            toolResults.push({ call, result })
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            warnings.push(`${call.name} 未完成：${message}`)
            toolResults.push({ call, error: message })
          }
        }

        currentModelRound = buildRunRound(nextRoundIndex++, `Model round ${modelIteration + 2}`, 'model')
        assistantContent = await buildConfiguredAssistantContent(
          lastUser.content,
          toolResults,
          warnings,
          memories,
          run,
          this.getRunAuth(run.id),
          (event) => {
            this.recordTraceEvent(run, {
              kind: 'model_call',
              title: modelTraceTitle(event.phase),
              summary: summarizeModelTrace(event.trace, event.error),
              status: event.phase === 'request' ? 'started' : event.phase === 'error' ? 'failed' : event.trace.response?.ok === false ? 'failed' : 'completed',
              round: currentModelRound,
              data: {
                phase: event.phase,
                ...event.trace,
                ...(event.error ? { error: event.error } : {}),
              },
            })
            this.store.updateRun(run)
          },
        )
      }

      if (toolCallCount >= run.policy.maxToolCalls) {
        const extraCalls = extractRequestedToolCallsFromAssistantContent(assistantContent)
        if (extraCalls.length > 0) warnings.push(`已达到工具调用上限 ${run.policy.maxToolCalls}`)
      }

      const finalRound = buildRunRound(nextRoundIndex++, 'Final response', 'final')
      const assistant = this.createMessage(
        thread.id,
        'assistant',
        assistantContent,
        run.id,
      )
      thread.messages.push(assistant)
      thread.updatedAt = assistant.createdAt

      const step = this.createStep(run, 'message', finalRound)
      step.status = 'completed'
      step.result = { messageId: assistant.id }
      step.completedAt = isoNow()
      this.recordTraceEvent(run, {
        kind: 'assistant',
        title: 'Assistant message created',
        summary: assistant.content.slice(0, 180),
        status: 'completed',
        round: finalRound,
        stepId: step.id,
        data: {
          messageId: assistant.id,
          chars: assistant.content.length,
        },
      })

      run.assistantMessageId = assistant.id
      run.warnings = warnings.length > 0 ? warnings : undefined
      const writtenMemories = this.memoryManager.extractAndWriteMemories({
        run,
        userMessage: lastUser,
        projectId: context.currentProjectId,
        toolResults,
        warnings,
      })
      run.metadata = {
        ...(run.metadata ?? {}),
        memoryIds: memories.map((memory) => memory.id),
        writtenMemoryIds: writtenMemories.map((memory) => memory.id),
      }
      this.recordTraceEvent(run, {
        kind: 'memory',
        title: 'Memories written',
        summary: `${writtenMemories.length} memory item(s) written after the run.`,
        status: 'completed',
        round: finalRound,
        data: {
          writtenMemoryIds: writtenMemories.map((memory) => memory.id),
          kinds: Array.from(new Set(writtenMemories.map((memory) => memory.kind))),
        },
      })
      run.status = warnings.length > 0 ? 'completed_with_warnings' : 'completed'
      run.completedAt = isoNow()
      run.updatedAt = run.completedAt
      this.recordTraceEvent(run, {
        kind: 'run',
        title: 'Run finished',
        summary: `Run ${run.status} with ${run.steps.length} step(s).`,
        status: warnings.length > 0 ? 'info' : 'completed',
        round: finalRound,
        data: {
          status: run.status,
          warningCount: warnings.length,
          stepCount: run.steps.length,
          toolResultCount: toolResults.length,
        },
      })
      thread.lastRunStatus = run.status
      thread.updatedAt = run.updatedAt
      this.store.updateThread(thread)
      this.store.updateRun(run)
    } catch (error) {
      run.status = 'failed'
      run.error = error instanceof Error ? error.message : String(error)
      run.failedAt = isoNow()
      run.updatedAt = run.failedAt
      this.recordTraceEvent(run, {
        kind: 'error',
        title: 'Run failed',
        summary: run.error,
        status: 'failed',
        data: {
          error: run.error,
        },
      })
      this.store.updateRun(run)
      this.updateThreadRunStatus(run.threadId, run.status)

      const thread = this.store.getThread(run.threadId)
      if (thread) {
        const assistant = this.createMessage(
          thread.id,
          'assistant',
          `运行失败：${run.error}`,
          run.id,
        )
        thread.messages.push(assistant)
        thread.updatedAt = assistant.createdAt
        thread.lastRunStatus = run.status
        run.assistantMessageId = assistant.id

        const step = this.createStep(run, 'message')
        step.status = 'completed'
        step.result = { messageId: assistant.id }
        step.completedAt = isoNow()
        this.memoryStore.createMemory({
          scope: 'thread',
          threadId: thread.id,
          kind: 'warning',
          content: run.error ?? 'run failed',
          sourceRunId: run.id,
        })
        this.store.updateThread(thread)
        this.store.updateRun(run)
      }
    }
  }

  private async callTool(
    run: AgentRun,
    toolName: string,
    args: Record<string, JSONValue> = {},
    round?: AgentRunRoundInfo,
  ): Promise<JSONValue> {
    const step = this.createStep(run, 'tool_call', round)
    step.toolName = toolName
    step.args = args
    this.recordTraceEvent(run, {
      kind: 'tool_call',
      title: `Tool call started: ${toolName}`,
      summary: Object.keys(args).length > 0 ? `${Object.keys(args).length} argument key(s).` : 'No arguments.',
      status: 'started',
      ...(round ? { round } : {}),
      stepId: step.id,
      toolName,
      data: {
        args,
      },
    })
    this.store.updateRun(run)

    try {
      const tool = this.toolRegistry.get(toolName)
      if (run.policy.sandboxMode && tool && isSandboxIntercepted(tool.risk)) {
        const result = buildSandboxResult(toolName, args)
        step.result = result
        step.sandboxed = true
        step.status = 'completed'
        step.completedAt = isoNow()
        run.updatedAt = step.completedAt
        this.recordTraceEvent(run, {
          kind: 'tool_call',
          title: `Tool sandboxed: ${toolName}`,
          summary: `${toolName} was intercepted by sandbox mode.`,
          status: 'completed',
          ...(round ? { round } : {}),
          stepId: step.id,
          toolName,
          data: {
            sandboxed: true,
            risk: tool.risk,
            result,
          },
        })
        this.store.updateRun(run)
        return result
      }

      const runtimeToolResult = await this.callRuntimeTool(run, toolName, args)
      if (runtimeToolResult !== undefined) {
        step.result = runtimeToolResult
        step.status = 'completed'
        step.completedAt = isoNow()
        run.updatedAt = step.completedAt
        this.recordTraceEvent(run, {
          kind: 'tool_call',
          title: `Runtime tool completed: ${toolName}`,
          summary: summarizeJSONValue(runtimeToolResult),
          status: 'completed',
          ...(round ? { round } : {}),
          stepId: step.id,
          toolName,
          data: {
            source: 'runtime',
            result: runtimeToolResult,
          },
        })
        this.store.updateRun(run)
        return runtimeToolResult
      }

      await this.mcpClient.initialize()
      const result = await this.mcpClient.callTool(toolName, args)
      step.result = result
      step.status = 'completed'
      step.completedAt = isoNow()
      run.updatedAt = step.completedAt
      this.recordTraceEvent(run, {
        kind: 'tool_call',
        title: `MCP tool completed: ${toolName}`,
        summary: summarizeJSONValue(result),
        status: 'completed',
        ...(round ? { round } : {}),
        stepId: step.id,
        toolName,
        data: {
          source: 'mcp',
          result,
        },
      })
      this.store.updateRun(run)
      return result
    } catch (error) {
      step.status = 'failed'
      step.error = error instanceof Error ? error.message : String(error)
      step.completedAt = isoNow()
      run.updatedAt = step.completedAt
      this.recordTraceEvent(run, {
        kind: 'tool_call',
        title: `Tool call failed: ${toolName}`,
        summary: step.error,
        status: 'failed',
        ...(round ? { round } : {}),
        stepId: step.id,
        toolName,
        data: {
          error: step.error,
        },
      })
      this.store.updateRun(run)
      throw error
    }
  }

  private rememberRunAuth(runId: string, value: unknown): void {
    const token = normalizeBackendAuthToken(value).backendAuthToken
    if (token) this.runAuth.set(runId, token)
  }

  private getRunAuth(runId: string): { backendAuthToken?: string } {
    const token = this.runAuth.get(runId)
    return token ? { backendAuthToken: token } : {}
  }

  private async callRuntimeTool(
    run: AgentRun,
    toolName: string,
    args: Record<string, JSONValue>,
  ): Promise<JSONValue | undefined> {
    if (toolName === 'movscript.create_draft') {
      return this.draftStore.createDraft({
        projectId: typeof args.projectId === 'number' ? args.projectId : undefined,
        kind: args.kind,
        title: args.title,
        content: args.content,
        source: mergeDraftSource(args.source, run),
        target: args.target,
        createdByRunId: run.id,
        createdByThreadId: run.threadId,
        metadata: isRecord(args.metadata) ? args.metadata : undefined,
      }) as unknown as JSONValue
    }

    if (toolName === 'movscript.list_drafts') {
      return {
        drafts: this.draftStore.listDrafts(normalizeDraftQuery(args)),
      } as unknown as JSONValue
    }

    if (toolName === 'movscript.apply_draft') {
      if (run.policy.sandboxMode) {
        return buildSandboxResult(toolName, args)
      }
      const preview = buildApplyDraftPreview(this.draftStore, args)
      const context = isRecord(run.metadata?.context) ? run.metadata.context as unknown as AgentDebugContextPanel : undefined
      const appliedByUserId = args.appliedByUserId ?? context?.user?.id
      let backendApply: BackendApplyResult
      try {
        backendApply = await this.backendApplyClient.applyReview(
          preview.review,
          typeof appliedByUserId === 'number' || typeof appliedByUserId === 'string'
            ? appliedByUserId
            : undefined,
        )
      } catch (error) {
        this.draftStore.updateDraft(preview.draft.id, {
          metadata: {
            ...(isRecord(preview.draft.metadata) ? preview.draft.metadata : {}),
            backendWritePerformed: false,
            backendWriteError: error instanceof Error ? error.message : String(error),
          },
        })
        throw error
      }
      const finalDraft = markDraftApplied(this.draftStore, preview.draft, preview.review, {
        ...args,
        ...(typeof appliedByUserId === 'number' || typeof appliedByUserId === 'string' ? { appliedByUserId } : {}),
      }, {
        backendWritePerformed: backendApply.performed,
        backendApply: backendApply as unknown as JSONValue,
      })
      return {
        status: 'applied',
        review: preview.review,
        draft: finalDraft,
        message: backendApply.performed
          ? 'Draft applied and backend entity patch completed.'
          : 'Draft marked applied in the local agent lifecycle. Backend entity patch was skipped.',
        backendApply,
      } as unknown as JSONValue
    }

    return undefined
  }

  private createStep(run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo): AgentRunStep {
    const step: AgentRunStep = {
      id: makeId('step'),
      runId: run.id,
      type,
      status: 'in_progress',
      ...(round ? {
        roundId: round.roundId,
        roundIndex: round.roundIndex,
        roundLabel: round.roundLabel,
        roundSource: round.roundSource,
      } : {}),
      createdAt: isoNow(),
    }
    run.steps.push(step)
    run.updatedAt = step.createdAt
    this.store.updateRun(run)
    return step
  }

  private recordTraceEvent(
    run: AgentRun,
    input: {
      kind: AgentTraceEventKind
      title: string
      summary?: string
      status: AgentTraceEvent['status']
      round?: AgentRunRoundInfo
      agentId?: string
      parentAgentId?: string
      stepId?: string
      toolName?: string
      data?: unknown
      completedAt?: string
    },
  ): AgentTraceEvent {
    const event: AgentTraceEvent = {
      id: makeId('trace'),
      runId: run.id,
      kind: input.kind,
      title: input.title,
      status: input.status,
      createdAt: isoNow(),
      ...(input.round ? {
        roundId: input.round.roundId,
        roundIndex: input.round.roundIndex,
        roundLabel: input.round.roundLabel,
        roundSource: input.round.roundSource,
      } : {}),
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.parentAgentId ? { parentAgentId: input.parentAgentId } : {}),
      ...(input.stepId ? { stepId: input.stepId } : {}),
      ...(input.toolName ? { toolName: input.toolName } : {}),
      ...(input.data !== undefined ? { data: toJSONValue(input.data) } : {}),
      ...(input.completedAt ? { completedAt: input.completedAt } : {}),
    }
    run.traceEvents = [...(run.traceEvents ?? []), event]
    run.updatedAt = event.completedAt ?? event.createdAt
    return event
  }

  private createMessage(
    threadId: string,
    role: AgentMessageRole,
    content: string,
    runId?: string,
  ): AgentMessage {
    return {
      id: makeId('msg'),
      threadId,
      role,
      content,
      runId,
      createdAt: isoNow(),
    }
  }

  private requireThread(id: string): AgentThread {
    const thread = this.store.getThread(id)
    if (!thread) throw new Error(`thread not found: ${id}`)
    return thread
  }

  private requireRun(id: string): AgentRun {
    const run = this.store.getRun(id)
    if (!run) throw new Error(`run not found: ${id}`)
    return run
  }

  private updateThreadRunStatus(threadId: string, status: AgentRun['status']): void {
    const thread = this.store.getThread(threadId)
    if (!thread) return
    thread.lastRunStatus = status
    thread.updatedAt = isoNow()
    this.store.updateThread(thread)
  }

  private toApprovalRequest(runId: string, blocked: BlockedToolCall): AgentApprovalRequest {
    return toApprovalRequest(runId, blocked, (call) => this.buildApprovalPreview(call))
  }

  private buildApprovalPreview(call: ToolCall): JSONValue | undefined {
    if (call.name !== 'movscript.apply_draft') return undefined
    try {
      return buildApplyDraftPreview(this.draftStore, call.args ?? {}) as unknown as JSONValue
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

function isMessageRole(value: unknown): value is AgentMessageRole {
  return value === 'system' || value === 'user' || value === 'assistant'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)))
}

function normalizeApprovedToolNames(value: unknown): string[] {
  return normalizeStringArray(value)
}

function normalizeToolCall(value: unknown): ToolCall | undefined {
  if (!isRecord(value)) return undefined
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : undefined
  if (!name) return undefined
  return {
    name,
    ...(isRecord(value.args) ? { args: value.args as Record<string, JSONValue> } : {}),
  }
}

type NormalizedClientInput = {
  visibleMessage: string
  attachments: AgentClientAttachmentRef[]
  uiSnapshot?: AgentClientUISnapshot
}

function normalizeClientInput(value: unknown): NormalizedClientInput | undefined {
  if (!isRecord(value)) return undefined
  const message = typeof value.message === 'string' ? value.message.trim() : ''
  const attachments = normalizeClientAttachments(value.attachments)
  const uiSnapshot = normalizeClientUISnapshot(value.uiSnapshot)
  if (!message && attachments.length === 0) return undefined
  return {
    visibleMessage: message || '用户发送了附件。',
    attachments,
    ...(uiSnapshot ? { uiSnapshot } : {}),
  }
}

function normalizeClientAttachments(value: unknown): AgentClientAttachmentRef[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : undefined
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : undefined
    const type = typeof item.type === 'string' && item.type.trim() ? item.type.trim() : undefined
    const mimeType = typeof item.mimeType === 'string' && item.mimeType.trim()
      ? item.mimeType.trim()
      : typeof item.mime_type === 'string' && item.mime_type.trim()
        ? item.mime_type.trim()
        : undefined
    const size = typeof item.size === 'number' && Number.isFinite(item.size) ? item.size : undefined
    const resourceId = typeof item.resourceId === 'number' && Number.isFinite(item.resourceId)
      ? item.resourceId
      : typeof item.resource_id === 'number' && Number.isFinite(item.resource_id)
        ? item.resource_id
        : undefined
    if (!id && !name && resourceId === undefined) return []
    return [{
      ...(id ? { id } : {}),
      ...(name ? { name } : {}),
      ...(type ? { type } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(size !== undefined ? { size } : {}),
      ...(resourceId !== undefined ? { resourceId } : {}),
    }]
  })
}

function normalizeClientUISnapshot(value: unknown): AgentClientUISnapshot | undefined {
  if (!isRecord(value)) return undefined
  const route = isRecord(value.route) ? value.route : undefined
  const project = isRecord(value.project) ? value.project : undefined
  const selection = isRecord(value.selection) ? value.selection : value.selection === null ? null : undefined
  const recentResources = normalizeClientResources(value.recentResources)
  const labels = normalizeStringArray(value.labels)

  const snapshot: AgentClientUISnapshot = {
    ...(route ? {
      route: {
        ...(typeof route.pathname === 'string' && route.pathname.trim() ? { pathname: route.pathname.trim() } : {}),
        ...(typeof route.search === 'string' ? { search: route.search } : {}),
        ...(typeof route.hash === 'string' ? { hash: route.hash } : {}),
      },
    } : {}),
    ...(project ? {
      project: {
        ...(typeof project.id === 'number' && Number.isFinite(project.id) ? { id: project.id } : typeof project.ID === 'number' && Number.isFinite(project.ID) ? { id: project.ID } : {}),
        ...(typeof project.name === 'string' ? { name: project.name } : {}),
        ...(typeof project.status === 'string' ? { status: project.status } : {}),
        ...(typeof project.description === 'string' ? { description: project.description } : {}),
      },
    } : {}),
    ...(selection === null ? { selection: null } : selection ? {
      selection: {
        ...(typeof selection.entityType === 'string' ? { entityType: selection.entityType } : {}),
        ...(typeof selection.entityId === 'number' || typeof selection.entityId === 'string' ? { entityId: selection.entityId } : {}),
        ...(typeof selection.label === 'string' ? { label: selection.label } : {}),
      },
    } : {}),
    ...(recentResources.length > 0 ? { recentResources } : {}),
    ...(labels.length > 0 ? { labels } : {}),
  }

  return Object.keys(snapshot).length > 0 ? snapshot : undefined
}

function normalizeClientResources(value: unknown): AgentClientResourceRef[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const id = typeof item.id === 'number' && Number.isFinite(item.id)
      ? item.id
      : typeof item.ID === 'number' && Number.isFinite(item.ID)
        ? item.ID
        : undefined
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : undefined
    const type = typeof item.type === 'string' && item.type.trim() ? item.type.trim() : undefined
    if (id === undefined || !name || !type) return []
    return [{
      id,
      name,
      type,
      ...(typeof item.mimeType === 'string' ? { mimeType: item.mimeType } : typeof item.mime_type === 'string' ? { mimeType: item.mime_type } : {}),
      ...(typeof item.size === 'number' && Number.isFinite(item.size) ? { size: item.size } : {}),
    }]
  })
}

function buildRuntimeUserMessage(input: NormalizedClientInput): string {
  const sections = [input.visibleMessage]
  if (input.attachments.length > 0) {
    sections.push([
      '[用户附件引用]',
      ...input.attachments.map((attachment, index) => {
        const identity = attachment.resourceId !== undefined ? `resource_id=${attachment.resourceId}` : attachment.id ? `id=${attachment.id}` : 'local_preview'
        return `${index + 1}. ${attachment.name ?? '未命名附件'} (${attachment.type ?? 'file'}, ${attachment.mimeType ?? 'unknown'}, ${attachment.size ?? 0} bytes, ${identity})`
      }),
      '当前 runtime 只接收附件引用和元数据；需要理解媒体内容时必须使用可用工具读取资源上下文，不能假设已经读取二进制内容。',
    ].join('\n'))
  }
  return sections.join('\n\n')
}

function normalizeDraftQuery(query: {
  projectId?: unknown
  kind?: unknown
  status?: unknown
  sourceEntityType?: unknown
  sourceEntityId?: unknown
  limit?: unknown
}): {
  projectId?: number
  kind?: AgentDraftKind
  status?: AgentDraftStatus
  sourceEntityType?: string
  sourceEntityId?: number | string
  limit?: number
} {
  const kind = normalizeOptionalDraftKind(query.kind)
  const status = normalizeDraftStatus(query.status)
  return {
    ...(typeof query.projectId === 'number' && Number.isFinite(query.projectId) ? { projectId: query.projectId } : {}),
    ...(kind ? { kind } : {}),
    ...(status ? { status } : {}),
    ...(typeof query.sourceEntityType === 'string' && query.sourceEntityType.trim() ? { sourceEntityType: query.sourceEntityType.trim() } : {}),
    ...(typeof query.sourceEntityId === 'number' || typeof query.sourceEntityId === 'string' ? { sourceEntityId: query.sourceEntityId } : {}),
    ...(typeof query.limit === 'number' && Number.isFinite(query.limit) ? { limit: query.limit } : {}),
  }
}

function normalizeOptionalDraftKind(value: unknown): AgentDraftKind | undefined {
  const kind = normalizeDraftKind(value)
  return kind === value ? kind : undefined
}

function mergeDraftSource(source: JSONValue | undefined, run: AgentRun): Record<string, JSONValue> {
  return {
    ...(isRecord(source) ? source : {}),
    runId: run.id,
    threadId: run.threadId,
  }
}

function getApprovedToolNames(run: AgentRun): string[] {
  return normalizeApprovedToolNames(run.metadata?.approvedToolNames)
}

function defaultRunPolicy(input: {
  approvalMode?: AgentRunPolicy['approvalMode']
  sandboxMode?: boolean
} = {}): AgentRunPolicy {
  return {
    approvalMode: input.approvalMode ?? 'interactive',
    ...(input.sandboxMode ? { sandboxMode: true } : {}),
    maxToolCalls: 20,
    maxIterations: 20,
    allowNetwork: false,
    allowFileBytes: false,
  }
}

function buildRunRound(
  roundIndex: number,
  roundLabel: string,
  roundSource: AgentRunRoundInfo['roundSource'],
): AgentRunRoundInfo {
  return {
    roundId: `round_${roundIndex}`,
    roundIndex,
    roundLabel,
    roundSource,
  }
}

function decideNextToolCalls(input: {
  message: string
  memories: AgentMemory[]
  context: AgentDebugContextPanel
  forcedToolCall?: ToolCall
  toolResults?: ToolCallOutcome[]
}): ToolCall[] {
  if (input.forcedToolCall) return [input.forcedToolCall]
  const toolResults = input.toolResults ?? []
  if (toolResults.length > 0) return []
  const message = input.message.trim()
  const command = parseInteractionCommand(message)
  const calls: ToolCall[] = []
  const selection = input.context.selection

  if (command === 'inspect_context') return []
  if (command === 'project_structure' || wantsProjectStructure(message)) {
    calls.push({ name: 'movscript.read_project_structure', args: { limit: 50 } })
  }
  if (command === 'list_drafts' || wantsDraftList(message)) {
    calls.push({ name: 'movscript.list_drafts', args: { limit: 20 } })
  }
  if (command === 'read_entity') {
    const target = parseEntityTarget(message) ?? selection
    if (target?.entityType && target.entityId !== undefined) {
      calls.push({
        name: 'movscript.read_entity',
        args: {
          entityType: target.entityType,
          entityId: target.entityId,
        },
      })
    }
  }
  if (command === 'apply_draft' || wantsApplyDraft(message)) {
    const draftId = parseDraftId(message)
    if (draftId) {
      const target = parseEntityTarget(message)
      calls.push({
        name: 'movscript.apply_draft',
        args: {
          draftId,
          ...(target ? {
            target: {
              entityType: target.entityType,
              entityId: target.entityId,
              ...(target.field ? { field: target.field } : {}),
            },
          } : {}),
        },
      })
    }
  }
  if (wantsProjectLookup(message)) {
    calls.push({
      name: 'movscript.search_entities',
      args: {
        query: summarizeSearchQuery(message),
        limit: 8,
      },
    })
  }
  if (command === 'draft' || wantsDraft(message)) {
    calls.push({
      name: 'movscript.create_draft',
      args: {
        kind: inferDraftKind(message, selection?.entityType),
        title: summarizeDraftTitle(message),
        content: buildDraftContent(message, input.memories),
        source: {
          ...(selection ? { entityType: selection.entityType, entityId: selection.entityId } : {}),
        },
        ...(selection ? {
          target: {
            entityType: selection.entityType,
            entityId: selection.entityId,
          },
        } : {}),
      },
    })
  }

  return dedupeToolCalls(calls)
}

function parseInteractionCommand(message: string): string | undefined {
  const firstToken = message.trim().split(/\s+/, 1)[0]
  const command = firstToken.startsWith('/') ? firstToken.slice(1) : ''
  if (command === 'context') return 'inspect_context'
  if (command === 'inspect_context') return 'inspect_context'
  if (command === 'project_structure') return 'project_structure'
  if (command === 'list_drafts') return 'list_drafts'
  if (command === 'read_entity') return 'read_entity'
  if (command === 'draft') return 'draft'
  if (command === 'apply_draft') return 'apply_draft'
  return undefined
}

function wantsProjectStructure(message: string): boolean {
  return /项目结构|结构摘要|read_project_structure|project structure|production plan|制作计划|规划项目/i.test(message)
}

function wantsDraftList(message: string): boolean {
  return /列出.*草稿|草稿列表|已有.*草稿|list_drafts|drafts/i.test(message)
}

function wantsApplyDraft(message: string): boolean {
  return /应用草稿|apply[_\s-]?draft|确认草稿|接受草稿/i.test(message)
}

function wantsProjectLookup(message: string): boolean {
  return /搜索|查找|看看|读取|检索|search|find|lookup|资料/i.test(message) && !wantsApplyDraft(message)
}

function wantsDraft(message: string): boolean {
  return /草稿|起草|改写|修改|写一个|生成.*内容|draft|revise|rewrite/i.test(message) && !wantsApplyDraft(message) && !wantsDraftList(message)
}

function parseDraftId(message: string): string | undefined {
  return message.match(/\b(draft_[a-zA-Z0-9_-]+)\b/)?.[1]
}

function parseEntityTarget(message: string): { entityType: string; entityId: number | string; field?: string } | undefined {
  const entity = message.match(/\b(script|setting|segment|scene_moment|storyboard_line|content_unit|asset_slot)\s*#?\s*([a-zA-Z0-9_-]+)/i)
  const field = message.match(/字段\s*([a-zA-Z0-9_]+)/)?.[1] ?? message.match(/\bfield\s+([a-zA-Z0-9_]+)/i)?.[1]
  if (!entity) return undefined
  const rawId = entity[2]
  const numericId = Number(rawId)
  return {
    entityType: entity[1].toLowerCase(),
    entityId: Number.isFinite(numericId) ? numericId : rawId,
    ...(field ? { field } : {}),
  }
}

function summarizeSearchQuery(message: string): string {
  return message
    .replace(/^\/\w+\s*/, '')
    .replace(/搜索|查找|检索|看看|资料|search|find|lookup/gi, ' ')
    .trim()
    .slice(0, 80) || message.trim().slice(0, 80)
}

function inferDraftKind(message: string, selectedEntityType?: string): string {
  if (selectedEntityType === 'content_unit' || /镜头|内容单元|content unit/i.test(message)) return 'content_unit'
  if (selectedEntityType === 'script' || /剧本|script/i.test(message)) return 'script'
  if (selectedEntityType === 'setting' || /设定|setting/i.test(message)) return 'setting'
  return 'note'
}

function summarizeDraftTitle(message: string): string {
  const normalized = message.replace(/^\/\w+\s*/, '').trim()
  return (normalized ? normalized.slice(0, 40) : 'Agent draft')
}

function buildDraftContent(message: string, memories: AgentMemory[]): string {
  const memoryLines = memories
    .filter((memory) => memory.kind === 'preference' || memory.kind === 'fact')
    .slice(0, 5)
    .map((memory) => `- ${memory.content}`)
  return [
    `用户请求：${message.trim()}`,
    memoryLines.length > 0 ? `相关记忆：\n${memoryLines.join('\n')}` : undefined,
    '草稿内容：请基于当前项目上下文继续细化。',
  ].filter(Boolean).join('\n\n')
}

function dedupeToolCalls(calls: ToolCall[]): ToolCall[] {
  const seen = new Set<string>()
  const result: ToolCall[] = []
  for (const call of calls) {
    const key = `${call.name}:${JSON.stringify(call.args ?? {})}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(call)
  }
  return result
}

function isSandboxIntercepted(risk: ToolRiskLevel): boolean {
  return risk === 'write' || risk === 'generate' || risk === 'destructive'
}

function buildSandboxResult(toolName: string, args: Record<string, JSONValue>): JSONValue {
  return {
    sandboxed: true,
    wouldHaveExecuted: {
      name: toolName,
      args,
    },
    simulatedResult: `${toolName} 已模拟执行（sandbox 模式，未实际写入）`,
    interceptedAt: isoNow(),
  }
}

function summarizeJSONValue(value: JSONValue): string {
  if (value === null) return 'null'
  if (typeof value !== 'object') return String(value).slice(0, 180)
  if (Array.isArray(value)) return `${value.length} item(s)`
  const keys = Object.keys(value)
  const typed = typeof value.status === 'string'
    ? `${value.status}; `
    : typeof value.message === 'string'
      ? `${value.message.slice(0, 120)}; `
      : ''
  return `${typed}${keys.length} key(s): ${keys.slice(0, 6).join(', ')}`
}

function modelTraceTitle(phase: 'request' | 'response' | 'error'): string {
  if (phase === 'request') return 'Model HTTP request sent'
  if (phase === 'response') return 'Model HTTP response received'
  return 'Model HTTP call failed'
}

function summarizeModelTrace(
  trace: {
    request?: { body?: { model?: string } }
    response?: { status?: number; statusText?: string; content?: string }
    latencyMs?: number
  },
  error?: string,
): string {
  if (error) return error.slice(0, 220)
  if (trace.response) {
    const status = `HTTP ${trace.response.status ?? 'unknown'}${trace.response.statusText ? ` ${trace.response.statusText}` : ''}`
    const latency = typeof trace.latencyMs === 'number' ? ` in ${trace.latencyMs}ms` : ''
    const content = trace.response.content ? `; ${trace.response.content.slice(0, 120)}` : ''
    return `${status}${latency}${content}`
  }
  const model = trace.request?.body?.model
  return `POST model gateway${model ? ` using ${model}` : ''}`
}

function buildDebugContext(
  contextResult: JSONValue,
  memories: AgentMemory[],
  clientInput?: NormalizedClientInput,
): AgentDebugContextPanel {
  const parsed = parseToolResult(contextResult)
  const snapshot = isRecord(parsed) && isRecord(parsed.snapshot) ? parsed.snapshot : parsed
  const project = isRecord(snapshot) && isRecord(snapshot.project) ? snapshot.project : undefined
  const projectId = typeof project?.id === 'number' ? project.id : typeof project?.ID === 'number' ? project.ID : undefined
  const route = isRecord(snapshot) && isRecord(snapshot.route) ? snapshot.route : undefined
  const user = isRecord(snapshot) && isRecord(snapshot.user) ? snapshot.user : undefined
  const selection = isRecord(snapshot) && isRecord(snapshot.selection) ? snapshot.selection : undefined
  const ui = clientInput?.uiSnapshot
  const uiProject = ui?.project
  const uiSelection = ui?.selection
  const mergedProjectId = typeof projectId === 'number' ? projectId : uiProject?.id
  return {
    route: {
      pathname: typeof route?.pathname === 'string' ? route.pathname : ui?.route?.pathname ?? '/',
      ...(typeof route?.search === 'string' ? { search: route.search } : typeof ui?.route?.search === 'string' ? { search: ui.route.search } : {}),
      ...(typeof route?.hash === 'string' ? { hash: route.hash } : typeof ui?.route?.hash === 'string' ? { hash: ui.route.hash } : {}),
    },
    ...((project || uiProject) && mergedProjectId !== undefined ? {
      project: {
        id: mergedProjectId,
        ...(typeof project?.name === 'string' ? { name: project.name } : typeof uiProject?.name === 'string' ? { name: uiProject.name } : {}),
        ...(typeof project?.status === 'string' ? { status: project.status } : typeof uiProject?.status === 'string' ? { status: uiProject.status } : {}),
        ...(typeof project?.description === 'string' ? { description: project.description } : typeof uiProject?.description === 'string' ? { description: uiProject.description } : {}),
      },
    } : {}),
    ...(user && typeof user.id === 'number' && typeof user.username === 'string' ? {
      user: {
        id: user.id,
        username: user.username,
        ...(typeof user.systemRole === 'string' ? { systemRole: user.systemRole } : {}),
      },
    } : {}),
    ...(selection && typeof selection.entityType === 'string' && (typeof selection.entityId === 'number' || typeof selection.entityId === 'string') ? {
      selection: {
        entityType: selection.entityType,
        entityId: selection.entityId,
        ...(typeof selection.label === 'string' ? { label: selection.label } : {}),
      },
    } : uiSelection && typeof uiSelection.entityType === 'string' && (typeof uiSelection.entityId === 'number' || typeof uiSelection.entityId === 'string') ? {
      selection: {
        entityType: uiSelection.entityType,
        entityId: uiSelection.entityId,
        ...(typeof uiSelection.label === 'string' ? { label: uiSelection.label } : {}),
      },
    } : { selection: null }),
    recentResources: mergeDebugResources(
      normalizeDebugResources(isRecord(snapshot) ? snapshot.recentResources : undefined),
      ui?.recentResources ?? [],
    ),
    attachments: clientInput?.attachments.map((attachment) => ({
      id: attachment.id ?? (attachment.resourceId !== undefined ? `resource-${attachment.resourceId}` : attachment.name ?? 'attachment'),
      name: attachment.name ?? '未命名附件',
      type: attachment.type ?? 'file',
      ...(attachment.resourceId !== undefined ? { resourceId: attachment.resourceId } : {}),
    })) ?? [],
    memories: memories.map(toDebugMemoryRef),
    labels: ui?.labels ?? [],
  }
}

function normalizeDebugResources(value: unknown): AgentDebugContextPanel['recentResources'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const id = typeof item.id === 'number' ? item.id : typeof item.ID === 'number' ? item.ID : undefined
    const name = typeof item.name === 'string' ? item.name : undefined
    const type = typeof item.type === 'string' ? item.type : undefined
    if (id === undefined || !name || !type) return []
    return [{
      id,
      name,
      type,
      ...(typeof item.mimeType === 'string' ? { mimeType: item.mimeType } : typeof item.mime_type === 'string' ? { mimeType: item.mime_type } : {}),
      ...(typeof item.size === 'number' ? { size: item.size } : {}),
    }]
  })
}

function mergeDebugResources(
  base: AgentDebugContextPanel['recentResources'],
  extra: AgentClientResourceRef[],
): AgentDebugContextPanel['recentResources'] {
  const byId = new Map<number, AgentDebugContextPanel['recentResources'][number]>()
  for (const resource of base) byId.set(resource.id, resource)
  for (const resource of extra) {
    if (typeof resource.id !== 'number' || !resource.name || !resource.type) continue
    byId.set(resource.id, {
      id: resource.id,
      name: resource.name,
      type: resource.type,
      ...(resource.mimeType ? { mimeType: resource.mimeType } : {}),
      ...(typeof resource.size === 'number' ? { size: resource.size } : {}),
    })
  }
  return Array.from(byId.values())
}

function toDebugMemoryRef(memory: AgentMemory): AgentDebugContextPanel['memories'][number] {
  return {
    id: memory.id,
    scope: memory.scope,
    kind: memory.kind,
    content: memory.content,
  }
}

function buildDebugTrace(
  manifest: AgentManifest,
  skills: ReturnType<typeof resolveAgentSkills>,
  tools: AgentCapabilitiesResponse['resolvedTools'],
  promptPartIds: string[],
): AgentRunDebugTrace {
  return {
    manifestId: manifest.id,
    manifestVersion: manifest.version,
    skillIds: skills.map((skill) => skill.id),
    availableToolNames: tools.available.map((tool) => tool.name),
    blockedTools: tools.blocked.map((tool) => ({
      name: tool.name,
      ...(tool.unavailableReason ? { reason: tool.unavailableReason } : {}),
    })),
    promptPartIds,
    ...(manifest.model ? { model: manifest.model } : {}),
  }
}

function toApprovalRequest(
  runId: string,
  blocked: BlockedToolCall,
  buildPreview?: (call: ToolCall) => JSONValue | undefined,
): AgentApprovalRequest {
  const now = isoNow()
  const preview = buildPreview?.(blocked.call)
  return {
    id: makeId('approval'),
    runId,
    toolName: blocked.call.name,
    ...(blocked.call.args ? { args: blocked.call.args } : {}),
    ...(preview !== undefined ? { preview } : {}),
    reason: blocked.message,
    ...(blocked.tool?.risk ? { risk: blocked.tool.risk } : {}),
    ...(blocked.tool?.permission ? { permission: blocked.tool.permission } : {}),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }
}

function mergePendingApprovals(
  existing: AgentApprovalRequest[],
  next: AgentApprovalRequest[],
  updatedAt: string,
): AgentApprovalRequest[] {
  const byTool = new Map<string, AgentApprovalRequest>()
  for (const approval of existing) {
    if (approval.status === 'pending') byTool.set(approval.toolName, approval)
  }
  for (const approval of next) {
    const current = byTool.get(approval.toolName)
    byTool.set(approval.toolName, current ? { ...current, args: approval.args, reason: approval.reason, updatedAt } : approval)
  }
  return Array.from(byTool.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function normalizeBackendAuthToken(value: unknown): { backendAuthToken?: string } {
  return typeof value === 'string' && value.trim() ? { backendAuthToken: value.trim() } : {}
}

function toJSONValue(value: unknown): JSONValue {
  if (value === undefined) return null
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(toJSONValue)
  if (!isRecord(value)) return String(value)
  const out: Record<string, JSONValue> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue
    out[key] = toJSONValue(item)
  }
  return out
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function isoNow(): string {
  return new Date().toISOString()
}
