import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assetKindLabel,
  buildAssetCandidatePatchPayload,
  buildPreProductionAssetRows,
  buildReferenceAssetClusters,
  candidateReferenceResourceIds,
  normalizeAssetKind,
  normalizeSlotStatus,
  rowHasActiveAssetCandidates,
  slotScopeLabel,
  type AssetSlotCandidateRecord,
  type AssetSlotRecord,
  type CreativeReferenceRecord,
} from './preProductionAssetRows'

function slot(input: Partial<AssetSlotRecord> & Pick<AssetSlotRecord, 'ID'>): AssetSlotRecord {
  return {
    project_id: 1,
    entity_type: 'asset_slot',
    ...input,
  }
}

function candidate(input: Partial<AssetSlotCandidateRecord> & Pick<AssetSlotCandidateRecord, 'ID'>): AssetSlotCandidateRecord {
  return {
    project_id: 1,
    entity_type: 'asset_slot_candidate',
    ...input,
  }
}

function reference(input: Partial<CreativeReferenceRecord> & Pick<CreativeReferenceRecord, 'ID'>): CreativeReferenceRecord {
  return {
    project_id: 1,
    entity_type: 'creative_reference',
    ...input,
  }
}

test('pre-production asset rows hydrate candidate and locked slots', () => {
  const primary = slot({ ID: 10, name: '主角雨衣', kind: 'image', status: 'candidate', locked_asset_slot_id: 20 })
  const locked = slot({ ID: 20, name: '雨衣定稿', resource_id: 90 })
  const candidateSlot = slot({ ID: 30, name: '雨衣候选', resource_id: 91 })
  const rows = buildPreProductionAssetRows([
    primary,
  ], [
    candidate({ ID: 100, asset_slot_id: 10, candidate_asset_slot_id: 30 }),
    candidate({ ID: 101, asset_slot_id: 10, candidate_asset_slot_id: 31, status: 'rejected' }),
  ], new Map([
    [20, locked],
    [30, candidateSlot],
  ]))

  assert.equal(rows.length, 1)
  assert.equal(rows[0].kind, 'image')
  assert.equal(rows[0].lockedSlot?.ID, 20)
  assert.equal(rows[0].candidates.length, 1)
  assert.equal(rows[0].candidates[0].candidate_asset_slot?.ID, 30)
  assert.match(rows[0].searchText, /主角雨衣/)
  assert.match(rows[0].searchText, /图片/)
})

test('pre-production asset rows build candidate patch payloads without page state', () => {
  assert.deepEqual(buildAssetCandidatePatchPayload(10, candidate({
    ID: 100,
    candidate_asset_slot_id: 30,
    source_type: 'ai',
    source_id: 88,
    score: 0.82,
    note: '可用',
  }), 'selected'), {
    asset_slot_id: 10,
    candidate_asset_slot_id: 30,
    source_type: 'ai',
    source_id: 88,
    score: 0.82,
    status: 'selected',
    note: '可用',
  })
})

test('pre-production asset clusters summarize reference groups and active candidates', () => {
  const refs = [reference({ ID: 7, name: '主角', kind: 'person' })]
  const rows = buildPreProductionAssetRows([
    slot({ ID: 10, creative_reference_id: 7, status: 'candidate', kind: 'image' }),
    slot({ ID: 11, status: 'locked', kind: 'video' }),
  ], [
    candidate({ ID: 100, asset_slot_id: 10, candidate_asset_slot_id: 30 }),
  ], new Map([[30, slot({ ID: 30, resource_id: 91 })]]))

  const clusters = buildReferenceAssetClusters(refs, rows)

  assert.equal(clusters.length, 2)
  assert.equal(clusters[0].reference?.ID, 7)
  assert.equal(clusters[0].candidate, 1)
  assert.equal(clusters[1].reference, null)
  assert.equal(clusters[1].locked, 1)
  assert.equal(rowHasActiveAssetCandidates(rows[0]), true)
})

test('pre-production asset rows collect up to three unique reference resource ids', () => {
  const [row] = buildPreProductionAssetRows([
    slot({ ID: 10, resource_id: 90, locked_asset_slot_id: 20 }),
  ], [
    candidate({ ID: 100, asset_slot_id: 10, candidate_asset_slot: slot({ ID: 30, resource_id: 91 }) }),
    candidate({ ID: 101, asset_slot_id: 10, candidate_asset_slot: slot({ ID: 31, resource_id: 92 }) }),
    candidate({ ID: 102, asset_slot_id: 10, candidate_asset_slot: slot({ ID: 32, resource_id: 93 }) }),
  ], new Map([[20, slot({ ID: 20, resource_id: 89 })]]))

  assert.deepEqual(candidateReferenceResourceIds(row), [89, 90, 91])
})

test('pre-production asset labels and normalization stay stable', () => {
  assert.equal(normalizeAssetKind('brand_pack'), 'brand_pack')
  assert.equal(normalizeAssetKind('unknown'), 'other')
  assert.equal(assetKindLabel('brand_pack'), '品牌包')
  assert.equal(normalizeSlotStatus('locked'), 'locked')
  assert.equal(normalizeSlotStatus('anything'), 'missing')
  assert.equal(slotScopeLabel(slot({ ID: 10, owner_type: 'content_unit', owner_id: 8 })), '制作项 #8')
})
