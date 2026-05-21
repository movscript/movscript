import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import type { MCPClient } from '../mcpClient.js'
import { findToolGrant, type AgentManifest } from '../catalog/agentManifest.js'
import type { AgentApprovalRequest, AgentDebugContextPanel, AgentInputRequest, AgentMessage, AgentRun, AgentRunPolicy, AgentRunStatus, AgentTraceEventKind, ResolvedAgentSkill, ResolvedToolCatalog, ToolCall, ToolCallOutcome, JSONValue } from '../state/types.js'
import type { AgentMemory } from '../memory/types.js'
import type { MemoryManager } from '../memory/memoryManager.js'
import type { KnowledgeManager } from '../knowledge/knowledgeManager.js'
import type { AgentDraftStore } from '../drafts/draftStore.js'
import type { BackendApplyClient } from '../drafts/backendApplyClient.js'
import type { ConfiguredRuntimeModelConfig, RuntimeModelAuthContext, RuntimeModelChatMessage, RuntimeModelChatToolCall } from '../model/modelConfig.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { SkillDiscoverySummary } from '../contextManager/modelContextBuilder.js'
import { createDefaultRuntimeModelRouter, type RuntimeModelRouter } from '../model/modelRouter.js'
import { executeTool, type AgentCatalogToolManager } from './toolExecutor.js'
import { applyToolPolicy, type BlockedToolCall } from '../tools/toolPolicy.js'
import { formatToolNameForDisplay } from '../tools/toolNames.js'
import type { AgentCommandRuntime } from '../context/commandRouter.js'
import {
  buildGenerationEvent,
  buildGenerationTimeoutEvent,
  extractGenerationMonitorRequest,
  type GenerationEvent,
} from '../generation/generationEvents.js'
import { contextManager } from '../contextManager/contextManager.js'
import { isJSONRecord } from '../jsonValue.js'
import {
  appendRuntimeInputMessagesToUserMessage,
  collectPendingRuntimeInputMessages,
} from '../state/runtimeRunInputs.js'

export interface AgentGraphTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: 'started' | 'completed' | 'blocked' | 'failed' | 'info'
  roundIndex: number
  roundLabel: string
  roundSource: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final'
  stepId?: string
  toolName?: string
  data?: unknown
  durationMs?: number
  volatile?: boolean
  volatileKey?: string
}

export type AgentGraphResult =
  | { status: 'completed'; finalContent: string; assistantContents: string[]; toolOutcomes: ToolCallOutcome[]; warnings: string[] }
  | { status: 'requires_action'; pendingApprovals: AgentApprovalRequest[]; pendingInputRequests?: AgentInputRequest[]; messages: RuntimeModelChatMessage[]; toolOutcomes: ToolCallOutcome[]; warnings: string[] }
  | { status: 'cancelled'; reason?: string }
  | { status: 'failed'; error: string }

export interface AgentGraphInput {
  run: AgentRun
  threadMessages: AgentMessage[]
  manifest: AgentManifest
  capabilities: ResolvedToolCatalog
  skills: ResolvedAgentSkill[]
  skillDiscovery?: SkillDiscoverySummary
  context: AgentDebugContextPanel
  memories: AgentMemory[]
  warnings: string[]
  command?: AgentCommandRuntime
  userMessage?: string
  rootUserMessageId?: string
  config: ConfiguredRuntimeModelConfig
  modelRouter?: RuntimeModelRouter
  auth: RuntimeModelAuthContext
  policy: AgentRunPolicy
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>
  draftStore: AgentDraftStore
  backendApplyClient: BackendApplyClient
  registry: ToolRegistry
  contractResolver?: AgentRuntimeContractResolver
  memoryManager?: MemoryManager
  knowledgeManager?: KnowledgeManager
  catalogManager?: AgentCatalogToolManager
  forcedToolCalls?: ToolCall[]
  approvedToolNames?: string[]
  signal?: AbortSignal
  onCatalogRefresh?: () => Promise<{
    manifest: AgentManifest
    capabilities: ResolvedToolCatalog
    skills: ResolvedAgentSkill[]
    skillDiscovery?: SkillDiscoverySummary
    registry: ToolRegistry
    warnings: string[]
  }>
  onTrace: (input: AgentGraphTraceInput) => void
  onGenerationEvent?: (event: GenerationEvent, trace: Omit<AgentGraphTraceInput, 'kind' | 'title' | 'summary' | 'status' | 'data'>) => void
  getThreadMessages?: () => AgentMessage[]
  onRuntimeInputConsumed?: (
    messages: AgentMessage[],
    trace: Omit<AgentGraphTraceInput, 'kind' | 'title' | 'summary' | 'status' | 'data'>,
  ) => void
  onStepCreate: (type: 'tool_call' | 'message', roundIndex: number, roundLabel: string, roundSource: AgentGraphTraceInput['roundSource'], toolName?: string) => string
  onStepComplete: (stepId: string, result?: JSONValue, error?: string, sandboxed?: boolean) => void
}

type AgentGraphState = {
  history: RuntimeModelChatMessage[]
  warnings: string[]
  toolOutcomes: ToolCallOutcome[]
  toolCallCount: number
  roundIndex: number
  finalContent?: string
  status?: AgentRunStatus
  error?: string
  pendingApprovals?: AgentApprovalRequest[]
  pendingInputRequests?: AgentInputRequest[]
  requestedCalls: ToolCall[]
  modelContent?: string | null
}

export async function runAgentGraph(input: AgentGraphInput): Promise<AgentGraphResult> {
  throwIfAborted(input.signal)
  const State = Annotation.Root({
    history: Annotation<RuntimeModelChatMessage[]>({
      reducer: (left, right) => left.concat(right),
      default: () => [],
    }),
    warnings: Annotation<string[]>({
      reducer: (left, right) => Array.from(new Set([...left, ...right])),
      default: () => [],
    }),
    toolOutcomes: Annotation<ToolCallOutcome[]>({
      reducer: (left, right) => left.concat(right),
      default: () => [],
    }),
    toolCallCount: Annotation<number>({
      reducer: (_left, right) => right,
      default: () => 0,
    }),
    roundIndex: Annotation<number>({
      reducer: (_left, right) => right,
      default: () => 1,
    }),
    finalContent: Annotation<string | undefined>({
      reducer: (_left, right) => right,
      default: () => undefined,
    }),
    status: Annotation<AgentRunStatus | undefined>({
      reducer: (_left, right) => right,
      default: () => undefined,
    }),
    error: Annotation<string | undefined>({
      reducer: (_left, right) => right,
      default: () => undefined,
    }),
    pendingApprovals: Annotation<AgentApprovalRequest[] | undefined>({
      reducer: (_left, right) => right,
      default: () => undefined,
    }),
    pendingInputRequests: Annotation<AgentInputRequest[] | undefined>({
      reducer: (_left, right) => right,
      default: () => undefined,
    }),
    requestedCalls: Annotation<ToolCall[]>({
      reducer: (_left, right) => right,
      default: () => [],
    }),
    modelContent: Annotation<string | null | undefined>({
      reducer: (_left, right) => right,
      default: () => undefined,
    }),
  })

  const graph = new StateGraph(State)
    .addNode('model', async (state) => runModelNode(state, input))
    .addNode('policy', async (state) => runPolicyNode(state, input))
    .addNode('execute', async (state) => runExecuteNode(state, input))
    .addEdge(START, 'model')
    .addConditionalEdges('model', (state) => {
      if (state.status || state.error) return END
      return 'policy'
    })
    .addConditionalEdges('policy', (state) => {
      if (state.status || state.error) return END
      return 'execute'
    })
    .addConditionalEdges('execute', (state) => {
      if (state.status || state.error) return END
      if (state.requestedCalls.length > 0) return 'policy'
      return 'model'
    })
    .compile()

  const result = await graph.invoke(
    {
      history: [],
      warnings: [...input.warnings],
      toolOutcomes: [],
      toolCallCount: 0,
      roundIndex: 1,
    },
    { recursionLimit: Math.max(10, input.policy.maxIterations * 4 + 4) },
  ) as AgentGraphState

  throwIfAborted(input.signal)
  if (result.error) return { status: 'failed', error: result.error }
  if (result.status === 'cancelled') return { status: 'cancelled', reason: 'Run was cancelled.' }
  if (result.status === 'requires_action') {
    return {
      status: 'requires_action',
      pendingApprovals: result.pendingApprovals ?? [],
      pendingInputRequests: result.pendingInputRequests ?? [],
      messages: result.history,
      toolOutcomes: result.toolOutcomes,
      warnings: result.warnings,
    }
  }

  return {
    status: 'completed',
    finalContent: result.finalContent ?? '',
    assistantContents: collectAssistantContents(result.history),
    toolOutcomes: result.toolOutcomes,
    warnings: result.warnings,
  }
}

