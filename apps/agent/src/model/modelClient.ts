import { setTimeout as sleep } from 'node:timers/promises'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type {
  RuntimeModelChatMessage,
  RuntimeModelChatTool,
  RuntimeModelChatToolCall,
  RuntimeModelHTTPTrace,
  RuntimeModelRequestSnapshot,
  RuntimeModelStreamTrace,
  RuntimeModelToolCallStreamTrace,
  RuntimeModelToolChoice,
  RuntimeModelAuthContext,
  RuntimeModelTraceCallback,
  ConfiguredRuntimeModelConfig,
  RuntimeModelAPIKind,
} from './modelConfig.js'
import { buildBackendGatewayChatRequest } from './modelConfig.js'
import { isJSONRecord } from '../jsonValue.js'

export interface ModelCallInput {
  messages: RuntimeModelChatMessage[]
  tools?: RuntimeModelChatTool[]
  toolChoice?: RuntimeModelToolChoice
  config: ConfiguredRuntimeModelConfig
  auth?: RuntimeModelAuthContext
  temperature?: number
  jsonMode?: boolean
  onTrace?: RuntimeModelTraceCallback
  signal?: AbortSignal
  retry?: ModelCallRetryOptions
}

export interface ModelCallRetryOptions {
  maxAttempts?: number
  initialDelayMs?: number
  maxDelayMs?: number
}

export interface ModelCallResult {
  content: string | null
  tool_calls: RuntimeModelChatToolCall[]
  finish_reason: 'stop' | 'tool_calls' | 'length' | string
  usage?: { input_tokens: number; output_tokens: number }
  rawAssistantMessage: RuntimeModelChatMessage
  trace: RuntimeModelHTTPTrace
}

class ModelCallHTTPError extends Error {
  readonly status: number
  readonly bodyText: string

  constructor(status: number, bodyText: string) {
    super(`backend model gateway HTTP ${status}: ${bodyText}`)
    this.name = 'ModelCallHTTPError'
    this.status = status
    this.bodyText = bodyText
  }
}

