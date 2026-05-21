import assert from 'node:assert/strict'
import test from 'node:test'

import type { AssetSlotViewModel, CreativeReferenceRecord, ReferenceAssetCluster } from './preProductionAssetRows'
import {
  buildPreProductionFilterParams,
  buildPreProductionReferenceSelectionParams,
  buildPreProductionSlotSelectionParams,
  resolvePreProductionPageSelection,
} from './preProductionPageController'

function row(id: number, kind: AssetSlotViewModel['kind'], referenceId?: number): AssetSlotViewModel {
  return {
    slot: { ID: id, kind, creative_reference_id: referenceId } as AssetSlotViewModel['slot'],
    candidates: [],
    searchText: '',
    kind,
    hasResource: false,
  }
}

function reference(id: number, name: string): CreativeReferenceRecord {
  return { ID: id, name, entity_type: 'creative_reference', project_id: 1 } as CreativeReferenceRecord
}

function cluster(referenceRecord: CreativeReferenceRecord | null, rows: AssetSlotViewModel[]): ReferenceAssetCluster {
  return {
    reference: referenceRecord,
    rows,
    missing: 0,
    candidate: 0,
    locked: 0,
    searchText: '',
  }
}

test('pre-production page controller resolves URL selection and kind filter', () => {
  const imageRow = row(10, 'image', 7)
  const videoRow = row(20, 'video', 9)
  const person = reference(7, '主角')
  const location = reference(9, '雨巷')
  const result = resolvePreProductionPageSelection({
    searchParams: new URLSearchParams('kind=video&asset_slot_id=20'),
    rows: [imageRow, videoRow],
    clusters: [cluster(person, [imageRow]), cluster(location, [videoRow])],
    referenceById: new Map([[person.ID, person], [location.ID, location]]),
  })

  assert.equal(result.kindFilter, 'video')
  assert.deepEqual(result.filtered.map((item) => item.slot.ID), [20])
  assert.equal(result.selected?.slot.ID, 20)
  assert.equal(result.selectedReference?.ID, 9)
  assert.equal(result.selectedCluster?.reference?.ID, 9)
  assert.deepEqual(result.filteredClusters.map((item) => item.rows.map((assetRow) => assetRow.slot.ID)), [[], [20]])
})

test('pre-production page controller resolves explicit reference and keeps empty hover by default', () => {
  const imageRow = row(10, 'image', 7)
  const person = reference(7, '主角')
  const location = reference(9, '雨巷')

  const explicit = resolvePreProductionPageSelection({
    searchParams: new URLSearchParams('reference_id=9'),
    rows: [imageRow],
    clusters: [cluster(person, [imageRow]), cluster(location, [])],
    referenceById: new Map([[person.ID, person], [location.ID, location]]),
  })
  assert.equal(explicit.selected, null)
  assert.equal(explicit.selectedReference?.ID, 9)
  assert.equal(explicit.selectedCluster?.reference?.ID, 9)

  const fallback = resolvePreProductionPageSelection({
    searchParams: new URLSearchParams(),
    rows: [imageRow],
    clusters: [cluster(person, [imageRow])],
    referenceById: new Map([[person.ID, person]]),
  })
  assert.equal(fallback.selectedReference, null)
  assert.equal(fallback.selectedCluster, null)
})

test('pre-production page controller builds shared filter params', () => {
  const next = buildPreProductionFilterParams(
    new URLSearchParams('kind=image&asset_slot_id=10&selected=10'),
    { kind: 'video', asset_slot_id: 20, selected: null },
  )

  assert.equal(next.get('kind'), 'video')
  assert.equal(next.get('asset_slot_id'), '20')
  assert.equal(next.has('selected'), false)
})

test('pre-production page controller toggles selected slot off on repeated click', () => {
  const imageRow = row(10, 'image', 7)
  const selected = buildPreProductionSlotSelectionParams(
    new URLSearchParams('reference_id=7&asset_slot_id=10'),
    [imageRow],
    10,
  )

  assert.equal(selected.has('reference_id'), false)
  assert.equal(selected.has('asset_slot_id'), false)
  assert.equal(selected.has('selected'), false)

  const forced = buildPreProductionSlotSelectionParams(
    new URLSearchParams('reference_id=7&asset_slot_id=10'),
    [imageRow],
    10,
    { forceOpen: true },
  )
  assert.equal(forced.get('reference_id'), '7')
  assert.equal(forced.get('asset_slot_id'), '10')
})

test('pre-production page controller toggles selected reference off on repeated click', () => {
  const selected = buildPreProductionReferenceSelectionParams(new URLSearchParams('reference_id=7'), 7)

  assert.equal(selected.has('reference_id'), false)
  assert.equal(selected.has('asset_slot_id'), false)

  const withAssetSelected = buildPreProductionReferenceSelectionParams(new URLSearchParams('reference_id=7&asset_slot_id=10'), 7)
  assert.equal(withAssetSelected.get('reference_id'), '7')
  assert.equal(withAssetSelected.has('asset_slot_id'), false)
})
