import type { AgentRun } from '@/shared/infrastructure/localAgentClient'

export function runTouchesAgentCatalog(run: AgentRun | null | undefined): boolean {
  if (!run) return false
  if (run.streamPartial) return false
  return false
}
