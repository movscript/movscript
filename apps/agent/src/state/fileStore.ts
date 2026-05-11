import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import type { AgentRun, AgentThread, AgentTraceEvent } from './types.js'
import { InMemoryAgentStore, type AgentStore } from './store.js'

interface AgentStateFile {
  version: 1 | 2
  threads: AgentThread[]
  runs: AgentRun[]
  traceEvents?: AgentTraceEvent[]
}

export class FileAgentStore extends InMemoryAgentStore implements AgentStore {
  readonly filePath: string

  constructor(filePath = resolveAgentStatePath()) {
    super()
    this.filePath = filePath
    this.load()
  }

  override createThread(thread: AgentThread): void {
    super.createThread(thread)
    this.persist()
  }

  override updateThread(thread: AgentThread): void {
    super.updateThread(thread)
    this.persist()
  }

  override createRun(run: AgentRun): void {
    super.createRun(run)
    this.persist()
  }

  override updateRun(run: AgentRun): void {
    super.updateRun(run)
    this.persist()
  }

  override appendTraceEvent(event: AgentTraceEvent): void {
    super.appendTraceEvent(event)
    this.persist()
  }

  private load(): void {
    if (!existsSync(this.filePath)) return
    const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<AgentStateFile>
    for (const thread of parsed.threads ?? []) {
      super.createThread(normalizeThread(thread))
    }
    for (const run of parsed.runs ?? []) {
      super.createRun(run)
    }
    for (const event of parsed.traceEvents ?? []) {
      super.appendTraceEvent(event)
    }
  }

  private persist(): void {
    const runs = this.listRuns()
    const state: AgentStateFile = {
      version: 2,
      threads: this.listThreads(),
      runs,
      traceEvents: runs.flatMap((run) => this.listRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })),
    }
    atomicWriteJSON(this.filePath, state)
  }
}

export function resolveAgentStatePath(): string {
  if (process.env.MOVSCRIPT_AGENT_STATE_PATH) return process.env.MOVSCRIPT_AGENT_STATE_PATH
  if (process.env.MOVSCRIPT_AGENT_USER_DATA_DIR) {
    return join(process.env.MOVSCRIPT_AGENT_USER_DATA_DIR, 'state.json')
  }
  return join(process.cwd(), '.movscript-agent', 'state.json')
}

export function resolveAgentMemoryPath(statePath = resolveAgentStatePath()): string {
  if (process.env.MOVSCRIPT_AGENT_MEMORY_PATH) return process.env.MOVSCRIPT_AGENT_MEMORY_PATH
  if (statePath.endsWith('.json')) return statePath.replace(/\.json$/, '.memories.json')
  return join(statePath, 'memories.json')
}

export function fallbackUserStatePath(): string {
  return join(homedir(), '.movscript-agent', 'state.json')
}

export function atomicWriteJSON(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tmpPath, filePath)
}

function normalizeThread(thread: AgentThread): AgentThread {
  return {
    ...thread,
    archived: thread.archived === true,
    status: thread.status ?? threadStatusFromRunStatus(thread.lastRunStatus),
    messages: Array.isArray(thread.messages) ? thread.messages : [],
  }
}

function threadStatusFromRunStatus(status: AgentThread['lastRunStatus']): AgentThread['status'] {
  if (!status) return 'idle'
  if (status === 'queued' || status === 'in_progress') return 'running'
  if (status === 'requires_action') return 'requires_action'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  return 'completed'
}
