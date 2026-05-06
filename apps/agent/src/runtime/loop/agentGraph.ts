import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import type { MCPClient } from '../../mcpClient.js'
import type { AgentManifest } from '../manifest/agentManifest.js'
import type { AgentApprovalRequest, AgentDebugContextPanel, AgentInputRequest, AgentMessage, AgentRun, AgentRunPolicy, AgentRunStatus, ResolvedAgentSkill, ResolvedToolCatalog, ToolCall, ToolCallOutcome, JSONValue } from '../types.js'
import type { AgentMemory } from '../memory/types.js'
import type { MemoryManager } from '../memory/memoryManager.js'
import type { AgentDraftStore } from '../store/draftStore.js'
import type { BackendApplyClient } from '../store/backendApplyClient.js'
import type { ConfiguredRuntimeModelConfig, RuntimeModelAuthContext, RuntimeModelChatMessage, RuntimeModelChatToolCall } from '../model/modelConfig.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import type { AgentLoopTraceInput, AgentLoopResult } from './agentLoop.js'
import { buildContext, buildOpenAIChatTools } from './contextBuilder.js'
import { callModel } from './modelClient.js'
import { executeTool } from './toolExecutor.js'
import { applyToolPolicy } from '../tools/toolPolicy.js'
import { buildApplyDraftPreview } from '../store/draftApply.js'
import type { AgentCommandRuntime } from '../commands/commandRouter.js'
import { isProductionOrchestrationAnalyzer } from '../production/orchestrationContract.js'

export interface AgentGraphInput {
  run: AgentRun
  threadMessages: AgentMessage[]
  manifest: AgentManifest
  capabilities: ResolvedToolCatalog
  skills: ResolvedAgentSkill[]
  context: AgentDebugContextPanel
  memories: AgentMemory[]
  warnings: string[]
  command?: AgentCommandRuntime
  rootUserMessageId?: string
  config: ConfiguredRuntimeModelConfig
  auth: RuntimeModelAuthContext
  policy: AgentRunPolicy
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>
  draftStore: AgentDraftStore
  backendApplyClient: BackendApplyClient
  registry: ToolRegistry
  memoryManager?: MemoryManager
  forcedToolCalls?: ToolCall[]
  approvedToolNames?: string[]
  onTrace: (input: AgentLoopTraceInput) => void
  onStepCreate: (type: 'tool_call' | 'message', roundIndex: number, roundLabel: string, roundSource: AgentLoopTraceInput['roundSource'], toolName?: string) => string
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

export async function runAgentGraph(input: AgentGraphInput): Promise<AgentLoopResult> {
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
      return 'model'
    })
    .compile()

  const thread = input.run.threadId
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

  if (result.error) return { status: 'failed', error: result.error }
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
    toolOutcomes: result.toolOutcomes,
    warnings: result.warnings,
  }
}

