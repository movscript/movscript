import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteJSON, resolveAgentStatePath } from '../state/fileStore.js'
import { isRecord } from '../jsonValue.js'

export interface RuntimeModelConfig {
  provider: 'backend-model-config'
  modelConfigId?: number
  model: string
  apiKind?: RuntimeModelAPIKind
  baseURL?: string
  useForChat: boolean
  useForPlanner: boolean
  updatedAt: string
}

export interface RuntimeModelConfigPublic {
  configured: boolean
  provider: 'backend-model-config'
  modelConfigId?: number
  model: string
  apiKind: RuntimeModelAPIKind
  baseURL?: string
  useForChat: boolean
  useForPlanner: boolean
  updatedAt?: string
  source: 'file' | 'none'
}

export interface RuntimeModelConfigInput {
  modelConfigId?: unknown
  model?: unknown
  apiKind?: unknown
  baseURL?: unknown
  useForChat?: unknown
  useForPlanner?: unknown
}

export type ConfiguredRuntimeModelConfig = RuntimeModelConfig & { model: string }

export interface RuntimeModelAuthContext {
  backendAuthToken?: string
  backendAPIBaseURL?: string
}

export const RUNTIME_MODEL_API_KINDS = [
  'backend_chat_completions',
  'openai_chat_completions',
  'openai_responses',
  'anthropic_messages',
] as const

export type RuntimeModelAPIKind = typeof RUNTIME_MODEL_API_KINDS[number]

export interface RuntimeModelRequestSnapshot {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: Record<string, unknown> & {
    model: string
    messages: RuntimeModelChatMessage[]
    stream?: boolean
    temperature?: number
    response_format?: { type: 'json_object' }
    tools?: unknown
    tool_choice?: unknown
    sdk_body?: unknown
  }
}

export interface RuntimeModelResponseSnapshot {
  status: number
  statusText: string
  ok: boolean
  headers: Record<string, string>
  bodyText: string
  parsedBody?: unknown
  content?: string
}

export interface RuntimeModelHTTPTrace {
  request: RuntimeModelRequestSnapshot
  response?: RuntimeModelResponseSnapshot
  latencyMs: number
}

export interface RuntimeModelTestResult {
  ok: boolean
  provider: string
  model: string
  modelConfigId?: number
  latencyMs: number
  content: string
  request: RuntimeModelRequestSnapshot
}

export interface RuntimeModelChatToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface RuntimeModelChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: RuntimeModelChatToolCall[]
}

export interface RuntimeModelChatTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: unknown
  }
}

export type RuntimeModelToolChoice = 'none' | 'auto' | 'required' | {
  type: 'function'
  function: {
    name: string
  }
}

export type RuntimeModelStreamTraceKind = 'reasoning' | 'content' | 'tool_call' | 'usage' | 'raw'

export interface RuntimeModelToolCallStreamTrace {
  index: number
  id?: string
  type?: string
  name?: string
  argumentsDelta?: string
  argumentsBuffer: string
  argumentsJSON?: unknown
  parseStatus: 'partial' | 'valid_json'
}

export interface RuntimeModelStreamTrace {
  kind: RuntimeModelStreamTraceKind
  delta?: string
  accumulated?: string
  toolCall?: RuntimeModelToolCallStreamTrace
  toolCalls?: RuntimeModelToolCallStreamTrace[]
  chunk?: unknown
}

export type RuntimeModelTraceCallback = (event: {
  phase: 'request' | 'response' | 'error' | 'stream' | 'retry'
  trace: RuntimeModelHTTPTrace
  error?: string
  stream?: RuntimeModelStreamTrace
  retry?: {
    attempt: number
    nextAttempt: number
    maxAttempts: number
    delayMs: number
    reason: string
  }
}) => void

const DEFAULT_BACKEND_API_BASE_URL = 'http://localhost:8765/api/v1'
const DEFAULT_BACKEND_MODEL = 'movscript-default-chat'
const DEFAULT_RUNTIME_MODEL_API_KIND: RuntimeModelAPIKind = 'backend_chat_completions'

export class RuntimeModelConfigStore {
  readonly filePath: string

  constructor(filePath = resolveRuntimeModelConfigPath()) {
    this.filePath = filePath
  }

  getEffectiveConfig(): RuntimeModelConfig | undefined {
    return this.readFileConfig()
  }

  getFileConfig(): RuntimeModelConfig | undefined {
    return this.readFileConfig()
  }