function collectAssistantContents(history: RuntimeModelChatMessage[]): string[] {
  const contents: string[] = []
  for (const message of history) {
    if (message.role !== 'assistant' || typeof message.content !== 'string') continue
    const content = message.content.trim()
    if (!content) continue
    if (contents.at(-1) === content) continue
    contents.push(content)
  }
  return contents
}

async function runModelNode(state: AgentGraphState, input: AgentGraphInput): Promise<Partial<AgentGraphState>> {
  throwIfAborted(input.signal)
  const currentRoundIndex = state.roundIndex
  const roundLabel = `Model turn ${currentRoundIndex}`
  const threadMessages = input.getThreadMessages?.() ?? input.threadMessages
  const lastUser = input.rootUserMessageId
    ? threadMessages.find((message) => message.id === input.rootUserMessageId && message.role === 'user')
    : [...threadMessages].reverse().find((message) => message.role === 'user')
  const frozenUserMessage = typeof input.userMessage === 'string' && input.userMessage.trim().length > 0
    ? input.userMessage.trim()
    : undefined
  if (!lastUser && !frozenUserMessage) {
    return { status: 'failed', error: 'run requires at least one user message' }
  }
  if (currentRoundIndex > input.policy.maxIterations) {
    return {
      warnings: [`已达到最大迭代次数 ${input.policy.maxIterations}`],
      status: 'completed',
      finalContent: getLastAssistantContent(state.history),
    }
  }

  const rootIndex = lastUser ? threadMessages.findIndex((message) => message.id === lastUser.id) : -1
  const supplementalUserMessages = rootIndex >= 0 && !frozenUserMessage
    ? threadMessages.slice(rootIndex + 1).filter((message) => message.role === 'user')
    : []
  const baseEffectiveUserMessage = frozenUserMessage ?? (supplementalUserMessages.length > 0
    ? [
      lastUser!.content,
      '',
      '[后续用户补充]',
      ...supplementalUserMessages.map((message) => message.content),
    ].join('\n')
    : lastUser!.content)
  const runtimeInputMessages = collectPendingRuntimeInputMessages({ run: input.run, threadMessages })
  const effectiveUserMessage = appendRuntimeInputMessagesToUserMessage(baseEffectiveUserMessage, runtimeInputMessages)
  if (runtimeInputMessages.length > 0) {
    input.onRuntimeInputConsumed?.(runtimeInputMessages, {
      roundIndex: currentRoundIndex,
      roundLabel,
      roundSource: 'model',
    })
  }
  const promptHistoryInput: AgentMessage[] = threadMessages.filter((message, index) => (
    message.role !== 'system'
    && (!lastUser || message.id !== lastUser.id)
    && (rootIndex < 0 || index <= rootIndex || message.role !== 'user')
  ))
  const maxHistoryMessages = numberField(input.run.metadata?.limits, 'maxHistoryMessages')
  const promptHistory = contextManager.compactThreadHistory({
    messages: promptHistoryInput,
    maxMessages: maxHistoryMessages,
    threadSummary: input.run.metadata?.threadContextSummary,
  })
  const historyTrace = contextManager.buildHistoryCompactedTrace(promptHistory)
  if (historyTrace) {
    input.onTrace({
      kind: 'context',
      title: historyTrace.title,
      summary: historyTrace.summary,
      status: 'completed',
      roundIndex: currentRoundIndex,
      roundLabel,
      roundSource: 'model',
      data: historyTrace.data,
    })
  }

  if (currentRoundIndex === 1 && input.forcedToolCalls && input.forcedToolCalls.length > 0) {
    const forcedToolCalls = input.forcedToolCalls.map(normalizeToolCall)
    input.onTrace({
      kind: 'policy',
      title: 'Forced tool calls injected',
      summary: `${forcedToolCalls.length} forced runtime tool call(s)`,
      status: 'info',
      roundIndex: currentRoundIndex,
      roundLabel,
      roundSource: 'model',
      data: { forcedCalls: forcedToolCalls.map((call) => call.name) },
    })
    return {
      history: [{
        role: 'assistant',
        content: null,
        tool_calls: forcedToolCalls.map((call) => ({
          id: call.id ?? makeId('call'),
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
        })),
      }],
      requestedCalls: forcedToolCalls,
    }
  }

  const modelTurnContext = contextManager.composeModelTurn({
    manifest: input.manifest,
    skills: input.skills,
    ...(input.skillDiscovery ? { skillDiscovery: input.skillDiscovery } : {}),
    context: input.context,
    tools: input.capabilities,
    policy: input.policy,
    memories: input.memories,
    warnings: state.warnings,
    history: promptHistory.messages,
    userMessage: effectiveUserMessage,
    toolLoopHistory: state.history,
    ...(promptHistory.summary ? { threadSummary: promptHistory.summary } : {}),
    ...(input.command ? { command: input.command } : {}),
    ...(input.contractResolver ? { contractResolver: input.contractResolver } : {}),
  })
  const { builtContext } = modelTurnContext
  input.onTrace({
    kind: 'prompt',
    title: modelTurnContext.promptTrace.title,
    summary: modelTurnContext.promptTrace.summary,
    status: 'completed',
    roundIndex: currentRoundIndex,
    roundLabel,
    roundSource: 'model',
    data: modelTurnContext.promptTrace.data,
  })
  const { messages, tools } = modelTurnContext
  const modelRouter = input.modelRouter ?? createDefaultRuntimeModelRouter(input.config)
  const reasoningRoute = modelRouter.resolve('reasoning')
  if (!reasoningRoute) {
    return { status: 'failed', error: 'run requires a configured reasoning model route' }
  }
  input.onTrace({
    kind: 'model_call',
    title: 'Model route selected',
    summary: `reasoning -> ${reasoningRoute.provider}:${reasoningRoute.config.model}`,
    status: 'info',
    roundIndex: currentRoundIndex,
    roundLabel,
    roundSource: 'model',
    data: {
      capability: reasoningRoute.capability,
      provider: reasoningRoute.provider,
      modelConfigId: reasoningRoute.config.modelConfigId,
      model: reasoningRoute.config.model,
      source: reasoningRoute.source,
    },
  })
  const modelResult = await modelRouter.call({
    capability: 'reasoning',
    messages,
    tools,
    toolChoice: tools.length > 0 ? 'auto' : undefined,
    auth: input.auth,
    signal: input.signal,
    onTrace: (event) => {
      if (event.phase === 'stream') {
        const isToolCallStream = event.stream?.kind === 'tool_call'
        const volatileKey = isToolCallStream
          ? toolCallStreamTraceKey(currentRoundIndex, event.stream?.toolCall)
          : undefined
        input.onTrace({
          kind: event.stream?.kind === 'reasoning' ? 'reasoning' : isToolCallStream ? 'tool_call' : 'model_call',
          title: event.stream?.kind === 'reasoning'
            ? 'Model reasoning delta'
            : isToolCallStream ? 'Model tool call delta' : 'Model stream delta',
          summary: isToolCallStream
            ? formatToolCallStreamSummary(event.stream?.toolCall)
            : event.stream?.delta ? event.stream.delta.slice(0, 180) : undefined,
          status: 'info',
          roundIndex: currentRoundIndex,
          roundLabel,
          roundSource: 'model',
          data: { phase: event.phase, stream: event.stream, latencyMs: event.trace.latencyMs },
          volatile: true,
          ...(volatileKey ? { volatileKey } : {}),
        })
        return
      }
      input.onTrace({
        kind: 'model_call',
        title: event.phase === 'request'
          ? 'Model HTTP request sent'
          : event.phase === 'response'
            ? 'Model HTTP response received'
            : event.phase === 'retry' ? 'Model retry scheduled' : 'Model HTTP call failed',
        summary: event.phase === 'retry' && event.retry
          ? `Rate limited or temporarily unavailable. Retry ${event.retry.nextAttempt}/${event.retry.maxAttempts} in ${Math.round(event.retry.delayMs / 1000)}s.`
          : event.error ?? (event.trace.response ? `HTTP ${event.trace.response.status} in ${event.trace.latencyMs}ms` : undefined),
        status: event.phase === 'request' ? 'started' : event.phase === 'error' ? 'failed' : event.phase === 'retry' ? 'info' : event.trace.response?.ok === false ? 'failed' : 'completed',
        roundIndex: currentRoundIndex,
        roundLabel,
        roundSource: 'model',
        data: { phase: event.phase, ...event.trace, ...(event.error ? { error: event.error } : {}), ...(event.retry ? { retry: event.retry } : {}) },
      })
    },
  }).catch((error) => {
    if (isAbortError(error) || input.signal?.aborted) throw error
    const message = error instanceof Error ? error.message : String(error)
    const finalContent = formatRecoverableModelError(message)
    return {
      content: finalContent,
      tool_calls: [],
      finish_reason: 'stop',
      rawAssistantMessage: { role: 'assistant' as const, content: finalContent },
      usage: undefined,
      recoverableError: true,
      warnings: [`模型调用未完成：${message}`],
    }
  })
  throwIfAborted(input.signal)

  input.onTrace({
    kind: 'model_call',
    title: 'Model HTTP response received',
    summary: modelResult.finish_reason === 'tool_calls'
      ? `${modelResult.tool_calls.length} tool call(s) requested`
      : `finish_reason=${modelResult.finish_reason}`,
    status: 'completed',
    roundIndex: currentRoundIndex,
    roundLabel,
    roundSource: 'model',
    data: {
      finish_reason: modelResult.finish_reason,
      tool_calls: modelResult.tool_calls.map((tc) => ({ id: tc.id, name: tc.function.name })),
      content_chars: modelResult.content?.length ?? 0,
      usage: modelResult.usage,
    },
  })

  if (modelResult.finish_reason === 'stop' || modelResult.tool_calls.length === 0) {
    const finalResult = modelResult
    const modelWarnings = 'warnings' in finalResult && Array.isArray(finalResult.warnings) ? finalResult.warnings : []
    return {
      history: [finalResult.rawAssistantMessage],
      status: 'completed',
      finalContent: finalResult.content ?? '',
      ...(modelWarnings.length > 0 ? { warnings: modelWarnings } : {}),
    }
  }

  return {
    history: [modelResult.rawAssistantMessage],
    requestedCalls: modelResult.tool_calls.map(toToolCall),
    modelContent: modelResult.content,
  }
}

