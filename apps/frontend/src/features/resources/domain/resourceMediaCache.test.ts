import assert from 'node:assert/strict'
import test from 'node:test'

import {
  __resetResourceMediaCacheForTests,
  acquireCachedResourceMediaUrl,
  isResourceFileUrl,
  resourceMediaCacheKey,
} from '@/shared/ui/resourceMediaCache'

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

test('acquireCachedResourceMediaUrl deduplicates concurrent object URL creation', async () => {
  __resetResourceMediaCacheForTests()
  let loads = 0
  let objectUrls = 0
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  URL.createObjectURL = (() => {
    objectUrls += 1
    return `blob:resource-42-${objectUrls}`
  }) as typeof URL.createObjectURL
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL

  try {
    const loadBlob = async () => {
      loads += 1
      await new Promise((resolve) => setTimeout(resolve, 0))
      return new Blob(['image'], { type: 'image/png' })
    }

    const [first, second] = await Promise.all([
      acquireCachedResourceMediaUrl('/api/v1/resources/42/file', loadBlob),
      acquireCachedResourceMediaUrl('/api/v1/resources/42/file', loadBlob),
    ])

    assert.equal(loads, 1)
    assert.equal(objectUrls, 1)
    assert.equal(first.url, second.url)
    first.release()
    second.release()
  } finally {
    __resetResourceMediaCacheForTests()
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  }
})

test('acquireCachedResourceMediaUrl deduplicates direct media URL blob loads', async () => {
  __resetResourceMediaCacheForTests()
  let loads = 0
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  URL.createObjectURL = (() => 'blob:direct-media') as typeof URL.createObjectURL
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL

  try {
    const loadBlob = async () => {
      loads += 1
      return new Blob(['video'], { type: 'video/mp4' })
    }

    const first = await acquireCachedResourceMediaUrl('https://cdn.example.test/media/output.mp4', loadBlob)
    const second = await acquireCachedResourceMediaUrl('https://cdn.example.test/media/output.mp4', loadBlob)

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

test('acquireCachedResourceMediaUrl caches transformed variants separately', async () => {
  __resetResourceMediaCacheForTests()
  let loads = 0
  let transforms = 0
  let objectUrls = 0
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  URL.createObjectURL = ((blob: Blob) => {
    objectUrls += 1
    return `blob:${blob.type || 'media'}-${objectUrls}`
  }) as typeof URL.createObjectURL
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL

  try {
    const loadBlob = async () => {
      loads += 1
      return new Blob(['image'], { type: 'image/png' })
    }
    const transformBlob = async () => {
      transforms += 1
      return new Blob(['thumb'], { type: 'image/jpeg' })
    }

    const [first, second] = await Promise.all([
      acquireCachedResourceMediaUrl('/api/v1/resources/42/file', loadBlob, { variantKey: 'thumb:512', transformBlob }),
      acquireCachedResourceMediaUrl('/api/v1/resources/42/file', loadBlob, { variantKey: 'thumb:512', transformBlob }),
    ])
    const full = await acquireCachedResourceMediaUrl('/api/v1/resources/42/file', loadBlob)

    assert.equal(loads, 1)
    assert.equal(transforms, 1)
    assert.equal(objectUrls, 2)
    assert.equal(first.url, second.url)
    assert.notEqual(first.url, full.url)
    first.release()
    second.release()
    full.release()
  } finally {
    __resetResourceMediaCacheForTests()
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  }
})
