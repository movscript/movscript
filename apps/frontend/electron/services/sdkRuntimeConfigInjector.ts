import type { AgentRuntimeAccountConfig } from './agentRuntimeAccountResolver'

export const DEFAULT_OPENAI_MODEL_ENDPOINT_BASE_URL = 'https://api.openai.com/v1'
export const DEFAULT_ANTHROPIC_MODEL_ENDPOINT_BASE_URL = 'https://api.anthropic.com'

export function codexOptionsFromAccount(
  account: AgentRuntimeAccountConfig,
  envOverrides: NodeJS.ProcessEnv,
  options: { disableBackendWebsockets?: boolean } = {},
): Record<string, unknown> | undefined {
  const modelEndpointBaseURL = account.modelEndpointBaseURL
  const shouldSetBaseURL = account.backendProviderSelected || modelEndpointBaseURL !== DEFAULT_OPENAI_MODEL_ENDPOINT_BASE_URL
  const env = normalizedSdkRuntimeEnv({
    ...process.env,
    ...envOverrides,
    ...(account.kind === 'apiKey' ? { OPENAI_API_KEY: account.apiKey } : {}),
    ...(shouldSetBaseURL
      ? {
          OPENAI_BASE_URL: modelEndpointBaseURL,
          OPENAI_API_BASE_URL: modelEndpointBaseURL,
        }
      : {}),
  })
  const next: Record<string, unknown> = {
    baseUrl: modelEndpointBaseURL,
    ...(account.backendProviderSelected && options.disableBackendWebsockets ? { config: codexBackendProviderConfig(modelEndpointBaseURL) } : {}),
    ...(account.kind === 'apiKey' ? { apiKey: account.apiKey } : {}),
    env,
  }
  return Object.keys(next).length ? next : undefined
}

function codexBackendProviderConfig(modelEndpointBaseURL: string): Record<string, unknown> {
  return {
    model_provider: 'movscript-backend-openai',
    model_providers: {
      'movscript-backend-openai': {
        name: 'Movscript Backend',
        base_url: modelEndpointBaseURL,
        env_key: 'OPENAI_API_KEY',
        wire_api: 'responses',
        supports_websockets: false,
      },
    },
  }
}

export function claudeOptionsFromAccount(
  account: AgentRuntimeAccountConfig,
  envOverrides: NodeJS.ProcessEnv,
): Record<string, unknown> {
  const modelEndpointBaseURL = normalizeClaudeSdkBaseURL(account.modelEndpointBaseURL)
  const shouldSetBaseURL = account.backendProviderSelected
    || modelEndpointBaseURL !== DEFAULT_ANTHROPIC_MODEL_ENDPOINT_BASE_URL
  const env: NodeJS.ProcessEnv = normalizedSdkRuntimeEnv({
    ...process.env,
    ...envOverrides,
    ...(account.kind === 'apiKey' ? { ANTHROPIC_API_KEY: account.apiKey } : {}),
    ...(shouldSetBaseURL
      ? {
          ANTHROPIC_BASE_URL: modelEndpointBaseURL,
          ANTHROPIC_API_BASE_URL: modelEndpointBaseURL,
        }
      : {}),
  })
  return { env }
}

export function normalizeClaudeSdkBaseURL(baseURL: string): string {
  try {
    const url = new URL(baseURL)
    if (url.pathname === '/v1') {
      url.pathname = ''
      return url.toString().replace(/\/+$/, '')
    }
  } catch {
    // Leave invalid/manual values untouched so the SDK can report the original issue.
  }
  return baseURL.replace(/\/+$/, '')
}

export function normalizedSdkRuntimeEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const pathKey = pathEnvKey(env)
  const currentPath = env[pathKey] || ''
  const electronNodeEnv = electronNodeRuntimeEnv(env)
  return {
    ...env,
    ...electronNodeEnv,
    [pathKey]: prependMissingPathSegments(currentPath, defaultSdkRuntimePathSegments()),
  }
}

function electronNodeRuntimeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (env.MOVSCRIPT_NODE) return {}
  if (!process.versions.electron) return {}
  return {
    MOVSCRIPT_NODE: process.execPath,
    ELECTRON_RUN_AS_NODE: env.ELECTRON_RUN_AS_NODE || '1',
  }
}

function pathEnvKey(env: NodeJS.ProcessEnv): string {
  if (process.platform !== 'win32') return 'PATH'
  const existing = Object.keys(env).find((key) => key.toLowerCase() === 'path')
  return existing || 'Path'
}

function prependMissingPathSegments(pathValue: string, segments: string[]): string {
  const delimiter = process.platform === 'win32' ? ';' : ':'
  const parts = pathValue.split(delimiter).filter(Boolean)
  const seen = new Set(parts)
  const prefix = segments.filter((segment) => segment && !seen.has(segment))
  return [...prefix, ...parts].join(delimiter)
}

function defaultSdkRuntimePathSegments(): string[] {
  if (process.platform === 'win32') return [
    'C:\\Program Files\\nodejs',
    'C:\\Windows\\System32',
    'C:\\Windows',
    'C:\\Windows\\System32\\Wbem',
  ]
  if (process.platform === 'darwin') return [
    '/opt/homebrew/opt/node@22/bin',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ]
  return [
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ]
}