function formatRecoverableModelError(message: string): string {
  return [
    '模型这次没有完成回复。',
    '请重试；如果连续失败，可以缩短输入或补充更明确的编排范围。',
    '',
    `错误信息：${message}`,
  ].join('\n')
}

async function runPolicyNode(state: AgentGraphState, input: AgentGraphInput): Promise<Partial<AgentGraphState>> {
  throwIfAborted(input.signal)
  const currentRoundIndex = state.roundIndex
  const roundLabel = `Model turn ${currentRoundIndex}`
  const remaining = input.policy.maxToolCalls - state.toolCallCount
  if (remaining <= 0) {
    return {
      warnings: [`已达到工具调用上限 ${input.policy.maxToolCalls}`],
      status: 'completed',
      finalContent: state.modelContent ?? getLastAssistantContent(state.history),
    }
  }

  const inputCalls = state.requestedCalls.filter((call) => call.name === 'movscript_request_user_input')
  if (inputCalls.length > 0) {
    const pendingInputRequests = inputCalls.map((call) => buildInputRequest(input.run.id, call.args ?? {}))
    input.onTrace({
      kind: 'input',
      title: 'User input required',
      summary: pendingInputRequests.map((request) => request.title).join(', '),
      status: 'blocked',
      roundIndex: currentRoundIndex,
      roundLabel,
      roundSource: 'model',
      data: { inputRequests: pendingInputRequests },
    })
    return {
      pendingApprovals: [],
      status: 'requires_action',
      warnings: [],
      finalContent: state.modelContent ?? getLastAssistantContent(state.history),
      requestedCalls: [],
      pendingInputRequests,
    }
  }

  const policyResult = applyToolPolicy(state.requestedCalls.slice(0, remaining), {
    currentProjectId: input.context.project?.id,
    manifest: input.manifest,
    catalog: input.capabilities,
    registry: input.registry,
    approvedToolNames: input.approvedToolNames,
    approvalMode: input.policy.approvalMode,
    sandboxMode: input.policy.sandboxMode === true,
    runRole: input.run.role,
  })
  input.onTrace({
    kind: 'policy',
    title: `Turn ${currentRoundIndex}: policy result`,
    summary: `${policyResult.toolCalls.length} allowed, ${policyResult.blockedToolCalls.length} blocked`,
    status: policyResult.blockedToolCalls.some((b) => b.reason === 'approval_required') ? 'blocked' : 'completed',
    roundIndex: currentRoundIndex,
    roundLabel,
    roundSource: 'model',
    data: {
      eventType: 'tool.call.policy_decision',
      allowed: policyResult.toolCalls.map((c) => c.name),
      blocked: policyResult.blockedToolCalls.map((b) => ({ name: b.call.name, reason: b.reason })),
      decision: policyResult.blockedToolCalls.some((b) => b.reason === 'approval_required')
        ? 'approval_required'
        : policyResult.blockedToolCalls.length > 0 ? 'deny' : 'allow',
    },
  })

  const approvalBlocked = policyResult.blockedToolCalls.filter((b) => b.reason === 'approval_required')
  if (approvalBlocked.length > 0) {
    input.onTrace({
      kind: 'approval',
      title: 'Approval requested',
      summary: approvalBlocked.map((blocked) => blocked.call.name).join(', '),
      status: 'blocked',
      roundIndex: currentRoundIndex,
      roundLabel,
      roundSource: 'approval',
      data: {
        eventType: 'approval.requested',
        tools: approvalBlocked.map((blocked) => ({
          name: blocked.call.name,
          reason: blocked.message,
          risk: blocked.tool?.risk,
          permission: blocked.tool?.permission,
        })),
      },
    })
    return {
      pendingApprovals: approvalBlocked.map((blocked) => ({
        id: makeId('approval'),
        runId: input.run.id,
        toolName: blocked.call.name,
        ...(blocked.call.args ? { args: blocked.call.args } : {}),
        reason: blocked.message,
        ...(blocked.tool?.risk ? { risk: blocked.tool.risk } : {}),
        ...(blocked.tool?.permission ? { permission: blocked.tool.permission } : {}),
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      status: 'requires_action',
      warnings: policyResult.warnings,
    }
  }

  const skillActivationRepairCalls = buildSkillActivationRepairCalls(policyResult.blockedToolCalls, input)
  if (policyResult.toolCalls.length === 0 && skillActivationRepairCalls.length > 0) {
    const repairPolicyResult = applyToolPolicy(skillActivationRepairCalls, {
      currentProjectId: input.context.project?.id,
      manifest: input.manifest,
      catalog: input.capabilities,
      registry: input.registry,
      approvedToolNames: input.approvedToolNames,
      approvalMode: input.policy.approvalMode,
      sandboxMode: input.policy.sandboxMode === true,
      runRole: input.run.role,
    })
    if (repairPolicyResult.toolCalls.length > 0) {
      input.onTrace({
        kind: 'policy',
        title: `Turn ${currentRoundIndex}: skill activation repair`,
        summary: repairPolicyResult.toolCalls.map((call) => call.name).join(', '),
        status: 'completed',
        roundIndex: currentRoundIndex,
        roundLabel,
        roundSource: 'runtime_rule',
        data: {
          eventType: 'tool.call.skill_activation_repair',
          blocked: policyResult.blockedToolCalls.map((b) => ({ name: b.call.name, reason: b.reason })),
          repairCalls: repairPolicyResult.toolCalls.map((call) => ({ name: call.name, args: call.args })),
        },
      })
      return {
        requestedCalls: repairPolicyResult.toolCalls,
        warnings: [
          ...repairPolicyResult.warnings,
          '读取项目剧本需要先加载剧本读取能力，已自动加载后重试。',
        ],
      }
    }
  }

  if (policyResult.toolCalls.length === 0) {
    return {
      status: 'completed',
      finalContent: state.modelContent ?? getLastAssistantContent(state.history) ?? (state.warnings.length > 0 ? state.warnings.join('\n') : ''),
      warnings: policyResult.warnings,
    }
  }

  return {
    requestedCalls: policyResult.toolCalls,
    warnings: policyResult.warnings,
  }
}

const TOOL_SKILL_ACTIVATION_REPAIRS: Record<string, { skillId: string; reason: string }> = {
  movscript_read_project_scripts: {
    skillId: 'movscript.workflow.script-reading',
    reason: '读取项目剧本需要加载剧本读取 workflow。',
  },
}

function buildSkillActivationRepairCalls(blockedToolCalls: BlockedToolCall[], input: AgentGraphInput): ToolCall[] {
  const skillTool = input.capabilities.byName.movscript_update_active_skills
  if (!skillTool?.available) return []

  const activeSkillIds = new Set(input.skills.map((skill) => skill.id))
  const load: string[] = []
  const reasons: string[] = []
  for (const blocked of blockedToolCalls) {
    if (blocked.reason !== 'not_granted' && blocked.reason !== 'unknown_tool') continue
    const repair = TOOL_SKILL_ACTIVATION_REPAIRS[blocked.call.name]
    if (!repair || activeSkillIds.has(repair.skillId) || load.includes(repair.skillId)) continue
    load.push(repair.skillId)
    reasons.push(repair.reason)
  }

  if (load.length === 0) return []
  return [{
    id: makeId('call'),
    name: 'movscript_update_active_skills',
    args: {
      load,
      reason: Array.from(new Set(reasons)).join(' '),
    },
  }]
}

function buildInputRequest(runId: string, args: Record<string, JSONValue>): AgentInputRequest {
  const now = new Date().toISOString()
  const choices = normalizeChoices(args.choices)
  const inputType = args.inputType === 'text' || args.inputType === 'confirmation' || args.inputType === 'choice'
    ? args.inputType
    : choices.length > 0 ? 'choice' : 'text'
  return {
    id: makeId('input'),
    runId,
    title: normalizeText(args.title) ?? normalizeText(args.header) ?? '需要补充信息',
    ...(normalizeText(args.summary) ?? normalizeText(args.description) ? { summary: normalizeText(args.summary) ?? normalizeText(args.description) } : {}),
    question: normalizeText(args.question) ?? '请补充必要信息后继续。',
    inputType,
    choices,
    allowCustomAnswer: args.allowCustomAnswer !== false,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeChoices(value: JSONValue | undefined): AgentInputRequest['choices'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (typeof item === 'string' && item.trim()) {
      return [{ id: `choice_${index + 1}`, label: item.trim() }]
    }
    if (!isJSONRecord(item)) return []
    const label = normalizeText(item.label)
    if (!label) return []
    return [{
      id: normalizeText(item.id) ?? `choice_${index + 1}`,
      label,
      ...(normalizeText(item.description) ? { description: normalizeText(item.description) } : {}),
    }]
  })
}

function normalizeText(value: JSONValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

async function runExecuteNode(state: AgentGraphState, input: AgentGraphInput): Promise<Partial<AgentGraphState>> {
  throwIfAborted(input.signal)
  const currentRoundIndex = state.roundIndex
  const roundLabel = `Model turn ${currentRoundIndex}`
  const effectiveRoundSource = currentRoundIndex === 1 && input.forcedToolCalls && input.forcedToolCalls.length > 0
    ? 'runtime_rule' as const
    : 'model' as const
  const toolOutcomes = [...state.toolOutcomes]
  const warnings = [...state.warnings]
  const requestedCalls = state.requestedCalls
  const canRunConcurrently = requestedCalls.length > 1 && requestedCalls.every((call) => canExecuteConcurrently(call, input.registry))

  const executeOne = async (call: ToolCall): Promise<{ outcome: ToolCallOutcome; turnResult: { toolCall: ToolCall; content: string }; warning?: string }> => {
    const stepId = input.onStepCreate('tool_call', currentRoundIndex, roundLabel, effectiveRoundSource, call.name)
    const startedAt = Date.now()
    try {
      const execResult = await executeTool(call, {
        run: input.run,
        mcpClient: input.mcpClient,
        draftStore: input.draftStore,
        backendApplyClient: input.backendApplyClient,
        registry: input.registry,
        memoryManager: input.memoryManager,
        knowledgeManager: input.knowledgeManager,
        catalogManager: input.catalogManager,
        sandboxMode: input.policy.sandboxMode === true,
        signal: input.signal,
      })
      throwIfAborted(input.signal)
      const durationMs = Date.now() - startedAt
      input.onStepComplete(stepId, execResult.result, undefined, execResult.sandboxed)
      const ledgerAudit = updateRunContextLedger(input, call, execResult.result, execResult.source)
      const { ledger } = ledgerAudit
      input.onTrace({
        kind: 'tool_call',
        title: execResult.sandboxed ? `Tool sandboxed: ${call.name}` : `Tool completed: ${call.name}`,
        summary: `${summarizeResult(execResult.result)} (${durationMs}ms)`,
        status: 'completed',
        roundIndex: currentRoundIndex,
        roundLabel,
        roundSource: effectiveRoundSource,
        stepId,
        toolName: call.name,
        data: { source: execResult.source, result: execResult.result, sandboxed: execResult.sandboxed, durationMs },
        durationMs,
      })
      const ledgerUpdatedTrace = contextManager.buildLedgerUpdatedTrace(ledger)
      input.onTrace({
        kind: 'context',
        title: ledgerUpdatedTrace.title,
        summary: ledgerUpdatedTrace.summary,
        status: 'completed',
        roundIndex: currentRoundIndex,
        roundLabel,
        roundSource: effectiveRoundSource,
        stepId,
        toolName: call.name,
        data: ledgerUpdatedTrace.data,
      })
      const dedupedTrace = contextManager.buildLedgerDedupedTrace(call.name, ledgerAudit)
      if (dedupedTrace) {
        input.onTrace({
          kind: 'context',
          title: dedupedTrace.title,
          summary: dedupedTrace.summary,
          status: 'completed',
          roundIndex: currentRoundIndex,
          roundLabel,
          roundSource: effectiveRoundSource,
          stepId,
          toolName: call.name,
          data: dedupedTrace.data,
        })
      }
      const knowledgeTrace = contextManager.buildKnowledgeTrace({ call, result: execResult.result, ledger })
      if (knowledgeTrace) {
        input.onTrace({
          kind: 'context',
          title: knowledgeTrace.title,
          summary: knowledgeTrace.summary,
          status: 'completed',
          roundIndex: currentRoundIndex,
          roundLabel,
          roundSource: effectiveRoundSource,
          stepId,
          toolName: call.name,
          data: knowledgeTrace.data,
        })
      }
      const generationEvent = buildGenerationEvent(call, execResult.result)
      if (generationEvent && input.onGenerationEvent) {
        input.onGenerationEvent(generationEvent, {
          roundIndex: currentRoundIndex,
          roundLabel,
          roundSource: effectiveRoundSource,
          stepId,
          toolName: call.name,
        })
        const monitorRequest = extractGenerationMonitorRequest(call, execResult.result, generationEvent)
        if (monitorRequest) {
          await monitorGenerationJob(monitorRequest, generationEvent, input, {
            roundIndex: currentRoundIndex,
            roundLabel,
            roundSource: effectiveRoundSource,
            stepId,
            toolName: call.name,
          })
          throwIfAborted(input.signal)
        }
      }
      const modelToolResult = contextManager.buildToolResultContext({ run: input.run, call, result: execResult.result })
      const droppedTrace = contextManager.buildToolResultDroppedTrace(call.name, modelToolResult)
      if (droppedTrace) {
        input.onTrace({
          kind: 'context',
          title: droppedTrace.title,
          summary: droppedTrace.summary,
          status: 'completed',
          roundIndex: currentRoundIndex,
          roundLabel,
          roundSource: effectiveRoundSource,
          stepId,
          toolName: call.name,
          data: droppedTrace.data,
        })
      }
      return {
        outcome: {
          call,
          ...(execResult.error ? { error: execResult.error } : { result: execResult.result }),
          rollback: buildRollbackRecord(call, execResult.result, execResult.sandboxed),
        },
        turnResult: {
          toolCall: normalizeToolCall(call),
          content: modelToolResult.content,
        },
      }
    } catch (error) {
      if (isAbortError(error) || input.signal?.aborted) throw error
      const message = error instanceof Error ? error.message : String(error)
      const durationMs = Date.now() - startedAt
      input.onStepComplete(stepId, undefined, message)
      input.onTrace({
        kind: 'tool_call',
        title: `Tool call failed: ${call.name}`,
        summary: `${message} (${durationMs}ms)`,
        status: 'failed',
        roundIndex: currentRoundIndex,
        roundLabel,
        roundSource: effectiveRoundSource,
        stepId,
        toolName: call.name,
        data: { error: message, durationMs },
        durationMs,
      })
      const modelToolResult = contextManager.buildToolResultContext({ run: input.run, call, error: message })
      return {
        outcome: { call, error: message },
        warning: `${formatToolNameForDisplay(call.name)} 未完成：${message}`,
        turnResult: {
          toolCall: normalizeToolCall(call),
          content: modelToolResult.content,
        },
      }
    }
  }

  const executed = canRunConcurrently
    ? await Promise.all(requestedCalls.map((call) => {
      throwIfAborted(input.signal)
      return executeOne(call)
    }))
    : []

  const results = canRunConcurrently ? executed : []
  if (!canRunConcurrently) {
    for (const call of requestedCalls) {
      throwIfAborted(input.signal)
      const result = await executeOne(call)
      results.push(result)
      if (call.name === 'movscript_apply_draft' && result.outcome.error) break
    }
  }

  for (const result of results) {
    toolOutcomes.push(result.outcome)
    if (result.warning) warnings.push(result.warning)
  }

  if (results.some((result) => isCatalogMutationTool(result.outcome.call.name)) && input.onCatalogRefresh) {
    const refreshed = await input.onCatalogRefresh()
    input.manifest = refreshed.manifest
    input.capabilities = refreshed.capabilities
    input.skills = refreshed.skills
    input.skillDiscovery = refreshed.skillDiscovery
    input.registry = refreshed.registry
    warnings.push(...refreshed.warnings)
    const manifestSnapshot = buildCatalogRefreshManifestSnapshot(refreshed.manifest)
    const capabilitySnapshot = buildCatalogRefreshCapabilitySnapshot(refreshed.capabilities)
    input.onTrace({
      kind: 'tool_catalog',
      title: 'Agent catalog refreshed',
      summary: buildCatalogRefreshSummary(manifestSnapshot, capabilitySnapshot, refreshed.capabilities.available.length),
      status: 'completed',
      roundIndex: currentRoundIndex,
      roundLabel,
      roundSource: effectiveRoundSource,
      data: {
        skillIds: refreshed.skills.map((skill) => skill.id),
        availableToolNames: refreshed.capabilities.available.map((tool) => tool.name),
        manifest: manifestSnapshot,
        capabilitySnapshot,
        warningCount: refreshed.warnings.length,
      },
    })
  }

  const turnResults: Array<{ toolCall: ToolCall; content: string }> = results.map((result) => result.turnResult)

  if (canRunConcurrently) {
    input.onTrace({
      kind: 'tool_call',
      title: 'Read tools executed concurrently',
      summary: `${requestedCalls.length} read tool call(s) completed in parallel.`,
      status: 'completed',
      roundIndex: currentRoundIndex,
      roundLabel,
      roundSource: effectiveRoundSource,
      data: { toolNames: requestedCalls.map((call) => call.name) },
    })
  }

  const nextHistory: RuntimeModelChatMessage[] = turnResults.flatMap(({ toolCall, content }) => ([
    { role: 'tool', tool_call_id: toolCall.id ?? makeId('call'), content },
  ]))
  const defaultApplyCalls = buildDefaultDraftApplyCalls(results.map((result) => result.outcome), input)
  if (defaultApplyCalls.length > 0) {
    input.onTrace({
      kind: 'policy',
      title: 'Default draft apply queued',
      summary: defaultApplyCalls.map((call) => String(call.args?.draftId ?? call.args?.draft_id ?? call.name)).join(', '),
      status: 'info',
      roundIndex: currentRoundIndex,
      roundLabel,
      roundSource: 'runtime_rule',
      data: {
        eventType: 'draft.apply.default_queued',
        order: defaultApplyCalls.map((call) => ({
          toolName: call.name,
          draftId: call.args?.draftId,
          draftKind: call.args?.draftKind,
        })),
      },
    })
  }

  if (currentRoundIndex === 1 && input.forcedToolCalls && input.forcedToolCalls.length > 0) {
    const remainingApprovals = remainingPendingApprovalsAfterForcedCalls(input.run, results.map((result) => result.outcome))
    if (defaultApplyCalls.length === 0 && remainingApprovals.length > 0) {
      input.onTrace({
        kind: 'approval',
        title: 'Approval still pending',
        summary: remainingApprovals.map((approval) => approval.toolName).join(', '),
        status: 'blocked',
        roundIndex: currentRoundIndex,
        roundLabel,
        roundSource: 'approval',
        data: {
          eventType: 'approval.remaining',
          approvals: remainingApprovals.map((approval) => ({
            id: approval.id,
            toolName: approval.toolName,
            risk: approval.risk,
            permission: approval.permission,
          })),
        },
      })
      return {
        history: nextHistory,
        toolOutcomes,
        warnings,
        toolCallCount: state.toolCallCount + requestedCalls.length,
        roundIndex: currentRoundIndex + 1,
        status: 'requires_action',
        pendingApprovals: remainingApprovals,
        pendingInputRequests: [],
      }
    }
    return {
      history: nextHistory,
      toolOutcomes,
      warnings,
      toolCallCount: state.toolCallCount + requestedCalls.length,
      roundIndex: currentRoundIndex + 1,
      ...(defaultApplyCalls.length > 0
        ? { requestedCalls: defaultApplyCalls }
        : { status: 'completed' as const, finalContent: '' }),
    }
  }

  return {
    history: nextHistory,
    toolOutcomes,
    warnings,
    toolCallCount: state.toolCallCount + requestedCalls.length,
    roundIndex: currentRoundIndex + 1,
    requestedCalls: defaultApplyCalls,
  }
}

function remainingPendingApprovalsAfterForcedCalls(run: AgentRun, outcomes: ToolCallOutcome[]): AgentApprovalRequest[] {
  const executedApprovalIds = new Set(
    outcomes
      .map((outcome) => approvalIdFromForcedCall(outcome.call))
      .filter((approvalId): approvalId is string => Boolean(approvalId)),
  )
  if (executedApprovalIds.size === 0) return []
  return (run.pendingApprovals ?? []).filter((approval) => approval.status === 'pending' && !executedApprovalIds.has(approval.id))
}

function approvalIdFromForcedCall(call: ToolCall): string | undefined {
  if (typeof call.id !== 'string') return undefined
  return call.id.startsWith('call_approval_') ? call.id.slice('call_'.length) : undefined
}

const DEFAULT_DRAFT_APPLY_KIND_ORDER: Record<string, number> = {
  project_standards_proposal: 5,
  setting_proposal: 10,
  asset_proposal: 20,
  production_proposal: 30,
  content_unit_proposal: 40,
}

function buildDefaultDraftApplyCalls(outcomes: ToolCallOutcome[], input: AgentGraphInput): ToolCall[] {
  if (!input.registry.get('movscript_apply_draft')) return []
  const grant = findToolGrant(input.manifest, 'movscript_apply_draft')
  if (!grant || grant.mode === 'deny') return []
  if (!hasExplicitDraftApplyIntent(input.userMessage)) return []
  const candidates = outcomes.flatMap((outcome, index) => {
    if (outcome.call.name !== 'movscript_create_draft') return []
    const result = isJSONRecord(outcome.result) ? outcome.result : undefined
    if (!result || result.status !== 'created') return []
    const draft = isJSONRecord(result.draft) ? result.draft : undefined
    const draftId = typeof result.draftId === 'string'
      ? result.draftId
      : typeof result.draftRef === 'string'
        ? result.draftRef
        : typeof draft?.id === 'string'
          ? draft.id
          : undefined
    const draftKind = typeof draft?.kind === 'string' ? draft.kind : undefined
    const rank = draftKind ? DEFAULT_DRAFT_APPLY_KIND_ORDER[draftKind] : undefined
    if (!draftId || rank === undefined) return []
    return [{ draftId, draftKind, rank, index }]
  })
  return candidates
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((candidate): ToolCall => ({
      id: makeId('call'),
      name: 'movscript_apply_draft',
      args: {
        draftId: candidate.draftId,
        ...(candidate.draftKind ? { draftKind: candidate.draftKind } : {}),
      },
    }))
}

function hasExplicitDraftApplyIntent(message: string | undefined): boolean {
  const text = typeof message === 'string' ? message.trim().toLowerCase() : ''
  if (!text) return false
  return /\b(apply|apply\s+draft|apply\s+proposal|commit\s+draft|write\s+to\s+backend)\b/i.test(text)
    || /(应用|套用|正式写入|写入项目|写入正式|提交应用|批准应用|通过并应用|落库|生效)/.test(text)
}

function updateRunContextLedger(input: AgentGraphInput, call: ToolCall, result: JSONValue | undefined, source: 'runtime' | 'mcp' | 'sandbox'): ReturnType<typeof contextManager.recordToolResult> {
  const catalogSnapshotValue = input.run.metadata?.catalogSnapshot
  const catalogSnapshot = isJSONRecord(catalogSnapshotValue)
    ? catalogSnapshotValue
    : undefined
  const catalogSnapshotId = typeof catalogSnapshot?.id === 'string' ? catalogSnapshot.id : 'unknown'
  const catalogSnapshotVersion = typeof catalogSnapshot?.version === 'string' ? catalogSnapshot.version : undefined
  const audit = contextManager.recordToolResult({
    ledger: input.run.metadata?.contextLedger,
    runId: input.run.id,
    threadId: input.run.threadId,
    catalogSnapshotId,
    catalogSnapshotVersion,
    activeSkillIds: input.skills.map((skill) => skill.id),
    visibleToolNames: input.capabilities.available.map((tool) => tool.name),
    call,
    result,
    source,
  })
  input.run.metadata = {
    ...(input.run.metadata ?? {}),
    contextLedger: audit.ledger as unknown as JSONValue,
  }
  return audit
}

async function monitorGenerationJob(
  request: NonNullable<ReturnType<typeof extractGenerationMonitorRequest>>,
  initialEvent: GenerationEvent,
  input: AgentGraphInput,
  trace: Omit<AgentGraphTraceInput, 'kind' | 'title' | 'summary' | 'status' | 'data'>,
): Promise<void> {
  if (!input.onGenerationEvent || request.timeoutMs <= 0) return
  const deadline = Date.now() + request.timeoutMs
  let previousKey = generationEventChangeKey(initialEvent)
  let lastEmittedAt = Date.now()
  const heartbeatMs = request.heartbeatMs > 0 ? request.heartbeatMs : Number.POSITIVE_INFINITY
  while (true) {
    throwIfAborted(input.signal)
    const execResult = await executeTool({ name: request.toolName, args: request.args }, {
      run: input.run,
      mcpClient: input.mcpClient,
      draftStore: input.draftStore,
      backendApplyClient: input.backendApplyClient,
      registry: input.registry,
      memoryManager: input.memoryManager,
      knowledgeManager: input.knowledgeManager,
      catalogManager: input.catalogManager,
      sandboxMode: input.policy.sandboxMode === true,
      signal: input.signal,
    })
    const event = buildGenerationEvent({ name: request.toolName, args: request.args }, execResult.result)
    if (!event) continue
    const nextKey = generationEventChangeKey(event)
    const now = Date.now()
    const timedOut = now >= deadline
    if (event.stage === 'timeout') {
      input.onGenerationEvent(event, trace)
      return
    }
    if (event.terminal || nextKey !== previousKey || (!timedOut && now - lastEmittedAt >= heartbeatMs)) {
      input.onGenerationEvent(event, trace)
      previousKey = nextKey
      lastEmittedAt = now
    }
    if (event.terminal) return
    if (timedOut) break
    await sleep(Math.min(request.pollIntervalMs, Math.max(0, deadline - now)), input.signal)
  }
  input.onGenerationEvent(buildGenerationTimeoutEvent(initialEvent), trace)
}

function generationEventChangeKey(event: GenerationEvent): string {
  return [
    event.stage,
    event.status,
    event.progress ?? '',
    event.outputResourceId ?? '',
    event.outputResourceIds?.join(',') ?? '',
  ].join(':')
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortErrorFromSignal(signal))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(abortErrorFromSignal(signal))
    }, { once: true })
  })
}

