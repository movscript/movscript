import { setTimeout as sleep } from 'node:timers/promises'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import {
  type RuntimeModelContentPart,
  RuntimeModelChatMessage,
  RuntimeModelChatTool,
  RuntimeModelChatToolCall,
  RuntimeModelHTTPTrace,
  RuntimeModelRequestSnapshot,
  RuntimeModelToolChoice,
  RuntimeModelAuthContext,
  RuntimeModelTraceCallback,
  ConfiguredRuntimeModelConfig,
  RuntimeModelAPIKind,
} from '../config/modelConfig.js'
import {
  ensureJSONModeMessages,
  runtimeModelContentText,
} from '../../messages/model/modelMessage.js'
import { isJSONRecord } from '../../shared/json/jsonValue.js'
import { toAnthropicToolInputSchema, toOpenAIToolParameters } from '../schema/providerToolSchema.js'
import {
  isSSEContent,
  parseGatewayModelResponse,
  readStreamingSSEModelResponse,
  sanitizeHeaders,
  sanitizeRequestSnapshot,
} from './model-client/responseParser.js'
import {
  normalizeAnthropicMessagesResult,
  normalizeOpenAIResponsesResult,
} from './model-client/sdkResponseParser.js'

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
    case 'openai_chat_completions':
      return callOpenAIChatCompletionsModelOnce(input)
    case 'openai_responses':
      return callOpenAIResponsesModelOnce(input)
    case 'anthropic_messages':
      return callAnthropicMessagesModelOnce(input)
  }
}

async function callOpenAIChatCompletionsModelOnce(input: ModelCallInput): Promise<ModelCallResult> {
  const request = buildOpenAIChatCompletionsSDKRequest(input)
  const started = Date.now()
  const publicRequest = sanitizeRequestSnapshot(request)
  let trace: RuntimeModelHTTPTrace = { request: publicRequest, latencyMs: 0 }
  input.onTrace?.({ phase: 'request', trace })

  let response: Response
  try {
    response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(sdkRequestBody(request)),
      signal: input.signal,
    })
  } catch (error) {
    trace = { request: publicRequest, latencyMs: Date.now() - started }
    const message = error instanceof Error ? error.message : String(error)
    input.onTrace?.({ phase: 'error', trace, error: message })
    throw error
  }

  const responseContentType = response.headers.get('content-type') ?? ''
  const responseHeaders = sanitizeHeaders(Object.fromEntries(response.headers.entries()))
  const responseText = isSSEContent(responseContentType) && response.body
    ? await readStreamingSSEModelResponse(response, {
      started,
      publicRequest,
      responseHeaders,
      onTrace: input.onTrace,
      signal: input.signal,
    })
    : await response.text()
  const parsedResult = parseGatewayModelResponse(responseText, responseContentType)
  trace = {
    request: publicRequest,
    response: {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: responseHeaders,
      bodyText: responseText,
      ...(parsedResult.parsedBody !== undefined ? { parsedBody: parsedResult.parsedBody } : {}),
      ...(parsedResult.content ? { content: parsedResult.content } : {}),
    },
    latencyMs: Date.now() - started,
  }
  input.onTrace?.({ phase: 'response', trace })

  if (!response.ok) {
    const error = new ModelCallHTTPError(response.status, responseText)
    input.onTrace?.({ phase: 'error', trace, error: error.message })
    throw error
  }
  if (!parsedResult.ok) {
    const error = parsedResult.error ?? 'backend model gateway returned invalid response'
    input.onTrace?.({ phase: 'error', trace, error })
    throw new Error(error)
  }
  if (parsedResult.content === null && parsedResult.tool_calls.length === 0) {
    const error = 'backend model gateway returned no assistant content and no tool calls'
    input.onTrace?.({ phase: 'error', trace, error })
    throw new Error(error)
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

export function isPromptTooLongModelError(error: unknown): boolean {
  const message = error instanceof ModelCallHTTPError
    ? `${error.status} ${error.bodyText} ${error.message}`
    : error instanceof Error
      ? error.message
      : String(error)
  if (error instanceof ModelCallHTTPError && error.status === 413) return true
  return /prompt[_\s-]*too[_\s-]*long|context[_\s-]*length|context window|maximum context|max context|too many tokens|input is too long|request too large|HTTP\s*413|status\s*413/i.test(message)
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
    case 'openai_chat_completions':
      return buildOpenAIChatCompletionsSDKRequest(input)
    case 'openai_responses':
      return buildOpenAIResponsesSDKRequest(input)
    case 'anthropic_messages':
      return buildAnthropicMessagesSDKRequest(input)
  }
}

