import { createHash } from 'node:crypto'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import type { AgentApprovalRequest, AgentInputRequest, AgentRunStatus, ToolCall, ToolCallOutcome } from '../../../state/shared/types.js'
import {
  type RuntimeModelChatMessage,
} from '../../../model/config/modelConfig.js'
import { buildForcedToolCallInjection, forcedToolCallTrace } from '../../tools/turn/forced/agentGraphForcedToolCalls.js'
import { runAgentGraphExecuteTurn } from '../execution/agentGraphExecuteTurn.js'
import { callReasoningModelTurn } from '../../model/graph/call/agentGraphModelCall.js'
import {
  toToolCall,
} from '../../model/graph/tool-calls/agentGraphModelToolCalls.js'
import { buildPromptTooLongRecoveryProjection, prepareModelInput } from '../../model/graph/input/agentGraphModelInput.js'
import { composeAgentGraphModelTurn } from '../../model/graph/context/agentGraphModelTurnContext.js'
import {
  buildModelFinalResponseTrace,
  buildModelToolCallsRequestedTrace,
  buildPromptTrace,
  buildRoundContextUpdateTrace,
} from '../../model/graph/trace/agentGraphModelTrace.js'
import {
  runAgentGraphPermissionTurn,
} from '../../model/permissions/turn/agentGraphPermissionTurn.js'
import { buildAgentGraphResult, getLastAssistantContent, type AgentGraphResult } from '../result/agentGraphResult.js'
import type { AgentGraphInput } from '../types/agentGraphTypes.js'

export type { AgentGraphResult } from '../result/agentGraphResult.js'
export type { AgentGraphInput, AgentGraphTraceInput } from '../types/agentGraphTypes.js'

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
    .addNode('permission', async (state) => runPermissionNode(state, input))
    .addNode('execute', async (state) => runExecuteNode(state, input))
    .addEdge(START, 'model')
    .addConditionalEdges('model', (state) => {
      if (state.status || state.error) return END
      return 'permission'
    })
    .addConditionalEdges('permission', (state) => {
      if (state.status || state.error) return END
      return 'execute'
    })
    .addConditionalEdges('execute', (state) => {
      if (state.status || state.error) return END
      if (state.requestedCalls.length > 0) return 'permission'
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
    { recursionLimit: Math.max(10, input.runtimeLimits.maxIterations * 4 + 4) },
  ) as AgentGraphState

  throwIfAborted(input.signal)
  return buildAgentGraphResult(result)
}

async function runModelNode(state: AgentGraphState, input: AgentGraphInput): Promise<Partial<AgentGraphState>> {
  throwIfAborted(input.signal)
  const currentRoundIndex = state.roundIndex
  const roundLabel = `Model turn ${currentRoundIndex}`
  const modelTrace = {
    roundIndex: currentRoundIndex,
    roundLabel,
    roundSource: 'model' as const,
  }
  const threadMessages = input.getThreadMessages?.() ?? input.threadMessages
  const preparedInput = prepareModelInput({
    run: input.run,
    threadMessages,
    ...(input.rootUserMessageId ? { rootUserMessageId: input.rootUserMessageId } : {}),
    ...(input.userMessage ? { userMessage: input.userMessage } : {}),
  })
  if (!preparedInput) {
    return { status: 'failed', error: 'run requires at least one user message' }
  }
  if (currentRoundIndex > input.runtimeLimits.maxIterations) {
    return {
      warnings: [`已达到最大迭代次数 ${input.runtimeLimits.maxIterations}`],
      status: 'completed',
      finalContent: getLastAssistantContent(state.history),
    }
  }

  if (preparedInput.runtimeInputMessages.length > 0) {
    input.onRuntimeInputConsumed?.(preparedInput.runtimeInputMessages, {
      ...modelTrace,
    })
  }
  if (preparedInput.historyTrace) {
    input.onTrace({
      kind: 'context',
      title: preparedInput.historyTrace.title,
      summary: preparedInput.historyTrace.summary,
      status: 'completed',
      ...modelTrace,
      data: preparedInput.historyTrace.data,
    })
  }

  const forcedToolCallInjection = buildForcedToolCallInjection({
    forcedToolCalls: input.forcedToolCalls,
    trace: modelTrace,
    makeId,
  })
  if (forcedToolCallInjection) {
    input.onTrace(forcedToolCallInjection.trace)
    return {
      history: forcedToolCallInjection.history,
      requestedCalls: forcedToolCallInjection.requestedCalls,
      roundIndex: forcedToolCallInjection.roundIndex,
    }
  }

  const modelTurnContext = composeAgentGraphModelTurn(input, {
    preparedInput,
    toolLoopHistory: state.history,
    warnings: state.warnings,
    roundIndex: currentRoundIndex,
    roundLabel,
  })
  input.onTrace(buildRoundContextUpdateTrace(modelTurnContext, modelTrace))
  input.onTrace(buildPromptTrace(modelTurnContext, modelTrace))
  const modelCallResult = await callReasoningModelTurn(input, {
    modelTurnContext,
    trace: modelTrace,
    makeId,
  })
  if (modelCallResult.kind === 'prompt_too_long') {
    const recovery = buildPromptTooLongRecoveryProjection(preparedInput)
    input.onTrace({
      kind: 'context',
      title: 'Prompt too long recovery projected',
      summary: `${recovery.droppedHistoryMessageCount} history message(s) collapsed before retrying the model call.`,
      status: 'completed',
      ...modelTrace,
      data: {
        eventType: 'context.prompt_too_long_recovery',
        contextEventType: 'context.prompt_too_long_recovery',
        droppedHistoryMessageCount: recovery.droppedHistoryMessageCount,
        retainedHistoryMessageCount: recovery.retainedHistoryMessageCount,
        summaryChars: recovery.summaryChars,
        errorHash: hashString(modelCallResult.error),
        errorChars: modelCallResult.error.length,
        strategy: 'collapse_thread_history_retry',
      },
    })
    const recoveryModelTurnContext = composeAgentGraphModelTurn(input, {
      preparedInput: recovery.preparedInput,
      toolLoopHistory: state.history,
      warnings: [...state.warnings, 'prompt.too_long.recovery: collapsed thread history before retry'],
      roundIndex: currentRoundIndex,
      roundLabel,
    })
    input.onTrace(buildRoundContextUpdateTrace(recoveryModelTurnContext, modelTrace))
    input.onTrace(buildPromptTrace(recoveryModelTurnContext, modelTrace))
    const recoveryCallResult = await callReasoningModelTurn(input, {
      modelTurnContext: recoveryModelTurnContext,
      trace: modelTrace,
      makeId,
      deferPromptTooLongRecovery: false,
    })
    if (recoveryCallResult.kind === 'prompt_too_long') {
      return { status: 'failed', error: recoveryCallResult.error }
    }
    return resolveModelCallResult(recoveryCallResult, state, input, recoveryModelTurnContext, modelTrace)
  }
  return resolveModelCallResult(modelCallResult, state, input, modelTurnContext, modelTrace)
}

