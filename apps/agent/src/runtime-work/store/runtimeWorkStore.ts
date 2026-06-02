import type { RuntimeWork } from '../core/runtimeWork.js'
import type { AgentStore } from '../../state/store/core/store.js'

export interface RuntimeWorkStore {
  create(work: RuntimeWork): RuntimeWork
  update(work: RuntimeWork): RuntimeWork
  get(id: string): RuntimeWork | undefined
  list(query?: { runId?: string; status?: RuntimeWork['status'] }): RuntimeWork[]
}

export class InMemoryRuntimeWorkStore implements RuntimeWorkStore {
  private readonly works = new Map<string, RuntimeWork>()

  create(work: RuntimeWork): RuntimeWork {
    this.works.set(work.id, clone(work))
    return clone(work)
  }

  update(work: RuntimeWork): RuntimeWork {
    if (!this.works.has(work.id)) throw new Error(`runtime work not found: ${work.id}`)
    this.works.set(work.id, clone(work))
    return clone(work)
  }

  get(id: string): RuntimeWork | undefined {
    const work = this.works.get(id)
    return work ? clone(work) : undefined
  }

  list(query: { runId?: string; status?: RuntimeWork['status'] } = {}): RuntimeWork[] {
    return Array.from(this.works.values())
      .filter((work) => query.runId === undefined || work.runId === query.runId)
      .filter((work) => query.status === undefined || work.status === query.status)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(clone)
  }
}

export class AgentStoreRuntimeWorkStore implements RuntimeWorkStore {
  constructor(private readonly store: Pick<
    AgentStore,
    'createRuntimeWork' | 'updateRuntimeWork' | 'getRuntimeWork' | 'listRuntimeWorks'
  >) {}

  create(work: RuntimeWork): RuntimeWork {
    this.store.createRuntimeWork(work)
    return clone(work)
  }

  update(work: RuntimeWork): RuntimeWork {
    if (!this.store.getRuntimeWork(work.id)) throw new Error(`runtime work not found: ${work.id}`)
    this.store.updateRuntimeWork(work)
    return clone(work)
  }

  get(id: string): RuntimeWork | undefined {
    return this.store.getRuntimeWork(id)
  }

  list(query: { runId?: string; status?: RuntimeWork['status'] } = {}): RuntimeWork[] {
    return this.store.listRuntimeWorks(query)
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