function abortErrorFromSignal(signal?: AbortSignal): Error {
  const reason = signal?.reason
  if (reason instanceof Error) return reason
  const error = new Error(typeof reason === 'string' ? reason : 'Run was cancelled.')
  error.name = 'AbortError'
  return error
}

function canExecuteConcurrently(call: ToolCall, registry: ToolRegistry): boolean {
  if (call.name === 'movscript_wait_subagent' || call.name === 'movscript_list_subagents') return true
  const tool = registry.get(call.name)
  return tool?.risk === 'read'
}

function isCatalogMutationTool(toolName: string): boolean {
  return toolName === 'movscript_reload_agent_catalog'
    || toolName === 'movscript_update_active_skills'
}

function buildCatalogRefreshManifestSnapshot(manifest: AgentManifest): Record<string, JSONValue> {
  return {
    id: manifest.id,
    version: manifest.version,
    name: manifest.name,
    ...(typeof manifest.metadata?.profileId === 'string' ? { profileId: manifest.metadata.profileId } : {}),
    ...(typeof manifest.metadata?.profileVersion === 'string' ? { profileVersion: manifest.metadata.profileVersion } : {}),
    toolCount: manifest.tools.length,
    tools: manifest.tools.map((grant) => ({
      name: grant.name,
      mode: grant.mode,
      ...(grant.approval ? { approval: grant.approval } : {}),
    })),
  }
}

