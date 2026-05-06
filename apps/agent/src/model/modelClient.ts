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
  const usage = parsed?.usage
    ? { input_tokens: parsed.usage.prompt_tokens ?? 0, output_tokens: parsed.usage.completion_tokens ?? 0 }
    : undefined

  const rawAssistantMessage: RuntimeModelChatMessage = {
    role: 'assistant',
    content,
    ...(rawToolCalls.length > 0 ? { tool_calls: rawToolCalls } : {}),
  }

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
  if (parsed === undefined) {
    const error = 'backend model gateway returned invalid JSON'
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
