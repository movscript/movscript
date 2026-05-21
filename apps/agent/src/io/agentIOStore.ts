import type { AgentIOOperation } from './agentIOOperation.js'

export interface AgentIOStore {
  create(operation: AgentIOOperation): AgentIOOperation
  update(operation: AgentIOOperation): AgentIOOperation
  get(id: string): AgentIOOperation | undefined
  list(query?: { runId?: string; status?: AgentIOOperation['status'] }): AgentIOOperation[]
}

export class InMemoryAgentIOStore implements AgentIOStore {
  private readonly operations = new Map<string, AgentIOOperation>()

  create(operation: AgentIOOperation): AgentIOOperation {
    this.operations.set(operation.id, clone(operation))
    return clone(operation)
  }

  update(operation: AgentIOOperation): AgentIOOperation {
    if (!this.operations.has(operation.id)) throw new Error(`runtime operation not found: ${operation.id}`)
    this.operations.set(operation.id, clone(operation))
    return clone(operation)
  }

  get(id: string): AgentIOOperation | undefined {
    const operation = this.operations.get(id)
    return operation ? clone(operation) : undefined
  }

  list(query: { runId?: string; status?: AgentIOOperation['status'] } = {}): AgentIOOperation[] {
    return Array.from(this.operations.values())
      .filter((operation) => query.runId === undefined || operation.runId === query.runId)
      .filter((operation) => query.status === undefined || operation.status === query.status)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(clone)
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