export async function callModel(input: ModelCallInput): Promise<ModelCallResult> {
  const retry = normalizeModelCallRetryOptions(input.retry)
  let attempt = 1
  let lastError: unknown

  while (attempt <= retry.maxAttempts) {
    try {
      return await callModelOnce(input)
    } catch (error) {
      lastError = error
      if (!shouldRetryModelCall(error) || attempt >= retry.maxAttempts) {
        throw error
      }
      throwIfAborted(input.signal)
      const delayMs = getRetryDelayMs(attempt, retry)
      const reason = error instanceof Error ? error.message : String(error)
      input.onTrace?.({
        phase: 'retry',
        trace: minimalRetryTrace(input),
        error: reason,
        retry: {
          attempt,
          nextAttempt: attempt + 1,
          maxAttempts: retry.maxAttempts,
          delayMs,
          reason,
        },
      })
      await sleep(delayMs)
      attempt++
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function callModelOnce(input: ModelCallInput): Promise<ModelCallResult> {
  switch (runtimeModelAPIKind(input.config)) {
    case 'backend_chat_completions':
      return callBackendChatCompletionsModelOnce(input)
    case 'openai_chat_completions':
      return callOpenAIChatCompletionsModelOnce(input)
    case 'openai_responses':
      return callOpenAIResponsesModelOnce(input)
    case 'anthropic_messages':
      return callAnthropicMessagesModelOnce(input)
  }
}

async function callBackendChatCompletionsModelOnce(input: ModelCallInput): Promise<ModelCallResult> {
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
      signal: input.signal,
    })
  } catch (error) {
    trace = { request: publicRequest, latencyMs: Date.now() - started }
    const message = error instanceof Error ? error.message : String(error)
    onTrace?.({ phase: 'error', trace, error: message })
    throw error
  }

  const responseContentType = response.headers.get('content-type') ?? ''
  const responseHeaders = sanitizeHeaders(Object.fromEntries(response.headers.entries()))
  const responseText = isSSEContent(responseContentType) && response.body
    ? await readStreamingSSEModelResponse(response, {
      started,
      publicRequest,
      responseHeaders,
      onTrace,
      signal: input.signal,
    })
    : await response.text()
  const latencyMs = Date.now() - started

  const parsedResult = parseGatewayModelResponse(responseText, responseContentType)
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
      headers: responseHeaders,
      bodyText: responseText,
      ...(parsed !== undefined ? { parsedBody: parsed } : {}),
      ...(content ? { content } : {}),
    },
    latencyMs,
  }
  onTrace?.({ phase: 'response', trace })

  if (!response.ok) {
    const error = new ModelCallHTTPError(response.status, responseText)
    onTrace?.({ phase: 'error', trace, error: error.message })
    throw error
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

async function callOpenAIChatCompletionsModelOnce(input: ModelCallInput): Promise<ModelCallResult> {
  const request = buildOpenAIChatCompletionsSDKRequest(input)
  const started = Date.now()
  const publicRequest = sanitizeRequestSnapshot(request)
  let trace: RuntimeModelHTTPTrace = { request: publicRequest, latencyMs: 0 }
  input.onTrace?.({ phase: 'request', trace })

  try {
    const client = await createOpenAISDKClient(input)
    const completion = await client.chat.completions.create(sdkRequestBody(request), { signal: input.signal })
    const parsedResult = parseGatewayModelResponse(JSON.stringify(completion), 'application/json')
    trace = {
      request: publicRequest,
      response: {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: {},
        bodyText: JSON.stringify(completion),
        parsedBody: completion,
        ...(parsedResult.content ? { content: parsedResult.content } : {}),
      },
      latencyMs: Date.now() - started,
    }
    input.onTrace?.({ phase: 'response', trace })
    if (parsedResult.content === null && parsedResult.tool_calls.length === 0) {
      throw new Error('backend model gateway returned no assistant content and no tool calls')
    }
    return {
      content: parsedResult.content,
      tool_calls: parsedResult.tool_calls,
      finish_reason: parsedResult.finish_reason,
      usage: parsedResult.usage
        ? { input_tokens: parsedResult.usage.prompt_tokens ?? 0, output_tokens: parsedResult.usage.completion_tokens ?? 0 }
        : undefined,
      rawAssistantMessage: parsedResult.rawAssistantMessage,
      trace,
    }
  } catch (error) {
    trace = { request: publicRequest, latencyMs: Date.now() - started }
    const message = error instanceof Error ? error.message : String(error)
    input.onTrace?.({ phase: 'error', trace, error: message })
    throw error
  }
}

async function callOpenAIResponsesModelOnce(input: ModelCallInput): Promise<ModelCallResult> {
  const request = buildOpenAIResponsesSDKRequest(input)
  const started = Date.now()
  const publicRequest = sanitizeRequestSnapshot(request)
  let trace: RuntimeModelHTTPTrace = { request: publicRequest, latencyMs: 0 }
  input.onTrace?.({ phase: 'request', trace })

  try {
    const client = await createOpenAISDKClient(input)
    const response = await client.responses.create(sdkRequestBody(request), { signal: input.signal })
    const result = normalizeOpenAIResponsesResult(response)
    trace = {
      request: publicRequest,
      response: {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: {},
        bodyText: JSON.stringify(response),
        parsedBody: response,
        ...(result.content ? { content: result.content } : {}),
      },
      latencyMs: Date.now() - started,
    }
    input.onTrace?.({ phase: 'response', trace })
    if (result.content === null && result.tool_calls.length === 0) {
      throw new Error('backend model gateway returned no assistant content and no tool calls')
    }
    return { ...result, trace }
  } catch (error) {
    trace = { request: publicRequest, latencyMs: Date.now() - started }
    const message = error instanceof Error ? error.message : String(error)
    input.onTrace?.({ phase: 'error', trace, error: message })
    throw error
  }
}

async function callAnthropicMessagesModelOnce(input: ModelCallInput): Promise<ModelCallResult> {
  const request = buildAnthropicMessagesSDKRequest(input)
  const started = Date.now()
  const publicRequest = sanitizeRequestSnapshot(request)
  let trace: RuntimeModelHTTPTrace = { request: publicRequest, latencyMs: 0 }
  input.onTrace?.({ phase: 'request', trace })

  try {
    const client = await createAnthropicSDKClient(input)
    const response = await client.messages.create(sdkRequestBody(request), { signal: input.signal })
    const result = normalizeAnthropicMessagesResult(response)
    trace = {
      request: publicRequest,
      response: {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: {},
        bodyText: JSON.stringify(response),
        parsedBody: response,
        ...(result.content ? { content: result.content } : {}),
      },
      latencyMs: Date.now() - started,
    }
    input.onTrace?.({ phase: 'response', trace })
    if (result.content === null && result.tool_calls.length === 0) {
      throw new Error('backend model gateway returned no assistant content and no tool calls')
    }
    return { ...result, trace }
  } catch (error) {
    trace = { request: publicRequest, latencyMs: Date.now() - started }
    const message = error instanceof Error ? error.message : String(error)
    input.onTrace?.({ phase: 'error', trace, error: message })
    throw error
  }
}

function shouldRetryModelCall(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (isAbortError(error)) return false
  if (error.message === 'backend model gateway returned no assistant content and no tool calls') return true
  if (error instanceof ModelCallHTTPError) {
    return RETRYABLE_MODEL_HTTP_STATUSES.has(error.status) || isWrappedRateLimitGatewayError(error)
  }
  return false
}

function normalizeModelCallRetryOptions(input?: ModelCallRetryOptions): Required<ModelCallRetryOptions> {
  return {
    maxAttempts: Math.max(1, Math.trunc(input?.maxAttempts ?? 5)),
    initialDelayMs: Math.max(0, Math.trunc(input?.initialDelayMs ?? 1000)),
    maxDelayMs: Math.max(0, Math.trunc(input?.maxDelayMs ?? 30000)),
  }
}

function getRetryDelayMs(attempt: number, retry: Required<ModelCallRetryOptions>): number {
  const delay = retry.initialDelayMs * (2 ** (attempt - 1))
  return Math.min(delay, retry.maxDelayMs)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('Aborted', 'AbortError')
  }
}

