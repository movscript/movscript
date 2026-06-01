import type { AgentApprovalRequest, AgentInputRequest, AgentRun } from '../state/types.js'

export function uniqueRuntimeRunsById(runs: AgentRun[]): AgentRun[] {
  const byId = new Map<string, AgentRun>()
  for (const run of runs) byId.set(run.id, run)
  return Array.from(byId.values())
}

export function runtimeRunDisplaysOnThread(run: AgentRun, threadId: string): boolean {
  return runtimeRunDisplayThreadIds(run).includes(threadId)
}

export function runtimeRunDisplayThreadIds(run: AgentRun): string[] {
  const threadIds = [
    ...runtimeInteractionDisplayThreadIds(run.pendingApprovals),
    ...runtimeInteractionDisplayThreadIds(run.pendingInputRequests),
  ]
  return [...new Set(threadIds)]
}

function runtimeInteractionDisplayThreadIds(
  interactions: Array<Pick<AgentApprovalRequest | AgentInputRequest, 'displayThreadId' | 'displayAnchor'>> | undefined,
): string[] {
  return (interactions ?? []).flatMap((interaction) => [
    ...(interaction.displayThreadId ? [interaction.displayThreadId] : []),
    ...(interaction.displayAnchor?.threadId ? [interaction.displayAnchor.threadId] : []),
  ])
}
