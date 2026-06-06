import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'

export function runTouchesProviderCatalog(run: AgentRun | null | undefined): boolean {
  if (!run) return false
  if (run.streamPartial) return false
  return false
}