const RETRYABLE_MODEL_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504])

function isWrappedRateLimitGatewayError(error: ModelCallHTTPError): boolean {
  return error.status >= 500
    && /rate[_-]?limit|requests-per-minute limit exceeded|upstream rate limit exceeded|HTTP 429|status\s*429/i.test(error.bodyText)
}

function isAbortError(error: Error): boolean {
  return error.name === 'AbortError'
}

function minimalRetryTrace(input: ModelCallInput): RuntimeModelHTTPTrace {
  const request = buildRequestSnapshotForRetry(input)
  return {
    request: sanitizeRequestSnapshot(request),
    latencyMs: 0,
  }
}

function buildRequestSnapshotForRetry(input: ModelCallInput): RuntimeModelRequestSnapshot {
  switch (runtimeModelAPIKind(input.config)) {
    case 'backend_chat_completions':
      return buildBackendGatewayChatRequest(input.config, input.messages, input.auth ?? {}, {
        temperature: input.temperature,
        jsonMode: input.jsonMode,
        tools: input.tools && input.tools.length > 0 ? input.tools : undefined,
        toolChoice: input.tools && input.tools.length > 0 ? (input.toolChoice ?? 'auto') : undefined,
      })
    case 'openai_chat_completions':
      return buildOpenAIChatCompletionsSDKRequest(input)
    case 'openai_responses':
      return buildOpenAIResponsesSDKRequest(input)
    case 'anthropic_messages':
      return buildAnthropicMessagesSDKRequest(input)
  }
}

function runtimeModelAPIKind(config: ConfiguredRuntimeModelConfig): RuntimeModelAPIKind {
  return config.apiKind ?? 'backend_chat_completions'
}

function modelIdentifier(config: ConfiguredRuntimeModelConfig): string {
  return config.model?.trim() || (config.modelConfigId ? `model_config:${config.modelConfigId}` : 'movscript-default-chat')
}

