import type { MovScriptWorkspaceDomainIndex } from '@movscript/workspace/indexer'
import type { MovScriptAssetIndexArtifact, MovScriptDomainEntityRef } from './derivedArtifactTypes.js'
import { canonicalEntities, stringField } from './derivedArtifactHelpers.js'

export function deriveAssetIndex(index: MovScriptWorkspaceDomainIndex): MovScriptAssetIndexArtifact {
  return {
    schema: 'movscript.asset-index.v1',
    assets: canonicalEntities(index)
      .filter((entity) => entity.entityKind === 'asset')
      .map((entity) => ({
        ...(entity.id !== undefined ? { id: entity.id } : {}),
        path: entity.path,
        owner: assetOwnerRef(entity.path),
        slot: stringField(entity.record.slot),
      })),
  }
}

function assetOwnerRef(path: string): MovScriptDomainEntityRef {
  const parts = path.split('/')
  const statesIndex = parts.indexOf('states')
  if (statesIndex >= 0) return { entityKind: 'setting_state', id: parts[statesIndex + 1] }
  return { entityKind: 'unknown' }
}