  getPublicConfig(): RuntimeModelConfigPublic {
    const fileConfig = this.readFileConfig()
    if (!fileConfig) {
      return {
        configured: false,
        provider: 'backend-model-config',
        model: DEFAULT_BACKEND_MODEL,
        apiKind: DEFAULT_RUNTIME_MODEL_API_KIND,
        useForChat: true,
        useForPlanner: true,
        source: 'none',
      }
    }
    return {
      configured: true,
      provider: 'backend-model-config',
      ...(fileConfig.modelConfigId ? { modelConfigId: fileConfig.modelConfigId } : {}),
      model: fileConfig.model,
      apiKind: fileConfig.apiKind ?? DEFAULT_RUNTIME_MODEL_API_KIND,
      baseURL: fileConfig.baseURL,
      useForChat: fileConfig.useForChat,
      useForPlanner: fileConfig.useForPlanner,
      updatedAt: fileConfig.updatedAt,
      source: 'file',
    }
  }

  save(input: RuntimeModelConfigInput): RuntimeModelConfigPublic {
    const existing = this.readFileConfig()
    const modelConfigId = normalizePositiveInteger(input.modelConfigId) ?? existing?.modelConfigId
    const model = normalizeNonEmptyString(input.model) ?? existing?.model ?? (modelConfigId ? backendModelID(modelConfigId) : undefined)
    if (!model) throw new Error('backend model_id is required')
    const apiKind = normalizeRuntimeModelAPIKind(input.apiKind) ?? existing?.apiKind ?? DEFAULT_RUNTIME_MODEL_API_KIND
    const baseURL = normalizeNonEmptyString(input.baseURL) ?? existing?.baseURL
    const config: RuntimeModelConfig = {
      provider: 'backend-model-config',
      ...(modelConfigId ? { modelConfigId } : {}),
      model,
      apiKind,
      ...(baseURL ? { baseURL } : {}),
      useForChat: typeof input.useForChat === 'boolean' ? input.useForChat : existing?.useForChat ?? true,
      useForPlanner: typeof input.useForPlanner === 'boolean' ? input.useForPlanner : existing?.useForPlanner ?? true,
      updatedAt: new Date().toISOString(),
    }
    atomicWriteJSON(this.filePath, config)
    return this.getPublicConfig()
  }

  async test(input: { message?: unknown } = {}, auth: RuntimeModelAuthContext = {}): Promise<RuntimeModelTestResult> {
    const config = this.getEffectiveConfig()
    if (!config?.model?.trim()) throw new Error('backend model_id is not configured')
    const messages = buildTestMessages(normalizeNonEmptyString(input.message) ?? 'Reply with one short sentence confirming the MovScript runtime model connection works.')
    const request = buildBackendGatewayChatRequest(config, messages, auth)
    const started = Date.now()
    const content = await callBackendGatewayChat(request)
    return {
      ok: true,
      provider: config.provider,
      model: config.model,
      ...(config.modelConfigId ? { modelConfigId: config.modelConfigId } : {}),
      latencyMs: Date.now() - started,
      content,
      request: publicRequestSnapshot(request),
    }
  }

  private readFileConfig(): RuntimeModelConfig | undefined {
    if (!existsSync(this.filePath)) return undefined
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown
    } catch {
      return undefined
    }
    if (!isRecord(parsed)) return undefined
    const modelConfigId = normalizePositiveInteger(parsed.modelConfigId)
    const model = normalizeNonEmptyString(parsed.model) ?? (modelConfigId ? backendModelID(modelConfigId) : undefined)
    if (!model) return undefined
    return {
      provider: 'backend-model-config',
      ...(modelConfigId ? { modelConfigId } : {}),
      model,
      apiKind: normalizeRuntimeModelAPIKind(parsed.apiKind) ?? DEFAULT_RUNTIME_MODEL_API_KIND,
      ...(normalizeNonEmptyString(parsed.baseURL) ? { baseURL: normalizeNonEmptyString(parsed.baseURL) } : {}),
      useForChat: parsed.useForChat !== false,
      useForPlanner: parsed.useForPlanner !== false,
      updatedAt: normalizeNonEmptyString(parsed.updatedAt) ?? new Date(0).toISOString(),
    }
  }
}

export function resolveRuntimeModelConfigPath(statePath = resolveAgentStatePath()): string {
  if (process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH) return process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
  if (statePath.endsWith('.json')) return statePath.replace(/\.json$/, '.model-config.json')
  return join(statePath, 'model-config.json')
}

export function resolveRuntimeChatModelConfig(store = new RuntimeModelConfigStore()): ConfiguredRuntimeModelConfig | undefined {
  const config = store.getEffectiveConfig()
  return config?.model?.trim() && config.useForChat ? config : undefined
}

export function resolveRuntimeChatFileModelConfig(store = new RuntimeModelConfigStore()): ConfiguredRuntimeModelConfig | undefined {
  const config = store.getFileConfig()
  return config?.model?.trim() && config.useForChat ? config : undefined
}