function buildOpenAIChatCompletionsSDKRequest(input: ModelCallInput): RuntimeModelRequestSnapshot {
  const body: RuntimeModelRequestSnapshot['body'] = {
    model: modelIdentifier(input.config),
    messages: input.jsonMode ? ensureJSONModeMessages(input.messages) : input.messages,
    ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
    ...(input.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    ...(input.tools && input.tools.length > 0 ? { tools: input.tools } : {}),
    ...(input.tools && input.tools.length > 0 ? { tool_choice: input.toolChoice ?? 'auto' } : {}),
  }
  return {
    url: `${resolveStandardModelBaseURL(input.config, input.auth)}/chat/completions`,
    method: 'POST',
    headers: sdkTraceHeaders(input),
    body,
  }
}

function buildOpenAIResponsesSDKRequest(input: ModelCallInput): RuntimeModelRequestSnapshot {
  const sdkBody = {
    model: modelIdentifier(input.config),
    input: toOpenAIResponsesInput(input.messages),
    ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
    ...(input.jsonMode ? { text: { format: { type: 'json_object' } } } : {}),
    ...(input.tools && input.tools.length > 0 ? { tools: input.tools.map(toOpenAIResponsesTool) } : {}),
    ...(input.tools && input.tools.length > 0 && input.toolChoice ? { tool_choice: input.toolChoice } : {}),
  }
  const body: RuntimeModelRequestSnapshot['body'] = {
    model: modelIdentifier(input.config),
    messages: input.messages,
    sdk_body: sdkBody,
  }
  return {
    url: `${resolveStandardModelBaseURL(input.config, input.auth)}/responses`,
    method: 'POST',
    headers: sdkTraceHeaders(input),
    body,
  }
}

function buildAnthropicMessagesSDKRequest(input: ModelCallInput): RuntimeModelRequestSnapshot {
  const { system, messages } = toAnthropicMessages(input.messages)
  const sdkBody = {
    model: modelIdentifier(input.config),
    messages,
    max_tokens: 4096,
    ...(system ? { system } : {}),
    ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
    ...(input.tools && input.tools.length > 0 ? { tools: input.tools.map(toAnthropicTool) } : {}),
    ...(input.tools && input.tools.length > 0 && input.toolChoice ? { tool_choice: toAnthropicToolChoice(input.toolChoice) } : {}),
  }
  const body: RuntimeModelRequestSnapshot['body'] = {
    model: modelIdentifier(input.config),
    messages: input.messages,
    sdk_body: sdkBody,
  }
  return {
    url: `${resolveStandardModelBaseURL(input.config, input.auth)}/messages`,
    method: 'POST',
    headers: sdkTraceHeaders(input),
    body,
  }
}

function sdkRequestBody(request: RuntimeModelRequestSnapshot): unknown {
  return request.body.sdk_body ?? request.body
}

function sdkTraceHeaders(input: ModelCallInput): Record<string, string> {
  return {
    Authorization: `Bearer ${resolveModelAPIKey(input)}`,
    'Content-Type': 'application/json',
  }
}

function resolveModelAPIKey(input: ModelCallInput): string {
  const value = input.auth?.backendAuthToken || process.env.MOVSCRIPT_AGENT_MODEL_API_KEY || process.env.MOVSCRIPT_MODEL_GATEWAY_API_KEY
  if (!value?.trim()) {
    throw new Error(`${runtimeModelAPIKind(input.config)} requires a backend auth token or gateway API key`)
  }
  return value.trim()
}

function resolveStandardModelBaseURL(config: ConfiguredRuntimeModelConfig, auth?: RuntimeModelAuthContext): string {
  const explicit = config.baseURL || process.env.MOVSCRIPT_AGENT_MODEL_BASE_URL
  if (explicit?.trim()) return explicit.trim().replace(/\/+$/, '')
  const raw = auth?.backendAPIBaseURL || process.env.MOVSCRIPT_BACKEND_API_BASE_URL || process.env.MOVSCRIPT_API_BASE_URL || 'http://localhost:8765'
  const normalized = raw.trim().replace(/\/+$/, '')
  if (normalized.endsWith('/v1')) return normalized
  if (normalized.endsWith('/api/v1')) return `${normalized.slice(0, -'/api/v1'.length)}/v1`
  return `${normalized}/v1`
}

async function createOpenAISDKClient(input: ModelCallInput): Promise<any> {
  return new OpenAI({
    apiKey: resolveModelAPIKey(input),
    baseURL: resolveStandardModelBaseURL(input.config, input.auth),
  })
}

async function createAnthropicSDKClient(input: ModelCallInput): Promise<any> {
  return new Anthropic({
    apiKey: resolveModelAPIKey(input),
    baseURL: resolveStandardModelBaseURL(input.config, input.auth),
  })
}

function ensureJSONModeMessages(messages: RuntimeModelChatMessage[]): RuntimeModelChatMessage[] {
  if (messages.some((message) => /\bjson\b/i.test(message.content ?? ''))) return messages
  return [
    {
      role: 'system',
      content: 'JSON mode is enabled. Return only a valid JSON object with no markdown fences.',
    },
    ...messages,
  ]
}

function toOpenAIResponsesInput(messages: RuntimeModelChatMessage[]): unknown[] {
  const input: unknown[] = []
  for (const message of messages) {
    if (message.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: message.tool_call_id,
        output: message.content ?? '',
      })
      continue
    }
    if (message.role === 'assistant' && message.tool_calls?.length) {
      if (message.content) {
        input.push({ role: 'assistant', content: [{ type: 'output_text', text: message.content }] })
      }
      for (const toolCall of message.tool_calls) {
        input.push({
          type: 'function_call',
          call_id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        })
      }
      continue
    }
    input.push({
      role: message.role,
      content: [{ type: message.role === 'assistant' ? 'output_text' : 'input_text', text: message.content ?? '' }],
    })
  }
  return input
}

