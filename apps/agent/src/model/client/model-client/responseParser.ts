import {
  type RuntimeModelChatMessage,
  type RuntimeModelChatToolCall,
  type RuntimeModelRequestSnapshot,
  type RuntimeModelStreamTrace,
  type RuntimeModelToolCallStreamTrace,
  type RuntimeModelTraceCallback,
} from '../../config/modelConfig.js'
import { runtimeModelTextContent } from '../../../messages/model/modelMessage.js'
import { isJSONRecord } from '../../../shared/json/jsonValue.js'
import { stringValue, tryParseJSON } from './values.js'

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: {
      role?: string
      content?: string | null
      tool_calls?: unknown[]
    }
    finish_reason?: string
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
  }
}

export interface ParsedModelGatewayResponse {
  ok: boolean
  parsedBody?: OpenAIChatCompletionResponse | { object: string; choices: Array<{ message: RuntimeModelChatMessage; finish_reason?: string }> }
  content: string | null
  tool_calls: RuntimeModelChatToolCall[]
  finish_reason: 'stop' | 'tool_calls' | 'length' | string
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  rawAssistantMessage: RuntimeModelChatMessage
  error?: string
}

export function isSSEContent(contentType: string): boolean {
  return contentType.toLowerCase().includes('text/event-stream')
}

export async function readStreamingSSEModelResponse(
  response: Response,
  input: {
    started: number
    publicRequest: RuntimeModelRequestSnapshot
    responseHeaders: Record<string, string>
    onTrace?: RuntimeModelTraceCallback
    signal?: AbortSignal
  },
): Promise<string> {
  if (!response.body) return await response.text()

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let responseText = ''
  let buffer = ''
  let accumulatedReasoning = ''
  let accumulatedContent = ''
  const toolCallParts = new Map<number, { id?: string; type?: string; name?: string; argumentsBuffer: string }>()

  const emitStreamTrace = (stream: RuntimeModelStreamTrace) => {
    input.onTrace?.({
      phase: 'stream',
      trace: {
        request: input.publicRequest,
        response: {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: input.responseHeaders,
          bodyText: stream.delta ?? '',
          ...(stream.chunk !== undefined ? { parsedBody: stream.chunk } : {}),
        },
        latencyMs: Date.now() - input.started,
      },
      stream,
    })
  }

  const processBlock = (block: string) => {
    const eventData = readSSEDataFromBlock(block)
    if (!eventData || eventData === '[DONE]') return

    let chunk: unknown
    try {
      chunk = JSON.parse(eventData)
    } catch {
      emitStreamTrace({ kind: 'raw', delta: eventData })
      return
    }

    const reasoningDelta = extractReasoningDelta(chunk)
    if (reasoningDelta) {
      accumulatedReasoning += reasoningDelta
      emitStreamTrace({ kind: 'reasoning', delta: reasoningDelta, accumulated: accumulatedReasoning, chunk })
    }

    const contentDelta = extractContentDelta(chunk)
    if (contentDelta) {
      accumulatedContent += contentDelta
      emitStreamTrace({ kind: 'content', delta: contentDelta, accumulated: accumulatedContent, chunk })
    }

    const toolCallDeltas = extractToolCallDeltas(chunk)
    if (toolCallDeltas.length > 0) {
      const toolCalls: RuntimeModelToolCallStreamTrace[] = []
      for (const toolDelta of toolCallDeltas) {
        const index = typeof toolDelta.index === 'number' ? toolDelta.index : toolCallParts.size
        const current = toolCallParts.get(index) ?? { argumentsBuffer: '' }
        if (toolDelta.id) current.id = toolDelta.id
        if (toolDelta.type) current.type = toolDelta.type
        if (toolDelta.function?.name) current.name = (current.name ?? '') + toolDelta.function.name
        const argumentsDelta = toolDelta.function?.arguments
        if (argumentsDelta) current.argumentsBuffer += argumentsDelta
        toolCallParts.set(index, current)
        toolCalls.push(toToolCallStreamTrace(index, current, argumentsDelta))
      }
      emitStreamTrace({
        kind: 'tool_call',
        toolCall: toolCalls[toolCalls.length - 1],
        toolCalls,
        chunk,
      })
    }

    if (hasUsageDelta(chunk)) {
      emitStreamTrace({ kind: 'usage', chunk })
    }
  }

  try {
    while (true) {
      throwIfAborted(input.signal)
      const { done, value } = await reader.read()
      throwIfAborted(input.signal)
      if (done) break
      const text = decoder.decode(value, { stream: true })
      responseText += text
      buffer += text

      let normalized = buffer.replace(/\r\n/g, '\n')
      let separatorIndex = normalized.indexOf('\n\n')
      while (separatorIndex >= 0) {
        throwIfAborted(input.signal)
        const block = normalized.slice(0, separatorIndex)
        processBlock(block)
        normalized = normalized.slice(separatorIndex + 2)
        separatorIndex = normalized.indexOf('\n\n')
      }
      buffer = normalized
    }
  } catch (error) {
    if (input.signal?.aborted) {
      await reader.cancel().catch(() => undefined)
      throw input.signal.reason ?? error
    }
    throw error
  }

  const tail = decoder.decode()
  if (tail) {
    responseText += tail
    buffer += tail
  }
  if (buffer.trim()) processBlock(buffer)

  return responseText
}

