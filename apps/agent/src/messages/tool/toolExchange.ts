import { isJSONValue, isRecord } from '../../shared/json/jsonValue.js'
import { isValidAgentEntityId, isValidAgentProjectId } from '../../context/runtime/runtimeContext.js'
import type { RuntimeModelChatMessage, RuntimeModelChatToolCall } from '../../model/config/modelConfig.js'
import type { JSONValue, ToolCall, ToolCallOutcome } from '../../state/shared/types.js'
import { runtimeModelTextContent } from '../model/modelMessage.js'

export function appendAssistantToolExchange(
  messages: RuntimeModelChatMessage[],
  assistantMessage: RuntimeModelChatMessage | undefined,
  outcomes: ToolCallOutcome[],
  requestedToolCalls: ToolCall[] = [],
): RuntimeModelChatMessage[] {
  const toolCalls = assistantMessage?.tool_calls?.length
    ? assistantMessage.tool_calls
    : requestedToolCalls.map(toRuntimeToolCall)
  if (toolCalls.length === 0 || outcomes.length === 0) return messages
  const assistantContent = assistantMessage?.tool_calls?.length ? assistantMessage.content : []
  return [
    ...messages,
    {
      role: 'assistant',
      content: assistantContent,
      tool_calls: toolCalls,
    },
    ...matchToolOutcomes(toolCalls, outcomes).map(({ toolCall, outcome }) => ({
      role: 'tool' as const,
      tool_call_id: toolCall.id,
      content: runtimeModelTextContent(JSON.stringify(outcome.error
        ? { error: outcome.error, call: outcome.call }
        : { result: outcome.result ?? null, call: outcome.call })),
    })),
  ]
}

export function extractRequestedToolCallsFromAssistantContent(content: string): ToolCall[] {
  const parsed = parseAssistantJSON(content)
  if (!isRecord(parsed)) return []
  const rawToolCalls = Array.isArray(parsed.tool_calls)
    ? parsed.tool_calls
    : Array.isArray(parsed.toolCalls)
      ? parsed.toolCalls
      : isRecord(parsed.tool_call)
        ? [parsed.tool_call]
        : isRecord(parsed.toolCall)
          ? [parsed.toolCall]
          : typeof parsed.name === 'string' || typeof parsed.tool_name === 'string'
            ? [parsed]
            : []
  return dedupeToolCalls(rawToolCalls.flatMap(normalizeAssistantToolCall))
}

function toRuntimeToolCall(call: ToolCall, index: number): RuntimeModelChatToolCall {
  return {
    id: `call_runtime_${index + 1}`,
    type: 'function',
    function: {
      name: call.name,
      arguments: JSON.stringify(call.args ?? {}),
    },
  }
}

function matchToolOutcomes(
  toolCalls: RuntimeModelChatToolCall[],
  outcomes: ToolCallOutcome[],
): Array<{ toolCall: RuntimeModelChatToolCall; outcome: ToolCallOutcome }> {
  const remaining = [...toolCalls]
  return outcomes.flatMap((outcome) => {
    const index = remaining.findIndex((toolCall) => toolCall.function.name === outcome.call.name)
    const toolCall = index >= 0 ? remaining.splice(index, 1)[0] : remaining.shift()
    return toolCall ? [{ toolCall, outcome }] : []
  })
}

function parseAssistantJSON(content: string): unknown {
  const trimmed = content.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

function normalizeAssistantToolCall(value: unknown): ToolCall[] {
  if (!isRecord(value)) return []
  const name = typeof value.name === 'string' && value.name.trim()
    ? value.name.trim()
    : typeof value.tool_name === 'string' && value.tool_name.trim()
      ? value.tool_name.trim()
      : isRecord(value.function) && typeof value.function.name === 'string' && value.function.name.trim()
        ? value.function.name.trim()
        : undefined
  if (!name) return []

  const rawArgs = isRecord(value.parameters)
    ? value.parameters
    : isRecord(value.args)
      ? value.args
      : isRecord(value.arguments)
        ? value.arguments
        : isRecord(value.function) && typeof value.function.arguments === 'string'
          ? parseArgumentsObject(value.function.arguments)
          : typeof value.arguments === 'string'
            ? parseArgumentsObject(value.arguments)
            : undefined

  return [{
    name,
    ...(isRecord(rawArgs) ? { args: normalizeAssistantToolArgs(rawArgs) } : {}),
  }]
}

function normalizeAssistantToolArgs(args: Record<string, unknown>): Record<string, JSONValue> {
  const output: Record<string, JSONValue> = {}
  for (const [key, value] of Object.entries(args)) {
    if ((key === 'projectId' || key === 'project_id') && !isJSONValue(value)) continue
    if (isJSONValue(value)) output[key] = value
  }
  const projectId = isValidAgentProjectId(args.projectId)
    ? args.projectId
    : isValidAgentProjectId(args.project_id)
      ? args.project_id
      : undefined
  if (projectId !== undefined) output.projectId = projectId
  else delete output.projectId
  if (!isValidAgentProjectId(output.project_id)) delete output.project_id
  return output
}

function parseArgumentsObject(value: string): unknown {
  if (!value.trim()) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function dedupeToolCalls(calls: ToolCall[]): ToolCall[] {
  const seen = new Set<string>()
  const result: ToolCall[] = []
  for (const call of calls) {
    const key = JSON.stringify([call.name, call.args ?? {}])
    if (seen.has(key)) continue
    seen.add(key)
    result.push(call)
  }
  return result
}