function runtimeModelAPIKind(config: ConfiguredRuntimeModelConfig): RuntimeModelAPIKind {
  return config.apiKind ?? 'openai_chat_completions'
}

function modelIdentifier(config: ConfiguredRuntimeModelConfig): string {
  return config.model?.trim() || (config.modelConfigId ? `model_config:${config.modelConfigId}` : 'movscript-default-chat')
}

function buildOpenAIChatCompletionsSDKRequest(input: ModelCallInput): RuntimeModelRequestSnapshot {
  const messages = input.jsonMode ? ensureJSONModeMessages(input.messages) : input.messages
  const body: RuntimeModelRequestSnapshot['body'] = {
    model: modelIdentifier(input.config),
    messages: toOpenAIChatCompletionsMessages(messages),
    stream: true,
    stream_options: { include_usage: true },
    ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
    ...(input.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    ...(input.tools && input.tools.length > 0 ? { tools: input.tools.map(toOpenAIChatCompletionsTool) } : {}),
    ...(input.tools && input.tools.length > 0 ? { tool_choice: input.toolChoice ?? 'auto' } : {}),
  }
  return {
    url: `${resolveStandardModelBaseURL(input.config, input.auth)}/chat/completions`,
    method: 'POST',
    headers: sdkTraceHeaders(input),
    body,
  }
}

function toOpenAIChatCompletionsMessages(messages: RuntimeModelChatMessage[]): unknown[] {
  return messages.map((message) => {
    const content = message.role === 'tool'
      ? runtimeModelContentText(message.content)
      : toOpenAIChatCompletionsContent(message)
    return {
      role: message.role,
      content,
      ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
      ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}),
    }
  })
}

function toOpenAIChatCompletionsContent(message: RuntimeModelChatMessage): unknown {
  if (message.tool_calls?.length && message.content.length === 0) return null
  const parts = message.content.flatMap(toOpenAIChatCompletionsContentPart)
  if (parts.length === 0) return ''
  if (parts.length === 1 && isOpenAITextPart(parts[0])) return parts[0].text
  return parts
}

function toOpenAIChatCompletionsContentPart(part: RuntimeModelContentPart): unknown[] {
  if (part.type === 'text') return part.text ? [{ type: 'text', text: part.text }] : []
  const image = openAIImagePayload(part)
  return image ? [{ type: 'image_url', image_url: image }] : []
}

function isOpenAITextPart(value: unknown): value is { type: 'text'; text: string } {
  return isJSONRecord(value) && value.type === 'text' && typeof value.text === 'string'
}

function toOpenAIChatCompletionsTool(tool: RuntimeModelChatTool): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name: tool.function.name,
      ...(tool.function.description ? { description: tool.function.description } : {}),
      parameters: toOpenAIToolParameters(tool.function.parameters),
    },
  }
}

