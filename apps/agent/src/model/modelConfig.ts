import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteJSON, resolveAgentStatePath } from '../state/fileStore.js'
import { isRecord } from '../jsonValue.js'

export interface RuntimeModelConfig {
  provider: 'backend-model-config'
  modelConfigId?: number
  model: string
  apiKind?: RuntimeModelAPIKind
  baseURL?: string
  apiKey?: string
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
  apiKeyConfigured: boolean
  useForChat: boolean
  useForPlanner: boolean
  updatedAt?: string
  source: 'file' | 'none'
  credentialStatus: RuntimeModelCredentialStatus
}

export interface RuntimeModelConfigInput {
  modelConfigId?: unknown
  model?: unknown
  apiKind?: unknown
  baseURL?: unknown
  apiKey?: unknown
  useForChat?: unknown
  useForPlanner?: unknown
}

export type ConfiguredRuntimeModelConfig = RuntimeModelConfig & { model: string }

export interface RuntimeModelCredentialStatus {
  required: boolean
  configured: boolean
  sourceEnv: string[]
  acceptedEnv: string[]
}

export interface RuntimeModelAuthContext {
  backendAuthToken?: string
  backendAPIBaseURL?: string
}

export class RuntimeModelConfigInputError extends Error {}

export const RUNTIME_MODEL_API_KINDS = [
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
  apiKind: RuntimeModelAPIKind
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

const DEFAULT_BACKEND_MODEL = 'movscript-default-chat'
const DEFAULT_RUNTIME_MODEL_API_KIND: RuntimeModelAPIKind = 'openai_chat_completions'
const SENSITIVE_RUNTIME_MODEL_URL_PARAM_PATTERN = /^(token|access_token|refresh_token|id_token|api_key|apikey|key|signature|sig|secret)$/i
const AUTHORIZATION_INLINE_SECRET_PATTERN = /\bauthorization\s*[:=]\s*(?:bearer\s+)?[^\s"',;&]+/i
const NAMED_INLINE_SECRET_PATTERN = /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|secret|password)\s*[:=]\s*[^\s"',;&]+/i
const PROVIDER_API_KEY_SECRET_PATTERN = /\b(?:sk|sk-proj|sk-ant)[-_][A-Za-z0-9_-]{12,}\b/i

function hasSensitiveRuntimeModelText(value: string | undefined): boolean {
  if (!value) return false
  return hasSensitiveRuntimeModelURL(value)
    || AUTHORIZATION_INLINE_SECRET_PATTERN.test(value)
    || NAMED_INLINE_SECRET_PATTERN.test(value)
    || PROVIDER_API_KEY_SECRET_PATTERN.test(value)
}

function hasSensitiveRuntimeModelURL(value: string | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    if (url.username || url.password) return true
    for (const key of url.searchParams.keys()) {
      if (SENSITIVE_RUNTIME_MODEL_URL_PARAM_PATTERN.test(key)) return true
    }
    return false
  } catch {
    return /https?:\/\/[^/\s:@]+:[^@\s]+@/i.test(value)
      || /\b(?:token|access_token|refresh_token|id_token|api_key|apikey|key|signature|sig|secret)=/i.test(value)
  }
}

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
        apiKeyConfigured: false,
        useForChat: true,
        useForPlanner: true,
        source: 'none',
        credentialStatus: describeRuntimeModelCredentialStatus(undefined),
      }
    }
    return {
      configured: true,
      provider: 'backend-model-config',
      ...(fileConfig.modelConfigId ? { modelConfigId: fileConfig.modelConfigId } : {}),
      model: fileConfig.model,
      apiKind: fileConfig.apiKind ?? DEFAULT_RUNTIME_MODEL_API_KIND,
      baseURL: fileConfig.baseURL,
      apiKeyConfigured: Boolean(fileConfig.apiKey?.trim()),
      useForChat: fileConfig.useForChat,
      useForPlanner: fileConfig.useForPlanner,
      updatedAt: fileConfig.updatedAt,
      source: 'file',
      credentialStatus: describeRuntimeModelCredentialStatus(fileConfig),
    }
  }

  save(input: RuntimeModelConfigInput): RuntimeModelConfigPublic {
    const existing = this.readFileConfig()
    const config = this.buildConfigFromInput(input, existing, new Date().toISOString())
    atomicWriteJSON(this.filePath, config)
    return this.getPublicConfig()
  }

  clear(): RuntimeModelConfigPublic {
    if (existsSync(this.filePath)) unlinkSync(this.filePath)
    return this.getPublicConfig()
  }

  async test(input: RuntimeModelConfigInput & { message?: unknown } = {}, auth: RuntimeModelAuthContext = {}): Promise<RuntimeModelTestResult> {
    const existing = this.getEffectiveConfig()
    const config = hasRuntimeModelConfigInputFields(input)
      ? this.buildConfigFromInput(input, existing, existing?.updatedAt ?? new Date().toISOString())
      : existing
    if (!config?.model?.trim()) throw new Error('backend model_id is not configured')
    const messages = buildTestMessages(normalizeNonEmptyString(input.message) ?? 'Reply with one short sentence confirming the MovScript runtime model connection works.')
    const started = Date.now()
    const { callModel } = await import('./modelClient.js')
    const result = await callModel({
      messages,
      config,
      auth,
      retry: { maxAttempts: 1 },
    })
    return {
      ok: true,
      provider: config.provider,
      model: config.model,
      apiKind: config.apiKind ?? DEFAULT_RUNTIME_MODEL_API_KIND,
      ...(config.modelConfigId ? { modelConfigId: config.modelConfigId } : {}),
      latencyMs: Date.now() - started,
      content: result.content ?? '',
      request: result.trace.request,
    }
  }

  private buildConfigFromInput(input: RuntimeModelConfigInput, existing: RuntimeModelConfig | undefined, updatedAt: string): RuntimeModelConfig {
    const inputModel = parseOptionalSaveString(input.model, 'model')
    const modelConfigId = parseOptionalSavePositiveInteger(input.modelConfigId, 'modelConfigId') ?? (input.model === undefined ? existing?.modelConfigId : undefined)
    const model = inputModel ?? existing?.model ?? (modelConfigId ? backendModelID(modelConfigId) : undefined)
    if (!model) throw new RuntimeModelConfigInputError('backend model_id is required')
    const apiKind = parseOptionalSaveAPIKind(input.apiKind) ?? existing?.apiKind ?? DEFAULT_RUNTIME_MODEL_API_KIND
    const preserveExistingBaseURL = input.model === undefined && input.modelConfigId === undefined && input.apiKind === undefined
    const baseURL = input.baseURL !== undefined
      ? parseOptionalSaveBaseURL(input.baseURL)
      : preserveExistingBaseURL ? existing?.baseURL : undefined
    const apiKey = input.apiKey !== undefined
      ? parseOptionalSaveAPIKey(input.apiKey)
      : existing?.apiKey
    if (hasSensitiveRuntimeModelText(model)) {
      throw new RuntimeModelConfigInputError('model must not include API keys, bearer tokens, or secret URL credentials')
    }
    if (hasSensitiveRuntimeModelURL(baseURL)) {
      throw new RuntimeModelConfigInputError('baseURL must not include secret URL credentials')
    }
    const useForChat = parseOptionalSaveBoolean(input.useForChat, 'useForChat') ?? existing?.useForChat ?? true
    const useForPlanner = parseOptionalSaveBoolean(input.useForPlanner, 'useForPlanner') ?? existing?.useForPlanner ?? true
    if (!useForChat && !useForPlanner) throw new RuntimeModelConfigInputError('runtime model config must enable at least one route')
    return {
      provider: 'backend-model-config',
      ...(modelConfigId ? { modelConfigId } : {}),
      model,
      apiKind,
      ...(baseURL ? { baseURL } : {}),
      ...(apiKey ? { apiKey } : {}),
      useForChat,
      useForPlanner,
      updatedAt,
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
    const useForChat = parsed.useForChat !== false
    const useForPlanner = parsed.useForPlanner !== false
    if (!useForChat && !useForPlanner) return undefined
    const apiKind = normalizeRuntimeModelAPIKind(parsed.apiKind) ?? DEFAULT_RUNTIME_MODEL_API_KIND
    if (hasSensitiveRuntimeModelText(model)) return undefined
    const baseURL = normalizeNonEmptyString(parsed.baseURL)
    const apiKey = normalizeNonEmptyString(parsed.apiKey)
    if (hasSensitiveRuntimeModelURL(baseURL)) return undefined
    return {
      provider: 'backend-model-config',
      ...(modelConfigId ? { modelConfigId } : {}),
      model,
      apiKind,
      ...(baseURL ? { baseURL } : {}),
      ...(apiKey ? { apiKey } : {}),
      useForChat,
      useForPlanner,
      updatedAt: normalizeNonEmptyString(parsed.updatedAt) ?? new Date(0).toISOString(),
    }
  }
}

