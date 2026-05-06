import type {
  RuntimeModelChatMessage,
  RuntimeModelChatTool,
  RuntimeModelChatToolCall,
  RuntimeModelHTTPTrace,
  RuntimeModelRequestSnapshot,
  RuntimeModelToolChoice,
  RuntimeModelAuthContext,
  RuntimeModelTraceCallback,
  ConfiguredRuntimeModelConfig,
} from './modelConfig.js'
import { buildBackendGatewayChatRequest } from './modelConfig.js'

export interface ModelCallInput {
  messages: RuntimeModelChatMessage[]
  tools?: RuntimeModelChatTool[]
  toolChoice?: RuntimeModelToolChoice
  config: ConfiguredRuntimeModelConfig
  auth?: RuntimeModelAuthContext
  temperature?: number
  jsonMode?: boolean
  onTrace?: RuntimeModelTraceCallback
}

export interface ModelCallResult {
  content: string | null
  tool_calls: RuntimeModelChatToolCall[]
  finish_reason: 'stop' | 'tool_calls' | 'length' | string
  usage?: { input_tokens: number; output_tokens: number }
  rawAssistantMessage: RuntimeModelChatMessage
  trace: RuntimeModelHTTPTrace
}

export async function callModel(input: ModelCallInput): Promise<ModelCallResult> {
  const { config, auth = {}, messages, tools = [], toolChoice, temperature, jsonMode, onTrace } = input

  const request = buildBackendGatewayChatRequest(config, messages, auth, {
    temperature,
    jsonMode,
    tools: tools.length > 0 ? tools : undefined,
    toolChoice: tools.length > 0 ? (toolChoice ?? 'auto') : undefined,
  })

  const started = Date.now()
  const publicRequest = sanitizeRequestSnapshot(request)
  let trace: RuntimeModelHTTPTrace = { request: publicRequest, latencyMs: 0 }
  onTrace?.({ phase: 'request', trace })

  let response: Response
  try {
    response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
    })
  } catch (error) {
    trace = { request: publicRequest, latencyMs: Date.now() - started }
    const message = error instanceof Error ? error.message : String(error)
    onTrace?.({ phase: 'error', trace, error: message })
    throw error
  }

  const responseText = await response.text()
  const latencyMs = Date.now() - started

  const parsedResult = parseGatewayModelResponse(responseText, response.headers.get('content-type') ?? '')
  const parsed = parsedResult.parsedBody

  const content = parsedResult.content
  const rawToolCalls = parsedResult.tool_calls
  const finishReason = parsedResult.finish_reason
  const usage = parsedResult.usage
    ? { input_tokens: parsedResult.usage.prompt_tokens ?? 0, output_tokens: parsedResult.usage.completion_tokens ?? 0 }
    : undefined

  const rawAssistantMessage = parsedResult.rawAssistantMessage

  trace = {
    request: publicRequest,
    response: {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: sanitizeHeaders(Object.fromEntries(response.headers.entries())),
      bodyText: responseText,
      ...(parsed !== undefined ? { parsedBody: parsed } : {}),
      ...(content ? { content } : {}),
    },
    latencyMs,
  }
  onTrace?.({ phase: 'response', trace })

  if (!response.ok) {
    const error = `backend model gateway HTTP ${response.status}: ${responseText}`
    onTrace?.({ phase: 'error', trace, error })
    throw new Error(error)
  }
  if (!parsedResult.ok) {
    const error = parsedResult.error ?? 'backend model gateway returned invalid response'
    onTrace?.({ phase: 'error', trace, error })
    throw new Error(error)
  }
  if (content === null && rawToolCalls.length === 0) {
    const error = 'backend model gateway returned no assistant content and no tool calls'
    onTrace?.({ phase: 'error', trace, error })
    throw new Error(error)
  }

  return { content, tool_calls: rawToolCalls, finish_reason: finishReason, usage, rawAssistantMessage, trace }
}

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

interface ParsedModelGatewayResponse {
  ok: boolean
  parsedBody?: OpenAIChatCompletionResponse | { object: string; choices: Array<{ message: RuntimeModelChatMessage; finish_reason?: string }> }
  content: string | null
  tool_calls: RuntimeModelChatToolCall[]
  finish_reason: 'stop' | 'tool_calls' | 'length' | string
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  rawAssistantMessage: RuntimeModelChatMessage
  error?: string
}

function parseGatewayModelResponse(responseText: string, contentType: string): ParsedModelGatewayResponse {
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
    content,
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
    content: trimmed,
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
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const fn = record.function && typeof record.function === 'object' ? record.function as Record<string, unknown> : undefined
    const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : undefined
    const name = typeof fn?.name === 'string' && fn.name.trim() ? fn.name.trim() : undefined
    const args = typeof fn?.arguments === 'string' ? fn.arguments : '{}'
    if (!id || !name) return []
    return [{ id, type: 'function', function: { name, arguments: args } }]
  })
}

function sanitizeRequestSnapshot(request: RuntimeModelRequestSnapshot): RuntimeModelRequestSnapshot {
  return { ...request, headers: sanitizeHeaders(request.headers) }
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sensitive = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'x-api-key', 'api-key'])
  return Object.fromEntries(Object.entries(headers).filter(([k]) => !sensitive.has(k.toLowerCase())))
}
