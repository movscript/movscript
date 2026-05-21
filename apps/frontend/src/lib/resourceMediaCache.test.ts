import assert from 'node:assert/strict'
import test from 'node:test'

import {
  __resetResourceMediaCacheForTests,
  acquireCachedResourceMediaUrl,
  isResourceFileUrl,
  resourceMediaCacheKey,
} from './resourceMediaCache'

test('isResourceFileUrl recognizes backend resource file endpoints', () => {
  assert.equal(isResourceFileUrl('/api/v1/resources/42/file'), true)
  assert.equal(isResourceFileUrl('/resources/42/file?download=1'), true)
  assert.equal(isResourceFileUrl('https://example.test/api/v1/resources/42/file'), true)
  assert.equal(isResourceFileUrl('/api/v1/resources/upload'), false)
  assert.equal(isResourceFileUrl('/api/v1/projects/42/resources'), false)
})

test('resourceMediaCacheKey normalizes absolute resource URLs', () => {
  assert.equal(
    resourceMediaCacheKey('https://example.test/api/v1/resources/42/file?variant=thumb'),
    'https://example.test/api/v1/resources/42/file?variant=thumb',
  )
})

test('acquireCachedResourceMediaUrl deduplicates resource blob loads', async () => {
  __resetResourceMediaCacheForTests()
  let loads = 0
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  URL.createObjectURL = (() => 'blob:resource-42') as typeof URL.createObjectURL
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL

  try {
    const loadBlob = async () => {
      loads += 1
      return new Blob(['image'], { type: 'image/png' })
    }

    const first = await acquireCachedResourceMediaUrl('/api/v1/resources/42/file', loadBlob)
    const second = await acquireCachedResourceMediaUrl('/api/v1/resources/42/file', loadBlob)

    assert.equal(loads, 1)
    assert.equal(first.url, second.url)
    first.release()
    second.release()
  } finally {
    __resetResourceMediaCacheForTests()
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  }
})
