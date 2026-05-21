import type { AgentIOOperation, AgentIOOperationKind, AgentIOStartInput } from './agentIOOperation.js'

export interface AgentIOProvider {
  readonly kind: AgentIOOperationKind
  start(input: AgentIOStartInput): Promise<AgentIOOperation>
  observe(operation: AgentIOOperation, options?: { signal?: AbortSignal }): Promise<AgentIOOperation>
  cancel?(operation: AgentIOOperation, options?: { signal?: AbortSignal }): Promise<AgentIOOperation>
}

