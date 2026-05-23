import type { RuntimeWork } from '../runtimeWork/runtimeWork.js'
import type {
  AgentRun,
  AgentSession,
  AgentTaskGraphSnapshot,
  AgentThread,
  RuntimeContinuation,
  RuntimeInteraction,
  RuntimeWakeEvent,
} from '../state/types.js'

export interface RuntimeThreadSnapshotV2 {
  schema: 'movscript.agent.internal-thread-snapshot.v1'
  updatedAt: string
  thread: AgentThread
  runs: AgentRun[]
  works: RuntimeWork[]
  interactions: RuntimeInteraction[]
  continuations: RuntimeContinuation[]
  wakeEvents: RuntimeWakeEvent[]
  current: {
    activeRunIds: string[]
    waitingRunIds: string[]
    runningWorkIds: string[]
    pendingInteractionIds: string[]
    readyContinuationIds: string[]
    queuedWakeEventIds: string[]
  }
}

export interface RuntimeSessionSnapshotV1 {
  schema: 'movscript.agent.internal-session-snapshot.v1'
  updatedAt: string
  session: AgentSession
  threads: AgentThread[]
  taskGraphs: AgentTaskGraphSnapshot[]
  runs: AgentRun[]
  works: RuntimeWork[]
  interactions: RuntimeInteraction[]
  continuations: RuntimeContinuation[]
  wakeEvents: RuntimeWakeEvent[]
  current: {
    activeThreadIds: string[]
    activeRunIds: string[]
    waitingRunIds: string[]
    runningWorkIds: string[]
    pendingInteractionIds: string[]
    readyContinuationIds: string[]
    queuedWakeEventIds: string[]
  }
}

export function buildRuntimeThreadSnapshotV2(input: {
  thread: AgentThread
  runs: AgentRun[]
  works: RuntimeWork[]
  interactions: RuntimeInteraction[]
  continuations: RuntimeContinuation[]
  wakeEvents: RuntimeWakeEvent[]
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
  const queuedWakeEventIds = input.wakeEvents
    .filter((event) => event.status === 'queued' || event.status === 'processing')
    .map((event) => event.id)

  return {
    schema: 'movscript.agent.internal-thread-snapshot.v1',
    updatedAt: maxTimestamp([
      input.thread.updatedAt,
      ...input.runs.map((run) => run.updatedAt),
      ...input.works.map((work) => work.updatedAt),
      ...input.interactions.map((interaction) => interaction.updatedAt),
      ...input.continuations.map((continuation) => continuation.updatedAt),
      ...input.wakeEvents.map((event) => event.updatedAt),
    ]),
    thread: input.thread,
    runs: input.runs,
    works: input.works,
    interactions: input.interactions,
    continuations: input.continuations,
    wakeEvents: input.wakeEvents,
    current: {
      activeRunIds,
      waitingRunIds,
      runningWorkIds,
      pendingInteractionIds,
      readyContinuationIds,
      queuedWakeEventIds,
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
  wakeEvents: RuntimeWakeEvent[]
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
  const queuedWakeEventIds = input.wakeEvents
    .filter((event) => event.status === 'queued' || event.status === 'processing')
    .map((event) => event.id)

  return {
    schema: 'movscript.agent.internal-session-snapshot.v1',
    updatedAt: maxTimestamp([
      input.session.updatedAt,
      ...input.threads.map((thread) => thread.updatedAt),
      ...input.taskGraphSnapshots.map((snapshot) => snapshot.taskGraph.updatedAt),
      ...input.taskGraphSnapshots.flatMap((snapshot) => snapshot.tasks.map((task) => task.updatedAt)),
      ...input.runs.map((run) => run.updatedAt),
      ...input.works.map((work) => work.updatedAt),
      ...input.interactions.map((interaction) => interaction.updatedAt),
      ...input.continuations.map((continuation) => continuation.updatedAt),
      ...input.wakeEvents.map((event) => event.updatedAt),
    ]),
    session: input.session,
    threads: input.threads,
    taskGraphs: input.taskGraphSnapshots,
    runs: input.runs,
    works: input.works,
    interactions: input.interactions,
    continuations: input.continuations,
    wakeEvents: input.wakeEvents,
    current: {
      activeThreadIds,
      activeRunIds,
      waitingRunIds,
      runningWorkIds,
      pendingInteractionIds,
      readyContinuationIds,
      queuedWakeEventIds,
    },
  }
}

function maxTimestamp(values: string[]): string {
  const sorted = values.filter(Boolean).sort()
  return sorted.at(-1) ?? new Date(0).toISOString()
}