function buildCatalogRefreshCapabilitySnapshot(capabilities: ResolvedToolCatalog): Record<string, JSONValue> {
  const keyToolNames = [
    'movscript_update_active_skills',
    'movscript_inspect_agent_catalog',
    'movscript_read_project_scripts',
    'movscript_get_focus',
    'movscript_request_user_input',
  ]
  return {
    availableToolNames: capabilities.available.map((tool) => tool.name),
    blockedTools: capabilities.blocked.map((tool) => ({
      name: tool.name,
      granted: tool.granted,
      available: tool.available,
      ...(tool.unavailableReason ? { unavailableReason: tool.unavailableReason } : {}),
    })),
    keyTools: keyToolNames.flatMap((name) => {
      const tool = capabilities.byName[name]
      if (!tool) return []
      return [{
        name: tool.name,
        granted: tool.granted,
        available: tool.available,
        approval: tool.approval,
        ...(tool.unavailableReason ? { unavailableReason: tool.unavailableReason } : {}),
      }]
    }),
  }
}

function buildCatalogRefreshSummary(
  manifest: Record<string, JSONValue>,
  capabilitySnapshot: Record<string, JSONValue>,
  availableCount: number,
): string {
  const tools = Array.isArray(manifest.tools) ? manifest.tools : []
  const grantPreview = tools
    .slice(0, 8)
    .flatMap((tool) => isJSONRecord(tool) && typeof tool.name === 'string' && typeof tool.mode === 'string' ? [`${tool.name}:${tool.mode}`] : [])
    .join(', ')
  const keyTools = Array.isArray(capabilitySnapshot.keyTools) ? capabilitySnapshot.keyTools : []
  const readScriptsStatus = keyTools
    .flatMap((tool) => {
      if (!isJSONRecord(tool) || tool.name !== 'movscript_read_project_scripts') return []
      const available = tool.available === true ? 'available' : 'blocked'
      const granted = tool.granted === true ? 'granted' : 'not_granted'
      const reason = typeof tool.unavailableReason === 'string' ? `/${tool.unavailableReason}` : ''
      return [`movscript_read_project_scripts=${available}/${granted}${reason}`]
    })[0]
  return [
    `${availableCount} available tool(s) after catalog change`,
    `manifest=${String(manifest.id ?? '-')}`,
    `tools=${String(manifest.toolCount ?? tools.length)}`,
    grantPreview ? `grants=${grantPreview}${tools.length > 8 ? ', ...' : ''}` : undefined,
    readScriptsStatus,
  ].filter(Boolean).join('; ') + '.'
}

