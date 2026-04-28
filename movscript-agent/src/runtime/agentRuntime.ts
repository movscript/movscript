import type { MCPClient } from '../mcpClient.js'
import type { JSONValue } from '../types.js'
import { DEFAULT_AGENT_MANIFEST, normalizeAgentManifest, type AgentManifest } from './agentManifest.js'
import { buildAssistantContent } from './assistantMessage.js'
import { extractAgentContext, parseToolResult } from './context.js'
import { resolveAgentCapabilities } from './capabilityResolver.js'
import { MemoryManager } from './memory/memoryManager.js'
import { InMemoryAgentMemoryStore, type AgentMemoryStore } from './memory/memoryStore.js'
import type { AgentMemory, MemoryQuery } from './memory/types.js'
import { planAgentRun } from './planner.js'
import { compilePromptPreview } from './promptCompiler.js'
import { resolveAgentSkills } from './skillResolver.js'
import { InMemoryAgentStore, type AgentStore } from './store.js'
import { applyToolPolicy } from './toolPolicy.js'
import type { BlockedToolCall } from './toolPolicy.js'
import type {
  AgentApprovalRequest,
  AgentMessage,
  AgentMessageRole,
  AgentPlanTask,
  AgentRunPreview,
  AgentRun,
  AgentRunStep,
  AgentRuntimeOptions,
  AgentCapabilitiesResponse,
  AgentDebugContextPanel,
  AgentInputEnvelope,
  AgentRunDebugTrace,
  AgentRunPolicy,
  AgentThread,
  AgentThreadSummary,
  ApproveRunInput,
  CreateMessageInput,
  CreateRunInput,
  CreateThreadInput,
  PreviewRunInput,
  RejectRunInput,
  ToolCallOutcome,
  UpdateThreadInput,
} from './types.js'