export function resolveRuntimePlannerModelConfig(store = new RuntimeModelConfigStore()): ConfiguredRuntimeModelConfig | undefined {
  const config = store.getEffectiveConfig()
  return config?.model?.trim() && config.useForPlanner ? config : undefined
}

export function buildBackendGatewayChatRequest(
  config: ConfiguredRuntimeModelConfig,
  messages: RuntimeModelChatMessage[],
  auth: RuntimeModelAuthContext = {},
  options: { temperature?: number; jsonMode?: boolean; tools?: RuntimeModelChatTool[]; toolChoice?: RuntimeModelToolChoice } = {},
): RuntimeModelRequestSnapshot {
  const requestMessages = options.jsonMode ? ensureJSONModeMessages(messages) : messages
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  }
  if (auth.backendAuthToken) {
    headers.Authorization = `Bearer ${auth.backendAuthToken}`
  }
  return {
    url: `${resolveBackendAPIBaseURL(auth.backendAPIBaseURL)}/model-gateway/chat/completions`,
    method: 'POST',
    headers,
    body: {
      model: runtimeModelIdentifier(config),
      messages: requestMessages,
      stream: true,
      ...(typeof options.temperature === 'number' ? { temperature: options.temperature } : {}),
      ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
      ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}),
    },
  }
}

function ensureJSONModeMessages(messages: RuntimeModelChatMessage[]): RuntimeModelChatMessage[] {
  if (messages.some((message) => containsJSONKeyword(message.content ?? ''))) return messages
  return [
    {
      role: 'system',
      content: 'JSON mode is enabled. Return only a valid JSON object with no markdown fences.',
    },
    ...messages,
  ]
}

function containsJSONKeyword(content: string): boolean {
  return /\bjson\b/i.test(content)
}

function normalizeRuntimeModelAPIKind(value: unknown): RuntimeModelAPIKind | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return RUNTIME_MODEL_API_KINDS.includes(normalized as RuntimeModelAPIKind)
    ? normalized as RuntimeModelAPIKind
    : undefined
}

export async function callBackendGatewayChat(request: RuntimeModelRequestSnapshot): Promise<string> {
  return callBackendGatewayChatWithTrace(request).then((result) => result.content)
}

export async function callBackendGatewayChatWithTrace(
  request: RuntimeModelRequestSnapshot,
  onTrace?: RuntimeModelTraceCallback,
): Promise<{ content: string; assistantMessage: RuntimeModelChatMessage; trace: RuntimeModelHTTPTrace }> {
  const started = Date.now()
  const publicRequest = publicRequestSnapshot(request)
  let trace: RuntimeModelHTTPTrace = {
    request: publicRequest,
    latencyMs: 0,
  }
  onTrace?.({ phase: 'request', trace })

  let response: Response
  try {
    response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
    })
  } catch (error) {
    trace = {
      request: publicRequest,
      latencyMs: Date.now() - started,
    }
    const message = error instanceof Error ? error.message : String(error)
    onTrace?.({ phase: 'error', trace, error: message })
    throw error
  }
  const responseText = await response.text()
  const contentType = response.headers.get('content-type') ?? ''
  const parsedResult = parseGatewayResponse(responseText, contentType)
  const parsed = parsedResult.parsedBody
  const assistantMessage = parsedResult.assistantMessage
  const content = parsedResult.content
  trace = {
    request: publicRequest,
    response: {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: publicHeadersSnapshot(Object.fromEntries(response.headers.entries())),
      bodyText: responseText,
      ...(parsed !== undefined ? { parsedBody: parsed } : {}),
      ...(content ? { content } : {}),
    },
    latencyMs: Date.now() - started,
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
  if (!content) {
    const error = 'backend model gateway returned no assistant content'
    onTrace?.({ phase: 'error', trace, error })
    throw new Error(error)
  }
  return { content, assistantMessage, trace }
}

function publicRequestSnapshot(request: RuntimeModelRequestSnapshot): RuntimeModelRequestSnapshot {
  return { ...request, headers: publicHeadersSnapshot(request.headers) }
}

function publicHeadersSnapshot(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !isSensitiveHeaderName(key)),
  )
}

function isSensitiveHeaderName(key: string): boolean {
  return [
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'api-key',
  ].includes(key.toLowerCase())
}

interface ParsedGatewayResponse {
  ok: boolean
  content?: string
  assistantMessage: RuntimeModelChatMessage
  parsedBody?: unknown
  error?: string
}

function parseGatewayResponse(responseText: string, contentType: string): ParsedGatewayResponse {
  const normalizedText = responseText.trimStart()
  if (contentType.toLowerCase().includes('text/event-stream') || normalizedText.startsWith('data:') || responseText.includes('\ndata:')) {
    return parseSSEChatResponse(responseText)
  }
  const parsed = parseJSONResponse(responseText)
  return {
    ok: parsed !== undefined,
    parsedBody: parsed,
    assistantMessage: extractAssistantMessage(parsed),
    content: extractAssistantContent(parsed),
    ...(parsed === undefined ? { error: 'backend model gateway returned invalid JSON' } : {}),
  }
}

