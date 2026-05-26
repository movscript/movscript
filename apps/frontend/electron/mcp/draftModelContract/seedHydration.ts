import type { AgentDraftKind } from '../../../src/shared/contracts/agentDraft'
import type { DraftSeedData } from './types'
import {
  collectSeedSourceVersions,
} from './seedSummaries'
import { hydrateDraftSeedInclude } from './seedHydrationIncludes'
import { resolveDraftSeedHydrationTarget } from './seedHydrationTarget'

export async function hydrateDraftSeedData(
  kind: AgentDraftKind,
  target: Record<string, unknown>,
  include: string[],
): Promise<DraftSeedData> {
  const data: Record<string, unknown> = {}
  const sourceVersions: Record<string, unknown> = {}
  const warnings: string[] = []
  const { projectId, targetIds } = resolveDraftSeedHydrationTarget(kind, target)

  if (!projectId) {
    return { data, sourceVersions, warnings: ['projectId unavailable; seed hydration skipped.'] }
  }

  for (const item of include) {
    try {
      const hydrated = await hydrateDraftSeedInclude(kind, projectId, targetIds, item)
      if (hydrated === undefined) continue
      data[item] = hydrated
      sourceVersions[item] = collectSeedSourceVersions(hydrated)
    } catch (error) {
      warnings.push(`${item}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return { data, sourceVersions, warnings }
}