function readSSEDataFromBlock(block: string): string {
  return block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trimStart())
    .join('\n')
    .trim()
}

function extractReasoningDelta(chunk: unknown): string {
  const record = isJSONRecord(chunk) ? chunk : undefined
  const event = isJSONRecord(record?.event) ? record.event : undefined
  const eventDelta = stringValue(event?.reasoning_delta)
    || stringValue(event?.reasoningContent)
    || stringValue(event?.reasoning)
  if (eventDelta) return eventDelta

  const delta = firstChoiceDelta(record)
  return stringValue(delta?.reasoning_content)
    || stringValue(delta?.reasoning_delta)
    || stringValue(delta?.reasoning)
    || ''
}

function extractContentDelta(chunk: unknown): string {
  const record = isJSONRecord(chunk) ? chunk : undefined
  const event = isJSONRecord(record?.event) ? record.event : undefined
  const eventDelta = stringValue(event?.content_delta)
    || stringValue(event?.contentDelta)
    || stringValue(event?.content)
  if (eventDelta) return eventDelta
  const delta = firstChoiceDelta(record)
  return stringValue(delta?.content)
    || stringValue(delta?.text)
    || stringValue(record?.content_delta)
    || stringValue(record?.contentDelta)
    || stringValue(record?.delta)
}

interface RuntimeModelToolCallDelta {
  index?: number
  id?: string
  type?: string
  function?: {
    name?: string
    arguments?: string
  }
}

function extractToolCallDeltas(chunk: unknown): RuntimeModelToolCallDelta[] {
  const record = isJSONRecord(chunk) ? chunk : undefined
  const event = isJSONRecord(record?.event) ? record.event : undefined
  const eventToolCalls = event?.tool_call_deltas
  const deltaToolCalls = firstChoiceDelta(record)?.tool_calls
  return normalizeToolCallDeltas(
    Array.isArray(deltaToolCalls) && deltaToolCalls.length > 0
      ? deltaToolCalls
      : Array.isArray(eventToolCalls) ? eventToolCalls : [],
  )
}

function normalizeToolCallDeltas(value: unknown[]): RuntimeModelToolCallDelta[] {
  return value.flatMap((item): RuntimeModelToolCallDelta[] => {
    const record = isJSONRecord(item) ? item : undefined
    if (!record) return []
    const fn = isJSONRecord(record.function) ? record.function : undefined
    return [{
      ...(typeof record.index === 'number' ? { index: record.index } : {}),
      ...(typeof record.id === 'string' ? { id: record.id } : {}),
      ...(typeof record.type === 'string' ? { type: record.type } : {}),
      ...(fn ? {
        function: {
          ...(typeof fn.name === 'string' ? { name: fn.name } : {}),
          ...(typeof fn.arguments === 'string' ? { arguments: fn.arguments } : {}),
        },
      } : {}),
    }]
  })
}

function toToolCallStreamTrace(
  index: number,
  current: { id?: string; type?: string; name?: string; argumentsBuffer: string },
  argumentsDelta: string | undefined,
): RuntimeModelToolCallStreamTrace {
  const parsedArguments = tryParseJSON(current.argumentsBuffer)
  return {
    index,
    ...(current.id ? { id: current.id } : {}),
    ...(current.type ? { type: current.type } : {}),
    ...(current.name ? { name: current.name } : {}),
    ...(argumentsDelta ? { argumentsDelta } : {}),
    argumentsBuffer: current.argumentsBuffer,
    ...(parsedArguments.ok ? { argumentsJSON: parsedArguments.value } : {}),
    parseStatus: parsedArguments.ok ? 'valid_json' : 'partial',
  }
}

function hasUsageDelta(chunk: unknown): boolean {
  const record = isJSONRecord(chunk) ? chunk : undefined
  const event = isJSONRecord(record?.event) ? record.event : undefined
  return !!record?.usage || !!event?.usage
}

function firstChoiceDelta(record: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const choices = record?.choices
  if (!Array.isArray(choices)) return undefined
  const choice = isJSONRecord(choices[0]) ? choices[0] : undefined
  return isJSONRecord(choice?.delta) ? choice.delta : undefined
}

