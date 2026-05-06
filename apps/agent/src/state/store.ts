import type { AgentRun, AgentThread, AgentThreadSummary } from './types.js'

export interface AgentStore {
  createThread(thread: AgentThread): void
  updateThread(thread: AgentThread): void
  listThreads(): AgentThread[]
  listThreadSummaries(): AgentThreadSummary[]
  getThread(id: string): AgentThread | undefined
  createRun(run: AgentRun): void
  updateRun(run: AgentRun): void
  listRuns(): AgentRun[]
  getRun(id: string): AgentRun | undefined
}

export class InMemoryAgentStore implements AgentStore {
  private readonly threads = new Map<string, AgentThread>()
  private readonly runs = new Map<string, AgentRun>()

  createThread(thread: AgentThread): void {
    this.threads.set(thread.id, clone(thread))
  }

  updateThread(thread: AgentThread): void {
    this.threads.set(thread.id, clone(thread))
  }

  listThreads(): AgentThread[] {
    return Array.from(this.threads.values())
      .map((thread) => clone(thread))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  listThreadSummaries(): AgentThreadSummary[] {
    return this.listThreads().map(toThreadSummary)
  }

  getThread(id: string): AgentThread | undefined {
    const thread = this.threads.get(id)
    return thread ? clone(thread) : undefined
  }

  createRun(run: AgentRun): void {
    this.runs.set(run.id, clone(run))
  }

  updateRun(run: AgentRun): void {
    this.runs.set(run.id, clone(run))
  }

  listRuns(): AgentRun[] {
    return Array.from(this.runs.values())
      .map((run) => clone(run))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  getRun(id: string): AgentRun | undefined {
    const run = this.runs.get(id)
    return run ? clone(run) : undefined
  }
}

export function toThreadSummary(thread: AgentThread): AgentThreadSummary {
  const lastMessage = thread.messages.at(-1)
  return {
    id: thread.id,
    ...(thread.title ? { title: thread.title } : {}),
    ...(typeof thread.projectId === 'number' ? { projectId: thread.projectId } : {}),
    ...(thread.metadata ? { metadata: clone(thread.metadata) } : {}),
    archived: thread.archived === true,
    ...(thread.lastRunStatus ? { lastRunStatus: thread.lastRunStatus } : {}),
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messageCount: thread.messages.length,
    ...(lastMessage ? { lastMessageAt: lastMessage.createdAt } : {}),
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
