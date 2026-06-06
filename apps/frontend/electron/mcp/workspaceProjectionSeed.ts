import { getWorkspaceModelContract } from './workspaceModelContract/contract'
import { isRecord } from './valueUtils'
import type { MovScriptWorkspaceKind } from '../../src/shared/contracts/movscriptWorkspace'

export async function buildBackendProjectionSeed(input: {
  kind: MovScriptWorkspaceKind
  target: Record<string, unknown>
}): Promise<{
  snapshot: Record<string, unknown>
  sourceVersions?: Record<string, unknown>
}> {
  const contract = await getWorkspaceModelContract({
    kind: input.kind,
    target: input.target,
    hydrate: true,
  })
  const contractRecord = asRecord(contract, 'workspace projection seed')
  const seed = isRecord(contractRecord.seed) ? contractRecord.seed : {}
  return {
    snapshot: asRecord(contractRecord.initialContent, 'workspace projection seed initialContent'),
    ...(isRecord(seed.sourceVersions) ? { sourceVersions: seed.sourceVersions } : {}),
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object`)
  return value
}
