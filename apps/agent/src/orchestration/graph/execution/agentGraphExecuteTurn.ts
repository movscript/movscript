import type { RuntimeModelChatMessage } from '../../../model/config/modelConfig.js'
import { runtimeModelTextContent } from '../../../messages/model/modelMessage.js'
import type { AgentApprovalRequest, AgentInputRequest, AgentRunStatus, ToolCall, ToolCallOutcome } from '../../../state/shared/types.js'
import type { AgentGraphInput, AgentGraphTraceInput } from '../types/agentGraphTypes.js'
import { buildCatalogRefreshTrace, isCatalogMutationTool } from '../../model/catalog/agentGraphCatalogRefreshTrace.js'
import {
  buildDefaultDraftApplyCalls,
  remainingPendingApprovalsAfterForcedCalls,
} from '../../tools/rules/draft-apply/agentGraphDraftApplyRules.js'
import {
  buildApprovalStillPendingTrace,
  buildConcurrentReadToolsTrace,
  buildDefaultDraftApplyQueuedTrace,
} from './agentGraphExecuteTrace.js'
import { canExecuteConcurrently } from '../../tools/rules/execution/agentGraphExecutionRules.js'
import type { AgentGraphMakeId } from '../input/agentGraphInputRequests.js'
import { executeToolTurn, type AgentGraphToolTurnResult } from '../../tools/turn/execution/agentGraphToolTurn.js'

type ExecuteTraceBase = Pick<AgentGraphTraceInput, 'roundIndex' | 'roundLabel' | 'roundSource'>

export interface AgentGraphExecuteState {
  toolOutcomes: ToolCallOutcome[]
  warnings: string[]
  requestedCalls: ToolCall[]
  toolCallCount: number
}

export interface AgentGraphExecuteTurnResult {
  history: RuntimeModelChatMessage[]
  toolOutcomes: ToolCallOutcome[]
  warnings: string[]
  toolCallCount: number
  roundIndex: number
  requestedCalls?: ToolCall[]
  status?: AgentRunStatus
  pendingApprovals?: AgentApprovalRequest[]
  pendingInputRequests?: AgentInputRequest[]
}

export async function runAgentGraphExecuteTurn(
  state: AgentGraphExecuteState,
  input: AgentGraphInput,
  options: {
    trace: ExecuteTraceBase
    makeId: AgentGraphMakeId
  },
): Promise<AgentGraphExecuteTurnResult> {
  const toolOutcomes = [...state.toolOutcomes]
  const warnings = [...state.warnings]
  const requestedCalls = state.requestedCalls
  const canRunConcurrently = requestedCalls.length > 1 && requestedCalls.every((call) => canExecuteConcurrently(call, input.registry))

  const executeOne = (call: ToolCall): Promise<AgentGraphToolTurnResult> => executeToolTurn(input, {
    call,
    ...options.trace,
  })

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
      if (call.name === 'draft_apply' && result.outcome.error) break
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
    input.onTrace(buildCatalogRefreshTrace(refreshed, options.trace))
  }

  const turnResults: Array<{ toolCall: ToolCall; content: string; supplementalMessages?: RuntimeModelChatMessage[] }> = results.map((result) => result.turnResult)

  if (canRunConcurrently) {
    input.onTrace(buildConcurrentReadToolsTrace(requestedCalls, options.trace))
  }

  const nextHistory: RuntimeModelChatMessage[] = turnResults.flatMap(({ toolCall, content, supplementalMessages }) => ([
    { role: 'tool', tool_call_id: toolCall.id ?? options.makeId('call'), content: runtimeModelTextContent(content) },
    ...(supplementalMessages ?? []),
  ]))
  const defaultApplyCalls = buildDefaultDraftApplyCalls({
    outcomes: results.map((result) => result.outcome),
    registry: input.registry,
    manifest: input.manifest,
    userMessage: input.userMessage,
    makeId: options.makeId,
  })
  if (defaultApplyCalls.length > 0) {
    input.onTrace(buildDefaultDraftApplyQueuedTrace(defaultApplyCalls, {
      ...options.trace,
      roundSource: 'runtime_rule',
    }))
  }

  const nextToolCallCount = state.toolCallCount + requestedCalls.length
  const nextRoundIndex = options.trace.roundIndex + 1
  if (options.trace.roundIndex === 1 && input.forcedToolCalls && input.forcedToolCalls.length > 0) {
    const remainingApprovals = remainingPendingApprovalsAfterForcedCalls(input.run, results.map((result) => result.outcome))
    if (defaultApplyCalls.length === 0 && remainingApprovals.length > 0) {
      input.onTrace(buildApprovalStillPendingTrace(remainingApprovals, {
        ...options.trace,
        roundSource: 'approval',
      }))
      return {
        history: nextHistory,
        toolOutcomes,
        warnings,
        toolCallCount: nextToolCallCount,
        roundIndex: nextRoundIndex,
        status: 'requires_action',
        pendingApprovals: remainingApprovals,
        pendingInputRequests: [],
      }
    }
    return {
      history: nextHistory,
      toolOutcomes,
      warnings,
      toolCallCount: nextToolCallCount,
      roundIndex: nextRoundIndex,
      ...(defaultApplyCalls.length > 0
        ? { requestedCalls: defaultApplyCalls }
        : { requestedCalls: [] }),
    }
  }

  return {
    history: nextHistory,
    toolOutcomes,
    warnings,
    toolCallCount: nextToolCallCount,
    roundIndex: nextRoundIndex,
    requestedCalls: defaultApplyCalls,
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const reason = signal.reason
  if (reason instanceof Error) throw reason
  const error = new Error(typeof reason === 'string' ? reason : 'Run was cancelled.')
  error.name = 'AbortError'
  throw error
}