function toOpenAIResponsesTool(tool: RuntimeModelChatTool): Record<string, unknown> {
  return {
    type: 'function',
    name: tool.function.name,
    ...(tool.function.description ? { description: tool.function.description } : {}),
    ...(tool.function.parameters !== undefined ? { parameters: tool.function.parameters } : {}),
  }
}

function toAnthropicMessages(messages: RuntimeModelChatMessage[]): { system: string; messages: unknown[] } {
  const system: string[] = []
  const out: unknown[] = []
  for (const message of messages) {
    if (message.role === 'system') {
      if (message.content?.trim()) system.push(message.content.trim())
      continue
    }
    if (message.role === 'tool') {
      out.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: message.tool_call_id,
          content: message.content ?? '',
        }],
      })
      continue
    }
    const content: unknown[] = []
    if (message.content) content.push({ type: 'text', text: message.content })
    for (const toolCall of message.tool_calls ?? []) {
      content.push({
        type: 'tool_use',
        id: toolCall.id,
        name: toolCall.function.name,
        input: parseToolArguments(toolCall.function.arguments),
      })
    }
    out.push({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: content.length > 0 ? content : [{ type: 'text', text: '' }],
    })
  }
  return { system: system.join('\n\n'), messages: out }
}

function toAnthropicTool(tool: RuntimeModelChatTool): Record<string, unknown> {
  return {
    name: tool.function.name,
    ...(tool.function.description ? { description: tool.function.description } : {}),
    input_schema: tool.function.parameters ?? { type: 'object', properties: {} },
  }
}

function toAnthropicToolChoice(choice: RuntimeModelToolChoice): unknown {
  if (choice === 'auto') return { type: 'auto' }
  if (choice === 'required') return { type: 'any' }
  if (choice === 'none') return { type: 'none' }
  return { type: 'tool', name: choice.function.name }
}

function parseToolArguments(value: string): unknown {
  if (!value.trim()) return {}
  try {
    return JSON.parse(value) as unknown
  } catch {
    return { arguments: value }
  }
}

