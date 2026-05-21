import type { RuntimeOperation } from '../operations/runtimeOperation.js'
import type {
  AgentRun,
  AgentThread,
  RuntimeContinuation,
  RuntimeInteraction,
} from '../state/types.js'

export interface RuntimeThreadSnapshotV2 {
  schema: 'movscript.thread-runtime.v2'
  updatedAt: string
  thread: AgentThread
  runs: AgentRun[]
  operations: RuntimeOperation[]
  interactions: RuntimeInteraction[]
  continuations: RuntimeContinuation[]
  current: {
    activeRunIds: string[]
    waitingRunIds: string[]
    runningOperationIds: string[]
    pendingInteractionIds: string[]
    readyContinuationIds: string[]
  }
}

export function buildRuntimeThreadSnapshotV2(input: {
  thread: AgentThread
  runs: AgentRun[]
  operations: RuntimeOperation[]
  interactions: RuntimeInteraction[]
  continuations: RuntimeContinuation[]
}): RuntimeThreadSnapshotV2 {
  const activeRunIds = input.runs
    .filter((run) => run.status === 'queued' || run.status === 'in_progress')
    .map((run) => run.id)
  const waitingRunIds = input.runs
    .filter((run) => run.status === 'requires_action')
    .map((run) => run.id)
  const runningOperationIds = input.operations
    .filter((operation) => operation.status === 'queued' || operation.status === 'running' || operation.status === 'waiting')
    .map((operation) => operation.id)
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
      ...input.operations.map((operation) => operation.updatedAt),
      ...input.interactions.map((interaction) => interaction.updatedAt),
      ...input.continuations.map((continuation) => continuation.updatedAt),
    ]),
    thread: input.thread,
    runs: input.runs,
    operations: input.operations,
    interactions: input.interactions,
    continuations: input.continuations,
    current: {
      activeRunIds,
      waitingRunIds,
      runningOperationIds,
      pendingInteractionIds,
      readyContinuationIds,
    },
  }
}

function maxTimestamp(values: string[]): string {
  const sorted = values.filter(Boolean).sort()
  return sorted.at(-1) ?? new Date(0).toISOString()
}
