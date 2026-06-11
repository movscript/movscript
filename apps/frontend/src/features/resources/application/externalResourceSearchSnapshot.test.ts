import assert from 'node:assert/strict'
import test from 'node:test'

import {
  externalResourceSearchInitialData,
  normalizeExternalMediaTypes,
  normalizeExternalOrientation,
  normalizeExternalSnapshotPage,
  parseExternalResourceSearchSnapshot,
} from './externalResourceSearchSnapshot'

const result = {
  total: 1,
  items: [{ provider_key: 'pexels', media_type: 'image', external_id: '1' }],
  page: 2,
  page_size: 20,
  provider: 'pexels',
}

test('external resource search snapshot parser normalizes persisted filters', () => {
  assert.deepEqual(
    parseExternalResourceSearchSnapshot(JSON.stringify({
      sourceId: 7,
      query: '  city ',
      submittedQuery: ' city ',
      mediaTypes: ['video', 'image', 'image', 'bad'],
      orientation: 'portrait',
      page: '3',
      result,
    })),
    {
      sourceId: 7,
      query: 'city',
      submittedQuery: 'city',
      mediaTypes: ['image', 'video'],
      orientation: 'portrait',
      page: 3,
      result,
    },
  )
})

test('external resource search snapshot rejects unusable payloads', () => {
  assert.equal(parseExternalResourceSearchSnapshot(null), null)
  assert.equal(parseExternalResourceSearchSnapshot('{'), null)
  assert.equal(parseExternalResourceSearchSnapshot(JSON.stringify({ submittedQuery: '', result })), null)
  assert.equal(parseExternalResourceSearchSnapshot(JSON.stringify({ submittedQuery: 'city', result: { items: null } })), null)
})

test('external resource search initial data only restores exact active searches', () => {
  const snapshot = parseExternalResourceSearchSnapshot(JSON.stringify({
    sourceId: 7,
    submittedQuery: 'city',
    mediaTypes: ['image'],
    orientation: 'landscape',
    page: 2,
    result,
  }))

  assert.deepEqual(
    externalResourceSearchInitialData(snapshot, {
      sourceId: 7,
      submittedQuery: ' city ',
      mediaTypeKey: 'image',
      orientation: 'landscape',
      page: 2,
    }),
    result,
  )
  assert.equal(
    externalResourceSearchInitialData(snapshot, {
      sourceId: 8,
      submittedQuery: 'city',
      mediaTypeKey: 'image',
      orientation: 'landscape',
      page: 2,
    }),
    undefined,
  )
})

test('external resource search filter normalizers provide stable defaults', () => {
  assert.deepEqual(normalizeExternalMediaTypes(['video', 'image', 'image']), ['image', 'video'])
  assert.deepEqual(normalizeExternalMediaTypes(['bad']), ['image', 'video'])
  assert.equal(normalizeExternalOrientation('square'), 'square')
  assert.equal(normalizeExternalOrientation('wide'), 'all')
  assert.equal(normalizeExternalSnapshotPage(4.8), 4)
  assert.equal(normalizeExternalSnapshotPage(-1), 1)
})