async function runModelNode(state: AgentGraphState, input: AgentGraphInput): Promise<Partial<AgentGraphState>> {
  const currentRoundIndex = state.roundIndex
  const roundLabel = `Model turn ${currentRoundIndex}`
  const lastUser = input.rootUserMessageId
    ? input.threadMessages.find((message) => message.id === input.rootUserMessageId && message.role === 'user')
    : [...input.threadMessages].reverse().find((message) => message.role === 'user')
  if (!lastUser) {
    return { status: 'failed', error: 'run requires at least one user message' }
  }
  if (currentRoundIndex > input.policy.maxIterations) {
    return {
      warnings: [`已达到最大迭代次数 ${input.policy.maxIterations}`],
      status: 'completed',
      finalContent: getLastAssistantContent(state.history),
    }
  }

  const rootIndex = input.threadMessages.findIndex((message) => message.id === lastUser.id)
  const supplementalUserMessages = rootIndex >= 0
    ? input.threadMessages.slice(rootIndex + 1).filter((message) => message.role === 'user')
    : []
  const effectiveUserMessage = supplementalUserMessages.length > 0
    ? [
      lastUser.content,
      '',
      '[后续用户补充]',
      ...supplementalUserMessages.map((message) => message.content),
    ].join('\n')
    : lastUser.content
  const promptHistory: AgentMessage[] = input.threadMessages.filter((message, index) => (
    message.role !== 'system'
    && message.id !== lastUser.id
    && (rootIndex < 0 || index <= rootIndex || message.role !== 'user')
  ))

  if (currentRoundIndex === 1 && input.forcedToolCalls && input.forcedToolCalls.length > 0) {
    const forcedToolCalls = input.forcedToolCalls.map(normalizeToolCall)
    input.onTrace({
      kind: 'policy',
      title: 'Forced tool calls injected',
      summary: `${forcedToolCalls.length} forced call(s) from createToolRun`,
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

  const { messages: baseMessages } = buildContext({
    manifest: input.manifest,
    skills: input.skills,
    context: input.context,
    tools: input.capabilities,
    policy: input.policy,
    memories: input.memories,
    warnings: state.warnings,
    history: promptHistory,
    userMessage: effectiveUserMessage,
    ...(input.command ? { command: input.command } : {}),
  })
  const messages = [
    ...baseMessages.slice(0, -1),
    ...state.history,
    baseMessages.at(-1)!,
  ]
  const tools = buildOpenAIChatTools(input.capabilities)
  const modelResult = await callModel({
    messages,
    tools,
    toolChoice: tools.length > 0 ? 'auto' : undefined,
    config: input.config,
    auth: input.auth,
    temperature: shouldReturnStructuredJSON(input.manifest) ? 0.1 : undefined,
    jsonMode: shouldReturnStructuredJSON(input.manifest),
    onTrace: (event) => {
      input.onTrace({
        kind: 'model_call',
        title: event.phase === 'request' ? 'Model HTTP request sent' : event.phase === 'response' ? 'Model HTTP response received' : 'Model HTTP call failed',
        summary: event.error ?? (event.trace.response ? `HTTP ${event.trace.response.status} in ${event.trace.latencyMs}ms` : undefined),
        status: event.phase === 'request' ? 'started' : event.phase === 'error' ? 'failed' : event.trace.response?.ok === false ? 'failed' : 'completed',
        roundIndex: currentRoundIndex,
        roundLabel,
        roundSource: 'model',
        data: { phase: event.phase, ...event.trace, ...(event.error ? { error: event.error } : {}) },
      })
    },
  })

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
    return {
      history: [modelResult.rawAssistantMessage],
      status: 'completed',
      finalContent: modelResult.content ?? '',
    }
  }

  return {
    history: [modelResult.rawAssistantMessage],
    requestedCalls: modelResult.tool_calls.map(toToolCall),
    modelContent: modelResult.content,
  }
}

function shouldReturnStructuredJSON(manifest: AgentManifest): boolean {
  return isProductionOrchestrationAnalyzer(manifest.id) || /输出JSON|JSON对象|valid JSON|machine-readable JSON/i.test(manifest.soul ?? '')
}

async function runPolicyNode(state: AgentGraphState, input: AgentGraphInput): Promise<Partial<AgentGraphState>> {
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
    sandboxMode: input.policy.sandboxMode === true,
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
      allowed: policyResult.toolCalls.map((c) => c.name),
      blocked: policyResult.blockedToolCalls.map((b) => ({ name: b.call.name, reason: b.reason })),
    },
  })

  const approvalBlocked = policyResult.blockedToolCalls.filter((b) => b.reason === 'approval_required')
  if (approvalBlocked.length > 0) {
    return {
      pendingApprovals: approvalBlocked.map((blocked) => ({
        id: makeId('approval'),
        runId: input.run.id,
        toolName: blocked.call.name,
        ...(blocked.call.args ? { args: blocked.call.args } : {}),
        reason: blocked.message,
        ...(blocked.tool?.risk ? { risk: blocked.tool.risk } : {}),
        ...(blocked.tool?.permission ? { permission: blocked.tool.permission } : {}),
        ...(blocked.call.name === 'movscript_apply_draft' ? { preview: safeBuildDraftPreview(input.draftStore, blocked.call.args ?? {}) } : {}),
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      status: 'requires_action',
      warnings: policyResult.warnings,
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

function isJSONRecord(value: JSONValue): value is Record<string, JSONValue> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

async function runExecuteNode(state: AgentGraphState, input: AgentGraphInput): Promise<Partial<AgentGraphState>> {
  const currentRoundIndex = state.roundIndex
  const roundLabel = `Model turn ${currentRoundIndex}`
  const effectiveRoundSource = currentRoundIndex === 1 && input.forcedToolCalls && input.forcedToolCalls.length > 0
    ? 'runtime_rule' as const
    : 'model' as const
  const turnResults: Array<{ toolCall: ToolCall; content: string }> = []
  const toolOutcomes = [...state.toolOutcomes]
  const warnings = [...state.warnings]

  for (const call of state.requestedCalls) {
    const stepId = input.onStepCreate('tool_call', currentRoundIndex, roundLabel, effectiveRoundSource, call.name)
    try {
      const execResult = await executeTool(call, {
        run: input.run,
        mcpClient: input.mcpClient,
        draftStore: input.draftStore,
        backendApplyClient: input.backendApplyClient,
        registry: input.registry,
        memoryManager: input.memoryManager,
        sandboxMode: input.policy.sandboxMode === true,
      })
      toolOutcomes.push({ call, ...(execResult.error ? { error: execResult.error } : { result: execResult.result }) })
      input.onStepComplete(stepId, execResult.result, undefined, execResult.sandboxed)
      input.onTrace({
        kind: 'tool_call',
        title: execResult.sandboxed ? `Tool sandboxed: ${call.name}` : `Tool completed: ${call.name}`,
        summary: summarizeResult(execResult.result),
        status: 'completed',
        roundIndex: currentRoundIndex,
        roundLabel,
        roundSource: effectiveRoundSource,
        stepId,
        toolName: call.name,
        data: { source: execResult.source, result: execResult.result, sandboxed: execResult.sandboxed },
      })
      turnResults.push({
        toolCall: normalizeToolCall(call),
        content: JSON.stringify({ result: execResult.result ?? null, call: { name: formatToolNameForDisplay(call.name), args: call.args } }),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      warnings.push(`${formatToolNameForDisplay(call.name)} 未完成：${message}`)
      toolOutcomes.push({ call, error: message })
      input.onStepComplete(stepId, undefined, message)
      input.onTrace({
        kind: 'tool_call',
        title: `Tool call failed: ${call.name}`,
        summary: message,
        status: 'failed',
        roundIndex: currentRoundIndex,
        roundLabel,
        roundSource: effectiveRoundSource,
        stepId,
        toolName: call.name,
        data: { error: message },
      })
      turnResults.push({
        toolCall: normalizeToolCall(call),
        content: JSON.stringify({ error: message, call: { name: formatToolNameForDisplay(call.name), args: call.args } }),
      })
    }
  }

  const nextHistory: RuntimeModelChatMessage[] = turnResults.flatMap(({ toolCall, content }) => ([
    { role: 'tool', tool_call_id: toolCall.id ?? makeId('call'), content },
  ]))

  if (currentRoundIndex === 1 && input.forcedToolCalls && input.forcedToolCalls.length > 0) {
    return {
      history: nextHistory,
      toolOutcomes,
      warnings,
      toolCallCount: state.toolCallCount + state.requestedCalls.length,
      roundIndex: currentRoundIndex + 1,
      status: 'completed',
      finalContent: '',
    }
  }

  return {
    history: nextHistory,
    toolOutcomes,
    warnings,
    toolCallCount: state.toolCallCount + state.requestedCalls.length,
    roundIndex: currentRoundIndex + 1,
  }
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

function parseArgs(input: string): Record<string, JSONValue> {
  try {
    const parsed = JSON.parse(input)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, JSONValue>
      : {}
  } catch {
    return {}
  }
}

function formatToolNameForDisplay(name: string): string {
  return name.startsWith('movscript_') ? `movscript.${name.slice('movscript_'.length)}` : name
}

function getLastAssistantContent(history: RuntimeModelChatMessage[]): string | undefined {
  return [...history].reverse().find((message) => message.role === 'assistant' && typeof message.content === 'string' && message.content.trim())?.content ?? undefined
}

function summarizeResult(value: JSONValue | undefined): string {
  if (value === undefined || value === null) return 'null'
  if (typeof value !== 'object') return String(value).slice(0, 180)
  if (Array.isArray(value)) return `${value.length} item(s)`
  const keys = Object.keys(value)
  const status = typeof value.status === 'string' ? `${value.status}; ` : ''
  return `${status}${keys.length} key(s): ${keys.slice(0, 6).join(', ')}`
}

function safeBuildDraftPreview(draftStore: AgentDraftStore, args: Record<string, JSONValue>): JSONValue | undefined {
  try {
    return buildApplyDraftPreview(draftStore, args as Record<string, unknown>) as unknown as JSONValue
  } catch {
    return undefined
  }
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