export function parseGatewayModelResponse(responseText: string, contentType: string): ParsedModelGatewayResponse {
  const normalizedText = responseText.trimStart()
  if (contentType.toLowerCase().includes('text/event-stream') || normalizedText.startsWith('data:') || responseText.includes('\ndata:')) {
    return parseSSEModelResponse(responseText)
  }

  let parsed: OpenAIChatCompletionResponse | undefined
  try {
    parsed = JSON.parse(responseText) as OpenAIChatCompletionResponse
  } catch {
    // leave undefined
  }

  const choice = parsed?.choices?.[0]
  const message = choice?.message
  const content = typeof message?.content === 'string' ? message.content.trim() || null : null
  const rawToolCalls = normalizeToolCalls(message?.tool_calls)
  const finishReason = choice?.finish_reason ?? (rawToolCalls.length > 0 ? 'tool_calls' : 'stop')
  const rawAssistantMessage: RuntimeModelChatMessage = {
    role: 'assistant',
    content: content ? runtimeModelTextContent(content) : [],
    ...(rawToolCalls.length > 0 ? { tool_calls: rawToolCalls } : {}),
  }
  return {
    ok: parsed !== undefined,
    parsedBody: parsed,
    content,
    tool_calls: rawToolCalls,
    finish_reason: finishReason,
    usage: parsed?.usage,
    rawAssistantMessage,
    ...(parsed === undefined ? { error: 'backend model gateway returned invalid JSON' } : {}),
  }
}

function parseSSEModelResponse(responseText: string): ParsedModelGatewayResponse {
  const chunks: unknown[] = []
  let content = ''
  let finishReason = ''
  let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined
  const toolCallParts = new Map<number, { id?: string; type?: string; name?: string; arguments: string }>()

  for (const eventData of readSSEDataBlocks(responseText)) {
    if (eventData === '[DONE]') break
    let chunk: {
      choices?: Array<{
        delta?: {
          content?: string
          tool_calls?: Array<{
            index?: number
            id?: string
            type?: string
            function?: { name?: string; arguments?: string }
          }>
        }
        finish_reason?: string
      }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    try {
      chunk = JSON.parse(eventData)
    } catch {
      continue
    }
    chunks.push(chunk)
    if (chunk.usage) usage = chunk.usage
    const choice = chunk.choices?.[0]
    const delta = choice?.delta
    if (delta?.content) content += delta.content
    if (choice?.finish_reason) finishReason = choice.finish_reason
    for (const toolDelta of delta?.tool_calls ?? []) {
      const index = typeof toolDelta.index === 'number' ? toolDelta.index : toolCallParts.size
      const current = toolCallParts.get(index) ?? { arguments: '' }
      if (toolDelta.id) current.id = toolDelta.id
      if (toolDelta.type) current.type = toolDelta.type
      if (toolDelta.function?.name) current.name = (current.name ?? '') + toolDelta.function.name
      if (toolDelta.function?.arguments) current.arguments += toolDelta.function.arguments
      toolCallParts.set(index, current)
    }
  }

  const rawToolCalls = Array.from(toolCallParts.entries())
    .sort(([a], [b]) => a - b)
    .flatMap(([, part]) => {
      if (!part.id || !part.name) return []
      return [{ id: part.id, type: 'function' as const, function: { name: part.name, arguments: part.arguments } }]
    })
  const trimmed = content.trim() || null
  const rawAssistantMessage: RuntimeModelChatMessage = {
    role: 'assistant',
    content: trimmed ? runtimeModelTextContent(trimmed) : [],
    ...(rawToolCalls.length > 0 ? { tool_calls: rawToolCalls } : {}),
  }
  const parsedBody = {
    object: 'chat.completion.stream',
    choices: [{ message: rawAssistantMessage, finish_reason: finishReason || (rawToolCalls.length > 0 ? 'tool_calls' : 'stop') }],
  }
  return {
    ok: chunks.length > 0 || responseText.includes('[DONE]'),
    parsedBody,
    content: trimmed,
    tool_calls: rawToolCalls,
    finish_reason: finishReason || (rawToolCalls.length > 0 ? 'tool_calls' : 'stop'),
    usage,
    rawAssistantMessage,
    ...(chunks.length === 0 && !responseText.includes('[DONE]') ? { error: 'backend model gateway returned invalid SSE' } : {}),
  }
}

function readSSEDataBlocks(responseText: string): string[] {
  const blocks = responseText.replace(/\r\n/g, '\n').split(/\n\n+/)
  const out: string[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    const dataLines = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trimStart())
    if (dataLines.length > 0) {
      out.push(dataLines.join('\n').trim())
    }
  }
  return out
}

function normalizeToolCalls(value: unknown): RuntimeModelChatToolCall[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): RuntimeModelChatToolCall[] => {
    if (!isJSONRecord(item)) return []
    const record = item
    const fn = isJSONRecord(record.function) ? record.function : undefined
    const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : undefined
    const name = typeof fn?.name === 'string' && fn.name.trim() ? fn.name.trim() : undefined
    const args = typeof fn?.arguments === 'string' ? fn.arguments : '{}'
    if (!id || !name) return []
    return [{ id, type: 'function', function: { name, arguments: args } }]
  })
}

export function sanitizeRequestSnapshot(request: RuntimeModelRequestSnapshot): RuntimeModelRequestSnapshot {
  return { ...request, headers: sanitizeHeaders(request.headers) }
}

export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sensitive = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'x-api-key', 'api-key'])
  return Object.fromEntries(Object.entries(headers).filter(([k]) => !sensitive.has(k.toLowerCase())))
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('Aborted', 'AbortError')
  }
}
