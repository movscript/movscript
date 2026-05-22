import type {
  AgentRun,
  AgentSessionRuntimeSnapshot,
  AgentTaskGraphSnapshot,
  AgentThread,
  RuntimeWork,
} from '@/lib/localAgentClient'

export interface AgentSessionRuntimeView {
  sessionId: string
  rootThread?: AgentThread
  activeThread?: AgentThread
  plans: AgentTaskGraphSnapshot[]
  childAgents: AgentSessionChildAgentView[]
  generationWorks: RuntimeWork[]
  current: AgentSessionRuntimeSnapshot['current']
}

export interface AgentSessionChildAgentView {
  thread: AgentThread
  run?: AgentRun
  parentRun?: AgentRun
  subagentName?: string
  status: AgentRun['status'] | AgentThread['status'] | 'idle'
  progress?: number
  taskId?: string
  taskGraphId?: string
  generationWorks: RuntimeWork[]
}

export function buildAgentSessionRuntimeView(snapshot: AgentSessionRuntimeSnapshot): AgentSessionRuntimeView {
  const threadsById = new Map(snapshot.threads.map((thread) => [thread.id, thread]))
  const runsById = new Map(snapshot.runs.map((run) => [run.id, run]))
  const runsByThreadId = groupRunsByThread(snapshot.runs)
  const generationWorks = snapshot.works.filter((work) => work.kind === 'generation_job')
  const generationWorksByRunId = groupWorksByRun(generationWorks)
  const rootThread = snapshot.session.rootThreadId
    ? threadsById.get(snapshot.session.rootThreadId)
    : snapshot.threads.find((thread) => thread.agentRole === 'root' || !thread.parentThreadId)
  const activeThread = snapshot.session.activeThreadId
    ? threadsById.get(snapshot.session.activeThreadId)
    : undefined

  return {
    sessionId: snapshot.session.id,
    rootThread,
    activeThread,
    plans: snapshot.taskGraphs,
    childAgents: snapshot.threads
      .filter((thread) => thread.parentThreadId || thread.agentRole === 'worker')
      .map((thread) => buildChildAgentView({
        thread,
        runs: runsByThreadId.get(thread.id) ?? [],
        runsById,
        generationWorksByRunId,
      }))
      .sort(compareChildAgents),
    generationWorks,
    current: snapshot.current,
  }
}

function buildChildAgentView(input: {
  thread: AgentThread
  runs: AgentRun[]
  runsById: Map<string, AgentRun>
  generationWorksByRunId: Map<string, RuntimeWork[]>
}): AgentSessionChildAgentView {
  const run = input.runs.sort(compareRunsByUpdatedAt)[0]
  const generationWorks = run ? input.generationWorksByRunId.get(run.id) ?? [] : []
  return {
    thread: input.thread,
    run,
    parentRun: run?.parentRunId ? input.runsById.get(run.parentRunId) : undefined,
    subagentName: stringMetadata(run?.metadata, 'subagentName') ?? input.thread.agentName,
    status: run?.status ?? input.thread.status ?? 'idle',
    progress: run?.progress,
    taskId: run?.taskId,
    taskGraphId: run?.taskGraphId,
    generationWorks,
  }
}

function groupRunsByThread(runs: AgentRun[]): Map<string, AgentRun[]> {
  const grouped = new Map<string, AgentRun[]>()
  for (const run of runs) {
    const current = grouped.get(run.threadId) ?? []
    current.push(run)
    grouped.set(run.threadId, current)
  }
  return grouped
}

function groupWorksByRun(works: RuntimeWork[]): Map<string, RuntimeWork[]> {
  const grouped = new Map<string, RuntimeWork[]>()
  for (const work of works) {
    const current = grouped.get(work.runId) ?? []
    current.push(work)
    grouped.set(work.runId, current)
  }
  return grouped
}

function stringMetadata(metadata: AgentRun['metadata'], key: string): string | undefined {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function compareRunsByUpdatedAt(left: AgentRun, right: AgentRun): number {
  return (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt)
}

function compareChildAgents(left: AgentSessionChildAgentView, right: AgentSessionChildAgentView): number {
  const leftTime = left.run?.updatedAt ?? left.thread.updatedAt
  const rightTime = right.run?.updatedAt ?? right.thread.updatedAt
  return rightTime.localeCompare(leftTime)
}
