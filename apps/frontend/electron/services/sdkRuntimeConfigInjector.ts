import type { AgentRuntimeAccountConfig } from './agentRuntimeAccountResolver'

export const DEFAULT_OPENAI_MODEL_ENDPOINT_BASE_URL = 'https://api.openai.com/v1'
export const DEFAULT_ANTHROPIC_MODEL_ENDPOINT_BASE_URL = 'https://api.anthropic.com'

export function codexOptionsFromAccount(
  account: AgentRuntimeAccountConfig,
  envOverrides: NodeJS.ProcessEnv,
): Record<string, unknown> | undefined {
  const modelEndpointBaseURL = account.modelEndpointBaseURL
  const shouldSetBaseURL = account.backendProviderSelected || modelEndpointBaseURL !== DEFAULT_OPENAI_MODEL_ENDPOINT_BASE_URL
  const next: Record<string, unknown> = {
    baseUrl: modelEndpointBaseURL,
    ...(account.kind === 'apiKey' ? { apiKey: account.apiKey } : {}),
    env: {
      ...process.env,
      ...envOverrides,
      ...(account.kind === 'apiKey' ? { OPENAI_API_KEY: account.apiKey } : {}),
      ...(shouldSetBaseURL
        ? {
            OPENAI_BASE_URL: modelEndpointBaseURL,
            OPENAI_API_BASE_URL: modelEndpointBaseURL,
          }
        : {}),
    },
  }
  return Object.keys(next).length ? next : undefined
}

export function claudeOptionsFromAccount(
  account: AgentRuntimeAccountConfig,
  envOverrides: NodeJS.ProcessEnv,
): Record<string, unknown> {
  const modelEndpointBaseURL = normalizeClaudeSdkBaseURL(account.modelEndpointBaseURL)
  const shouldSetBaseURL = account.backendProviderSelected
    || modelEndpointBaseURL !== DEFAULT_ANTHROPIC_MODEL_ENDPOINT_BASE_URL
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...envOverrides,
    ...(account.kind === 'apiKey' ? { ANTHROPIC_API_KEY: account.apiKey } : {}),
    ...(shouldSetBaseURL
      ? {
          ANTHROPIC_BASE_URL: modelEndpointBaseURL,
          ANTHROPIC_API_BASE_URL: modelEndpointBaseURL,
        }
      : {}),
  }
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
