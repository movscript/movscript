import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { JSONValue } from '../types.js'
import { isJSONRecord, isRecord } from '../jsonValue.js'
import { atomicWriteJSON, resolveAgentStatePath } from '../state/fileStore.js'

export interface AgentCatalogState {
  version: 1
  updatedAt: string
  metadata?: Record<string, JSONValue>
}

export interface AgentCatalogStateStore {
  readonly filePath?: string
  load(): AgentCatalogState
  save(state: AgentCatalogState): AgentCatalogState
}

export class InMemoryAgentCatalogStateStore implements AgentCatalogStateStore {
  private state: AgentCatalogState = defaultCatalogState()

  load(): AgentCatalogState {
    return clone(this.state)
  }

  save(state: AgentCatalogState): AgentCatalogState {
    this.state = normalizeCatalogState(state)
    return clone(this.state)
  }
}

export class FileAgentCatalogStateStore implements AgentCatalogStateStore {
  readonly filePath: string

  constructor(filePath = resolveAgentCatalogStatePath()) {
    this.filePath = filePath
  }

  load(): AgentCatalogState {
    if (!existsSync(this.filePath)) return defaultCatalogState()
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown
    } catch {
      return defaultCatalogState()
    }
    return normalizeCatalogState(parsed)
  }

  save(state: AgentCatalogState): AgentCatalogState {
    const next = normalizeCatalogState(state)
    atomicWriteJSON(this.filePath, next)
    return next
  }
}

export function resolveAgentCatalogStatePath(statePath = resolveAgentStatePath()): string {
  if (process.env.MOVSCRIPT_AGENT_CATALOG_STATE_PATH) return process.env.MOVSCRIPT_AGENT_CATALOG_STATE_PATH
  if (statePath.endsWith('.json')) return statePath.replace(/\.json$/, '.catalog.json')
  return join(statePath, 'catalog.json')
}

export function defaultCatalogState(): AgentCatalogState {
  return { version: 1, updatedAt: new Date().toISOString() }
}

export function normalizeCatalogState(input: unknown): AgentCatalogState {
  const record = isRecord(input) ? input : {}
  return {
    version: 1,
    updatedAt: typeof record.updatedAt === 'string' && record.updatedAt.trim() ? record.updatedAt.trim() : new Date().toISOString(),
    ...(isJSONRecord(record.metadata) ? { metadata: record.metadata } : {}),
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