function resolveModelCallResult(
  modelCallResult: Awaited<ReturnType<typeof callReasoningModelTurn>>,
  state: AgentGraphState,
  input: AgentGraphInput,
  modelTurnContext: ReturnType<typeof composeAgentGraphModelTurn>,
  modelTrace: { roundIndex: number; roundLabel: string; roundSource: 'model' },
): Partial<AgentGraphState> {
  if (modelCallResult.kind === 'failed') {
    return { status: 'failed', error: modelCallResult.error }
  }
  if (modelCallResult.kind === 'requires_action') {
    return {
      status: 'requires_action' as const,
      pendingApprovals: [],
      pendingInputRequests: [modelCallResult.pendingInputRequest],
      requestedCalls: [],
      warnings: [modelCallResult.warning],
    }
  }
  if (modelCallResult.kind === 'prompt_too_long') {
    return { status: 'failed', error: modelCallResult.error }
  }
  const { modelResult } = modelCallResult
  throwIfAborted(input.signal)

  if (modelResult.tool_calls.length > 0) {
    input.onTrace(buildModelToolCallsRequestedTrace(modelResult, modelTrace))
  }

  input.onTrace(buildModelFinalResponseTrace(modelResult, modelTurnContext.contextBundle, modelTrace))

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

function hashString(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

async function runPermissionNode(state: AgentGraphState, input: AgentGraphInput): Promise<Partial<AgentGraphState>> {
  throwIfAborted(input.signal)
  const currentRoundIndex = state.roundIndex
  const roundLabel = `Model turn ${currentRoundIndex}`
  const permissionTrace = {
    roundIndex: currentRoundIndex,
    roundLabel,
    roundSource: 'model' as const,
  }
  return runAgentGraphPermissionTurn(state, input, {
    trace: permissionTrace,
    makeId,
  })
}

async function runExecuteNode(state: AgentGraphState, input: AgentGraphInput): Promise<Partial<AgentGraphState>> {
  throwIfAborted(input.signal)
  const currentRoundIndex = state.roundIndex
  const roundLabel = `Model turn ${currentRoundIndex}`
  const forcedTrace = forcedToolCallTrace({
    roundIndex: currentRoundIndex,
    roundLabel,
    roundSource: 'model' as const,
  }, input.forcedToolCalls)
  const effectiveRoundSource = input.forcedToolCalls && input.forcedToolCalls.length > 0 && currentRoundIndex === forcedTrace.roundIndex
    ? 'runtime_rule' as const
    : 'model' as const
  return runAgentGraphExecuteTurn(state, input, {
    makeId,
    trace: {
      roundIndex: currentRoundIndex,
      roundLabel,
      roundSource: effectiveRoundSource,
    },
  })
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
