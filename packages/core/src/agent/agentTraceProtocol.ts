import type { JSONValue } from './protocolJson.js'

export const AGENT_TRACE_EVENT_KINDS = [
  'run',
  'thread',
  'message',
  'context',
  'memory',
  'manifest',
  'skill',
  'tool_catalog',
  'prompt',
  'permission',
  'reasoning',
  'tool_call',
  'model_call',
  'approval',
  'input',
  'assistant',
  'task',
  'taskGraph',
  'error',
] as const

export type AgentTraceEventKind = typeof AGENT_TRACE_EVENT_KINDS[number]
export type AgentTraceStatus = 'started' | 'completed' | 'blocked' | 'failed' | 'info'

export interface AgentTraceEvent {
  id: string
  runId: string
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceStatus
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  roundSource?: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final'
  agentId?: string
  parentAgentId?: string
  stepId?: string
  toolName?: string
  data?: JSONValue
  durationMs?: number
  createdAt: string
  completedAt?: string
}

export interface AgentTraceQuery {
  cursor?: string
  limit?: number
  kind?: AgentTraceEventKind
}

export interface AgentRunTracePage {
  runId: string
  events: AgentTraceEvent[]
  total: number
  hasMore: boolean
  nextCursor?: string
}

export interface AgentRunTraceSummary {
  runId: string
  total: number
  byKind: Partial<Record<AgentTraceEventKind, number>>
  latestEvent?: AgentTraceEvent
}
