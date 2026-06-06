import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWorkspaceAssetSlotCandidates,
  isInternalPreProductionCandidateSlot,
  preProductionAssetSlotCandidatesQueryKey,
  preProductionAssetSlotsQueryKey,
  preProductionSettingsQueryKey,
  preProductionWorkspaceDataQueryKey,
} from './preProductionDataController'
import type { AssetSlotRecord } from '../domain/preProductionAssetRows'

test('pre-production data controller defines stable query keys', () => {
  assert.deepEqual(preProductionSettingsQueryKey(42), ['pre-production-settings', 42])
  assert.deepEqual(preProductionAssetSlotsQueryKey(42), ['semantic-asset-slots-page', 42])
  assert.deepEqual(preProductionAssetSlotCandidatesQueryKey(42), ['semantic-asset-slot-candidates-page', 42])
  assert.deepEqual(preProductionWorkspaceDataQueryKey(42), ['pre-production-workspace-data', 42])
})

test('pre-production data controller filters internal candidate slots', () => {
  assert.equal(isInternalPreProductionCandidateSlot({ ID: 10, owner_type: 'asset_slot' } as AssetSlotRecord), true)
  assert.equal(isInternalPreProductionCandidateSlot({ ID: 10, owner_type: 'asset_slot', owner_id: 2 } as AssetSlotRecord, new Map([[10, 2]])), true)
  assert.equal(isInternalPreProductionCandidateSlot({ ID: 10, owner_type: 'asset_slot', owner_id: 3 } as AssetSlotRecord, new Map([[10, 2]])), false)
  assert.equal(isInternalPreProductionCandidateSlot({ ID: 10, owner_type: 'asset_slot' } as AssetSlotRecord, new Map([[10, 2]])), false)
  assert.equal(isInternalPreProductionCandidateSlot({ ID: 11, owner_type: 'setting' } as AssetSlotRecord), false)
  assert.equal(isInternalPreProductionCandidateSlot({ ID: 12 } as AssetSlotRecord), false)
})

test('pre-production data controller derives candidates from local asset slot edit records', () => {
  const candidates = buildWorkspaceAssetSlotCandidates([
    { ID: 10, name: 'Parent', locked_asset_slot_id: 11 } as AssetSlotRecord,
    { ID: 11, name: 'Selected Candidate', owner_type: 'asset_slot', owner_id: 10, resource_id: 99 } as AssetSlotRecord,
    { ID: 12, name: 'Rejected Candidate', owner_type: 'asset_slot', owner_id: 10, status: 'rejected' } as AssetSlotRecord,
  ])

  assert.equal(candidates.length, 2)
  assert.equal(candidates[0].asset_slot_id, 10)
  assert.equal(candidates[0].candidate_asset_slot_id, 11)
  assert.equal(candidates[0].candidate_asset_slot?.resource_id, 99)
  assert.equal(candidates[0].status, 'selected')
  assert.equal(candidates[1].status, 'rejected')
})
