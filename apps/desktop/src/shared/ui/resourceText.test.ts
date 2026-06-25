import assert from 'node:assert/strict'
import test from 'node:test'

import { configureSurfaceHttpClients, type SurfaceHttpClient } from '@movscript/shared/surface-http'
import { __resetResourceTextCacheForTests, configureResourceMediaBrowser, loadResourceTextUrl } from '@movscript/resource-surface/resource-media'

function configureTextClient(get: SurfaceHttpClient['get']) {
  configureSurfaceHttpClients({
    data: {
      get,
      post: async () => ({ data: undefined }),
      put: async () => ({ data: undefined }),
      patch: async () => ({ data: undefined }),
      delete: async () => ({ data: undefined }),
    },
  })
}

test('loadResourceTextUrl deduplicates immutable text resource loads', async () => {
  __resetResourceTextCacheForTests()
  let calls = 0
  configureTextClient(async (url: string, config?: unknown) => {
    calls += 1
    assert.equal(url, '/api/v1/resources/42/file')
    assert.equal((config as { baseURL?: string }).baseURL, '')
    assert.equal((config as { responseType?: string }).responseType, 'text')
    assert.equal(typeof (config as { transformResponse?: unknown[] }).transformResponse?.[0], 'function')
    await new Promise((resolve) => setTimeout(resolve, 0))
    return { data: 'hello text' }
  })

  try {
    const [first, second] = await Promise.all([
      loadResourceTextUrl('/api/v1/resources/42/file'),
      loadResourceTextUrl('/api/v1/resources/42/file'),
    ])

    assert.equal(calls, 1)
    assert.equal(first, 'hello text')
    assert.equal(second, first)
  } finally {
    __resetResourceTextCacheForTests()
  }
})

test('loadResourceTextUrl clears failed cache entries so callers can retry', async () => {
  __resetResourceTextCacheForTests()
  let calls = 0
  configureTextClient(async () => {
    calls += 1
    if (calls === 1) throw new Error('network failed')
    return { data: 'retry text' }
  })

  try {
    await assert.rejects(() => loadResourceTextUrl('/api/v1/resources/42/file'), /network failed/)
    assert.equal(await loadResourceTextUrl('/api/v1/resources/42/file'), 'retry text')
    assert.equal(calls, 2)
  } finally {
    __resetResourceTextCacheForTests()
  }
})

test('loadResourceTextUrl clears protected text cache when auth scope changes', async () => {
  __resetResourceTextCacheForTests()
  let authScope = 'user:1:org:10'
  let calls = 0
  configureResourceMediaBrowser({ authCacheScope: () => authScope })
  configureTextClient(async () => {
    calls += 1
    return { data: `text-${authScope}-${calls}` }
  })

  try {
    assert.equal(await loadResourceTextUrl('/api/v1/resources/42/file'), 'text-user:1:org:10-1')
    assert.equal(await loadResourceTextUrl('/api/v1/resources/42/file'), 'text-user:1:org:10-1')

    authScope = 'user:2:org:20'
    assert.equal(await loadResourceTextUrl('/api/v1/resources/42/file'), 'text-user:2:org:20-2')

    authScope = 'user:1:org:10'
    assert.equal(await loadResourceTextUrl('/api/v1/resources/42/file'), 'text-user:1:org:10-1')
    assert.equal(calls, 2)
  } finally {
    configureResourceMediaBrowser({ authCacheScope: '' })
    __resetResourceTextCacheForTests()
  }
})