export type {
  AgentMessage,
  AgentMessageRole,
  AgentPlanTask,
  AgentRun,
  AgentRunPreview,
  AgentRunStatus,
  AgentRunStep,
  AgentRuntimeOptions,
  AgentTaskPlan,
  AgentApprovalRequest,
  AgentCapabilitiesResponse,
  AgentDebugContextPanel,
  AgentInputEnvelope,
  AgentRunDebugTrace,
  AgentRunPolicy,
  AgentStepStatus,
  AgentThread,
  AgentThreadSummary,
  ApproveRunInput,
  CreateMessageInput,
  CreateRunInput,
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
export { DEFAULT_TOOL_REGISTRY, StaticToolRegistry } from './toolRegistry.js'

export class AgentRuntime {
  private readonly mcpClient: Pick<MCPClient, 'initialize' | 'callTool' | 'listTools' | 'listResources'>
  private readonly store: AgentStore
  private readonly memoryStore: AgentMemoryStore
  private readonly memoryManager: MemoryManager
  private readonly defaultAgentManifest: AgentManifest

  constructor(options: AgentRuntimeOptions) {
    this.mcpClient = options.mcpClient
    this.store = options.store ?? new InMemoryAgentStore()
    this.memoryStore = options.memoryStore ?? new InMemoryAgentMemoryStore()
    this.memoryManager = new MemoryManager(this.memoryStore)
    this.defaultAgentManifest = options.defaultAgentManifest ?? DEFAULT_AGENT_MANIFEST
  }

  async getCapabilities(input: { agentManifest?: unknown; currentProjectId?: number; includeResources?: boolean } = {}): Promise<AgentCapabilitiesResponse> {
    const agentManifest = normalizeAgentManifest(input.agentManifest ?? this.defaultAgentManifest)
    return resolveAgentCapabilities({
      mcpClient: this.mcpClient,
      manifest: agentManifest,
      currentProjectId: input.currentProjectId,
      includeResources: input.includeResources,
    })
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
    if (typeof input.content !== 'string' || input.content.trim().length === 0) {
      throw new Error('message content is required')
    }

    const message = this.createMessage(threadId, role, input.content.trim())
    thread.messages.push(message)
    thread.updatedAt = message.createdAt
    this.store.updateThread(thread)
    return message
  }

  createRun(input: CreateRunInput): AgentRun {
    if (typeof input.threadId !== 'string' || !input.threadId) {
      throw new Error('threadId is required')
    }
    this.requireThread(input.threadId)

    const now = isoNow()
    const agentManifest = normalizeAgentManifest(input.agentManifest ?? this.defaultAgentManifest)
    const run: AgentRun = {
      id: makeId('run'),
      threadId: input.threadId,
      status: 'queued',
      agentManifest,
      createdAt: now,
      updatedAt: now,
      steps: [],
      ...(normalizeApprovedToolNames(input.approvedToolNames).length > 0
        ? { metadata: { approvedToolNames: normalizeApprovedToolNames(input.approvedToolNames) } }
        : {}),
    }
    this.store.createRun(run)
    const thread = this.requireThread(input.threadId)
    thread.lastRunStatus = run.status
    thread.updatedAt = now
    this.store.updateThread(thread)
    void this.executeRun(run.id)
    return run
  }

  async previewRun(input: PreviewRunInput): Promise<AgentRunPreview> {
    const thread = typeof input.threadId === 'string' && input.threadId
      ? this.requireThread(input.threadId)
      : undefined
    const explicitMessage = typeof input.message === 'string' && input.message.trim().length > 0
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
    const skills = resolveAgentSkills(agentManifest, message)
    const capabilities = await resolveAgentCapabilities({
      mcpClient: this.mcpClient,
      manifest: agentManifest,
      currentProjectId: context.currentProjectId,
    })
    const debugContext = buildDebugContext(contextResult, memories)
    const policy = defaultRunPolicy('dry_run')
    const envelope: AgentInputEnvelope = {
      id: makeId('envelope'),
      ...(thread ? { threadId: thread.id } : {}),
      mode: 'preview',
      message: { role: 'user', content: message },
      history: thread?.messages ?? [],
      context: debugContext,
      manifest: agentManifest,
      skills,
      tools: capabilities.resolvedTools,
      policy,
      memories: memories.map(toMemoryRef),
      ...(agentManifest.model ? { model: agentManifest.model } : {}),
      debug: {
        source: 'runtime',
        warnings: [...capabilities.warnings],
      },
    }
    const promptPreview = compilePromptPreview(envelope)
    envelope.debug.compiledPrompt = promptPreview
    const planned = planAgentRun(message, memories)
    const warnings: string[] = [...capabilities.warnings]
    const pendingApprovals: AgentApprovalRequest[] = []
    const approvedToolNames = normalizeApprovedToolNames(input.approvedToolNames)

    planned.plan.tasks = planned.plan.tasks.map((task) => {
      const policy = applyToolPolicy(task.toolCalls, {
        currentProjectId: context.currentProjectId,
        manifest: agentManifest,
        catalog: capabilities.resolvedTools,
        approvedToolNames,
      })
      warnings.push(...policy.warnings.filter((warning) => !warnings.includes(warning)))
      pendingApprovals.push(
        ...policy.blockedToolCalls
          .filter((blocked) => blocked.reason === 'approval_required')
          .map((blocked) => toApprovalRequest('preview', blocked)),
      )
      return {
        ...task,
        toolCalls: policy.toolCalls,
        status: task.toolCalls.length > 0 && policy.toolCalls.length === 0 ? 'skipped' : task.status,
      }
    })
    planned.plan.updatedAt = isoNow()

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
      debug: buildDebugTrace(envelope, promptPreview.debugParts.map((part) => part.id)),
      plan: planned.plan,
      toolCalls: planned.plan.tasks.flatMap((task) => task.toolCalls),
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
    this.store.updateRun(run)
    this.updateThreadRunStatus(run.threadId, run.status)
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
    this.store.updateRun(run)
    this.updateThreadRunStatus(run.threadId, run.status)

    try {
      const thread = this.requireThread(run.threadId)
      const lastUser = [...thread.messages].reverse().find((message) => message.role === 'user')
      if (!lastUser) throw new Error('run requires at least one user message')

      const contextResult = await this.callTool(run, 'movscript.get_context_pack')
      const context = extractAgentContext(contextResult)
      if (typeof context.currentProjectId === 'number') {
        thread.projectId = context.currentProjectId
        this.store.updateThread(thread)
      }
      const memories = this.memoryManager.loadRelevantMemories({
        projectId: context.currentProjectId,
        threadId: thread.id,
      })
      const capabilities = await resolveAgentCapabilities({
        mcpClient: this.mcpClient,
        manifest: run.agentManifest ?? this.defaultAgentManifest,
        currentProjectId: context.currentProjectId,
      })
      const skills = resolveAgentSkills(run.agentManifest ?? this.defaultAgentManifest, lastUser.content)
      const debugContext = buildDebugContext(contextResult, memories)
      const envelope: AgentInputEnvelope = {
        id: makeId('envelope'),
        threadId: thread.id,
        runId: run.id,
        mode: 'run',
        message: { role: 'user', content: lastUser.content },
        history: thread.messages.filter((message) => message.id !== lastUser.id),
        context: debugContext,
        manifest: run.agentManifest ?? this.defaultAgentManifest,
        skills,
        tools: capabilities.resolvedTools,
        policy: defaultRunPolicy('interactive'),
        memories: memories.map(toMemoryRef),
        ...((run.agentManifest ?? this.defaultAgentManifest).model ? { model: (run.agentManifest ?? this.defaultAgentManifest).model } : {}),
        debug: {
          source: 'runtime',
          warnings: [...capabilities.warnings],
        },
      }
      const promptPreview = compilePromptPreview(envelope)
      envelope.debug.compiledPrompt = promptPreview
      run.envelope = envelope
      const planned = planAgentRun(lastUser.content, memories)
      const planningStep = this.createStep(run, 'planning')
      planningStep.title = '任务规划'
      run.plan = planned.plan
      planningStep.result = {
        planId: planned.plan.id,
        objective: planned.plan.objective,
        taskCount: planned.plan.tasks.length,
      }
      planningStep.status = 'completed'
      planningStep.completedAt = isoNow()
      run.updatedAt = planningStep.completedAt
      this.store.updateRun(run)

      const warnings: string[] = [...capabilities.warnings]
      const pendingApprovals: AgentApprovalRequest[] = []
      run.plan.tasks = run.plan.tasks.map((task) => {
        const policy = applyToolPolicy(task.toolCalls, {
          currentProjectId: context.currentProjectId,
          manifest: run.agentManifest,
          catalog: capabilities.resolvedTools,
          approvedToolNames: getApprovedToolNames(run),
        })
        warnings.push(...policy.warnings.filter((warning) => !warnings.includes(warning)))
        pendingApprovals.push(
          ...policy.blockedToolCalls
            .filter((blocked) => blocked.reason === 'approval_required')
            .map((blocked) => toApprovalRequest(run.id, blocked)),
        )
        return {
          ...task,
          toolCalls: policy.toolCalls,
          status: task.toolCalls.length > 0 && policy.toolCalls.length === 0 ? 'skipped' : task.status,
        }
      })
      run.plan.updatedAt = isoNow()
      run.metadata = {
        ...(run.metadata ?? {}),
        debugTrace: buildDebugTrace(envelope, promptPreview.debugParts.map((part) => part.id)) as unknown as JSONValue,
      }
      this.store.updateRun(run)

      if (pendingApprovals.length > 0) {
        const now = isoNow()
        run.pendingApprovals = mergePendingApprovals(run.pendingApprovals ?? [], pendingApprovals, now)
        run.warnings = warnings.length > 0 ? warnings : undefined
        run.status = 'requires_action'
        run.updatedAt = now
        this.store.updateRun(run)
        this.updateThreadRunStatus(run.threadId, run.status)
        return
      }

      const toolResults: ToolCallOutcome[] = []
      for (const task of run.plan.tasks) {
        await this.executeTask(run, task, toolResults, warnings)
      }

      const assistant = this.createMessage(
        thread.id,
        'assistant',
        buildAssistantContent(lastUser.content, toolResults, warnings, memories),
        run.id,
      )
      thread.messages.push(assistant)
      thread.updatedAt = assistant.createdAt

      const step = this.createStep(run, 'message')
      step.status = 'completed'
      step.result = { messageId: assistant.id }
      step.completedAt = isoNow()

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
      run.status = warnings.length > 0 ? 'completed_with_warnings' : 'completed'
      run.completedAt = isoNow()
      run.updatedAt = run.completedAt
      thread.lastRunStatus = run.status
      thread.updatedAt = run.updatedAt
      this.store.updateThread(thread)
      this.store.updateRun(run)
    } catch (error) {
      run.status = 'failed'
      run.error = error instanceof Error ? error.message : String(error)
      run.failedAt = isoNow()
      run.updatedAt = run.failedAt
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
    parentStepId?: string,
  ): Promise<JSONValue> {
    const step = this.createStep(run, 'tool_call')
    step.toolName = toolName
    step.args = args
    step.parentStepId = parentStepId
    this.store.updateRun(run)

    try {
      await this.mcpClient.initialize()
      const result = await this.mcpClient.callTool(toolName, args)
      step.result = result
      step.status = 'completed'
      step.completedAt = isoNow()
      run.updatedAt = step.completedAt
      this.store.updateRun(run)
      return result
    } catch (error) {
      step.status = 'failed'
      step.error = error instanceof Error ? error.message : String(error)
      step.completedAt = isoNow()
      run.updatedAt = step.completedAt
      this.store.updateRun(run)
      throw error
    }
  }

  private async executeTask(
    run: AgentRun,
    task: AgentPlanTask,
    toolResults: ToolCallOutcome[],
    warnings: string[],
  ): Promise<void> {
    const taskStep = this.createStep(run, 'subagent')
    taskStep.title = task.title
    taskStep.agentId = makeId('agent')
    taskStep.agentRole = task.agentRole
    taskStep.result = {
      taskId: task.id,
      description: task.description,
      toolCount: task.toolCalls.length,
    }
    this.updatePlanTask(run, task.id, { status: task.status === 'skipped' ? 'skipped' : 'in_progress', startedAt: taskStep.createdAt })

    if (task.status === 'skipped') {
      taskStep.status = 'completed'
      taskStep.completedAt = isoNow()
      taskStep.result = {
        ...(isRecord(taskStep.result) ? taskStep.result : {}),
        summary: '由于当前权限或项目上下文不足，跳过该子任务。',
      }
      this.updatePlanTask(run, task.id, { status: 'skipped', completedAt: taskStep.completedAt })
      run.updatedAt = taskStep.completedAt
      this.store.updateRun(run)
      return
    }

    let failed = false
    for (const call of task.toolCalls) {
      try {
        const result = await this.callTool(run, call.name, call.args, taskStep.id)
        toolResults.push({ call, result })
      } catch (error) {
        failed = true
        const message = error instanceof Error ? error.message : String(error)
        warnings.push(`${call.name} 未完成：${message}`)
        toolResults.push({ call, error: message })
      }
    }

    taskStep.status = failed ? 'failed' : 'completed'
    taskStep.completedAt = isoNow()
    taskStep.result = {
      ...(isRecord(taskStep.result) ? taskStep.result : {}),
      summary: failed ? '子 agent 执行时有工具调用失败。' : '子 agent 已完成分配任务。',
    }
    this.updatePlanTask(run, task.id, {
      status: failed ? 'failed' : 'completed',
      completedAt: taskStep.completedAt,
      ...(failed ? { error: 'one or more tool calls failed' } : {}),
    })
    run.updatedAt = taskStep.completedAt
    this.store.updateRun(run)
  }

  private updatePlanTask(run: AgentRun, taskId: string, patch: Partial<AgentPlanTask>): void {
    if (!run.plan) return
    run.plan.tasks = run.plan.tasks.map((task) => (
      task.id === taskId ? { ...task, ...patch } : task
    ))
    run.plan.updatedAt = isoNow()
    this.store.updateRun(run)
  }

  private createStep(run: AgentRun, type: AgentRunStep['type']): AgentRunStep {
    const step: AgentRunStep = {
      id: makeId('step'),
      runId: run.id,
      type,
      status: 'in_progress',
      createdAt: isoNow(),
    }
    run.steps.push(step)
    run.updatedAt = step.createdAt
    this.store.updateRun(run)
    return step
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

function getApprovedToolNames(run: AgentRun): string[] {
  return normalizeApprovedToolNames(run.metadata?.approvedToolNames)
}

function defaultRunPolicy(approvalMode: AgentRunPolicy['approvalMode']): AgentRunPolicy {
  return {
    approvalMode,
    maxToolCalls: 8,
    maxIterations: 4,
    allowNetwork: false,
    allowFileBytes: false,
  }
}

function buildDebugContext(contextResult: JSONValue, memories: AgentMemory[]): AgentDebugContextPanel {
  const parsed = parseToolResult(contextResult)
  const snapshot = isRecord(parsed) && isRecord(parsed.snapshot) ? parsed.snapshot : parsed
  const project = isRecord(snapshot) && isRecord(snapshot.project) ? snapshot.project : undefined
  const projectId = typeof project?.id === 'number' ? project.id : typeof project?.ID === 'number' ? project.ID : undefined
  const route = isRecord(snapshot) && isRecord(snapshot.route) ? snapshot.route : undefined
  const user = isRecord(snapshot) && isRecord(snapshot.user) ? snapshot.user : undefined
  const selection = isRecord(snapshot) && isRecord(snapshot.selection) ? snapshot.selection : undefined
  return {
    route: {
      pathname: typeof route?.pathname === 'string' ? route.pathname : '/',
      ...(typeof route?.search === 'string' ? { search: route.search } : {}),
      ...(typeof route?.hash === 'string' ? { hash: route.hash } : {}),
    },
    ...(project && projectId !== undefined ? {
      project: {
        id: projectId,
        ...(typeof project.name === 'string' ? { name: project.name } : {}),
        ...(typeof project.status === 'string' ? { status: project.status } : {}),
        ...(typeof project.description === 'string' ? { description: project.description } : {}),
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
    } : { selection: null }),
    recentResources: normalizeDebugResources(isRecord(snapshot) ? snapshot.recentResources : undefined),
    attachments: [],
    memories: memories.map(toMemoryRef),
    labels: [],
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

function toMemoryRef(memory: AgentMemory): AgentInputEnvelope['memories'][number] {
  return {
    id: memory.id,
    scope: memory.scope,
    kind: memory.kind,
    content: memory.content,
  }
}

function buildDebugTrace(envelope: AgentInputEnvelope, promptPartIds: string[]): AgentRunDebugTrace {
  return {
    envelopeId: envelope.id,
    manifestId: envelope.manifest.id,
    manifestVersion: envelope.manifest.version,
    skillIds: envelope.skills.map((skill) => skill.id),
    availableToolNames: envelope.tools.available.map((tool) => tool.name),
    blockedTools: envelope.tools.blocked.map((tool) => ({
      name: tool.name,
      ...(tool.unavailableReason ? { reason: tool.unavailableReason } : {}),
    })),
    promptPartIds,
    planner: 'rule',
    ...(envelope.model ? { model: envelope.model } : {}),
  }
}

function toApprovalRequest(runId: string, blocked: BlockedToolCall): AgentApprovalRequest {
  const now = isoNow()
  return {
    id: makeId('approval'),
    runId,
    toolName: blocked.call.name,
    ...(blocked.call.args ? { args: blocked.call.args } : {}),
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

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function isoNow(): string {
  return new Date().toISOString()
}
