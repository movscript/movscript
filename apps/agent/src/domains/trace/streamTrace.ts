import { createHash } from 'node:crypto'
import { isRecord } from '../../jsonValue.js'
import type { JSONValue } from '../../state/types.js'

export function summarizeModelStreamTraceData(data: unknown): unknown {
  if (!isRecord(data) || !isRecord(data.stream)) return data
  return {
    ...data,
    stream: summarizeModelStreamTrace(data.stream),
  }
}

export function summarizeModelStreamTrace(stream: Record<string, unknown>): Record<string, JSONValue> {
  const toolCall = isRecord(stream.toolCall) ? summarizeToolCallStreamTrace(stream.toolCall) : undefined
  const toolCalls = Array.isArray(stream.toolCalls)
    ? stream.toolCalls
      .filter(isRecord)
      .map(summarizeToolCallStreamTrace)
    : undefined

  return omitUndefinedJSON({
    kind: typeof stream.kind === 'string' ? stream.kind : undefined,
    ...(typeof stream.delta === 'string' ? summarizeTextPayload('delta', stream.delta) : {}),
    ...(typeof stream.accumulated === 'string' ? summarizeTextPayload('accumulated', stream.accumulated) : {}),
    toolCall,
    ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
    ...(stream.chunk !== undefined ? summarizeJSONPayload('chunk', toJSONValue(stream.chunk)) : {}),
  })
}

function summarizeToolCallStreamTrace(toolCall: Record<string, unknown>): Record<string, JSONValue> {
  return omitUndefinedJSON({
    index: typeof toolCall.index === 'number' && Number.isFinite(toolCall.index) ? toolCall.index : undefined,
    id: typeof toolCall.id === 'string' ? toolCall.id : undefined,
    type: typeof toolCall.type === 'string' ? toolCall.type : undefined,
    name: typeof toolCall.name === 'string' ? toolCall.name : undefined,
    parseStatus: typeof toolCall.parseStatus === 'string' ? toolCall.parseStatus : undefined,
    ...(typeof toolCall.argumentsDelta === 'string' ? summarizeTextPayload('argumentsDelta', toolCall.argumentsDelta) : {}),
    ...(typeof toolCall.argumentsBuffer === 'string' ? summarizeTextPayload('argumentsBuffer', toolCall.argumentsBuffer) : {}),
    ...(toolCall.argumentsJSON !== undefined ? summarizeJSONPayload('argumentsJSON', toJSONValue(toolCall.argumentsJSON)) : {}),
  })
}

function summarizeTextPayload(prefix: string, value: string): Record<string, JSONValue> {
  return {
    [`${prefix}Hash`]: hashString(value),
    [`${prefix}Chars`]: value.length,
    [`${prefix}Mode`]: 'summary',
  }
}

function summarizeJSONPayload(prefix: string, value: JSONValue): Record<string, JSONValue> {
  const json = stableStringify(value)
  return {
    [`${prefix}Hash`]: hashString(json),
    [`${prefix}Chars`]: json.length,
    [`${prefix}Mode`]: 'summary',
  }
}

function omitUndefinedJSON(input: Record<string, unknown>): Record<string, JSONValue> {
  const output: Record<string, JSONValue> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    output[key] = toJSONValue(value)
  }
  return output
}

function toJSONValue(value: unknown): JSONValue {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map(toJSONValue)
  if (value && typeof value === 'object') return omitUndefinedJSON(value as Record<string, unknown>)
  return null
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableJSON(value))
}

function stableJSON(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJSON)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableJSON(item)]),
  )
}

function hashString(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
