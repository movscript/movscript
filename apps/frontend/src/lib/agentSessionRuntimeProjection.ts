import type {
  AgentRuntimeSnapshotV2,
  AgentRun,
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
  current: AgentSessionRuntimeCurrentView
}

export interface AgentSessionRuntimeCurrentView {
  activeThreadIds: string[]
  activeRunIds: string[]
  waitingRunIds: string[]
  runningWorkIds: string[]
  pendingInteractionIds: string[]
  readyContinuationIds: string[]
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

export function buildAgentSessionRuntimeView(snapshot: AgentRuntimeSnapshotV2): AgentSessionRuntimeView {
  const session = snapshot.entities.sessions?.[0]
  const threads = snapshot.entities.threads ?? []
  const runs = snapshot.entities.runs ?? []
  const works = snapshot.entities.works ?? []
  const threadsById = new Map(threads.map((thread) => [thread.id, thread]))
  const runsById = new Map(runs.map((run) => [run.id, run]))
  const runsByThreadId = groupRunsByThread(runs)
  const generationWorks = works.filter((work) => work.kind === 'generation_job')
  const generationWorksByRunId = groupWorksByRun(generationWorks)
  const rootThread = session?.rootThreadId
    ? threadsById.get(session.rootThreadId)
    : threads.find((thread) => thread.agentRole === 'root' || !thread.parentThreadId)
  const activeThread = session?.activeThreadId
    ? threadsById.get(session.activeThreadId)
    : undefined

  return {
    sessionId: session?.id ?? snapshot.scope.id,
    rootThread,
    activeThread,
    plans: snapshot.entities.taskGraphs ?? [],
    childAgents: threads
      .filter((thread) => thread.parentThreadId || thread.agentRole === 'worker')
      .map((thread) => buildChildAgentView({
        thread,
        runs: runsByThreadId.get(thread.id) ?? [],
        runsById,
        generationWorksByRunId,
      }))
      .sort(compareChildAgents),
    generationWorks,
    current: currentViewFromSnapshot(snapshot),
  }
}

function currentViewFromSnapshot(snapshot: AgentRuntimeSnapshotV2): AgentSessionRuntimeCurrentView {
  const runs = snapshot.entities.runs ?? []
  const works = snapshot.entities.works ?? []
  const interactions = snapshot.entities.interactions ?? []
  const continuations = snapshot.entities.continuations ?? []
  return {
    activeThreadIds: [...new Set(runs.filter((run) => run.status === 'queued' || run.status === 'in_progress').map((run) => run.threadId))],
    activeRunIds: runs.filter((run) => run.status === 'queued' || run.status === 'in_progress').map((run) => run.id),
    waitingRunIds: runs.filter((run) => run.status === 'requires_action').map((run) => run.id),
    runningWorkIds: works.filter((work) => work.status === 'running').map((work) => work.id),
    pendingInteractionIds: interactions.filter((interaction) => interaction.status === 'pending').map((interaction) => interaction.id),
    readyContinuationIds: continuations.filter((continuation) => continuation.status === 'ready').map((continuation) => continuation.id),
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