function buildOpenAIResponsesSDKRequest(input: ModelCallInput): RuntimeModelRequestSnapshot {
  const sdkBody = {
    model: modelIdentifier(input.config),
    input: toOpenAIResponsesInput(input.messages),
    ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
    ...(input.jsonMode ? { text: { format: { type: 'json_object' } } } : {}),
    ...(input.tools && input.tools.length > 0 ? { tools: input.tools.map(toOpenAIResponsesTool) } : {}),
    ...(input.tools && input.tools.length > 0 && input.toolChoice ? { tool_choice: toOpenAIResponsesToolChoice(input.toolChoice) } : {}),
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
    url: `${resolveAnthropicMessagesBaseURL(input.config, input.auth)}/messages`,
    method: 'POST',
    headers: sdkTraceHeaders(input),
    body,
  }
}

function sdkRequestBody(request: RuntimeModelRequestSnapshot): unknown {
  return request.body.sdk_body ?? request.body
}

function sdkTraceHeaders(input: ModelCallInput): Record<string, string> {
  const apiKey = resolveOptionalModelAPIKey(input)
  return {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    'Content-Type': 'application/json',
  }
}

function resolveModelAPIKey(input: ModelCallInput): string {
  const apiKind = runtimeModelAPIKind(input.config)
  const value = resolveOptionalModelAPIKey(input)
  if (!value) {
    throw new Error(usesBackendCompatibleBaseURL(input)
      ? `${apiKind} requires a backend auth token`
      : `${apiKind} requires an API key in model settings`)
  }
  return value
}

function resolveOptionalModelAPIKey(input: ModelCallInput): string | undefined {
  const value = shouldUseBackendRequestAuth(input)
    ? input.auth?.backendAuthToken
    : input.config.apiKey
  return value?.trim() || undefined
}

function resolveStandardModelBaseURL(config: ConfiguredRuntimeModelConfig, auth?: RuntimeModelAuthContext): string {
  const explicit = config.baseURL || process.env.MOVSCRIPT_AGENT_MODEL_BASE_URL
  if (explicit?.trim()) {
    return isBackendCompatibleURL(explicit, auth)
      ? resolveCompatibleGatewayBaseURL(explicit)
      : explicit.trim().replace(/\/+$/, '')
  }
  return resolveCompatibleGatewayBaseURL(resolveBackendBaseURL(auth))
}

function shouldUseBackendRequestAuth(input: ModelCallInput): boolean {
  if (!input.auth?.backendAuthToken) return false
  return usesBackendCompatibleBaseURL(input)
}

function usesBackendCompatibleBaseURL(input: ModelCallInput): boolean {
  const explicit = input.config.baseURL?.trim() || process.env.MOVSCRIPT_AGENT_MODEL_BASE_URL?.trim()
  if (!explicit) return true
  return isBackendCompatibleURL(explicit, input.auth)
}

function isBackendCompatibleURL(value: string, auth?: RuntimeModelAuthContext): boolean {
  return sameURLOrigin(resolveCompatibleGatewayBaseURL(value), resolveCompatibleGatewayBaseURL(resolveBackendBaseURL(auth)))
}

function resolveBackendBaseURL(auth?: RuntimeModelAuthContext): string {
  return auth?.backendAPIBaseURL
    || process.env.MOVSCRIPT_BACKEND_API_BASE_URL
    || process.env.MOVSCRIPT_API_BASE_URL
    || 'http://localhost:8765'
}

function sameURLOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin
  } catch {
    return false
  }
}

function resolveCompatibleGatewayBaseURL(raw: string): string {
  const normalized = raw.trim().replace(/\/+$/, '')
  if (normalized.endsWith('/api/v1')) return `${normalized.slice(0, -'/api/v1'.length)}/v1`
  if (normalized.endsWith('/v1')) return normalized
  return `${normalized}/v1`
}

