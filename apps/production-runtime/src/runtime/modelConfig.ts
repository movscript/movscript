import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteJSON, resolveAgentStatePath } from './fileStore.js'

export interface RuntimeModelConfig {
  provider: 'backend-model-config'
  modelConfigId: number
  model: string
  useForChat: boolean
  useForPlanner: boolean
  updatedAt: string
}

export interface RuntimeModelConfigPublic {
  configured: boolean
  provider: 'backend-model-config'
  modelConfigId?: number
  model: string
  useForChat: boolean
  useForPlanner: boolean
  updatedAt?: string
  source: 'file' | 'none'
}

export interface RuntimeModelConfigInput {
  modelConfigId?: unknown
  model?: unknown
  useForChat?: unknown
  useForPlanner?: unknown
}

export type ConfiguredRuntimeModelConfig = RuntimeModelConfig & { modelConfigId: number }

export interface RuntimeModelAuthContext {
  backendAuthToken?: string
}

export interface RuntimeModelRequestSnapshot {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: {
    model: string
    messages: Array<{
      role: 'system' | 'user' | 'assistant'
      content: string
    }>
    temperature?: number
    response_format?: { type: 'json_object' }
  }
}

export interface RuntimeModelTestResult {
  ok: boolean
  provider: string
  model: string
  modelConfigId: number
  latencyMs: number
  content: string
  request: RuntimeModelRequestSnapshot
}

export type RuntimeModelChatMessage = RuntimeModelRequestSnapshot['body']['messages'][number]

const DEFAULT_BACKEND_API_BASE_URL = 'http://localhost:8765/api/v1'
const DEFAULT_BACKEND_MODEL = 'movscript-default-chat'

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
        useForChat: true,
        useForPlanner: true,
        source: 'none',
      }
    }
    return {
      configured: true,
      provider: 'backend-model-config',
      modelConfigId: fileConfig.modelConfigId,
      model: fileConfig.model,
      useForChat: fileConfig.useForChat,
      useForPlanner: fileConfig.useForPlanner,
      updatedAt: fileConfig.updatedAt,
      source: 'file',
    }
  }

  save(input: RuntimeModelConfigInput): RuntimeModelConfigPublic {
    const existing = this.readFileConfig()
    const modelConfigId = normalizePositiveInteger(input.modelConfigId) ?? existing?.modelConfigId
    if (!modelConfigId) throw new Error('backend model config id is required')
    const model = normalizeNonEmptyString(input.model) ?? existing?.model ?? backendModelID(modelConfigId)
    const config: RuntimeModelConfig = {
      provider: 'backend-model-config',
      modelConfigId,
      model,
      useForChat: typeof input.useForChat === 'boolean' ? input.useForChat : existing?.useForChat ?? true,
      useForPlanner: typeof input.useForPlanner === 'boolean' ? input.useForPlanner : existing?.useForPlanner ?? true,
      updatedAt: new Date().toISOString(),
    }
    atomicWriteJSON(this.filePath, config)
    return this.getPublicConfig()
  }

  async test(input: { message?: unknown } = {}, auth: RuntimeModelAuthContext = {}): Promise<RuntimeModelTestResult> {
    const config = this.getEffectiveConfig()
    if (!config?.modelConfigId) throw new Error('backend model config is not configured')
    const messages = buildTestMessages(normalizeNonEmptyString(input.message) ?? 'Reply with one short sentence confirming the MovScript runtime model connection works.')
    const request = buildBackendGatewayChatRequest(config, messages, auth)
    const started = Date.now()
    const content = await callBackendGatewayChat(request)
    return {
      ok: true,
      provider: config.provider,
      model: config.model,
      modelConfigId: config.modelConfigId,
      latencyMs: Date.now() - started,
      content,
      request: publicRequestSnapshot(request),
    }
  }

  private readFileConfig(): RuntimeModelConfig | undefined {
    if (!existsSync(this.filePath)) return undefined
    const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<RuntimeModelConfig>
    const modelConfigId = normalizePositiveInteger(parsed.modelConfigId)
    if (!modelConfigId) return undefined
    return {
      provider: 'backend-model-config',
      modelConfigId,
      model: normalizeNonEmptyString(parsed.model) ?? backendModelID(modelConfigId),
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
  return config?.modelConfigId && config.useForChat ? config : undefined
}

export function resolveRuntimeChatFileModelConfig(store = new RuntimeModelConfigStore()): ConfiguredRuntimeModelConfig | undefined {
  const config = store.getFileConfig()
  return config?.modelConfigId && config.useForChat ? config : undefined
}

export function resolveRuntimePlannerModelConfig(store = new RuntimeModelConfigStore()): ConfiguredRuntimeModelConfig | undefined {
  const config = store.getEffectiveConfig()
  return config?.modelConfigId && config.useForPlanner ? config : undefined
}

export function buildBackendGatewayChatRequest(
  config: ConfiguredRuntimeModelConfig,
  messages: RuntimeModelChatMessage[],
  auth: RuntimeModelAuthContext = {},
  options: { temperature?: number; jsonMode?: boolean } = {},
): RuntimeModelRequestSnapshot {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (auth.backendAuthToken) {
    headers.Authorization = `Bearer ${auth.backendAuthToken}`
  }
  return {
    url: `${resolveBackendAPIBaseURL()}/model-gateway/chat/completions`,
    method: 'POST',
    headers,
    body: {
      model: backendModelID(config.modelConfigId),
      messages,
      ...(typeof options.temperature === 'number' ? { temperature: options.temperature } : {}),
      ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    },
  }
}

export async function callBackendGatewayChat(request: RuntimeModelRequestSnapshot): Promise<string> {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
  })
  const responseText = await response.text()
  if (!response.ok) throw new Error(`backend model gateway HTTP ${response.status}: ${responseText}`)
  const parsed = JSON.parse(responseText) as { choices?: Array<{ message?: { content?: string } }> }
  const content = parsed.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('backend model gateway returned no assistant content')
  return content
}

function publicRequestSnapshot(request: RuntimeModelRequestSnapshot): RuntimeModelRequestSnapshot {
  const headers = { ...request.headers }
  delete headers.Authorization
  return { ...request, headers }
}

function buildTestMessages(message: string): RuntimeModelChatMessage[] {
  return [
    {
      role: 'system',
      content: 'You are a concise connection test for MovScript Production Runtime.',
    },
    {
      role: 'user',
      content: message,
    },
  ]
}

function resolveBackendAPIBaseURL(): string {
  return normalizeBaseURL(process.env.MOVSCRIPT_BACKEND_API_BASE_URL || process.env.MOVSCRIPT_API_BASE_URL || DEFAULT_BACKEND_API_BASE_URL)
}

function backendModelID(modelConfigId: number): string {
  return `model_config:${modelConfigId}`
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
