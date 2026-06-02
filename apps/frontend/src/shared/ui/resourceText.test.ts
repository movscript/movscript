import assert from 'node:assert/strict'
import test from 'node:test'

import { api } from '@/shared/infrastructure/api'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { __resetResourceTextCacheForTests, loadResourceTextUrl } from '@/shared/ui/resourceText'

test('loadResourceTextUrl deduplicates immutable text resource loads', async () => {
  __resetResourceTextCacheForTests()
  const originalGet = api.get
  let calls = 0
  api.get = (async (url: string, config?: unknown) => {
    calls += 1
    assert.equal(url, '/api/v1/resources/42/file')
    assert.equal((config as { baseURL?: string }).baseURL, '')
    assert.equal((config as { responseType?: string }).responseType, 'text')
    assert.equal(typeof (config as { transformResponse?: unknown[] }).transformResponse?.[0], 'function')
    await new Promise((resolve) => setTimeout(resolve, 0))
    return { data: 'hello text' }
  }) as typeof api.get

  try {
    const [first, second] = await Promise.all([
      loadResourceTextUrl('/api/v1/resources/42/file'),
      loadResourceTextUrl('/api/v1/resources/42/file'),
    ])

    assert.equal(calls, 1)
    assert.equal(first, 'hello text')
    assert.equal(second, first)
  } finally {
    api.get = originalGet
    __resetResourceTextCacheForTests()
  }
})

test('loadResourceTextUrl clears failed cache entries so callers can retry', async () => {
  __resetResourceTextCacheForTests()
  const originalGet = api.get
  let calls = 0
  api.get = (async () => {
    calls += 1
    if (calls === 1) throw new Error('network failed')
    return { data: 'retry text' }
  }) as typeof api.get

  try {
    await assert.rejects(() => loadResourceTextUrl('/api/v1/resources/42/file'), /network failed/)
    assert.equal(await loadResourceTextUrl('/api/v1/resources/42/file'), 'retry text')
    assert.equal(calls, 2)
  } finally {
    api.get = originalGet
    __resetResourceTextCacheForTests()
  }
})

test('loadResourceTextUrl clears protected text cache when auth scope changes', async () => {
  __resetResourceTextCacheForTests()
  const originalGet = api.get
  const originalState = useUserStore.getState()
  let calls = 0
  api.get = (async () => {
    calls += 1
    return { data: `text-${useUserStore.getState().currentUser?.ID ?? 'anonymous'}-${calls}` }
  }) as typeof api.get

  try {
    useUserStore.setState({ currentUser: { ID: 1, username: 'one', system_role: 'user' }, currentOrgID: 10, token: 'token-one' })
    assert.equal(await loadResourceTextUrl('/api/v1/resources/42/file'), 'text-1-1')
    assert.equal(await loadResourceTextUrl('/api/v1/resources/42/file'), 'text-1-1')

    useUserStore.setState({ currentUser: { ID: 2, username: 'two', system_role: 'user' }, currentOrgID: 20, token: 'token-two' })
    assert.equal(await loadResourceTextUrl('/api/v1/resources/42/file'), 'text-2-2')

    useUserStore.setState({ currentUser: { ID: 1, username: 'one', system_role: 'user' }, currentOrgID: 10, token: 'token-one' })
    assert.equal(await loadResourceTextUrl('/api/v1/resources/42/file'), 'text-1-3')
    assert.equal(calls, 3)
  } finally {
    api.get = originalGet
    useUserStore.setState(originalState, true)
    __resetResourceTextCacheForTests()
  }
})