function normalizeToolCall(call: ToolCall): ToolCall {
  return {
    id: call.id ?? makeId('call'),
    name: call.name,
    ...(call.args ? { args: call.args } : {}),
  }
}

function toToolCall(call: RuntimeModelChatToolCall): ToolCall {
  return {
    id: call.id,
    name: call.function.name,
    ...(call.function.arguments ? { args: parseArgs(call.function.arguments) } : {}),
  }
}

function formatToolCallStreamSummary(toolCall: { name?: string; id?: string; argumentsBuffer?: string; parseStatus?: string } | undefined): string | undefined {
  if (!toolCall) return undefined
  const label = toolCall.name || toolCall.id || 'tool'
  const chars = toolCall.argumentsBuffer?.length ?? 0
  return `${label} arguments ${toolCall.parseStatus ?? 'partial'} (${chars} chars)`
}

function toolCallStreamTraceKey(roundIndex: number, toolCall: { index?: number } | undefined): string {
  return `model-tool-call-stream:${roundIndex}:${toolCall?.index ?? 0}`
}

function parseArgs(input: string): Record<string, JSONValue> {
  try {
    const parsed = JSON.parse(input)
    return isJSONRecord(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}

function getLastAssistantContent(history: RuntimeModelChatMessage[]): string | undefined {
  return [...history].reverse().find((message) => message.role === 'assistant' && typeof message.content === 'string' && message.content.trim())?.content ?? undefined
}

function summarizeResult(value: JSONValue | undefined): string {
  if (value === undefined || value === null) return 'null'
  if (typeof value !== 'object') return String(value).slice(0, 180)
  if (Array.isArray(value)) return `${value.length} item(s)`
  const skillSummary = summarizeSkillStateResult(value)
  if (skillSummary) return skillSummary
  const catalogSummary = summarizeCatalogInspectResult(value)
  if (catalogSummary) return catalogSummary
  const keys = Object.keys(value)
  const status = typeof value.status === 'string' ? `${value.status}; ` : ''
  return `${status}${keys.length} key(s): ${keys.slice(0, 6).join(', ')}`
}

function summarizeSkillStateResult(value: Record<string, JSONValue>): string | undefined {
  if (value.eventType !== 'skill.state_requested') return undefined
  const status = typeof value.status === 'string' ? value.status : 'updated'
  const loaded = stringArray(value.loadedSkillIds)
  const unloaded = stringArray(value.unloadedSkillIds)
  const corrected = isJSONRecord(value.correctedSkillActivation)
  const parts = [
    `${status}; skill state`,
    loaded.length > 0 ? `loaded=${loaded.join(', ')}` : undefined,
    unloaded.length > 0 ? `unloaded=${unloaded.join(', ')}` : undefined,
    corrected ? 'corrected=true' : undefined,
  ].filter(Boolean)
  return parts.join('; ')
}

function stringArray(value: JSONValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

function summarizeCatalogInspectResult(value: Record<string, JSONValue>): string | undefined {
  if (value.status !== 'ok' || typeof value.view !== 'string') return undefined
  if (value.view === 'summary') {
    const activeSkillIds = stringArray(value.activeSkillIds)
    const availableSkillIds = stringArray(value.availableSkillIds)
    const enabledPackIds = stringArray(value.enabledPackIds)
    const counts = isJSONRecord(value.counts) ? value.counts : undefined
    const tools = typeof counts?.tools === 'number' ? `tools=${counts.tools}` : undefined
    const skills = typeof counts?.skills === 'number' ? `skills=${counts.skills}` : undefined
    return [
      'ok; catalog summary',
      activeSkillIds.length > 0 ? `active=${activeSkillIds.join(', ')}` : 'active=none',
      availableSkillIds.length > 0 ? `available=${availableSkillIds.slice(0, 6).join(', ')}` : 'available=none',
      enabledPackIds.length > 0 ? `packs=${enabledPackIds.slice(0, 4).join(', ')}` : undefined,
      [tools, skills].filter(Boolean).join(', ') || undefined,
    ].filter(Boolean).join('; ')
  }
  if (value.view === 'skill' && isJSONRecord(value.skill)) {
    const skill = value.skill
    const id = stringField(skill.id) ?? 'unknown'
    const active = value.active === true ? 'active=true' : 'active=false'
    const covered = value.coveredByEnabledPack === true ? 'coveredByPack=true' : 'coveredByPack=false'
    const toolRefs = stringArray(skill.toolRefs)
    const loadMode = stringField(skill.loadMode)
    return [
      `ok; catalog skill ${id}`,
      active,
      covered,
      loadMode ? `load=${loadMode}` : undefined,
      toolRefs.length > 0 ? `tools=${toolRefs.map(stripToolRef).join(', ')}` : undefined,
    ].filter(Boolean).join('; ')
  }
  if (value.view === 'tool' && isJSONRecord(value.tool)) {
    const tool = value.tool
    const name = stringField(tool.name) ?? 'unknown'
    const grant = isJSONRecord(value.grant) ? stringField(grantMode(value.grant)) : undefined
    return [
      `ok; catalog tool ${name}`,
      value.enabledByPack === true ? 'enabledByPack=true' : 'enabledByPack=false',
      grant ? `grant=${grant}` : 'grant=none',
    ].join('; ')
  }
  return undefined
}

function stripToolRef(value: string): string {
  return value.startsWith('tool://') ? value.slice('tool://'.length) : value
}

function grantMode(value: Record<string, JSONValue>): JSONValue | undefined {
  return value.mode
}

function buildRollbackRecord(call: ToolCall, result: JSONValue | undefined, sandboxed?: boolean): ToolCallOutcome['rollback'] {
  if (sandboxed || result === undefined) {
    return {
      policy: 'not_applicable',
      reason: sandboxed ? 'Tool call was sandboxed and did not perform side effects.' : 'Tool call produced no durable side effect result.',
    }
  }
  const metadata = isJSONRecord(result) ? result : undefined
  const draftId = metadata
    ? stringField(metadata.draftId)
      ?? stringField(metadata.draftRef)
      ?? stringField(metadata.proposalRef)
      ?? (call.name === 'movscript_create_draft' ? stringField(metadata.id) : undefined)
    : undefined
  if (draftId) {
    return {
      policy: 'reversible',
      reason: 'Local draft side effect can be superseded, rejected, or edited before apply.',
      artifactType: 'draft',
      artifactUri: `agent-draft:${draftId}`,
      metadata: { draftId },
    }
  }
  if (isRuntimeStateTool(call.name)) {
    return {
      policy: 'not_applicable',
      reason: 'Runtime state/catalog tools do not perform backend product writes.',
    }
  }
  const backendWritePerformed = metadata && (
    booleanField(metadata.performed)
    || (isJSONRecord(metadata.backendCreate) && booleanField(metadata.backendCreate.performed))
    || (isJSONRecord(metadata.backendApply) && booleanField(metadata.backendApply.performed))
  )
  if (backendWritePerformed || isBackendWriteTool(call.name)) {
    return {
      policy: 'manual_compensation',
      reason: 'Backend write may require a compensating product action; automatic destructive rollback is not available.',
      artifactType: 'backend-write',
      metadata: {
        toolName: call.name,
        ...(metadata ? { result: metadata } : {}),
      },
    }
  }
  return {
    policy: 'not_applicable',
    reason: 'Tool call is read-only or produced no recognized durable write.',
  }
}

function isBackendWriteTool(name: string): boolean {
  return name === 'movscript_apply_draft'
    || name.includes('_create_')
    || name.includes('_update_')
    || name.includes('_delete_')
}

function isRuntimeStateTool(name: string): boolean {
  return name === 'movscript_update_active_skills'
    || name === 'movscript_inspect_agent_catalog'
    || name === 'movscript_reload_agent_catalog'
    || name === 'movscript_create_plan'
    || name === 'movscript_get_plan'
    || name === 'movscript_replan'
    || name === 'movscript_spawn_subagent'
    || name === 'movscript_list_subagents'
    || name === 'movscript_wait_subagent'
    || name === 'movscript_cancel_subagent'
}

function booleanField(value: unknown): boolean {
  return value === true
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberField(value: unknown, key?: string): number | undefined {
  const candidate = key && isJSONRecord(value) ? value[key] : value
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const reason = signal.reason
  if (reason instanceof Error) throw reason
  const error = new Error(typeof reason === 'string' ? reason : 'Run was cancelled.')
  error.name = 'AbortError'
  throw error
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
