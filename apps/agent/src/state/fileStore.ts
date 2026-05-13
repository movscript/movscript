import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import type { AgentPlan, AgentRun, AgentTask, AgentThread, AgentTraceEvent } from './types.js'
import { InMemoryAgentStore, type AgentStore } from './store.js'

interface AgentStateFile {
  version: 1 | 2 | 3
  threads: AgentThread[]
  runs: AgentRun[]
  plans?: AgentPlan[]
  tasks?: AgentTask[]
  traceEvents?: AgentTraceEvent[]
}

export class FileAgentStore extends InMemoryAgentStore implements AgentStore {
  readonly filePath: string
  private persistTimer: NodeJS.Timeout | undefined
  private dirty = false
  private flushing = false
  private readonly flushBeforeExit: () => void

  constructor(filePath = resolveAgentStatePath()) {
    super()
    this.filePath = filePath
    this.load()
    this.flushBeforeExit = () => this.flush()
    process.once('beforeExit', this.flushBeforeExit)
    process.once('exit', this.flushBeforeExit)
  }

  override createThread(thread: AgentThread): void {
    super.createThread(thread)
    this.schedulePersist()
  }

  override updateThread(thread: AgentThread): void {
    super.updateThread(thread)
    this.schedulePersist()
  }

  override createRun(run: AgentRun): void {
    super.createRun(run)
    this.schedulePersist()
  }

  override updateRun(run: AgentRun): void {
    super.updateRun(run)
    this.schedulePersist()
  }

  override createPlan(plan: AgentPlan): void {
    super.createPlan(plan)
    this.schedulePersist()
  }

  override updatePlan(plan: AgentPlan): void {
    super.updatePlan(plan)
    this.schedulePersist()
  }

  override createTask(task: AgentTask): void {
    super.createTask(task)
    this.schedulePersist()
  }

  override updateTask(task: AgentTask): void {
    super.updateTask(task)
    this.schedulePersist()
  }

  override appendTraceEvent(event: AgentTraceEvent): void {
    super.appendTraceEvent(event)
    this.schedulePersist()
  }

  flush(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = undefined
    }
    if (!this.dirty || this.flushing) return
    this.flushing = true
    try {
      this.dirty = false
      this.persist()
    } finally {
      this.flushing = false
      if (this.dirty) this.schedulePersist()
    }
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
    for (const plan of parsed.plans ?? []) {
      super.createPlan(plan)
    }
    for (const task of parsed.tasks ?? []) {
      super.createTask(task)
    }
    for (const event of parsed.traceEvents ?? []) {
      super.appendTraceEvent(event)
    }
  }

  private schedulePersist(): void {
    this.dirty = true
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined
      this.flush()
    }, 250)
    this.persistTimer.unref?.()
  }

  private persist(): void {
    const runs = this.listRuns()
    const state: AgentStateFile = {
      version: 3,
      threads: this.listThreads(),
      runs,
      plans: this.listPlans(),
      tasks: this.listTasks(),
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
