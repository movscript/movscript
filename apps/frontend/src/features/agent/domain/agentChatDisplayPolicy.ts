export type AgentChatContentKind =
  | 'prompt'
  | 'trace'
  | 'arguments'
  | 'rawDetails'
  | 'result'
  | 'error'
  | 'summary'
  | 'shortText'

export const AGENT_CHAT_COLLAPSE_LIMITS = {
  prompt: 1200,
  trace: 0,
  arguments: 0,
  rawDetails: 0,
  result: 3200,
  error: 3200,
  summary: 3200,
  shortText: 1200,
} as const satisfies Record<AgentChatContentKind, number>

export function agentChatContentDefaultOpen(kind: AgentChatContentKind, value: unknown): boolean {
  const limit = AGENT_CHAT_COLLAPSE_LIMITS[kind]
  if (limit <= 0) return false
  return agentChatContentLength(value) <= limit
}

export function agentChatListDefaultOpen(count: number): boolean {
  return count <= 3
}

function agentChatContentLength(value: unknown): number {
  if (typeof value === 'string') return value.length
  try {
    return JSON.stringify(value)?.length ?? 0
  } catch {
    return String(value).length
  }
}
