import { createAgentRuntimeTransport, type AgentRuntimeTransport } from '@/shared/infrastructure/agentRuntimeTransport'
import type { AgentRunStatus } from '@movscript/protocol'

export const DEFAULT_LOCAL_AGENT_HEALTH_TIMEOUT_MS = 5_000
export const DEFAULT_LOCAL_AGENT_REQUEST_TIMEOUT_MS = 30_000
export const DEFAULT_RUN_STREAM_HTTP_TIMEOUT_MS = 60_000

const DEFAULT_LOCAL_AGENT_BASE_URL = 'http://127.0.0.1:28765'

export const TERMINAL_RUN_STATUSES = new Set<AgentRunStatus>([
  'completed',
  'completed_with_warnings',
  'requires_action',
  'failed',
  'cancelled',
])

export function runtimeLocalAgentBaseURL(): string {
  return import.meta.env?.VITE_LOCAL_AGENT_BASE_URL || DEFAULT_LOCAL_AGENT_BASE_URL
}

export function runtimeLocalAgentTransport(baseURL: string): AgentRuntimeTransport {
  return createAgentRuntimeTransport({
    baseURL,
    mode: import.meta.env?.VITE_LOCAL_AGENT_TRANSPORT,
    socketPath: import.meta.env?.VITE_LOCAL_AGENT_SOCKET_PATH,
  })
}