function resolveAnthropicMessagesBaseURL(config: ConfiguredRuntimeModelConfig, auth?: RuntimeModelAuthContext): string {
  const baseURL = resolveStandardModelBaseURL(config, auth)
  return baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`
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
    baseURL: resolveAnthropicSDKBaseURL(input.config, input.auth),
  })
}

function resolveAnthropicSDKBaseURL(config: ConfiguredRuntimeModelConfig, auth?: RuntimeModelAuthContext): string {
  const baseURL = resolveAnthropicMessagesBaseURL(config, auth)
  return baseURL.endsWith('/v1') ? baseURL.slice(0, -'/v1'.length) : baseURL
}

function toOpenAIResponsesInput(messages: RuntimeModelChatMessage[]): unknown[] {
  const input: unknown[] = []
  for (const message of messages) {
    if (message.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: message.tool_call_id,
        output: runtimeModelContentText(message.content),
      })
      continue
    }
    if (message.role === 'assistant' && message.tool_calls?.length) {
      const content = toOpenAIResponsesContent(message)
      if (content.length > 0) input.push({ role: 'assistant', content })
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
      content: toOpenAIResponsesContent(message),
    })
  }
  return input
}

function toOpenAIResponsesContent(message: RuntimeModelChatMessage): unknown[] {
  return message.content.flatMap((part): unknown[] => {
    if (part.type === 'text') {
      return part.text ? [{ type: message.role === 'assistant' ? 'output_text' : 'input_text', text: part.text }] : []
    }
    const image = openAIImagePayload(part)
    return image ? [{ type: 'input_image', image_url: typeof image === 'string' ? image : image.url, ...(part.detail ? { detail: part.detail } : {}) }] : []
  })
}

function openAIImagePayload(part: RuntimeModelContentPart): string | { url: string; detail?: string } | undefined {
  if (part.type !== 'image') return undefined
  switch (part.source.type) {
    case 'url':
      return { url: part.source.url, ...(part.detail ? { detail: part.detail } : {}) }
    case 'data_url':
      return { url: part.source.dataUrl, ...(part.detail ? { detail: part.detail } : {}) }
    case 'file_id':
      return undefined
  }
}

function toOpenAIResponsesTool(tool: RuntimeModelChatTool): Record<string, unknown> {
  return {
    type: 'function',
    name: tool.function.name,
    ...(tool.function.description ? { description: tool.function.description } : {}),
    parameters: toOpenAIToolParameters(tool.function.parameters),
  }
}

function toOpenAIResponsesToolChoice(choice: RuntimeModelToolChoice): unknown {
  if (choice === 'auto' || choice === 'required' || choice === 'none') return choice
  return { type: 'function', name: choice.function.name }
}

function toAnthropicMessages(messages: RuntimeModelChatMessage[]): { system: string; messages: unknown[] } {
  const system: string[] = []
  const out: unknown[] = []
  for (const message of messages) {
    if (message.role === 'system') {
      const text = runtimeModelContentText(message.content).trim()
      if (text) system.push(text)
      continue
    }
    if (message.role === 'tool') {
      out.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: message.tool_call_id,
          content: runtimeModelContentText(message.content),
        }],
      })
      continue
    }
    const content: unknown[] = []
    content.push(...message.content.flatMap(toAnthropicContentPart))
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

function toAnthropicContentPart(part: RuntimeModelContentPart): unknown[] {
  if (part.type === 'text') return part.text ? [{ type: 'text', text: part.text }] : []
  if (part.source.type === 'url') {
    return [{ type: 'image', source: { type: 'url', url: part.source.url } }]
  }
  if (part.source.type === 'data_url') {
    const parsed = parseDataURL(part.source.dataUrl)
    return parsed ? [{ type: 'image', source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data } }] : []
  }
  return []
}

function parseDataURL(value: string): { mediaType: string; data: string } | undefined {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(value)
  if (!match) return undefined
  return { mediaType: match[1] ?? 'application/octet-stream', data: match[2] ?? '' }
}

function toAnthropicTool(tool: RuntimeModelChatTool): Record<string, unknown> {
  return {
    name: tool.function.name,
    ...(tool.function.description ? { description: tool.function.description } : {}),
    input_schema: toAnthropicToolInputSchema(tool.function.parameters),
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
