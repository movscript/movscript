import assert from 'node:assert/strict'
import test from 'node:test'

import type { AssetSlotRecord, AssetSlotViewModel } from './preProductionAssetRows'
import {
  buildPreProductionAssetSlotCreatePayload,
  buildPreProductionGeneratedCandidatePayload,
  buildPreProductionLibraryCandidatePayload,
  buildPreProductionUploadCandidatePayload,
  defaultPreProductionResourceTypeForAssetKind,
  initialPreProductionResourceLibraryState,
  openPreProductionResourceLibraryState,
  preProductionResourceLibraryPageCount,
  preProductionResourceLibraryTotal,
  preProductionResourceLibraryTypeParam,
  setPreProductionResourceLibraryOpen,
  setPreProductionResourceLibraryPage,
  setPreProductionResourceLibrarySearch,
  setPreProductionResourceLibrarySelection,
  setPreProductionResourceLibraryType,
} from './preProductionAssetCandidateWrite'

function slot(input: Partial<AssetSlotRecord> & Pick<AssetSlotRecord, 'ID'>): AssetSlotRecord {
  return input as AssetSlotRecord
}

function row(input: Partial<AssetSlotViewModel> & { slot: AssetSlotRecord }): AssetSlotViewModel {
  return {
    candidates: [],
    searchText: '',
    kind: 'image',
    hasResource: false,
    ...input,
  }
}

test('pre-production write model builds asset slot create payload scoped to reference', () => {
  assert.deepEqual(buildPreProductionAssetSlotCreatePayload({
    kindFilter: 'all',
    selectedId: 20,
    selectedReferenceId: null,
    slots: [slot({ ID: 20, creative_reference_id: 7 })],
  }), {
    kind: 'image',
    name: '未命名图片素材',
    status: 'missing',
    priority: 'normal',
    creative_reference_id: 7,
    owner_type: 'creative_reference',
    owner_id: 7,
  })

  assert.deepEqual(buildPreProductionAssetSlotCreatePayload({
    kindFilter: 'video',
    selectedReferenceId: 9,
    slots: [],
  }), {
    kind: 'video',
    name: '未命名视频素材',
    status: 'missing',
    priority: 'normal',
    creative_reference_id: 9,
    owner_type: 'creative_reference',
    owner_id: 9,
  })
})

test('pre-production write model builds candidate payloads', () => {
  const target = row({ slot: slot({ ID: 60 }) })
  const resource = { ID: 90, owner_id: 1, name: 'door.png', type: 'image' as const, url: '/resources/90', size: 10, mime_type: 'image/png' }

  assert.deepEqual(buildPreProductionLibraryCandidatePayload(target, resource), {
    asset_slot_id: 60,
    resource_id: 90,
    source_type: 'manual',
    source_id: 90,
    score: 0.7,
    status: 'candidate',
    note: '从资源库选择：door.png',
  })
  assert.deepEqual(buildPreProductionUploadCandidatePayload(target, resource), {
    asset_slot_id: 60,
    resource_id: 90,
    source_type: 'upload',
    source_id: 90,
    score: 0.75,
    status: 'candidate',
    note: '手动上传候选：door.png',
  })
  assert.deepEqual(buildPreProductionGeneratedCandidatePayload(target, 91, 'video', 1001), {
    asset_slot_id: 60,
    resource_id: 91,
    source_type: 'ai_agent',
    source_id: 1001,
    status: 'candidate',
    score: 0.8,
    note: 'AI 生成视频候选：resource #91',
  })
})

test('pre-production write model normalizes resource library state', () => {
  assert.equal(preProductionResourceLibraryTypeParam('all'), 'image,video,audio,text,file')
  assert.equal(preProductionResourceLibraryTypeParam('audio'), 'audio')
  assert.equal(defaultPreProductionResourceTypeForAssetKind('brand_pack'), 'all')
  assert.equal(defaultPreProductionResourceTypeForAssetKind('video'), 'video')
  assert.equal(preProductionResourceLibraryPageCount({ data: { total: 37 }, pageSize: 18 }), 3)
  assert.equal(preProductionResourceLibraryPageCount({ data: [{ ID: 1 }, { ID: 2 }] as any[] }), 1)
  assert.equal(preProductionResourceLibraryTotal({ total: 12 }), 12)
  assert.equal(preProductionResourceLibraryTotal([{ ID: 1 }, { ID: 2 }] as any[]), 2)
})

test('pre-production write model transitions resource library state', () => {
  const resource = { ID: 90, owner_id: 1, name: 'door.png', type: 'image' as const, url: '/resources/90', size: 10, mime_type: 'image/png' }
  const opened = openPreProductionResourceLibraryState('video')

  assert.deepEqual(opened, { open: true, search: '', type: 'video', page: 1, selectedResource: null })
  assert.deepEqual(setPreProductionResourceLibrarySearch(opened, 'door'), { ...opened, search: 'door', page: 1 })
  assert.deepEqual(setPreProductionResourceLibraryType({ ...opened, page: 3, selectedResource: resource }, 'audio'), {
    ...opened,
    type: 'audio',
    page: 1,
    selectedResource: null,
  })
  assert.equal(setPreProductionResourceLibraryPage(opened, -2).page, 1)
  assert.equal(setPreProductionResourceLibrarySelection(opened, resource).selectedResource?.ID, 90)
  assert.deepEqual(setPreProductionResourceLibraryOpen({ ...opened, selectedResource: resource }, false), {
    ...opened,
    open: false,
    selectedResource: null,
  })
  assert.equal(initialPreProductionResourceLibraryState.open, false)
})
