import type { JSONValue } from './protocolJson.js'

export interface ToolCall {
  id?: string
  name: string
  args?: Record<string, JSONValue>
  arguments?: Record<string, JSONValue>
  origin?: AgentToolCallOrigin
}

export interface AgentToolCallOrigin {
  toolCallId?: string
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  roundSource?: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final'
}
