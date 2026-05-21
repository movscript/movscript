import { fetchResourceById, type AgentMessageViewModelDeps } from '@/lib/agentMessageViewModel'
import { localAgentClient, type AgentRun, type AgentThread, type LocalAgentClient, type RuntimeInteraction } from '@/lib/localAgentClient'
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
  const runs = attachRuntimeInteractionIds(mergeRuns(runProjection.runs, input.ensureRuns ?? []), snapshot?.interactions)
  const actionableRuns = resolveActionableRuns(runs, snapshot?.interactions)
  const currentRun = resolveCurrentRun({
    runs,
    actionableRuns,
    snapshotRunIds: [
      ...(snapshot?.current.waitingRunIds ?? []),
      ...(snapshot?.current.activeRunIds ?? []),
    ],
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
      fetchResourceById: deps.fetchResourceById ?? fetchResourceById,
    },
  })
  return { thread, runs, currentRun, actionableRuns, messages }
}

function attachRuntimeInteractionIds(runs: AgentRun[], interactions: RuntimeInteraction[] | undefined): AgentRun[] {
  const interactionByApprovalId = new Map<string, string>()
  for (const interaction of interactions ?? []) {
    if (interaction.kind !== 'approval') continue
    const payload = isRecord(interaction.payload) ? interaction.payload : undefined
    const approvalId = typeof payload?.approvalId === 'string' ? payload.approvalId : undefined
    if (approvalId) interactionByApprovalId.set(approvalId, interaction.id)
  }
  if (interactionByApprovalId.size === 0) return runs
  return runs.map((run) => ({
    ...run,
    pendingApprovals: (run.pendingApprovals ?? []).map((approval) => {
      const interactionId = interactionByApprovalId.get(approval.id)
      return interactionId ? { ...approval, interactionId } : approval
    }),
  }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
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
  snapshotRunIds?: string[]
  activeRunId?: string
  lastRunId?: string
}): AgentRun | undefined {
  const byId = new Map(input.runs.map((run) => [run.id, run]))
  return input.actionableRuns[0]
    ?? (input.snapshotRunIds ?? []).map((runId) => byId.get(runId)).find((run): run is AgentRun => !!run)
    ?? (input.activeRunId ? byId.get(input.activeRunId) : undefined)
    ?? (input.lastRunId ? byId.get(input.lastRunId) : undefined)
    ?? [...input.runs].sort(compareRunsByUpdatedAtDesc)[0]
}

function resolveActionableRuns(runs: AgentRun[], interactions: Array<{ runId: string; status: string }> | undefined): AgentRun[] {
  const byId = new Map(runs.map((run) => [run.id, run]))
  const actionableRunIds = Array.from(new Set((interactions ?? [])
    .filter((interaction) => interaction.status === 'pending')
    .map((interaction) => interaction.runId)))
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
