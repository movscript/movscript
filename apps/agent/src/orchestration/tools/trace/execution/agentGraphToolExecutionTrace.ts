import type { ContextTracePayload } from '../../../../context/prompt/turn/modelTurnContext.js'
import { summarizeToolCallTrace } from '../../../../trace/summaries/tool/call/toolTrace.js'
import type { ToolSource } from '../../../../ports/tools/toolExecutionSource.js'
import type { JSONValue, ToolCall } from '../../../../state/shared/types.js'
import type { AgentGraphTraceInput } from '../../../graph/types/agentGraphTypes.js'
import { summarizeResult } from '../result/agentGraphToolResultSummary.js'

type ToolExecutionTraceBase = Pick<AgentGraphTraceInput, 'roundIndex' | 'roundLabel' | 'roundSource' | 'stepId'>

export function buildToolCompletedTrace(input: {
  call: ToolCall
  result: JSONValue | undefined
  source: ToolSource
  sandboxed?: boolean
  pipeline?: JSONValue
  durationMs: number
  trace: ToolExecutionTraceBase
}): AgentGraphTraceInput {
  return {
    kind: 'tool_call',
    title: input.sandboxed ? `Tool sandboxed: ${input.call.name}` : `Tool completed: ${input.call.name}`,
    summary: `${summarizeResult(input.result)} (${input.durationMs}ms)`,
    status: 'completed',
    ...input.trace,
    toolName: input.call.name,
    data: summarizeToolCallTrace({
      call: input.call,
      source: input.source,
      args: input.call.args,
      result: input.result,
      sandboxed: input.sandboxed,
      pipeline: input.pipeline,
      durationMs: input.durationMs,
    }),
    durationMs: input.durationMs,
  }
}

export function buildToolReplayGuardTrace(input: {
  call: ToolCall
  result: JSONValue | undefined
  replayGuard: Record<string, JSONValue>
  durationMs: number
  trace: ToolExecutionTraceBase
}): AgentGraphTraceInput {
  return {
    kind: 'tool_call',
    title: `Tool replay guard reused result: ${input.call.name}`,
    summary: `${summarizeResult(input.result)} reused without re-execution (${input.durationMs}ms)`,
    status: 'completed',
    ...input.trace,
    toolName: input.call.name,
    data: buildToolReplayGuardTraceData(input),
    durationMs: input.durationMs,
  }
}

function buildToolReplayGuardTraceData(input: {
  call: ToolCall
  result: JSONValue | undefined
  replayGuard: Record<string, JSONValue>
  durationMs: number
}): Record<string, JSONValue> {
  return {
    ...summarizeToolCallTrace({
      call: input.call,
      source: 'runtime',
      args: input.call.args,
      result: input.result,
      durationMs: input.durationMs,
    }),
    replayGuard: input.replayGuard,
  }
}

export function buildToolFailedTrace(input: {
  call: ToolCall
  message: string
  errorData?: JSONValue
  pipeline?: JSONValue
  durationMs: number
  trace: ToolExecutionTraceBase
}): AgentGraphTraceInput {
  return {
    kind: 'tool_call',
    title: `Tool call failed: ${input.call.name}`,
    summary: `${input.message} (${input.durationMs}ms)`,
    status: 'failed',
    ...input.trace,
    toolName: input.call.name,
    data: summarizeToolCallTrace({
      call: input.call,
      args: input.call.args,
      error: input.message,
      errorData: input.errorData,
      pipeline: input.pipeline,
      durationMs: input.durationMs,
    }),
    durationMs: input.durationMs,
  }
}

export function buildToolResultDroppedTrace(
  toolName: string,
  droppedTrace: ContextTracePayload,
  trace: ToolExecutionTraceBase,
): AgentGraphTraceInput {
  return {
    kind: 'context',
    title: droppedTrace.title,
    summary: droppedTrace.summary,
    status: 'completed',
    ...trace,
    toolName,
    data: droppedTrace.data,
  }
}
