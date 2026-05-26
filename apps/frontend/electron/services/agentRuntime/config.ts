export const DEFAULT_PRODUCTION_RUNTIME_BASE_URL = 'http://127.0.0.1:28765'
export const DEFAULT_MCP_ENDPOINT = 'http://127.0.0.1:18765/mcp'
export const DEFAULT_BACKEND_API_BASE_URL = 'http://localhost:8765'
export const DEFAULT_AGENT_USER_DATA_DIR = 'movscript-agent'
export const MIN_AGENT_RUNTIME_API_VERSION = 1

export type AgentRuntimeLaunchPolicy = 'spawn' | 'external'

export function getAgentRuntimeLaunchPolicy(): AgentRuntimeLaunchPolicy {
  const raw = (process.env.MOVSCRIPT_AGENT_POLICY || '').trim().toLowerCase()
  if (raw === 'external' || raw === 'spawn') return raw
  return 'spawn'
}

export function normalizeBaseURL(value?: string): string {
  return (value || DEFAULT_PRODUCTION_RUNTIME_BASE_URL).replace(/\/+$/, '')
}

export function resolvePort(baseURL: string): number {
  const url = new URL(baseURL)
  return Number(url.port || 28765)
}

export function normalizeBackendAPIBaseURL(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`
}
