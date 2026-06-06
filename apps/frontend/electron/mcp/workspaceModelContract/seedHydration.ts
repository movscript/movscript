import type { MovScriptWorkspaceKind } from '../../../src/shared/contracts/movscriptWorkspace'
import type { WorkspaceSeedData } from './types'
import {
  collectSeedSourceVersions,
} from './seedSummaries'
import { hydrateWorkspaceSeedInclude } from './seedHydrationIncludes'
import { resolveWorkspaceSeedHydrationTarget } from './seedHydrationTarget'

export async function hydrateWorkspaceSeedData(
  kind: MovScriptWorkspaceKind,
  target: Record<string, unknown>,
  include: string[],
): Promise<WorkspaceSeedData> {
  const data: Record<string, unknown> = {}
  const sourceVersions: Record<string, unknown> = {}
  const warnings: string[] = []
  const { projectId, targetIds } = resolveWorkspaceSeedHydrationTarget(kind, target)

  if (!projectId) {
    return { data, sourceVersions, warnings: ['projectId unavailable; seed hydration skipped.'] }
  }

  for (const item of include) {
    try {
      const hydrated = await hydrateWorkspaceSeedInclude(kind, projectId, targetIds, item)
      if (hydrated === undefined) continue
      data[item] = hydrated
      sourceVersions[item] = collectSeedSourceVersions(hydrated)
    } catch (error) {
      warnings.push(`${item}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return { data, sourceVersions, warnings }
}
