import type { RuntimeOperation } from './runtimeOperation.js'
import type { AgentStore } from '../state/store.js'

export interface RuntimeOperationStore {
  create(operation: RuntimeOperation): RuntimeOperation
  update(operation: RuntimeOperation): RuntimeOperation
  get(id: string): RuntimeOperation | undefined
  list(query?: { runId?: string; status?: RuntimeOperation['status'] }): RuntimeOperation[]
}

export class InMemoryRuntimeOperationStore implements RuntimeOperationStore {
  private readonly operations = new Map<string, RuntimeOperation>()

  create(operation: RuntimeOperation): RuntimeOperation {
    this.operations.set(operation.id, clone(operation))
    return clone(operation)
  }

  update(operation: RuntimeOperation): RuntimeOperation {
    if (!this.operations.has(operation.id)) throw new Error(`runtime operation not found: ${operation.id}`)
    this.operations.set(operation.id, clone(operation))
    return clone(operation)
  }

  get(id: string): RuntimeOperation | undefined {
    const operation = this.operations.get(id)
    return operation ? clone(operation) : undefined
  }

  list(query: { runId?: string; status?: RuntimeOperation['status'] } = {}): RuntimeOperation[] {
    return Array.from(this.operations.values())
      .filter((operation) => query.runId === undefined || operation.runId === query.runId)
      .filter((operation) => query.status === undefined || operation.status === query.status)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(clone)
  }
}

export class AgentStoreRuntimeOperationStore implements RuntimeOperationStore {
  constructor(private readonly store: Pick<
    AgentStore,
    'createRuntimeOperation' | 'updateRuntimeOperation' | 'getRuntimeOperation' | 'listRuntimeOperations'
  >) {}

  create(operation: RuntimeOperation): RuntimeOperation {
    this.store.createRuntimeOperation(operation)
    return clone(operation)
  }

  update(operation: RuntimeOperation): RuntimeOperation {
    if (!this.store.getRuntimeOperation(operation.id)) throw new Error(`runtime operation not found: ${operation.id}`)
    this.store.updateRuntimeOperation(operation)
    return clone(operation)
  }

  get(id: string): RuntimeOperation | undefined {
    return this.store.getRuntimeOperation(id)
  }

  list(query: { runId?: string; status?: RuntimeOperation['status'] } = {}): RuntimeOperation[] {
    return this.store.listRuntimeOperations(query)
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