export function resolveRuntimeModelConfigPath(statePath = resolveAgentStatePath()): string {
  if (process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH) return process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
  if (statePath.endsWith('.json')) return statePath.replace(/\.json$/, '.model-config.json')
  return join(statePath, 'model-config.json')
}

export function describeRuntimeModelCredentialStatus(config: RuntimeModelConfig | undefined): RuntimeModelCredentialStatus {
  const acceptedEnv = ['model settings API key']
  const sourceEnv = config?.apiKey?.trim() ? ['model settings API key'] : []
  const apiKind = config?.apiKind ?? DEFAULT_RUNTIME_MODEL_API_KIND
  const usesBackendCompatibleGateway = Boolean(config)
    && isBackendCompatibleConfigBaseURL(config?.baseURL)
    && !process.env.MOVSCRIPT_AGENT_MODEL_BASE_URL?.trim()
  return {
    required: Boolean(config) && !usesBackendCompatibleGateway,
    configured: sourceEnv.length > 0,
    sourceEnv,
    acceptedEnv,
  }
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

export function ensureJSONModeMessages(messages: RuntimeModelChatMessage[]): RuntimeModelChatMessage[] {
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

function parseOptionalSaveAPIKind(value: unknown): RuntimeModelAPIKind | undefined {
  if (value === undefined) return undefined
  const apiKind = normalizeRuntimeModelAPIKind(value)
  if (!apiKind) throw new RuntimeModelConfigInputError('apiKind is invalid')
  return apiKind
}

function parseOptionalSaveBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new RuntimeModelConfigInputError(`${label} must be boolean`)
  return value
}

function parseOptionalSavePositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new RuntimeModelConfigInputError(`${label} must be a positive integer`)
  return value
}

