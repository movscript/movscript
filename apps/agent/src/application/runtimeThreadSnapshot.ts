import type { RuntimeWork } from '../runtimeWork/runtimeWork.js'
import type {
  AgentRun,
  AgentSession,
  AgentTaskGraphSnapshot,
  AgentThread,
  RuntimeContinuation,
  RuntimeInteraction,
} from '../state/types.js'

export interface RuntimeThreadSnapshotV2 {
  schema: 'movscript.thread-runtime.v2'
  updatedAt: string
  thread: AgentThread
  runs: AgentRun[]
  works: RuntimeWork[]
  interactions: RuntimeInteraction[]
  continuations: RuntimeContinuation[]
  current: {
    activeRunIds: string[]
    waitingRunIds: string[]
    runningWorkIds: string[]
    pendingInteractionIds: string[]
    readyContinuationIds: string[]
  }
}

export interface RuntimeSessionSnapshotV1 {
  schema: 'movscript.session-runtime.v1'
  updatedAt: string
  session: AgentSession
  threads: AgentThread[]
  taskGraphs: AgentTaskGraphSnapshot[]
  runs: AgentRun[]
  works: RuntimeWork[]
  interactions: RuntimeInteraction[]
  continuations: RuntimeContinuation[]
  current: {
    activeThreadIds: string[]
    activeRunIds: string[]
    waitingRunIds: string[]
    runningWorkIds: string[]
    pendingInteractionIds: string[]
    readyContinuationIds: string[]
  }
}

export function buildRuntimeThreadSnapshotV2(input: {
  thread: AgentThread
  runs: AgentRun[]
  works: RuntimeWork[]
  interactions: RuntimeInteraction[]
  continuations: RuntimeContinuation[]
}): RuntimeThreadSnapshotV2 {
  const activeRunIds = input.runs
    .filter((run) => run.status === 'queued' || run.status === 'in_progress')
    .map((run) => run.id)
  const waitingRunIds = input.runs
    .filter((run) => run.status === 'requires_action')
    .map((run) => run.id)
  const runningWorkIds = input.works
    .filter((work) => work.status === 'queued' || work.status === 'running' || work.status === 'waiting')
    .map((work) => work.id)
  const pendingInteractionIds = input.interactions
    .filter((interaction) => interaction.status === 'pending')
    .map((interaction) => interaction.id)
  const readyContinuationIds = input.continuations
    .filter((continuation) => continuation.status === 'ready')
    .map((continuation) => continuation.id)

  return {
    schema: 'movscript.thread-runtime.v2',
    updatedAt: maxTimestamp([
      input.thread.updatedAt,
      ...input.runs.map((run) => run.updatedAt),
      ...input.works.map((work) => work.updatedAt),
      ...input.interactions.map((interaction) => interaction.updatedAt),
      ...input.continuations.map((continuation) => continuation.updatedAt),
    ]),
    thread: input.thread,
    runs: input.runs,
    works: input.works,
    interactions: input.interactions,
    continuations: input.continuations,
    current: {
      activeRunIds,
      waitingRunIds,
      runningWorkIds,
      pendingInteractionIds,
      readyContinuationIds,
    },
  }
}

export function buildRuntimeSessionSnapshotV1(input: {
  session: AgentSession
  threads: AgentThread[]
  taskGraphSnapshots: AgentTaskGraphSnapshot[]
  runs: AgentRun[]
  works: RuntimeWork[]
  interactions: RuntimeInteraction[]
  continuations: RuntimeContinuation[]
}): RuntimeSessionSnapshotV1 {
  const activeThreadIds = input.threads
    .filter((thread) => thread.status === 'running' || thread.status === 'requires_action')
    .map((thread) => thread.id)
  const activeRunIds = input.runs
    .filter((run) => run.status === 'queued' || run.status === 'in_progress')
    .map((run) => run.id)
  const waitingRunIds = input.runs
    .filter((run) => run.status === 'requires_action')
    .map((run) => run.id)
  const runningWorkIds = input.works
    .filter((work) => work.status === 'queued' || work.status === 'running' || work.status === 'waiting')
    .map((work) => work.id)
  const pendingInteractionIds = input.interactions
    .filter((interaction) => interaction.status === 'pending')
    .map((interaction) => interaction.id)
  const readyContinuationIds = input.continuations
    .filter((continuation) => continuation.status === 'ready')
    .map((continuation) => continuation.id)

  return {
    schema: 'movscript.session-runtime.v1',
    updatedAt: maxTimestamp([
      input.session.updatedAt,
      ...input.threads.map((thread) => thread.updatedAt),
      ...input.taskGraphSnapshots.map((snapshot) => snapshot.taskGraph.updatedAt),
      ...input.taskGraphSnapshots.flatMap((snapshot) => snapshot.tasks.map((task) => task.updatedAt)),
      ...input.runs.map((run) => run.updatedAt),
      ...input.works.map((work) => work.updatedAt),
      ...input.interactions.map((interaction) => interaction.updatedAt),
      ...input.continuations.map((continuation) => continuation.updatedAt),
    ]),
    session: input.session,
    threads: input.threads,
    taskGraphs: input.taskGraphSnapshots,
    runs: input.runs,
    works: input.works,
    interactions: input.interactions,
    continuations: input.continuations,
    current: {
      activeThreadIds,
      activeRunIds,
      waitingRunIds,
      runningWorkIds,
      pendingInteractionIds,
      readyContinuationIds,
    },
  }
}

function maxTimestamp(values: string[]): string {
  const sorted = values.filter(Boolean).sort()
  return sorted.at(-1) ?? new Date(0).toISOString()
}
