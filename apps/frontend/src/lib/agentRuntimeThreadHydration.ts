import { fetchAllRunTraceEvents, fetchResourceById, type AgentMessageViewModelDeps } from '@/lib/agentMessageViewModel'
import { localAgentClient, type AgentRun, type AgentThread, type AgentTraceEvent, type LocalAgentClient } from '@/lib/localAgentClient'
import { projectRuntimeThreadMessages } from '@/lib/agentThreadProjection'
import type { ChatMessage, ChatRunActivityEvent } from '@/store/agentStore'
import type { RawResource } from '@/types'

type RuntimeThreadHydrationClient = Pick<LocalAgentClient, 'getThread' | 'listRunsByThread'> & Partial<Pick<LocalAgentClient, 'getThreadRuntime'>>

export interface RuntimeThreadHydrationResult {
  thread: AgentThread
  runs: AgentRun[]
  currentRun?: AgentRun
  actionableRuns: AgentRun[]
  messages: ChatMessage[]
}

export interface RuntimeThreadHydrationDeps extends AgentMessageViewModelDeps {
  client?: RuntimeThreadHydrationClient
  fetchAllRunTraceEvents?: (runId: string) => Promise<AgentTraceEvent[]>
  fetchResourceById?: (id: number) => Promise<RawResource | undefined>
}

export async function loadRuntimeThreadProjection(input: {
  threadId: string
  thread?: AgentThread
  existingMessages?: ChatMessage[]
  ensureRuns?: AgentRun[]
  liveEventsByRunId?: Record<string, ChatRunActivityEvent[]>
  signal?: AbortSignal
}, deps: RuntimeThreadHydrationDeps = {}): Promise<RuntimeThreadHydrationResult> {
  const client = deps.client ?? localAgentClient
  const snapshot = input.thread || !client.getThreadRuntime
    ? undefined
    : await client.getThreadRuntime(input.threadId, input.signal)
  const thread = input.thread ?? snapshot?.thread ?? await client.getThread(input.threadId, input.signal)
  const snapshotRuns = snapshot?.runs
  const runProjection = snapshotRuns
    ? { threadId: thread.id, runs: snapshotRuns }
    : await client.listRunsByThread(thread.id, input.signal).catch((error) => {
      if (input.signal?.aborted) throw error
      return { threadId: thread.id, runs: [] }
    })
  const runs = mergeRuns(runProjection.runs, input.ensureRuns ?? [])
  const actionableRuns = resolveActionableRuns(runs, snapshot?.interactions.actionableRunIds)
  const currentRun = resolveCurrentRun({
    runs,
    actionableRuns,
    snapshotRunId: snapshot?.current.runId,
    activeRunId: thread.activeRunId,
    lastRunId: thread.lastRunId,
  })
  const messages = await projectRuntimeThreadMessages({
    thread,
    runs,
    existingMessages: input.existingMessages,
    liveEventsByRunId: input.liveEventsByRunId,
    deps: {
      ...deps,
      fetchRunTraceEvents: deps.fetchRunTraceEvents ?? (async (runId) => {
        const events = await (deps.fetchAllRunTraceEvents ?? fetchAllRunTraceEvents)(runId)
        return events.filter((event) => event.kind === 'tool_call')
      }),
      fetchResourceById: deps.fetchResourceById ?? fetchResourceById,
    },
  })
  return { thread, runs, currentRun, actionableRuns, messages }
}

function mergeRuns(primary: AgentRun[], ensured: AgentRun[]): AgentRun[] {
  const byId = new Map<string, AgentRun>()
  for (const run of primary) byId.set(run.id, run)
  for (const run of ensured) {
    if (!byId.has(run.id)) byId.set(run.id, run)
  }
  return Array.from(byId.values())
}

function resolveCurrentRun(input: {
  runs: AgentRun[]
  actionableRuns: AgentRun[]
  snapshotRunId?: string
  activeRunId?: string
  lastRunId?: string
}): AgentRun | undefined {
  const byId = new Map(input.runs.map((run) => [run.id, run]))
  return input.actionableRuns[0]
    ?? (input.snapshotRunId ? byId.get(input.snapshotRunId) : undefined)
    ?? (input.activeRunId ? byId.get(input.activeRunId) : undefined)
    ?? (input.lastRunId ? byId.get(input.lastRunId) : undefined)
    ?? [...input.runs].sort(compareRunsByUpdatedAtDesc)[0]
}

function resolveActionableRuns(runs: AgentRun[], actionableRunIds: string[] | undefined): AgentRun[] {
  const byId = new Map(runs.map((run) => [run.id, run]))
  if (actionableRunIds?.length) {
    const indexed = actionableRunIds
      .map((runId) => byId.get(runId))
      .filter((run): run is AgentRun => !!run)
    if (indexed.length > 0) return indexed
  }
  return runs.filter(runNeedsUserAction).sort(compareRunsByUpdatedAtDesc)
}

function runNeedsUserAction(run: AgentRun): boolean {
  return run.status === 'requires_action'
    && (
      (run.pendingApprovals ?? []).some((approval) => approval.status === 'pending')
      || (run.pendingInputRequests ?? []).some((request) => request.status === 'pending')
    )
}

function compareRunsByUpdatedAtDesc(a: AgentRun, b: AgentRun): number {
  return timestamp(b.updatedAt ?? b.createdAt) - timestamp(a.updatedAt ?? a.createdAt)
}

function timestamp(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}