function parseOptionalSaveString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value.trim()) throw new RuntimeModelConfigInputError(`${label} must be a non-empty string`)
  return value.trim()
}

function parseOptionalSaveBaseURL(value: unknown): string | undefined {
  if (value === null) return undefined
  return parseOptionalSaveString(value, 'baseURL')
}

function parseOptionalSaveAPIKey(value: unknown): string | undefined {
  if (value === null) return undefined
  return parseOptionalSaveString(value, 'apiKey')
}

function hasRuntimeModelConfigInputFields(input: RuntimeModelConfigInput): boolean {
  return input.modelConfigId !== undefined
    || input.model !== undefined
    || input.apiKind !== undefined
    || input.baseURL !== undefined
    || input.apiKey !== undefined
    || input.useForChat !== undefined
    || input.useForPlanner !== undefined
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

function backendModelID(modelConfigId: number): string {
  return `model_config:${modelConfigId}`
}

function isBackendCompatibleConfigBaseURL(value: string | undefined): boolean {
  if (!value?.trim()) return true
  const backendBaseURL = process.env.MOVSCRIPT_BACKEND_API_BASE_URL || process.env.MOVSCRIPT_API_BASE_URL || 'http://localhost:8765'
  try {
    return new URL(toCompatibleGatewayBaseURL(value)).origin === new URL(toCompatibleGatewayBaseURL(backendBaseURL)).origin
  } catch {
    return false
  }
}

function toCompatibleGatewayBaseURL(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '')
  if (normalized.endsWith('/api/v1')) return `${normalized.slice(0, -'/api/v1'.length)}/v1`
  if (normalized.endsWith('/v1')) return normalized
  return `${normalized}/v1`
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
