import assert from 'node:assert/strict'
import test from 'node:test'

import {
  __resetResourceMediaCacheForTests,
  acquireCachedResourceMediaUrl,
  isResourceFileUrl,
  loadCachedResourceBlob,
  loadCachedResourceDataURL,
  resourceMediaCacheKey,
} from '@/shared/ui/resourceMediaCache'
import { useUserStore } from '@/shared/infrastructure/session/userStore'

test('isResourceFileUrl recognizes backend resource file endpoints', () => {
  assert.equal(isResourceFileUrl('/api/v1/resources/42/file'), true)
  assert.equal(isResourceFileUrl('/resources/42/file?download=1'), true)
  assert.equal(isResourceFileUrl('https://example.test/api/v1/resources/42/file'), true)
  assert.equal(isResourceFileUrl('/api/v1/resources/upload'), false)
  assert.equal(isResourceFileUrl('/api/v1/projects/42/resources'), false)
})

test('resourceMediaCacheKey normalizes absolute resource URLs', () => {
  const originalState = useUserStore.getState()
  useUserStore.setState({ currentUser: null, currentOrgID: null, token: null })
  try {
    assert.equal(
      resourceMediaCacheKey('https://example.test/api/v1/resources/42/file?variant=thumb'),
      'https://example.test/api/v1/resources/42/file?variant=thumb::auth:user:anonymous:org:none:token:none',
    )
  } finally {
    useUserStore.setState(originalState, true)
  }
})

test('resourceMediaCacheKey keeps public media URLs outside auth scope', () => {
  assert.equal(
    resourceMediaCacheKey('https://cdn.example.test/media/output.mp4'),
    'https://cdn.example.test/media/output.mp4',
  )
})

test('loadCachedResourceBlob separates protected resource cache by auth scope', async () => {
  __resetResourceMediaCacheForTests()
  const originalState = useUserStore.getState()
  let loads = 0

  try {
    const loadBlob = async () => {
      loads += 1
      return new Blob([`user-${useUserStore.getState().currentUser?.ID ?? 'anonymous'}`], { type: 'text/plain' })
    }

    useUserStore.setState({ currentUser: { ID: 1, username: 'one', system_role: 'user' }, currentOrgID: 10, token: 'token-one' })
    const first = await loadCachedResourceBlob('/api/v1/resources/42/file', loadBlob)
    const firstAgain = await loadCachedResourceBlob('/api/v1/resources/42/file', loadBlob)

    useUserStore.setState({ currentUser: { ID: 2, username: 'two', system_role: 'user' }, currentOrgID: 20, token: 'token-two' })
    const second = await loadCachedResourceBlob('/api/v1/resources/42/file', loadBlob)

    assert.equal(loads, 2)
    assert.equal(await first.text(), 'user-1')
    assert.equal(await firstAgain.text(), 'user-1')
    assert.equal(await second.text(), 'user-2')
  } finally {
    __resetResourceMediaCacheForTests()
    useUserStore.setState(originalState, true)
  }
})

test('resource media cache clears protected object URLs when auth scope changes', async () => {
  __resetResourceMediaCacheForTests()
  const originalState = useUserStore.getState()
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  const revoked: string[] = []
  let loads = 0
  URL.createObjectURL = ((() => `blob:scoped-${loads}`) as typeof URL.createObjectURL)
  URL.revokeObjectURL = ((url: string) => {
    revoked.push(url)
  }) as typeof URL.revokeObjectURL

  try {
    useUserStore.setState({ currentUser: { ID: 1, username: 'one', system_role: 'user' }, currentOrgID: 10, token: 'token-one' })
    const first = await acquireCachedResourceMediaUrl('/api/v1/resources/42/file', async () => {
      loads += 1
      return new Blob(['image'], { type: 'image/png' })
    })

    useUserStore.setState({ currentUser: { ID: 2, username: 'two', system_role: 'user' }, currentOrgID: 20, token: 'token-two' })
    const second = await acquireCachedResourceMediaUrl('/api/v1/resources/42/file', async () => {
      loads += 1
      return new Blob(['image'], { type: 'image/png' })
    })

    assert.equal(loads, 2)
    assert.deepEqual(revoked, [first.url])
    assert.notEqual(second.url, first.url)
    first.release()
    second.release()
  } finally {
    __resetResourceMediaCacheForTests()
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    useUserStore.setState(originalState, true)
  }
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

test('loadCachedResourceDataURL deduplicates resource blob loads and encodings', async () => {
  __resetResourceMediaCacheForTests()
  let loads = 0
  let reads = 0
  const originalFileReader = globalThis.FileReader

  class MockFileReader {
    result: string | ArrayBuffer | null = null
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    error: Error | null = null

    readAsDataURL(blob: Blob) {
      reads += 1
      void blob.arrayBuffer().then((buffer) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`
        this.onload?.()
      }).catch((error) => {
        this.error = error instanceof Error ? error : new Error(String(error))
        this.onerror?.()
      })
    }
  }

  globalThis.FileReader = MockFileReader as unknown as typeof FileReader

  try {
    const loadBlob = async () => {
      loads += 1
      return new Blob(['image'], { type: 'image/png' })
    }

    const [first, second] = await Promise.all([
      loadCachedResourceDataURL('/api/v1/resources/42/file', loadBlob),
      loadCachedResourceDataURL('/api/v1/resources/42/file', loadBlob),
    ])

    assert.equal(loads, 1)
    assert.equal(reads, 1)
    assert.equal(first, 'data:image/png;base64,aW1hZ2U=')
    assert.equal(second, first)
  } finally {
    __resetResourceMediaCacheForTests()
    globalThis.FileReader = originalFileReader
  }
})