function normalizeOpenAIResponsesResult(response: unknown): Omit<ModelCallResult, 'trace'> {
  const record = isJSONRecord(response) ? response : {}
  const output = Array.isArray(record.output) ? record.output : []
  const contentParts: string[] = []
  const toolCalls: RuntimeModelChatToolCall[] = []
  for (const item of output) {
    const itemRecord = isJSONRecord(item) ? item : undefined
    if (!itemRecord) continue
    if (itemRecord.type === 'message') {
      for (const block of Array.isArray(itemRecord.content) ? itemRecord.content : []) {
        const blockRecord = isJSONRecord(block) ? block : undefined
        const text = stringValue(blockRecord?.text)
        if (text) contentParts.push(text)
      }
      continue
    }
    if (itemRecord.type === 'function_call') {
      const id = stringValue(itemRecord.call_id) || stringValue(itemRecord.id)
      const name = stringValue(itemRecord.name)
      if (!id || !name) continue
      toolCalls.push({
        id,
        type: 'function',
        function: {
          name,
          arguments: stringValue(itemRecord.arguments) || '{}',
        },
      })
    }
  }
  const content = typeof record.output_text === 'string' && record.output_text.trim()
    ? record.output_text.trim()
    : contentParts.join('').trim() || null
  const usage = isJSONRecord(record.usage) ? record.usage : undefined
  const rawAssistantMessage: RuntimeModelChatMessage = {
    role: 'assistant',
    content,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  }
  return {
    content,
    tool_calls: toolCalls,
    finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
    usage: usage ? {
      input_tokens: numericValue(usage.input_tokens),
      output_tokens: numericValue(usage.output_tokens),
    } : undefined,
    rawAssistantMessage,
  }
}

function normalizeAnthropicMessagesResult(response: unknown): Omit<ModelCallResult, 'trace'> {
  const record = isJSONRecord(response) ? response : {}
  const contentBlocks = Array.isArray(record.content) ? record.content : []
  const contentParts: string[] = []
  const toolCalls: RuntimeModelChatToolCall[] = []
  for (const block of contentBlocks) {
    const blockRecord = isJSONRecord(block) ? block : undefined
    if (!blockRecord) continue
    if (blockRecord.type === 'text') {
      const text = stringValue(blockRecord.text)
      if (text) contentParts.push(text)
      continue
    }
    if (blockRecord.type === 'tool_use') {
      const id = stringValue(blockRecord.id)
      const name = stringValue(blockRecord.name)
      if (!id || !name) continue
      toolCalls.push({
        id,
        type: 'function',
        function: {
          name,
          arguments: JSON.stringify(blockRecord.input ?? {}),
        },
      })
    }
  }
  const content = contentParts.join('').trim() || null
  const usage = isJSONRecord(record.usage) ? record.usage : undefined
  const rawAssistantMessage: RuntimeModelChatMessage = {
    role: 'assistant',
    content,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  }
  return {
    content,
    tool_calls: toolCalls,
    finish_reason: toolCalls.length > 0 ? 'tool_calls' : stringValue(record.stop_reason) || 'stop',
    usage: usage ? {
      input_tokens: numericValue(usage.input_tokens),
      output_tokens: numericValue(usage.output_tokens),
    } : undefined,
    rawAssistantMessage,
  }
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

function isSSEContent(contentType: string): boolean {
  return contentType.toLowerCase().includes('text/event-stream')
}

async function readStreamingSSEModelResponse(
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

function tryParseJSON(value: string): { ok: true; value: unknown } | { ok: false } {
  if (!value.trim()) return { ok: false }
  try {
    return { ok: true, value: JSON.parse(value) }
  } catch {
    return { ok: false }
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

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function numericValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
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

function sanitizeRequestSnapshot(request: RuntimeModelRequestSnapshot): RuntimeModelRequestSnapshot {
  return { ...request, headers: sanitizeHeaders(request.headers) }
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sensitive = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'x-api-key', 'api-key'])
  return Object.fromEntries(Object.entries(headers).filter(([k]) => !sensitive.has(k.toLowerCase())))
}
