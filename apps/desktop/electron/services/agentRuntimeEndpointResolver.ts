import { resolveMovScriptDataServiceSession } from '@movscript/data-client'
import type { ProviderModelAPIKind } from '@movscript/core/agent'
import type { MovScriptWorkspaceConfig } from '@movscript/workspace/home'

export type RuntimeModelEndpointConfig = {
  apiKind: ProviderModelAPIKind
  modelEndpointBaseURL?: string
}

const DEFAULT_OPENAI_MODEL_ENDPOINT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_ANTHROPIC_MODEL_ENDPOINT_BASE_URL = 'https://api.anthropic.com'

export function resolveRuntimeModelEndpointConfig(
  config: MovScriptWorkspaceConfig,
  providerKey: string,
  providerKind: string,
  runtimeApi: string | undefined,
): RuntimeModelEndpointConfig {
  const provider = providerConfigRecord(config, providerKey)
  const rawApiKind = stringField(recordField(provider, 'config')?.apiKind)
    ?? stringField(recordField(provider, 'config')?.api_kind)
    ?? stringField(provider?.apiKind)
    ?? stringField(provider?.api_kind)
    ?? stringField(config.modelConfig?.apiKind)
  const apiKind = normalizeProviderModelAPIKind(rawApiKind)
    ?? defaultProviderModelAPIKind(providerKind, runtimeApi)
  const configuredModelEndpointBaseURL = stringField(recordField(provider, 'config')?.modelEndpointBaseURL)
    ?? stringField(config.modelConfig?.modelEndpointBaseURL)
  return {
    apiKind,
    ...(configuredModelEndpointBaseURL ? { modelEndpointBaseURL: normalizeBaseURL(configuredModelEndpointBaseURL) } : {}),
  }
}

export function resolveModelEndpointBaseURL(
  config: MovScriptWorkspaceConfig,
  input: {
    accountModelEndpointBaseURL?: string
    modelConfig: RuntimeModelEndpointConfig
    providerKey: string
    workspaceDir: string
    backendProviderSelected: boolean
  },
): string {
  const providerModelEndpointBaseURL = providerRecordModelEndpointBaseURL(config, input.providerKey)
  const backendModelEndpointBaseURL = input.backendProviderSelected
    ? `${resolveMovScriptDataServiceSession({ workspaceDir: input.workspaceDir }).baseURL}/v1`
    : undefined
  const defaultModelEndpointBaseURL = input.modelConfig.apiKind === 'anthropic_messages'
    ? DEFAULT_ANTHROPIC_MODEL_ENDPOINT_BASE_URL
    : DEFAULT_OPENAI_MODEL_ENDPOINT_BASE_URL
  const modelEndpointBaseURL = normalizeModelEndpointBaseURL(input.accountModelEndpointBaseURL)
    ?? normalizeModelEndpointBaseURL(providerModelEndpointBaseURL)
    ?? normalizeModelEndpointBaseURL(backendModelEndpointBaseURL)
    ?? input.modelConfig.modelEndpointBaseURL
    ?? defaultModelEndpointBaseURL
  return input.backendProviderSelected ? normalizeLocalBackendLoopbackModelEndpointBaseURL(modelEndpointBaseURL) : modelEndpointBaseURL
}

function defaultProviderModelAPIKind(providerKind: string, runtimeApi: string | undefined): ProviderModelAPIKind {
  if (providerKind === 'claude' || runtimeApi === 'claude-sdk') return 'anthropic_messages'
  return 'openai_responses'
}

function normalizeProviderModelAPIKind(value: string | undefined): ProviderModelAPIKind | undefined {
  switch (value) {
    case 'openai_responses':
    case 'openai_chat_completions':
    case 'anthropic_messages':
      return value
    default:
      return undefined
  }
}

function providerRecordModelEndpointBaseURL(config: MovScriptWorkspaceConfig, providerKey: string): string | undefined {
  const provider = providerConfigRecord(config, providerKey)
  return stringField(provider?.modelEndpointBaseURL)
    ?? stringField(recordField(provider, 'config')?.modelEndpointBaseURL)
}

function normalizeModelEndpointBaseURL(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = normalizeBaseURL(value)
  if (normalized.endsWith('/api/v1')) {
    return `${normalized.slice(0, -'/api/v1'.length)}/v1`
  }
  return normalized
}

function normalizeLocalBackendLoopbackModelEndpointBaseURL(value: string): string {
  try {
    const url = new URL(value)
    if (url.hostname !== 'localhost') return value
    url.hostname = '127.0.0.1'
    return url.toString().replace(/\/+$/, '')
  } catch {
    return value
  }
}

function providerConfigRecord(config: MovScriptWorkspaceConfig, providerKey: string): Record<string, unknown> | undefined {
  return recordField(recordField(config, 'providers'), providerKey)
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function recordField(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  const child = value[key]
  return isRecord(child) ? child : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeBaseURL(value: string): string {
  return value.replace(/\/+$/, '')
}
