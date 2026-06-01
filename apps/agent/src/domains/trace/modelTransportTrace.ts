import { createHash } from 'node:crypto'
import type { RuntimeModelHTTPTrace } from '../../model/modelConfig.js'
import type { JSONValue } from '../../state/types.js'

export type ModelTransportTraceSummary = Record<string, JSONValue>

export function summarizeModelHTTPTrace(trace: RuntimeModelHTTPTrace): ModelTransportTraceSummary {
  return omitUndefinedJSON({
    request: summarizeModelHTTPRequest(trace.request),
    ...(trace.response ? { response: summarizeModelHTTPResponse(trace.response) } : {}),
    latencyMs: trace.latencyMs,
  })
}

function summarizeModelHTTPRequest(request: RuntimeModelHTTPTrace['request']): Record<string, JSONValue> {
  const rawBody = jsonRecord((request as { body?: unknown }).body)
  const submittedBody = jsonRecord(rawBody?.sdk_body) ?? rawBody
  return omitUndefinedJSON({
    url: request.url,
    method: request.method,
    headers: request.headers as Record<string, string>,
    ...(rawBody ? { body: summarizeModelRequestBody(rawBody, submittedBody) } : {}),
  })
}

function summarizeModelRequestBody(rawBody: Record<string, unknown>, submittedBody: Record<string, unknown> | undefined): Record<string, JSONValue> {
  const body = submittedBody ?? rawBody
  const rawBodyJSON = stableStringify(rawBody)
  const messages = arrayValue(body.messages)
  const rawMessages = arrayValue(rawBody.messages)
  const input = arrayValue(body.input)
  const tools = arrayValue(body.tools) ?? arrayValue(rawBody.tools)
  return omitUndefinedJSON({
    model: stringValue(body.model) ?? stringValue(rawBody.model),
    messageCount: messages?.length ?? input?.length ?? rawMessages?.length,
    toolCount: tools?.length,
    bodyHash: hashString(rawBodyJSON),
    bodyChars: rawBodyJSON.length,
    contentMode: 'summary',
  })
}

function summarizeModelHTTPResponse(response: NonNullable<RuntimeModelHTTPTrace['response']>): Record<string, JSONValue> {
  const bodyText = response.bodyText
  return omitUndefinedJSON({
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    headers: response.headers,
    bodyTextHash: hashString(bodyText),
    bodyTextChars: bodyText.length,
    parsedBody: summarizeParsedModelBody(response.parsedBody),
    contentChars: response.content?.length,
    contentMode: 'summary',
  })
}

function summarizeParsedModelBody(value: unknown): Record<string, JSONValue> | undefined {
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    return { type: 'array', itemCount: value.length }
  }
  const record = value as Record<string, unknown>
  return omitUndefinedJSON({
    type: 'object',
    id: stringValue(record.id),
    object: stringValue(record.object),
    choiceCount: arrayValue(record.choices)?.length,
    outputCount: arrayValue(record.output)?.length,
    contentBlockCount: arrayValue(record.content)?.length,
  })
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
  if (value && typeof value === 'object') {
    return omitUndefinedJSON(value as Record<string, unknown>)
  }
  return null
}

function jsonRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
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
