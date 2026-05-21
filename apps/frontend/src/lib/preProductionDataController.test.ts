import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isInternalPreProductionCandidateSlot,
  preProductionAssetSlotCandidatesQueryKey,
  preProductionAssetSlotsQueryKey,
  preProductionCreativeReferencesQueryKey,
} from './preProductionDataController'
import type { AssetSlotRecord } from './preProductionAssetRows'

test('pre-production data controller defines stable query keys', () => {
  assert.deepEqual(preProductionCreativeReferencesQueryKey(42), ['pre-production-creative-references', 42])
  assert.deepEqual(preProductionAssetSlotsQueryKey(42), ['semantic-asset-slots-page', 42])
  assert.deepEqual(preProductionAssetSlotCandidatesQueryKey(42), ['semantic-asset-slot-candidates-page', 42])
})

test('pre-production data controller filters internal candidate slots', () => {
  assert.equal(isInternalPreProductionCandidateSlot({ ID: 10, owner_type: 'asset_slot' } as AssetSlotRecord), true)
  assert.equal(isInternalPreProductionCandidateSlot({ ID: 11, owner_type: 'creative_reference' } as AssetSlotRecord), false)
  assert.equal(isInternalPreProductionCandidateSlot({ ID: 12 } as AssetSlotRecord), false)
})
