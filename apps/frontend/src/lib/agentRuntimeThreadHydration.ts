import { fetchAllRunTraceEvents, fetchResourceById, type AgentMessageViewModelDeps } from '@/lib/agentMessageViewModel'
import { localAgentClient, type AgentRun, type AgentThread, type AgentTraceEvent, type LocalAgentClient } from '@/lib/localAgentClient'
import { projectRuntimeThreadMessages } from '@/lib/agentThreadProjection'
import type { ChatMessage, ChatRunActivityEvent } from '@/store/agentStore'
import type { RawResource } from '@/types'

type RuntimeThreadHydrationClient = Pick<LocalAgentClient, 'getThread' | 'listRunsByThread'> & Partial<Pick<LocalAgentClient, 'getThreadRuntime'>>

export interface RuntimeThreadHydrationResult {
  thread: AgentThread
  runs: AgentRun[]
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
  return { thread, runs, messages }
}

function mergeRuns(primary: AgentRun[], ensured: AgentRun[]): AgentRun[] {
  const byId = new Map<string, AgentRun>()
  for (const run of primary) byId.set(run.id, run)
  for (const run of ensured) {
    if (!byId.has(run.id)) byId.set(run.id, run)
  }
  return Array.from(byId.values())
}
