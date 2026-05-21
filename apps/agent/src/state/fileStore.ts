import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import type { AgentPlan, AgentRun, AgentTask, AgentThread, AgentTraceEvent } from './types.js'
import { InMemoryAgentStore, type AgentStore } from './store.js'
import type { AgentRunDebugLedger } from './runDebugLedger.js'
import { isRecord } from '../jsonValue.js'
import { isValidAgentProjectId } from '../context/runtimeContext.js'

interface AgentStateFile {
  version: 1 | 2 | 3
  threads: AgentThread[]
  runs: AgentRun[]
  plans?: AgentPlan[]
  tasks?: AgentTask[]
  traceEvents?: AgentTraceEvent[]
  debugLedgers?: AgentRunDebugLedger[]
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

  override updateRunDebugLedger(runId: string, ledger: AgentRunDebugLedger): void {
    super.updateRunDebugLedger(runId, ledger)
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
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown
    } catch {
      return
    }
    if (!isRecord(parsed)) return
    for (const thread of arrayValue(parsed.threads)) {
      if (!isRecord(thread)) continue
      super.createThread(normalizeThread(thread as unknown as AgentThread))
    }
    for (const run of arrayValue(parsed.runs)) {
      if (!isRecord(run)) continue
      super.createRun(run as unknown as AgentRun)
    }
    for (const plan of arrayValue(parsed.plans)) {
      if (!isRecord(plan)) continue
      super.createPlan(plan as unknown as AgentPlan)
    }
    for (const task of arrayValue(parsed.tasks)) {
      if (!isRecord(task)) continue
      super.createTask(task as unknown as AgentTask)
    }
    for (const event of arrayValue(parsed.traceEvents)) {
      if (!isRecord(event)) continue
      super.appendTraceEvent(event as unknown as AgentTraceEvent)
    }
    for (const ledger of arrayValue(parsed.debugLedgers)) {
      if (!isRecord(ledger) || ledger.schema !== 'movscript.agent.run-debug-ledger.v1' || typeof ledger.runId !== 'string') continue
      super.updateRunDebugLedger(ledger.runId, ledger as unknown as AgentRunDebugLedger)
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
      debugLedgers: runs.flatMap((run) => this.getRunDebugLedger(run.id) ?? []),
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
  const projectId = isValidAgentProjectId(thread.projectId) ? thread.projectId : undefined
  return {
    ...thread,
    ...(projectId !== undefined ? { projectId } : { projectId: undefined }),
    archived: thread.archived === true,
    status: thread.status ?? threadStatusFromRunStatus(thread.lastRunStatus),
    messages: Array.isArray(thread.messages) ? thread.messages : [],
  }
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function threadStatusFromRunStatus(status: AgentThread['lastRunStatus']): AgentThread['status'] {
  if (!status) return 'idle'
  if (status === 'queued' || status === 'in_progress') return 'running'
  if (status === 'requires_action') return 'requires_action'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  return 'completed'
}
