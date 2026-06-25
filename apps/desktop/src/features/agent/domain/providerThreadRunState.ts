import type { AgentRun, AgentThread, ProviderInteraction } from '@movscript/agent-protocol'
import type { AgentConversationShape, ProviderThreadRunState, ResolveProviderThreadRunStateInput } from './agentConversationTypes'
import { isRecord } from './agentConversationUtils'

export function resolveProviderThreadRunState<Run extends AgentRun = AgentRun>(input: ResolveProviderThreadRunStateInput<Run>): ProviderThreadRunState<Run> {
  const runs = attachProviderInteractionApprovals(mergeProviderSessionRuns(input.runs ?? [], input.ensureRuns ?? []), input.interactions)
  const actionableRuns = resolveActionableProviderSessionRuns(runs, input.interactions)
  const currentRun = resolveCurrentProviderSessionRun({
    runs,
    actionableRuns,
    snapshotRunIds: [
      ...(input.current?.waitingRunIds ?? []),
      ...(input.current?.activeRunIds ?? []),
    ],
    activeRunId: input.thread?.activeRunId,
    lastRunId: input.thread?.lastRunId,
  })
  return {
    runs,
    actionableRuns,
    ...(currentRun ? { currentRun } : {}),
  }
}

export function mergeProviderSessionRuns<Run extends AgentRun = AgentRun>(primary: Run[], ensured: Run[]): Run[] {
  const byId = new Map<string, Run>()
  for (const run of primary) byId.set(run.id, run)
  for (const run of ensured) {
    if (!byId.has(run.id)) byId.set(run.id, run)
  }
  return Array.from(byId.values())
}

export function attachProviderInteractionApprovals<Run extends AgentRun = AgentRun>(runs: Run[], interactions: ProviderInteraction[] | undefined): Run[] {
  const interactionByApprovalId = new Map<string, string>()
  const interactionDisplayByApprovalId = new Map<string, Pick<ProviderInteraction, 'displayThreadId' | 'displayAnchor'>>()
  for (const interaction of interactions ?? []) {
    const payload = isRecord(interaction.payload) ? interaction.payload : undefined
    if (interaction.kind === 'approval') {
      const approvalId = typeof payload?.approvalId === 'string' ? payload.approvalId : undefined
      if (approvalId) {
        interactionByApprovalId.set(approvalId, interaction.id)
        interactionDisplayByApprovalId.set(approvalId, {
          ...(interaction.displayThreadId ? { displayThreadId: interaction.displayThreadId } : {}),
          ...(interaction.displayAnchor ? { displayAnchor: interaction.displayAnchor } : {}),
        })
      }
      continue
    }
  }
  if (interactionByApprovalId.size === 0) return runs
  return runs.map((run) => ({
    ...run,
    pendingApprovals: (run.pendingApprovals ?? []).map((approval) => {
      const interactionId = interactionByApprovalId.get(approval.id)
      const display = interactionDisplayByApprovalId.get(approval.id)
      return interactionId ? { ...approval, interactionId, ...display } : approval
    }),
  }) as Run)
}

export function resolveActionableProviderSessionRuns<Run extends AgentRun = AgentRun>(runs: Run[], interactions: Array<{ runId: string; status: string; kind?: string }> | undefined): Run[] {
  const byId = new Map(runs.map((run) => [run.id, run]))
  const actionableRunIds = Array.from(new Set((interactions ?? [])
    .filter((interaction) => interaction.status === 'pending' && (interaction.kind === 'approval' || interaction.kind === 'input'))
    .map((interaction) => interaction.runId)))
  if (actionableRunIds.length > 0) {
    const indexed = actionableRunIds
      .map((runId) => byId.get(runId))
      .filter((run): run is Run => !!run)
    if (indexed.length > 0) return indexed
  }
  return runs.filter(runNeedsProviderSessionUserAction).sort(compareRunsByUpdatedAtDesc)
}

export function resolveCurrentProviderSessionRun<Run extends AgentRun = AgentRun>(input: {
  runs: Run[]
  actionableRuns: Run[]
  snapshotRunIds?: string[]
  activeRunId?: string
  lastRunId?: string
}): Run | undefined {
  const byId = new Map(input.runs.map((run) => [run.id, run]))
  return input.actionableRuns[0]
    ?? (input.snapshotRunIds ?? []).map((runId) => byId.get(runId)).find((run): run is Run => !!run)
    ?? (input.activeRunId ? byId.get(input.activeRunId) : undefined)
    ?? (input.lastRunId ? byId.get(input.lastRunId) : undefined)
    ?? [...input.runs].sort(compareRunsByUpdatedAtDesc)[0]
}

export interface ProviderThreadConversationSessionState {
  conversationThreadBindings?: Record<string, { providerSessionTreeId?: string; providerThreadId?: string; updatedAt?: number }>
}

export function conversationIdForProviderThread(input: ProviderThreadConversationSessionState & { threadId: string }): string | undefined {
  return Object.entries(input.conversationThreadBindings ?? {})
    .filter(([, binding]) => binding.providerThreadId === input.threadId)
    .sort(([, left], [, right]) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))[0]
    ?.[0]
}

export function conversationIdForProviderSession(input: ProviderThreadConversationSessionState & { providerSessionTreeId: string }): string | undefined {
  return Object.entries(input.conversationThreadBindings ?? {})
    .filter(([, binding]) => binding.providerSessionTreeId === input.providerSessionTreeId)
    .sort(([, left], [, right]) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))[0]
    ?.[0]
}

export function existingConversationIdForProviderThread<Conversation extends Pick<AgentConversationShape, 'id' | 'providerThreadId'>>(
  threadId: string,
  conversations: Conversation[],
  sessionState: ProviderThreadConversationSessionState,
): string | undefined {
  const persistedConversationId = conversations.find((conversation) => conversation.providerThreadId === threadId)?.id
  const mappedConversationId = persistedConversationId ?? conversationIdForProviderThread({
    threadId,
    conversationThreadBindings: sessionState.conversationThreadBindings,
  })
  if (!mappedConversationId) return undefined
  return conversations.some((conversation) => conversation.id === mappedConversationId) ? mappedConversationId : undefined
}

export function existingConversationIdForProviderSession<Conversation extends Pick<AgentConversationShape, 'id' | 'providerSessionId'>>(
  providerSessionTreeId: string,
  conversations: Conversation[],
  sessionState: ProviderThreadConversationSessionState,
): string | undefined {
  const persistedConversationId = conversations.find((conversation) => conversation.providerSessionId === providerSessionTreeId)?.id
  const mappedConversationId = persistedConversationId ?? conversationIdForProviderSession({
    providerSessionTreeId,
    conversationThreadBindings: sessionState.conversationThreadBindings,
  })
  if (!mappedConversationId) return undefined
  return conversations.some((conversation) => conversation.id === mappedConversationId) ? mappedConversationId : undefined
}

function runNeedsProviderSessionUserAction(run: AgentRun): boolean {
  return run.status === 'requires_action'
    && (
      (run.pendingApprovals ?? []).some((approval) => approval.status === 'pending')
      || (run.pendingInputRequests ?? []).some((request) => request.status === 'pending')
    )
}

function compareRunsByUpdatedAtDesc(a: AgentRun, b: AgentRun): number {
  return providerSessionTimestamp(b.updatedAt ?? b.createdAt) - providerSessionTimestamp(a.updatedAt ?? a.createdAt)
}

function providerSessionTimestamp(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}
