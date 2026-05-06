import type { MCPClient } from '../mcpClient.js'
import type { JSONValue } from '../types.js'
import { DEFAULT_AGENT_MANIFEST, normalizeAgentManifest, type AgentManifest } from '../manifest/agentManifest.js'
import { extractAgentContext } from '../context/runtimeContext.js'
import { resolveAgentCapabilities } from '../runtime/tools/capabilityResolver.js'
import { MemoryManager } from '../memory/memoryManager.js'
import { InMemoryAgentMemoryStore, type AgentMemoryStore } from '../memory/memoryStore.js'
import type { AgentMemory, MemoryQuery } from '../memory/types.js'
import { resolveAgentSkills } from '../manifest/skillResolver.js'
import { InMemoryAgentStore, type AgentStore } from '../state/store.js'
import { DEFAULT_TOOL_REGISTRY, type ToolRegistry } from '../tools/toolRegistry.js'
import {
  InMemoryAgentDraftStore,
  normalizeDraftStatus,
  type AgentDraft,
  type AgentDraftKind,
  type AgentDraftStatus,
  type AgentDraftStore,
} from '../drafts/draftStore.js'
import { buildApplyDraftPreview, rejectDraft } from '../drafts/draftApply.js'
import { BackendApplyClient } from '../drafts/backendApplyClient.js'
import { runAgentGraph } from '../orchestration/agentGraph.js'
import { buildPromptPreview } from '../orchestration/contextBuilder.js'
import {
  EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
  type AgentRuntimeContractResolver,
} from '../contracts/runtimeContract.js'
import { buildAgentRun } from '../state/runFactory.js'
import { appendTraceEvent, buildRunStep } from '../state/runTrace.js'
import { buildRunSetupMetadata } from '../state/runSetup.js'
import type {
  AgentApprovalRequest,
  AgentInputRequest,
  AgentMessage,
  AgentMessageRole,
  AgentRunPreview,
  AgentRun,
  AgentTraceEvent,
  AgentTraceEventKind,
  AgentRunStep,
  AgentRuntimeOptions,
  AgentCapabilitiesResponse,
  AgentDebugContextPanel,
  AgentRunPolicy,
  AgentThread,
  AgentThreadSummary,
  ApproveRunInput,
  CancelRunInput,
  AnswerRunInputRequestInput,
  CreateMessageInput,
  CreateRunInput,
  CreateToolRunInput,
  CreateThreadInput,
  PreviewRunInput,
  RejectRunInput,
  ToolCallOutcome,
  ToolCall,
  UpdateThreadInput,
} from '../state/types.js'
import { normalizeClientInput, buildRuntimeUserMessage } from '../context/normalizeClientInput.js'
import {
  normalizeStringArray,
  normalizeApprovedToolNames,
  normalizeToolCall,
  normalizeBackendAuthToken,
  normalizeBackendAPIBaseURL,
  normalizeDraftQuery,
  normalizeOptionalDraftKind,
  getApprovedToolNames,
  defaultRunPolicy,
  buildRunRound,
  mergePendingApprovals,
  mergePendingInputRequests,
  formatInputAnswerMessage,
  type AgentRunRoundInfo,
} from '../context/normalizeRunInput.js'
import { buildDebugContext, buildDebugTrace } from '../context/debugContext.js'
import { parseAgentCommand } from '../context/commandRouter.js'
import { planPreviewToolRequests } from '../runtime/preview/previewPlanner.js'
import {
  buildLocalDiagnosticFallbackContextResult,
  isLocalDiagnosticCommand,
  renderLocalDiagnosticCommand,
  renderLocalFinalAssistantContent,
} from '../context/localDiagnosticCommands.js'

