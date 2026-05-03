import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteJSON, resolveAgentStatePath } from './fileStore.js'

export interface RuntimeModelConfig {
  provider: 'openai-compatible'
  baseURL: string
  model: string
  apiKey?: string
  useForChat: boolean
  useForPlanner: boolean
  updatedAt: string
}

export interface RuntimeModelConfigPublic {
  configured: boolean
  provider: 'openai-compatible'
  baseURL: string
  model: string
  apiKeyConfigured: boolean
  useForChat: boolean
  useForPlanner: boolean
  updatedAt?: string
  source: 'file' | 'env' | 'none'
}

export interface RuntimeModelConfigInput {
  baseURL?: unknown
  model?: unknown
  apiKey?: unknown
  useForChat?: unknown
  useForPlanner?: unknown
}

export type ConfiguredRuntimeModelConfig = RuntimeModelConfig & { apiKey: string }

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'

export class RuntimeModelConfigStore {
  readonly filePath: string

  constructor(filePath = resolveRuntimeModelConfigPath()) {
    this.filePath = filePath
  }

  getEffectiveConfig(): RuntimeModelConfig | undefined {
    const fileConfig = this.readFileConfig()
    if (fileConfig?.apiKey) return fileConfig

    const envConfig = resolveEnvConfig()
    if (envConfig) return envConfig
    return fileConfig
  }

  getFileConfig(): RuntimeModelConfig | undefined {
    return this.readFileConfig()
  }

  getPublicConfig(): RuntimeModelConfigPublic {
    const fileConfig = this.readFileConfig()
    const envConfig = resolveEnvConfig()
    const effective = fileConfig ?? envConfig
    if (!effective) {
      return {
        configured: false,
        provider: 'openai-compatible',
        baseURL: DEFAULT_OPENAI_BASE_URL,
        model: DEFAULT_OPENAI_MODEL,
        apiKeyConfigured: false,
        useForChat: true,
        useForPlanner: true,
        source: 'none',
      }
    }
    return {
      configured: !!effective.apiKey,
      provider: 'openai-compatible',
      baseURL: effective.baseURL,
      model: effective.model,
      apiKeyConfigured: !!effective.apiKey,
      useForChat: effective.useForChat,
      useForPlanner: effective.useForPlanner,
      ...(effective.updatedAt ? { updatedAt: effective.updatedAt } : {}),
      source: fileConfig ? 'file' : 'env',
    }
  }

  save(input: RuntimeModelConfigInput): RuntimeModelConfigPublic {
    const existing = this.readFileConfig()
    const baseURL = normalizeNonEmptyString(input.baseURL) ?? existing?.baseURL ?? DEFAULT_OPENAI_BASE_URL
    const model = normalizeNonEmptyString(input.model) ?? existing?.model ?? DEFAULT_OPENAI_MODEL
    const apiKeyInput = normalizeNonEmptyString(input.apiKey)
    const apiKey = apiKeyInput ?? existing?.apiKey
    const config: RuntimeModelConfig = {
      provider: 'openai-compatible',
      baseURL: normalizeBaseURL(baseURL),
      model,
      ...(apiKey ? { apiKey } : {}),
      useForChat: typeof input.useForChat === 'boolean' ? input.useForChat : existing?.useForChat ?? true,
      useForPlanner: typeof input.useForPlanner === 'boolean' ? input.useForPlanner : existing?.useForPlanner ?? true,
      updatedAt: new Date().toISOString(),
    }
    atomicWriteJSON(this.filePath, config)
    return this.getPublicConfig()
  }

  async test(input: { message?: unknown } = {}): Promise<{
    ok: boolean
    provider: string
    model: string
    baseURL: string
    latencyMs: number
    content: string
  }> {
    const config = this.getEffectiveConfig()
    if (!config?.apiKey) throw new Error('runtime model API key is not configured')
    const started = Date.now()
    const content = await callOpenAICompatible(config, normalizeNonEmptyString(input.message) ?? 'Reply with one short sentence confirming the MovScript runtime model connection works.')
    return {
      ok: true,
      provider: config.provider,
      model: config.model,
      baseURL: config.baseURL,
      latencyMs: Date.now() - started,
      content,
    }
  }

  private readFileConfig(): RuntimeModelConfig | undefined {
    if (!existsSync(this.filePath)) return undefined
    const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<RuntimeModelConfig>
    const apiKey = normalizeNonEmptyString(parsed.apiKey)
    const baseURL = normalizeNonEmptyString(parsed.baseURL) ?? DEFAULT_OPENAI_BASE_URL
    const model = normalizeNonEmptyString(parsed.model) ?? DEFAULT_OPENAI_MODEL
    return {
      provider: 'openai-compatible',
      baseURL: normalizeBaseURL(baseURL),
      model,
      ...(apiKey ? { apiKey } : {}),
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
  return config?.apiKey && config.useForChat ? { ...config, apiKey: config.apiKey } : undefined
}

export function resolveRuntimeChatFileModelConfig(store = new RuntimeModelConfigStore()): ConfiguredRuntimeModelConfig | undefined {
  const config = store.getFileConfig()
  return config?.apiKey && config.useForChat ? { ...config, apiKey: config.apiKey } : undefined
}

export function resolveRuntimePlannerModelConfig(store = new RuntimeModelConfigStore()): ConfiguredRuntimeModelConfig | undefined {
  const config = store.getEffectiveConfig()
  return config?.apiKey && config.useForPlanner ? { ...config, apiKey: config.apiKey } : undefined
}

async function callOpenAICompatible(config: RuntimeModelConfig, message: string): Promise<string> {
  const response = await fetch(`${config.baseURL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: 'You are a concise connection test for MovScript Production Runtime.',
        },
        {
          role: 'user',
          content: message,
        },
      ],
    }),
  })
  const responseText = await response.text()
  if (!response.ok) throw new Error(`runtime model test HTTP ${response.status}: ${responseText}`)
  const parsed = JSON.parse(responseText) as { choices?: Array<{ message?: { content?: string } }> }
  const content = parsed.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('runtime model test returned no assistant content')
  return content
}

function resolveEnvConfig(): RuntimeModelConfig | undefined {
  const gatewayKey = process.env.MOVSCRIPT_AGENT_GATEWAY_API_KEY || process.env.MOVSCRIPT_AGENT_GATEWAY_USER_ID
  if (gatewayKey) {
    return {
      provider: 'openai-compatible',
      apiKey: gatewayKey,
      model: process.env.MOVSCRIPT_AGENT_GATEWAY_MODEL || process.env.MOVSCRIPT_AGENT_OPENAI_MODEL || 'movscript-default-chat',
      baseURL: normalizeBaseURL(process.env.MOVSCRIPT_AGENT_GATEWAY_BASE_URL || process.env.MOVSCRIPT_AGENT_OPENAI_BASE_URL || 'http://127.0.0.1:8080/v1'),
      useForChat: true,
      useForPlanner: true,
      updatedAt: new Date(0).toISOString(),
    }
  }

  const apiKey = process.env.MOVSCRIPT_AGENT_OPENAI_API_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) return undefined
  return {
    provider: 'openai-compatible',
    apiKey,
    model: process.env.MOVSCRIPT_AGENT_OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    baseURL: normalizeBaseURL(process.env.MOVSCRIPT_AGENT_OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL),
    useForChat: true,
    useForPlanner: true,
    updatedAt: new Date(0).toISOString(),
  }
}

function normalizeBaseURL(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