function parseJSONResponse(responseText: string): { choices?: Array<{ message?: { role?: string; content?: string | null; tool_calls?: unknown[] } }> } | undefined {
  try {
    return JSON.parse(responseText) as { choices?: Array<{ message?: { role?: string; content?: string | null; tool_calls?: unknown[] } }> }
  } catch {
    return undefined
  }
}

function parseSSEChatResponse(responseText: string): ParsedGatewayResponse {
  const chunks: unknown[] = []
  let content = ''
  let finishReason = ''
  let role = 'assistant'
  const toolCallParts = new Map<number, { id?: string; type?: string; name?: string; arguments: string }>()

  for (const eventData of readSSEDataBlocks(responseText)) {
    if (eventData === '[DONE]') break
    let chunk: {
      choices?: Array<{
        delta?: {
          role?: string
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
    }
    try {
      chunk = JSON.parse(eventData)
    } catch {
      continue
    }
    chunks.push(chunk)
    const choice = chunk.choices?.[0]
    const delta = choice?.delta
    if (delta?.role) role = delta.role
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

  const toolCalls = Array.from(toolCallParts.entries())
    .sort(([a], [b]) => a - b)
    .flatMap(([, part]) => {
      if (!part.id || !part.name) return []
      return [{
        id: part.id,
        type: 'function' as const,
        function: {
          name: part.name,
          arguments: part.arguments,
        },
      }]
    })
  const trimmed = content.trim()
  const assistantMessage: RuntimeModelChatMessage = {
    role: role === 'assistant' ? 'assistant' : 'assistant',
    content: trimmed || null,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  }
  return {
    ok: chunks.length > 0 || responseText.includes('[DONE]'),
    parsedBody: { object: 'chat.completion.stream', choices: [{ message: assistantMessage, finish_reason: finishReason || undefined }] },
    assistantMessage,
    content: trimmed || (toolCalls.length > 0 ? JSON.stringify({ tool_calls: toolCalls }) : undefined),
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

function extractAssistantMessage(parsed: { choices?: Array<{ message?: { role?: string; content?: string | null; tool_calls?: unknown[] } }> } | undefined): RuntimeModelChatMessage {
  const message = parsed?.choices?.[0]?.message
  const content = typeof message?.content === 'string' ? message.content : null
  const toolCalls = normalizeRuntimeToolCalls(message?.tool_calls)
  return {
    role: 'assistant',
    content,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  }
}

function extractAssistantContent(parsed: { choices?: Array<{ message?: { content?: string | null; tool_calls?: unknown[] } }> } | undefined): string | undefined {
  const message = parsed?.choices?.[0]?.message
  const content = typeof message?.content === 'string' ? message.content.trim() : ''
  if (content) return content
  if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
    return JSON.stringify({ tool_calls: message.tool_calls })
  }
  return undefined
}

function normalizeRuntimeToolCalls(value: unknown): RuntimeModelChatToolCall[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): RuntimeModelChatToolCall[] => {
    if (!isRecord(item)) return []
    const record = item
    const fn = isRecord(record.function) ? record.function : undefined
    const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : undefined
    const name = typeof fn?.name === 'string' && fn.name.trim() ? fn.name.trim() : undefined
    const args = typeof fn?.arguments === 'string' ? fn.arguments : ''
    if (!id || !name) return []
    return [{
      id,
      type: 'function',
      function: {
        name,
        arguments: args,
      },
    }]
  })
}

function buildTestMessages(message: string): RuntimeModelChatMessage[] {
  return [
    {
      role: 'system',
      content: 'You are a concise connection test for MovScript Agent.',
    },
    {
      role: 'user',
      content: message,
    },
  ]
}

function resolveBackendAPIBaseURL(override?: string): string {
  return normalizeBaseURL(override || process.env.MOVSCRIPT_BACKEND_API_BASE_URL || process.env.MOVSCRIPT_API_BASE_URL || DEFAULT_BACKEND_API_BASE_URL)
}

function backendModelID(modelConfigId: number): string {
  return `model_config:${modelConfigId}`
}

function runtimeModelIdentifier(config: ConfiguredRuntimeModelConfig): string {
  return config.model?.trim() || (config.modelConfigId ? backendModelID(config.modelConfigId) : DEFAULT_BACKEND_MODEL)
}

function normalizeBaseURL(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizePositiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim())
    return parsed > 0 ? parsed : undefined
  }
  return undefined
}