export type {
  AgentMessage,
  AgentMessageRole,
  AgentRun,
  AgentRunPreview,
  AgentRunStatus,
  AgentRunStep,
  AgentRuntimeOptions,
  AgentApprovalRequest,
  AgentInputRequest,
  AgentCapabilitiesResponse,
  AgentDebugContextPanel,
  AgentRunDebugTrace,
  AgentRunPolicy,
  AgentStepStatus,
  AgentThread,
  AgentThreadSummary,
  ApproveRunInput,
  CancelRunInput,
  AnswerRunInputRequestInput,
  CreateMessageInput,
  CreateRunInput,
  CreateToolRunInput,
  CreateThreadInput,
  PreviewRunInput,
  RejectRunInput,
  UpdateThreadInput,
  ToolCall,
  ToolCallOutcome,
} from '../state/types.js'
export type { AgentMemory, AgentMemoryKind, AgentMemoryScope, MemoryQuery } from '../memory/types.js'
export type { AgentManifest, AgentToolGrant, AgentSkillManifest } from '../manifest/agentManifest.js'
export type {
  AgentUpdateCandidate,
  AgentUpdateChannel,
  AgentUpdateDecision,
  AgentUpdateEvaluation,
  AgentUpdateKind,
  AgentUpdatePolicy,
  AgentUpdatePolicyRule,
  AgentUpdateSeverity,
  AgentUpdateState,
} from '../updates/updatePolicy.js'
export { DEFAULT_AGENT_MANIFEST, normalizeAgentManifest } from '../manifest/agentManifest.js'
export {
  DEFAULT_AGENT_UPDATE_POLICY,
  buildAgentUpdateState,
  evaluateAgentUpdateCandidate,
  normalizeAgentUpdateCandidate,
  normalizeAgentUpdatePolicy,
} from '../updates/updatePolicy.js'
export { InMemoryAgentMemoryStore } from '../memory/memoryStore.js'
export { InMemoryAgentStore } from '../state/store.js'
export {
  FileAgentDraftStore,
  InMemoryAgentDraftStore,
  normalizeDraftStatus,
  resolveAgentDraftPath,
} from '../drafts/draftStore.js'
export { DEFAULT_TOOL_REGISTRY, StaticToolRegistry } from '../tools/toolRegistry.js'
export {
  loadAgentPluginCatalog,
  resolveAgentSkillsDir,
  resolveAgentToolsDir,
  resolveBuiltinAgentSkillsDir,
  resolveBuiltinAgentToolsDir,
} from '../manifest/pluginCatalog.js'

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
  private readonly contractResolver: AgentRuntimeContractResolver
  private readonly pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  private readonly pluginWarnings: string[]
  private readonly updateState?: AgentCapabilitiesResponse['updates']
  private readonly runControllers = new Map<string, AbortController>()
  private readonly runAuth = new Map<string, { backendAuthToken?: string; backendAPIBaseURL?: string }>()

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
    this.contractResolver = options.contractResolver ?? EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER
    this.pluginCatalogInfo = options.pluginCatalogInfo
    this.pluginWarnings = options.pluginWarnings ?? []
    this.updateState = options.updateState
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
      updates: this.updateState,
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
    if (!content) throw new Error('message content is required')
    const message = this.createMessage(threadId, role, content)
    thread.messages.push(message)
    if (clientInput) {
      thread.metadata = { ...(thread.metadata ?? {}), lastClientInput: clientInput as unknown as JSONValue }
    }
    thread.updatedAt = message.createdAt
    this.store.updateThread(thread)
    return message
  }

  createRun(input: CreateRunInput): AgentRun {
    if (typeof input.threadId !== 'string' || !input.threadId) throw new Error('threadId is required')
    const thread = this.requireThread(input.threadId)
    const clientInput = normalizeClientInput(input.clientInput)
    if (clientInput) {
      thread.metadata = { ...(thread.metadata ?? {}), lastClientInput: clientInput as unknown as JSONValue }
      this.store.updateThread(thread)
    }
    const now = isoNow()
    const agentManifest = normalizeAgentManifest(input.agentManifest ?? this.defaultAgentManifest)
    const runtimeContract = this.contractResolver.find(agentManifest)
    const approvedToolNames = normalizeApprovedToolNames(input.approvedToolNames)
    const policy = defaultRunPolicy({ sandboxMode: input.sandboxMode === true })
    const initialUser = [...thread.messages].reverse().find((message) => message.role === 'user')
    const run = buildAgentRun({
      id: makeId('run'),
      threadId: input.threadId,
      agentManifest,
      policy,
      now,
      runtimeContract,
      ...(approvedToolNames.length > 0 ? { approvedToolNames } : {}),
      ...(clientInput ? { clientInput: clientInput as unknown as JSONValue } : {}),
      ...(initialUser ? { initialUserMessageId: initialUser.id } : {}),
    })
    this.store.createRun(run)
    thread.lastRunStatus = run.status
    thread.updatedAt = now
    this.store.updateThread(thread)
    this.rememberRunAuth(run.id, input)
    this.startRunExecution(run.id)
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
      thread.metadata = { ...(thread.metadata ?? {}), lastClientInput: clientInput as unknown as JSONValue }
    }
    thread.updatedAt = userMessage.createdAt
    this.store.updateThread(thread)
    const now = isoNow()
    const approvedToolNames = normalizeApprovedToolNames(input.approvedToolNames)
    const agentManifest = normalizeAgentManifest(input.agentManifest ?? this.defaultAgentManifest)
    const runtimeContract = this.contractResolver.find(agentManifest)
    const policy = defaultRunPolicy({ sandboxMode: input.sandboxMode === true })
    const run = buildAgentRun({
      id: makeId('run'),
      threadId: thread.id,
      agentManifest,
      policy,
      now,
      forcedToolCall: toolCall,
      initialUserMessageId: userMessage.id,
      runtimeContract,
      ...(approvedToolNames.length > 0 ? { approvedToolNames } : {}),
      ...(clientInput ? { clientInput: clientInput as unknown as JSONValue } : {}),
    })
    this.store.createRun(run)
    thread.lastRunStatus = run.status
    thread.updatedAt = now
    this.store.updateThread(thread)
    this.rememberRunAuth(run.id, input)
    this.startRunExecution(run.id)
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
    const command = parseAgentCommand(message)

    const now = isoNow()
    const agentManifest = normalizeAgentManifest(input.agentManifest ?? this.defaultAgentManifest)
    await this.mcpClient.initialize()
    const contextResult = await this.mcpClient.callTool('movscript_get_context_pack', {})
    const context = extractAgentContext(contextResult)
    const memories = this.memoryManager.loadRelevantMemories({
      ...(typeof context.currentProjectId === 'number' ? { projectId: context.currentProjectId } : {}),
      threadId: thread?.id ?? 'preview',
      query: message,
    })
    const skills = resolveAgentSkills(agentManifest, message, this.skillCatalog)
    const capabilities = await resolveAgentCapabilities({
      mcpClient: this.mcpClient,
      manifest: agentManifest,
      currentProjectId: context.currentProjectId,
      registry: this.toolRegistry,
      pluginCatalog: this.pluginCatalogInfo,
      warnings: this.pluginWarnings,
      updates: this.updateState,
    })
    const debugContext = buildDebugContext(contextResult, memories, clientInput)
    const policy = defaultRunPolicy({ sandboxMode: input.sandboxMode !== false })
    const promptPreview = buildPromptPreview({
      manifest: agentManifest,
      skills,
      context: debugContext,
      tools: capabilities.resolvedTools,
      policy,
      memories,
      warnings: [...capabilities.warnings],
      history: thread?.messages ?? [],
      userMessage: message,
      command,
      contractResolver: this.contractResolver,
    })
    const warnings: string[] = [...capabilities.warnings]

    let previewToolPlan = { toolCalls: [] as ToolCall[], pendingApprovals: [] as AgentApprovalRequest[] }
    try {
      previewToolPlan = await planPreviewToolRequests({
        manifest: agentManifest,
        skills,
        context: debugContext,
        tools: capabilities.resolvedTools,
        policy,
        memories,
        warnings,
        history: thread?.messages ?? [],
        userMessage: message,
        command,
        currentProjectId: context.currentProjectId,
        registry: this.toolRegistry,
        draftStore: this.draftStore,
        contractResolver: this.contractResolver,
        makeApprovalId: () => makeId('approval'),
        now: isoNow,
      })
    } catch {
      // model call failed — preview still works without tool predictions
    }

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
      toolCalls: previewToolPlan.toolCalls,
      pendingApprovals: previewToolPlan.pendingApprovals,
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
    if (run.status !== 'requires_action') throw new Error(`run ${runId} is not waiting for approval`)
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
      return { ...approval, status: 'approved', approvedAt: now, updatedAt: now }
    })
    run.metadata = { ...(run.metadata ?? {}), approvedToolNames: Array.from(approvedToolNames) }
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
    this.rememberRunAuth(run.id, input)
    this.startRunExecution(run.id)
    return run
  }

  rejectRun(runId: string, input: RejectRunInput = {}): AgentRun {
    const run = this.requireRun(runId)
    if (run.status !== 'requires_action') throw new Error(`run ${runId} is not waiting for approval`)
    const now = isoNow()
    const selectedApprovalIds = new Set(normalizeStringArray(input.approvalIds))
    const rejectingAll = selectedApprovalIds.size === 0
    const rejectedToolNames: string[] = []
    run.pendingApprovals = (run.pendingApprovals ?? []).map((approval) => {
      const reject = approval.status === 'pending' && (rejectingAll || selectedApprovalIds.has(approval.id))
      if (!reject) return approval
      rejectedToolNames.push(approval.toolName)
      return { ...approval, status: 'rejected', rejectedAt: now, updatedAt: now }
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
    const assistant = this.createMessage(thread.id, 'assistant', `已取消需要确认的工具调用。\n\n${warning}`, run.id)
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

  cancelRun(runId: string, input: CancelRunInput = {}): AgentRun {
    const run = this.requireRun(runId)
    if (run.status === 'cancelled') return run
    if (run.status === 'completed' || run.status === 'completed_with_warnings' || run.status === 'failed') {
      throw new Error(`run ${runId} is already finished`)
    }
    const controller = this.runControllers.get(runId)
    controller?.abort(createAbortError(typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim() : 'Run was cancelled.'))
    return this.markRunCancelled(run, typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim() : undefined)
  }

  answerRunInputRequest(runId: string, input: AnswerRunInputRequestInput = {}): AgentRun {
    const run = this.requireRun(runId)
    if (run.status !== 'requires_action') throw new Error(`run ${runId} is not waiting for user input`)
    const pendingInputs = (run.pendingInputRequests ?? []).filter((request) => request.status === 'pending')
    if (pendingInputs.length === 0) throw new Error(`run ${runId} has no pending user input request`)
    const requestId = typeof input.requestId === 'string' && input.requestId.trim() ? input.requestId.trim() : undefined
    const request = requestId
      ? pendingInputs.find((item) => item.id === requestId)
      : pendingInputs[0]
    if (!request) throw new Error(`input request not found: ${requestId}`)

    const choiceIds = normalizeStringArray(input.choiceIds).filter((choiceId) => request.choices.some((choice) => choice.id === choiceId))
    const text = typeof input.text === 'string' && input.text.trim() ? input.text.trim() : undefined
    if (choiceIds.length === 0 && !text) throw new Error('input answer requires choiceIds or text')

    const now = isoNow()
    run.pendingInputRequests = (run.pendingInputRequests ?? []).map((item) => {
      if (item.id !== request.id) return item
      return {
        ...item,
        status: 'answered',
        answer: {
          ...(choiceIds.length > 0 ? { choiceIds } : {}),
          ...(text ? { text } : {}),
        },
        answeredAt: now,
        updatedAt: now,
      }
    })
    run.status = 'queued'
    run.updatedAt = now
    this.recordTraceEvent(run, {
      kind: 'input',
      title: 'User input received',
      summary: request.title,
      status: 'completed',
      data: {
        requestId: request.id,
        choiceIds,
        ...(text ? { text } : {}),
      },
    })

    const thread = this.requireThread(run.threadId)
    const answerMessage = this.createMessage(thread.id, 'user', formatInputAnswerMessage(request, choiceIds, text))
    thread.messages.push(answerMessage)
    thread.updatedAt = answerMessage.createdAt
    thread.lastRunStatus = run.status
    this.store.updateThread(thread)
    this.store.updateRun(run)
    this.rememberRunAuth(run.id, input)
    this.startRunExecution(run.id)
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

  private startRunExecution(runId: string): void {
    const controller = new AbortController()
    this.runControllers.set(runId, controller)
    void this.executeRun(runId, controller.signal).finally(() => {
      if (this.runControllers.get(runId) === controller) {
        this.runControllers.delete(runId)
      }
    })
  }

  private async executeRun(runId: string, signal?: AbortSignal): Promise<void> {
    const run = this.store.getRun(runId)
    if (!run) return
    if (run.status === 'cancelled') return
    this.throwIfRunCancelled(runId, signal)

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
      data: { policy: run.policy, manifestId: run.agentManifest?.id, sandboxMode: run.policy.sandboxMode === true },
    })
    this.store.updateRun(run)
    this.updateThreadRunStatus(run.threadId, run.status)

    try {
      this.throwIfRunCancelled(run.id, signal)
      const thread = this.requireThread(run.threadId)
      const initialUserMessageId = typeof run.metadata?.initialUserMessageId === 'string' ? run.metadata.initialUserMessageId : undefined
      const lastUser = initialUserMessageId
        ? thread.messages.find((m) => m.id === initialUserMessageId && m.role === 'user')
        : [...thread.messages].reverse().find((m) => m.role === 'user')
      if (!lastUser) throw new Error('run requires at least one user message')
      const command = parseAgentCommand(lastUser.content)
      const clientInput = normalizeClientInput(run.metadata?.clientInput ?? thread.metadata?.lastClientInput)

      this.recordTraceEvent(run, {
        kind: 'message',
        title: 'User message loaded',
        summary: lastUser.content.slice(0, 180),
        status: 'completed',
        round: setupRound,
        data: { messageId: lastUser.id, hasClientInput: Boolean(clientInput), attachmentCount: clientInput?.attachments.length ?? 0 },
      })
      this.store.updateRun(run)

      this.throwIfRunCancelled(run.id, signal)
      let contextResult: JSONValue
      let contextError: string | undefined
      try {
        await this.mcpClient.initialize()
        contextResult = await this.mcpClient.callTool('movscript_get_context_pack', {})
      } catch (error) {
        contextError = error instanceof Error ? error.message : String(error)
        this.recordTraceEvent(run, {
          kind: 'context',
          title: 'Context pack failed',
          summary: contextError,
          status: isLocalDiagnosticCommand(command.name) ? 'blocked' : 'failed',
          round: setupRound,
          data: {
            source: 'mcp_context_pack',
            endpoint: 'movscript_get_context_pack',
            error: contextError,
            fallback: isLocalDiagnosticCommand(command.name) ? 'client_input_snapshot' : 'none',
          },
        })
        this.store.updateRun(run)
        if (!isLocalDiagnosticCommand(command.name)) throw error
        contextResult = buildLocalDiagnosticFallbackContextResult(clientInput, contextError)
      }
      const context = extractAgentContext(contextResult)
      if (typeof context.currentProjectId === 'number') {
        thread.projectId = context.currentProjectId
        this.store.updateThread(thread)
      }
      const memories = this.memoryManager.loadRelevantMemories({
        projectId: context.currentProjectId,
        threadId: thread.id,
        query: lastUser.content,
      })
      this.recordTraceEvent(run, {
        kind: 'memory',
        title: 'Relevant memories loaded',
        summary: `${memories.length} memory item(s) matched this run.`,
        status: 'completed',
        round: setupRound,
        data: { memoryIds: memories.map((m) => m.id), kinds: Array.from(new Set(memories.map((m) => m.kind))) },
      })

      const agentManifest = run.agentManifest ?? this.defaultAgentManifest
      const runtimeContract = this.contractResolver.find(agentManifest)
      const contextWarnings = contextError ? [`Context pack unavailable: ${contextError}`] : []
      const capabilities = await resolveAgentCapabilities({
        mcpClient: this.mcpClient,
        manifest: agentManifest,
        currentProjectId: context.currentProjectId,
        registry: this.toolRegistry,
        pluginCatalog: this.pluginCatalogInfo,
        warnings: [...this.pluginWarnings, ...contextWarnings],
        updates: this.updateState,
      })
      const skills = resolveAgentSkills(agentManifest, lastUser.content, this.skillCatalog)
      const setup = buildRunSetupMetadata({
        run,
        agentManifest,
        skills,
        capabilities,
        contextResult,
        context,
        memories,
        command,
        ...(clientInput ? { clientInput } : {}),
        authMetadata: this.getRunAuth(run.id),
      })
      const debugContext = setup.debugContext

      this.recordTraceEvent(run, {
        kind: 'context',
        title: contextError ? 'Runtime context resolved from fallback' : 'Runtime context resolved',
        summary: debugContext.project
          ? `Project #${debugContext.project.id} ${debugContext.project.name ?? ''}`.trim()
          : contextError ? 'MCP context unavailable; using client input snapshot.' : 'No project context selected.',
        status: contextError ? 'blocked' : 'completed',
        round: setupRound,
        data: {
          route: debugContext.route,
          project: debugContext.project,
          selection: debugContext.selection,
          recentResourceCount: debugContext.recentResources.length,
          attachmentCount: debugContext.attachments.length,
          ...(contextError ? { fallback: true, error: contextError } : {}),
        },
      })
      this.recordTraceEvent(run, {
        kind: 'manifest',
        title: 'Agent manifest resolved',
        summary: `${agentManifest.name} (${agentManifest.id}@${agentManifest.version})`,
        status: 'completed',
        round: setupRound,
        data: { id: agentManifest.id, version: agentManifest.version, permissions: agentManifest.permissions, toolGrants: agentManifest.tools.map((t) => ({ name: t.name, mode: t.mode, approval: t.approval })) },
      })
      this.recordTraceEvent(run, {
        kind: 'skill',
        title: 'Skills activated',
        summary: skills.length > 0 ? skills.map((s) => s.name).join(', ') : 'No skills activated.',
        status: 'completed',
        round: setupRound,
        data: { skills: skills.map((s) => ({ id: s.id, name: s.name, activationReason: s.activationReason, priority: s.resolvedPriority, warnings: s.warnings })) },
      })
      this.recordTraceEvent(run, {
        kind: 'tool_catalog',
        title: 'Tool catalog resolved',
        summary: `${capabilities.resolvedTools.available.length} available, ${capabilities.resolvedTools.blocked.length} blocked.`,
        status: 'completed',
        round: setupRound,
        data: { availableToolNames: capabilities.resolvedTools.available.map((t) => t.name), blockedTools: capabilities.resolvedTools.blocked.map((t) => ({ name: t.name, reason: t.unavailableReason })), warnings: capabilities.warnings },
      })

      run.metadata = setup.metadata
      this.store.updateRun(run)
      this.throwIfRunCancelled(run.id, signal)

      if (isLocalDiagnosticCommand(command.name) && !run.metadata?.forcedToolCall) {
        const localRound = buildRunRound(1, 'Runtime command', 'runtime_rule')
        this.recordTraceEvent(run, {
          kind: 'policy',
          title: 'Command handled locally',
          summary: `${command.rawName ?? `/${command.name}`} returns deterministic runtime diagnostics without calling the model gateway.`,
          status: 'completed',
          round: localRound,
          data: {
            command,
            modelGatewayCalled: false,
            reason: `${command.name} is a deterministic runtime diagnostic command`,
          },
        })

        const finalRound = buildRunRound(999, 'Final response', 'final')
        const finalContent = renderLocalDiagnosticCommand({
          command,
          run,
          manifest: agentManifest,
          skills,
          context: debugContext,
          tools: capabilities.resolvedTools,
          policy: run.policy,
          memories,
          warnings: [...capabilities.warnings],
          history: thread.messages,
          userMessage: lastUser.content,
          memoryStorePath: this.getMemoryStorePath(),
          contractResolver: this.contractResolver,
        })
        const assistant = this.createMessage(thread.id, 'assistant', finalContent || '（无内容）', run.id)
        thread.messages.push(assistant)
        thread.updatedAt = assistant.createdAt

        const step = this.createStep(run, 'message', finalRound)
        step.status = 'completed'
        step.result = { messageId: assistant.id, localCommand: command.name }
        step.completedAt = isoNow()
        this.recordTraceEvent(run, {
          kind: 'assistant',
          title: 'Assistant message created',
          summary: assistant.content.slice(0, 180),
          status: 'completed',
          round: finalRound,
          stepId: step.id,
          data: { messageId: assistant.id, chars: assistant.content.length, source: 'runtime_rule' },
        })

        run.assistantMessageId = assistant.id
        run.warnings = capabilities.warnings.length > 0 ? [...capabilities.warnings] : undefined
        run.metadata = {
          ...(run.metadata ?? {}),
          memoryIds: memories.map((m) => m.id),
          writtenMemoryIds: [],
        }
        run.status = run.warnings && run.warnings.length > 0 ? 'completed_with_warnings' : 'completed'
        run.completedAt = isoNow()
        run.updatedAt = run.completedAt
        this.recordTraceEvent(run, {
          kind: 'run',
          title: 'Run finished',
          summary: `Run ${run.status}; no model gateway call was needed.`,
          status: run.warnings && run.warnings.length > 0 ? 'info' : 'completed',
          round: finalRound,
          data: { status: run.status, warningCount: run.warnings?.length ?? 0, modelGatewayCalled: false },
        })
        thread.lastRunStatus = run.status
        thread.updatedAt = run.updatedAt
        this.store.updateThread(thread)
        this.store.updateRun(run)
        return
      }

      // Resolve model config
      const { resolveRuntimeChatModelConfig } = await import('../model/modelConfig.js')
      const modelConfig = resolveRuntimeChatModelConfig()
      if (!modelConfig) throw new Error('no model config found — configure a backend model config first')

      const loopResult = await runAgentGraph({
        run,
        threadMessages: thread.messages,
        manifest: agentManifest,
        capabilities: capabilities.resolvedTools,
        skills,
        context: debugContext,
        memories,
        warnings: [...capabilities.warnings],
        command,
        ...(typeof run.metadata?.initialUserMessageId === 'string' ? { rootUserMessageId: run.metadata.initialUserMessageId } : {}),
        config: modelConfig,
        auth: this.getRunAuth(run.id),
        policy: run.policy,
        mcpClient: this.mcpClient,
        draftStore: this.draftStore,
        backendApplyClient: this.backendApplyClient,
        registry: this.toolRegistry,
        contractResolver: this.contractResolver,
        memoryManager: this.memoryManager,
        signal,
        ...(runtimeContract?.commandOverride
          ? { command: runtimeContract.commandOverride({ userMessage: lastUser.content, manifest: agentManifest }) }
          : {}),
        ...(run.metadata?.forcedToolCall ? { forcedToolCalls: [normalizeToolCall(run.metadata.forcedToolCall) as ToolCall] } : {}),
        ...(getApprovedToolNames(run).length > 0 ? { approvedToolNames: getApprovedToolNames(run) } : {}),
        onTrace: (traceInput) => {
          this.recordTraceEvent(run, {
            kind: traceInput.kind,
            title: traceInput.title,
            summary: traceInput.summary,
            status: traceInput.status,
            round: { roundId: `round_${traceInput.roundIndex}`, roundIndex: traceInput.roundIndex, roundLabel: traceInput.roundLabel, roundSource: traceInput.roundSource },
            stepId: traceInput.stepId,
            toolName: traceInput.toolName,
            data: traceInput.data,
          })
          this.store.updateRun(run)
        },
        onStepCreate: (type, roundIndex, roundLabel, roundSource, toolName) => {
          const step = this.createStep(run, type, { roundId: `round_${roundIndex}`, roundIndex, roundLabel, roundSource }, toolName)
          return step.id
        },
        onStepComplete: (stepId, result, error, sandboxed) => {
          const step = run.steps.find((s) => s.id === stepId)
          if (!step) return
          step.status = error ? 'failed' : 'completed'
          if (result !== undefined) step.result = result
          if (error) step.error = error
          if (sandboxed) step.sandboxed = sandboxed
          step.completedAt = isoNow()
          run.updatedAt = step.completedAt
          this.store.updateRun(run)
        },
      })
      this.throwIfRunCancelled(run.id, signal)

      if (loopResult.status === 'requires_action') {
        const now = isoNow()
        run.pendingApprovals = mergePendingApprovals(run.pendingApprovals ?? [], loopResult.pendingApprovals, now)
        run.pendingInputRequests = mergePendingInputRequests(run.pendingInputRequests ?? [], loopResult.pendingInputRequests ?? [], now)
        run.warnings = loopResult.warnings.length > 0 ? loopResult.warnings : undefined
        run.status = 'requires_action'
        run.updatedAt = now
        const pendingInputCount = (run.pendingInputRequests ?? []).filter((request) => request.status === 'pending').length
        this.recordTraceEvent(run, {
          kind: pendingInputCount > 0 && loopResult.pendingApprovals.length === 0 ? 'input' : 'approval',
          title: pendingInputCount > 0 && loopResult.pendingApprovals.length === 0 ? 'User input required' : 'Approval required',
          summary: pendingInputCount > 0 && loopResult.pendingApprovals.length === 0
            ? `${pendingInputCount} user input request(s) paused the run.`
            : `${loopResult.pendingApprovals.length} tool action(s) paused the run.`,
          status: 'blocked',
          data: { approvals: loopResult.pendingApprovals, inputRequests: run.pendingInputRequests },
        })
        this.store.updateRun(run)
        this.updateThreadRunStatus(run.threadId, run.status)
        return
      }

      if (loopResult.status === 'cancelled') {
        this.markRunCancelled(run, loopResult.reason)
        return
      }

      if (loopResult.status === 'failed') {
        throw new Error(loopResult.error)
      }

      // completed
      const finalRound = buildRunRound(999, 'Final response', 'final')
      const finalContent = this.formatFinalAssistantContent(lastUser.content, loopResult.finalContent, loopResult.toolOutcomes, loopResult.warnings, memories, run)
      const assistant = this.createMessage(thread.id, 'assistant', finalContent || '（无内容）', run.id)
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
        data: { messageId: assistant.id, chars: assistant.content.length },
      })

      run.assistantMessageId = assistant.id
      run.warnings = loopResult.warnings.length > 0 ? loopResult.warnings : undefined

      const writtenMemories = this.memoryManager.extractAndWriteMemories({
        run,
        userMessage: lastUser,
        projectId: context.currentProjectId,
        toolResults: loopResult.toolOutcomes,
        warnings: loopResult.warnings,
      })
      run.metadata = {
        ...(run.metadata ?? {}),
        memoryIds: memories.map((m) => m.id),
        writtenMemoryIds: writtenMemories.map((m) => m.id),
      }
      this.recordTraceEvent(run, {
        kind: 'memory',
        title: 'Memories written',
        summary: `${writtenMemories.length} memory item(s) written after the run.`,
        status: 'completed',
        round: finalRound,
        data: { writtenMemoryIds: writtenMemories.map((m) => m.id), kinds: Array.from(new Set(writtenMemories.map((m) => m.kind))) },
      })

      run.status = loopResult.warnings.length > 0 ? 'completed_with_warnings' : 'completed'
      run.completedAt = isoNow()
      run.updatedAt = run.completedAt
      this.recordTraceEvent(run, {
        kind: 'run',
        title: 'Run finished',
        summary: `Run ${run.status} with ${run.steps.length} step(s).`,
        status: loopResult.warnings.length > 0 ? 'info' : 'completed',
        round: finalRound,
        data: { status: run.status, warningCount: loopResult.warnings.length, stepCount: run.steps.length, toolResultCount: loopResult.toolOutcomes.length },
      })
      thread.lastRunStatus = run.status
      thread.updatedAt = run.updatedAt
      this.store.updateThread(thread)
      this.store.updateRun(run)
    } catch (error) {
      if (this.isAbortError(error) || this.isRunCancelled(runId)) {
        this.markRunCancelled(this.store.getRun(runId) ?? run)
        return
      }
      run.status = 'failed'
      run.error = error instanceof Error ? error.message : String(error)
      run.failedAt = isoNow()
      run.updatedAt = run.failedAt
      this.recordTraceEvent(run, {
        kind: 'error',
        title: 'Run failed',
        summary: run.error,
        status: 'failed',
        data: { error: run.error },
      })
      this.store.updateRun(run)
      this.updateThreadRunStatus(run.threadId, run.status)
      const thread = this.store.getThread(run.threadId)
      if (thread) {
        const assistant = this.createMessage(thread.id, 'assistant', `运行失败：${run.error}`, run.id)
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
  }

  private rememberRunAuth(runId: string, value: unknown): void {
    const record = isRecord(value) ? value : {}
    const token = normalizeBackendAuthToken(record.backendAuthToken ?? value).backendAuthToken
    const backendAPIBaseURL = normalizeBackendAPIBaseURL(record.backendAPIBaseURL).backendAPIBaseURL
    const current = this.runAuth.get(runId) ?? {}
    const next = {
      ...current,
      ...(token ? { backendAuthToken: token } : {}),
      ...(backendAPIBaseURL ? { backendAPIBaseURL } : {}),
    }
    if (Object.keys(next).length > 0) this.runAuth.set(runId, next)
  }

  private getRunAuth(runId: string): { backendAuthToken?: string; backendAPIBaseURL?: string } {
    return this.runAuth.get(runId) ?? {}
  }

  private createStep(run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string): AgentRunStep {
    const step = buildRunStep({
      id: makeId('step'),
      runId: run.id,
      type,
      createdAt: isoNow(),
      ...(round ? { round } : {}),
      ...(toolName ? { toolName } : {}),
    })
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
    const event = appendTraceEvent({
      id: makeId('trace'),
      run,
      now: isoNow(),
      kind: input.kind,
      title: input.title,
      status: input.status,
      ...(input.round ? { round: input.round } : {}),
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.parentAgentId ? { parentAgentId: input.parentAgentId } : {}),
      ...(input.stepId ? { stepId: input.stepId } : {}),
      ...(input.toolName ? { toolName: input.toolName } : {}),
      ...(input.data !== undefined ? { data: input.data } : {}),
      ...(input.completedAt ? { completedAt: input.completedAt } : {}),
    })
    return event
  }

  private createMessage(threadId: string, role: AgentMessageRole, content: string, runId?: string): AgentMessage {
    return { id: makeId('msg'), threadId, role, content, runId, createdAt: isoNow() }
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

  private isRunCancelled(runId: string): boolean {
    return this.store.getRun(runId)?.status === 'cancelled'
  }

  private throwIfRunCancelled(runId: string, signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : createAbortError(typeof signal.reason === 'string' ? signal.reason : undefined)
    }
    if (this.isRunCancelled(runId)) {
      throw createAbortError('Run was cancelled.')
    }
  }

  private markRunCancelled(run: AgentRun, reason?: string): AgentRun {
    const current = this.store.getRun(run.id) ?? run
    if (current.status === 'cancelled') return current
    const now = isoNow()
    current.pendingApprovals = (current.pendingApprovals ?? []).map((approval) => (
      approval.status === 'pending'
        ? { ...approval, status: 'rejected', rejectedAt: now, updatedAt: now }
        : approval
    ))
    current.pendingInputRequests = (current.pendingInputRequests ?? []).map((request) => (
      request.status === 'pending'
        ? { ...request, status: 'cancelled', updatedAt: now }
        : request
    ))
    current.status = 'cancelled'
    current.cancelledAt = now
    current.completedAt = now
    current.updatedAt = now
    current.warnings = Array.from(new Set([...(current.warnings ?? []), reason ?? '用户停止了当前会话。']))
    this.recordTraceEvent(current, {
      kind: 'run',
      title: 'Run cancelled',
      summary: reason ?? '用户停止了当前会话。',
      status: 'info',
      data: { reason: reason ?? '用户停止了当前会话。' },
    })
    const thread = this.store.getThread(current.threadId)
    if (thread && !current.assistantMessageId) {
      const assistant = this.createMessage(thread.id, 'assistant', `已停止当前会话。\n\n${reason ?? '用户停止了当前会话。'}`, current.id)
      thread.messages.push(assistant)
      thread.updatedAt = assistant.createdAt
      thread.lastRunStatus = current.status
      current.assistantMessageId = assistant.id
      const step = this.createStep(current, 'message')
      step.status = 'completed'
      step.result = { messageId: assistant.id, cancelled: true }
      step.completedAt = now
      this.store.updateThread(thread)
    }
    this.store.updateRun(current)
    this.updateThreadRunStatus(current.threadId, current.status)
    return current
  }

  private updateThreadRunStatus(threadId: string, status: AgentRun['status']): void {
    const thread = this.store.getThread(threadId)
    if (!thread) return
    thread.lastRunStatus = status
    thread.updatedAt = isoNow()
    this.store.updateThread(thread)
  }

  private formatFinalAssistantContent(
    userMessage: string,
    modelContent: string,
    toolResults: ToolCallOutcome[],
    warnings: string[],
    memories: AgentMemory[],
    run: AgentRun,
  ): string {
    const command = parseAgentCommand(userMessage)
    return renderLocalFinalAssistantContent({
      command,
      run,
      context: isRecord(run.metadata?.context) ? run.metadata.context : undefined,
      warnings,
      memories,
      memoryStorePath: this.getMemoryStorePath(),
      modelContent,
    })
  }

  private getMemoryStorePath(): string | undefined {
    const store = this.memoryStore as { filePath?: unknown }
    return typeof store.filePath === 'string' ? store.filePath : undefined
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError'
  }
}

function isMessageRole(value: unknown): value is AgentMessageRole {
  return value === 'system' || value === 'user' || value === 'assistant'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function isoNow(): string {
  return new Date().toISOString()
}

function createAbortError(message = 'Run was cancelled.'): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}
