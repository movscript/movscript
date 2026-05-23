import { assistantResultPayloadForRun, fetchResourceById, type AgentMessageViewModelDeps } from '@/lib/agentMessageViewModel'
import { localAgentClient, type AgentRun, type AgentThread, type LocalAgentClient } from '@/lib/localAgentClient'
import { runtimeStatusLightFromThreadRuntimeSnapshot, type AgentRuntimeStatusLight } from '@/lib/agentRuntimeStatusLight'
import { buildAgentSessionRuntimeView } from '@/lib/agentSessionRuntimeProjection'
import { buildRuntimeThreadConversationProjection } from '@movscript/conversation'
import { formatLocalAgentAssistantContent } from '@/lib/localAgentResult'
import type { ChatMessage, ChatRunActivityEvent } from '@/store/agentStore'
import type { RawResource } from '@/types'

type RuntimeThreadHydrationClient = Pick<LocalAgentClient, 'getThread' | 'listRunsByThread'> & Partial<Pick<LocalAgentClient, 'getThreadRuntime' | 'getSessionRuntime'>>

export interface RuntimeThreadHydrationResult {
  thread: AgentThread
  runs: AgentRun[]
  currentRun?: AgentRun
  actionableRuns: AgentRun[]
  messages: ChatMessage[]
  runtimeStatusLight: AgentRuntimeStatusLight
}

export interface RuntimeThreadHydrationDeps extends AgentMessageViewModelDeps {
  client?: RuntimeThreadHydrationClient
  fetchResourceById?: (id: number) => Promise<RawResource | undefined>
}

export async function loadRuntimeThreadProjection(input: {
  threadId: string
  sessionId?: string
  thread?: AgentThread
  existingMessages?: ChatMessage[]
  ensureRuns?: AgentRun[]
  liveEventsByRunId?: Record<string, ChatRunActivityEvent[]>
  signal?: AbortSignal
}, deps: RuntimeThreadHydrationDeps = {}): Promise<RuntimeThreadHydrationResult> {
  const client = deps.client ?? localAgentClient
  const snapshot = input.thread && !input.sessionId
    ? undefined
    : await loadRuntimeSnapshot({
      client,
      threadId: input.threadId,
      sessionId: input.sessionId,
      signal: input.signal,
    })
  const sessionView = snapshot?.scope.type === 'session'
    ? buildAgentSessionRuntimeView(snapshot)
    : undefined
  const thread = input.thread
    ?? sessionView?.interactiveThread
    ?? sessionView?.rootThread
    ?? snapshot?.entities.threads?.find((candidate) => candidate.id === input.threadId)
    ?? await client.getThread(input.threadId, input.signal)
  const snapshotRuns = snapshot?.entities.runs
  const runProjection = snapshotRuns
    ? { threadId: thread.id, runs: snapshotRuns }
    : await client.listRunsByThread(thread.id, input.signal).catch((error) => {
      if (input.signal?.aborted) throw error
      return { threadId: thread.id, runs: [] }
    })
  const projection = await buildRuntimeThreadConversationProjection<ChatMessage, AgentRun, AgentThread, AgentMessageViewModelDeps>({
    thread,
    runs: runProjection.runs,
    ensureRuns: input.ensureRuns,
    interactions: snapshot?.entities.interactions,
    current: runtimeThreadCurrentFromV2(snapshot, thread.id),
    existingMessages: input.existingMessages,
    liveEventsByRunId: input.liveEventsByRunId,
    deps: {
      assistantResultPayloadForRun: (run, liveEvents, assistantContent, payloadDeps) =>
        assistantResultPayloadForRun(run as AgentRun, liveEvents as ChatRunActivityEvent[], assistantContent, payloadDeps),
      assistantResultPayloadDeps: {
        ...deps,
        fetchResourceById: deps.fetchResourceById ?? fetchResourceById,
      },
      formatAssistantContent: (run, runtimeThread) =>
        formatLocalAgentAssistantContent(run as AgentRun, runtimeThread as Pick<AgentThread, 'messages'>),
      localUserEchoContentKey,
    },
  })
  return { ...projection, runtimeStatusLight: runtimeStatusLightFromThreadRuntimeSnapshot(snapshot) }
}

async function loadRuntimeSnapshot(input: {
  client: RuntimeThreadHydrationClient
  threadId: string
  sessionId?: string
  signal?: AbortSignal
}) {
  if (input.sessionId && input.client.getSessionRuntime) {
    const sessionSnapshot = await input.client.getSessionRuntime(input.sessionId, input.signal).catch(() => undefined)
    if (sessionSnapshot) return sessionSnapshot
  }
  return input.client.getThreadRuntime
    ? await input.client.getThreadRuntime(input.threadId, input.signal)
    : undefined
}

function runtimeThreadCurrentFromV2(
  snapshot: Awaited<ReturnType<LocalAgentClient['getThreadRuntime']>> | undefined,
  threadId: string,
): { activeRunIds?: string[]; waitingRunIds?: string[] } | undefined {
  if (!snapshot) return undefined
  const runs = snapshot.entities.runs ?? []
  return {
    activeRunIds: runs.filter((run) => run.status === 'queued' || run.status === 'in_progress').map((run) => run.id),
    waitingRunIds: runs.filter((run) => run.status === 'requires_action').map((run) => run.id),
  }
}

function localUserEchoContentKey(text: string): string {
  return (text.split(/\n\n\[(?:用户附件引用|用户随消息提供的附件)\]/)[0] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}
