import { isJSONRecord } from '../jsonValue.js'
import type { RuntimeModelChatToolCall } from '../model/modelConfig.js'
import type { JSONValue, ToolCall } from '../state/types.js'

export function toToolCall(call: RuntimeModelChatToolCall): ToolCall {
  return {
    id: call.id,
    name: call.function.name,
    ...(call.function.arguments ? { args: parseModelToolCallArgs(call.function.arguments) } : {}),
  }
}

export function parseModelToolCallArgs(input: string): Record<string, JSONValue> {
  try {
    const parsed = JSON.parse(input)
    return isJSONRecord(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}

export function formatToolCallStreamSummary(toolCall: { name?: string; id?: string; argumentsBuffer?: string; parseStatus?: string } | undefined): string | undefined {
  if (!toolCall) return undefined
  const label = toolCall.name || toolCall.id || 'tool'
  const chars = toolCall.argumentsBuffer?.length ?? 0
  return `${label} arguments ${toolCall.parseStatus ?? 'partial'} (${chars} chars)`
}

export function toolCallStreamTraceKey(roundIndex: number, toolCall: { index?: number } | undefined): string {
  return `model-tool-call-stream:${roundIndex}:${toolCall?.index ?? 0}`
}

export function reasoningStreamTraceKey(roundIndex: number): string {
  return `model-reasoning-stream:${roundIndex}`
}
