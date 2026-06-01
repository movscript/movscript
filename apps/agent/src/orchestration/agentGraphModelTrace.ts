import type { ModelCallResult } from '../model/modelClient.js'
import type { RuntimeModelTraceCallback } from '../model/modelConfig.js'
import type { RuntimeModelCapabilityRoute } from '../model/modelRouter.js'
import { contextBundleTraceData } from '../domains/trace/contextBundleTrace.js'
import { summarizeModelHTTPTrace } from '../domains/trace/modelTransportTrace.js'
import type { ComposedModelTurnContext } from '../contextManager/contextManager.js'
import type { ContextBundle } from '../contextManager/types.js'
import type { AgentGraphTraceInput } from './agentGraphTypes.js'
import {
  formatToolCallStreamSummary,
  parseModelToolCallArgs,
  reasoningStreamTraceKey,
  toolCallStreamTraceKey,
} from './agentGraphModelToolCalls.js'

type ModelRoundTraceBase = Pick<AgentGraphTraceInput, 'roundIndex' | 'roundLabel' | 'roundSource'>

export function buildPromptTrace(
  modelTurnContext: ComposedModelTurnContext,
  trace: ModelRoundTraceBase,
): AgentGraphTraceInput {
  return {
    kind: 'prompt',
    title: modelTurnContext.promptTrace.title,
    summary: modelTurnContext.promptTrace.summary,
    status: 'completed',
    ...trace,
    data: {
      ...modelTurnContext.promptTrace.data,
      ...contextBundleTraceData(modelTurnContext.contextBundle),
    },
  }
}

export function buildModelRouteSelectedTrace(
  route: RuntimeModelCapabilityRoute,
  contextBundle: ContextBundle,
  trace: ModelRoundTraceBase,
): AgentGraphTraceInput {
  return {
    kind: 'model_call',
    title: 'Model route selected',
    summary: `reasoning -> ${route.provider}:${route.config.model}`,
    status: 'info',
    ...trace,
    data: {
      capability: route.capability,
      ...contextBundleTraceData(contextBundle),
      provider: route.provider,
      modelConfigId: route.config.modelConfigId,
      model: route.config.model,
      source: route.source,
    },
  }
}

export function buildModelRoundStartedTrace(input: {
  route: RuntimeModelCapabilityRoute
  contextBundle: ContextBundle
  messageCount: number
  toolCount: number
  trace: ModelRoundTraceBase
}): AgentGraphTraceInput {
  return {
    kind: 'model_call',
    title: 'Model round started',
    summary: `Round ${input.trace.roundIndex} started with ${input.route.config.model}`,
    status: 'started',
    ...input.trace,
    data: {
      eventType: 'model.round.started',
      ...contextBundleTraceData(input.contextBundle),
      roundIndex: input.trace.roundIndex,
      modelConfigId: input.route.config.modelConfigId,
      model: input.route.config.model,
      messageCount: input.messageCount,
      toolCount: input.toolCount,
    },
  }
}

export function createModelTraceCallback(input: {
  onTrace: (trace: AgentGraphTraceInput) => void
  contextBundle: ContextBundle
  trace: ModelRoundTraceBase
}): RuntimeModelTraceCallback {
  return (event) => {
    if (event.phase === 'stream') {
      const isToolCallStream = event.stream?.kind === 'tool_call'
      const isReasoningStream = event.stream?.kind === 'reasoning'
      const volatileKey = isToolCallStream
        ? toolCallStreamTraceKey(input.trace.roundIndex, event.stream?.toolCall)
        : isReasoningStream ? reasoningStreamTraceKey(input.trace.roundIndex)
        : undefined
      input.onTrace({
        kind: isReasoningStream ? 'reasoning' : isToolCallStream ? 'tool_call' : 'model_call',
        title: isReasoningStream
          ? 'Model reasoning delta'
          : isToolCallStream ? 'Model tool call delta' : 'Assistant progress update',
        summary: isToolCallStream
          ? formatToolCallStreamSummary(event.stream?.toolCall)
          : event.stream?.delta ? event.stream.delta.slice(0, 180) : undefined,
        status: 'info',
        ...input.trace,
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
      ...input.trace,
      data: {
        phase: event.phase,
        ...contextBundleTraceData(input.contextBundle),
        ...summarizeModelHTTPTrace(event.trace),
        ...(event.error ? { error: event.error } : {}),
        ...(event.retry ? { retry: event.retry } : {}),
      },
      ...(event.phase === 'response' || event.phase === 'error' ? { durationMs: event.trace.latencyMs } : {}),
    })
  }
}

export function buildModelRoundCompletedTrace(input: {
  result: ModelCallResult
  contextBundle: ContextBundle
  durationMs: number
  trace: ModelRoundTraceBase
}): AgentGraphTraceInput {
  return {
    kind: 'model_call',
    title: 'Model round completed',
    summary: input.result.finish_reason === 'tool_calls'
      ? `Round ${input.trace.roundIndex} requested ${input.result.tool_calls.length} tool call(s) in ${input.durationMs}ms`
      : `Round ${input.trace.roundIndex} finished with ${input.result.finish_reason} in ${input.durationMs}ms`,
    status: 'completed',
    ...input.trace,
    data: {
      eventType: 'model.round.completed',
      ...contextBundleTraceData(input.contextBundle),
      roundIndex: input.trace.roundIndex,
      finish_reason: input.result.finish_reason,
      tool_calls: input.result.tool_calls.map((tc) => ({ id: tc.id, name: tc.function.name })),
      content_chars: input.result.content?.length ?? 0,
      usage: input.result.usage,
      durationMs: input.durationMs,
    },
    durationMs: input.durationMs,
  }
}

export function buildModelToolCallsRequestedTrace(
  result: ModelCallResult,
  trace: ModelRoundTraceBase,
): AgentGraphTraceInput {
  return {
    kind: 'model_call',
    title: 'Model tool calls requested',
    summary: `${result.tool_calls.length} tool call(s) requested`,
    status: 'completed',
    ...trace,
    data: {
      eventType: 'model.tool_calls.requested',
      tool_calls: result.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        args: parseModelToolCallArgs(tc.function.arguments),
      })),
    },
  }
}

export function buildModelFinalResponseTrace(
  result: ModelCallResult,
  contextBundle: ContextBundle,
  trace: ModelRoundTraceBase,
): AgentGraphTraceInput {
  return {
    kind: 'model_call',
    title: 'Model HTTP response received',
    summary: result.finish_reason === 'tool_calls'
      ? `${result.tool_calls.length} tool call(s) requested`
      : `finish_reason=${result.finish_reason}`,
    status: 'completed',
    ...trace,
    data: {
      finish_reason: result.finish_reason,
      ...contextBundleTraceData(contextBundle),
      tool_calls: result.tool_calls.map((tc) => ({ id: tc.id, name: tc.function.name })),
      content_chars: result.content?.length ?? 0,
      usage: result.usage,
    },
  }
}
